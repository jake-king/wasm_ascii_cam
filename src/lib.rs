use wasm_bindgen::prelude::*;

/// Number of glyphs in the front end's ASCII palette (`www/js/asciiCam.js`).
pub const PALETTE_LEN: u32 = 64;

/// Maps RGBA pixels to palette indices, one byte per pixel.
///
/// `rgba` is canvas `ImageData` layout: 4 bytes per pixel, alpha ignored; a
/// trailing partial pixel is dropped. Brightness is integer Rec. 601 luma,
/// (77 R + 150 G + 29 B) / 256, scaled from 0..=255 down to 0..PALETTE_LEN.
///
/// Built with the `simd128` target feature, whole groups of 16 pixels go
/// through [`simd::rgb_to_ascii_16`]; the output is identical either way.
#[wasm_bindgen]
pub fn rgb_to_ascii(rgba: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; rgba.len() / 4];
    convert_into(rgba, &mut out);
    out
}

/// [`rgb_to_ascii`] into an existing buffer of `rgba.len() / 4` bytes.
fn convert_into(rgba: &[u8], out: &mut [u8]) {
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    let (rgba, out) = {
        let groups = rgba.len() / 64;
        for (input, output) in rgba.chunks_exact(64).zip(out.chunks_exact_mut(16)) {
            simd::rgb_to_ascii_16(input.try_into().unwrap(), output.try_into().unwrap());
        }
        (&rgba[groups * 64..], &mut out[groups * 16..])
    };
    for (px, index) in rgba.chunks_exact(4).zip(out.iter_mut()) {
        *index = pixel_index(px[0], px[1], px[2]);
    }
}

/// The scalar conversion alone, for tests and benchmarks.
#[wasm_bindgen]
pub fn rgb_to_ascii_scalar(rgba: &[u8]) -> Vec<u8> {
    rgba.chunks_exact(4).map(|px| pixel_index(px[0], px[1], px[2])).collect()
}

/// Benchmark helper: converts `rgba` `times` times inside WebAssembly into one
/// reused buffer, so the timing leaves out allocation and the copies between
/// JavaScript and WASM memory. Returns a checksum so the work is not skipped.
#[wasm_bindgen]
pub fn convert_repeatedly(rgba: &[u8], times: u32) -> u32 {
    let mut out = vec![0u8; rgba.len() / 4];
    let mut checksum = 0u32;
    for _ in 0..times {
        convert_into(core::hint::black_box(rgba), &mut out);
        checksum = checksum.wrapping_add(out.get(out.len() / 2).copied().unwrap_or(0) as u32);
        core::hint::black_box(&mut out);
    }
    checksum
}

/// Whether this build uses WebAssembly SIMD.
#[wasm_bindgen]
pub fn simd_enabled() -> bool {
    cfg!(all(target_arch = "wasm32", target_feature = "simd128"))
}

#[inline]
fn pixel_index(r: u8, g: u8, b: u8) -> u8 {
    let luma = (77 * r as u32 + 150 * g as u32 + 29 * b as u32) >> 8;
    (luma * PALETTE_LEN / 256) as u8
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod simd {
    use core::arch::wasm32::*;

    /// 16 RGBA pixels (64 bytes) to 16 palette indices, written to `out`.
    ///
    /// Per 128-bit vector of 4 pixels: widen bytes to 16 bits, then
    /// `i32x4_dot_i16x8` multiplies by the weights and adds adjacent pairs,
    /// giving (77 R + 150 G) and (29 B + 0 A) for each pixel. Adding those two
    /// halves gives the weighted sum; `>> 10` is luma `>> 8` then the 256 → 64
    /// palette scale `>> 2`. The 16 results are narrowed back to bytes.
    #[inline]
    pub fn rgb_to_ascii_16(rgba: &[u8; 64], out: &mut [u8; 16]) {
        let weights = i16x8(77, 150, 29, 0, 77, 150, 29, 0);
        let mut sums = [u32x4_splat(0); 4];
        for (i, sum) in sums.iter_mut().enumerate() {
            // SAFETY: rgba is 64 bytes, so bytes 16*i .. 16*i+16 are in bounds;
            // v128_load has no alignment requirement.
            let px = unsafe { v128_load(rgba.as_ptr().add(16 * i) as *const v128) };
            let lo = i32x4_dot_i16x8(u16x8_extend_low_u8x16(px), weights);   // pixels 0, 1
            let hi = i32x4_dot_i16x8(u16x8_extend_high_u8x16(px), weights);  // pixels 2, 3
            let rg = i32x4_shuffle::<0, 2, 4, 6>(lo, hi);
            let ba = i32x4_shuffle::<1, 3, 5, 7>(lo, hi);
            *sum = u32x4_shr(i32x4_add(rg, ba), 10);
        }
        // Each index is 0..=63, so the saturating narrows are exact.
        let words_lo = i16x8_narrow_i32x4(sums[0], sums[1]);
        let words_hi = i16x8_narrow_i32x4(sums[2], sums[3]);
        let bytes = u8x16_narrow_i16x8(words_lo, words_hi);
        // SAFETY: out is 16 bytes; v128_store has no alignment requirement.
        unsafe { v128_store(out.as_mut_ptr() as *mut v128, bytes) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn black_and_white_map_to_the_palette_ends() {
        assert_eq!(rgb_to_ascii(&[0, 0, 0, 255, 255, 255, 255, 255]), vec![0, 63]);
    }

    #[test]
    fn alpha_is_ignored() {
        assert_eq!(rgb_to_ascii(&[200, 10, 90, 0]), rgb_to_ascii(&[200, 10, 90, 255]));
    }

    #[test]
    fn green_reads_brighter_than_blue() {
        let green = rgb_to_ascii(&[0, 255, 0, 255])[0];
        let blue = rgb_to_ascii(&[0, 0, 255, 255])[0];
        assert!(green > blue, "green {green} should be brighter than blue {blue}");
    }

    #[test]
    fn one_index_per_whole_pixel() {
        assert_eq!(rgb_to_ascii(&[9; 4 * 80 * 30]).len(), 80 * 30);
        assert_eq!(rgb_to_ascii(&[9; 6]).len(), 1, "a trailing partial pixel is dropped");
    }

    #[test]
    fn every_index_is_in_the_palette() {
        let all: Vec<u8> = (0..=255u8).flat_map(|v| [v, v, v, 255]).collect();
        assert!(rgb_to_ascii(&all).iter().all(|&i| (i as u32) < PALETTE_LEN));
    }

    #[test]
    fn scalar_export_matches() {
        let px: Vec<u8> = (0..4000u32).map(|i| (i * 37 % 256) as u8).collect();
        assert_eq!(rgb_to_ascii(&px), rgb_to_ascii_scalar(&px));
    }
}
