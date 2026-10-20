use wasm_bindgen::prelude::*;

/// Number of glyphs in the front end's ASCII palette (`www/js/asciiCam.js`).
pub const PALETTE_LEN: u32 = 64;

/// Maps RGBA pixels to palette indices, one byte per pixel.
///
/// `rgba` is canvas `ImageData` layout: 4 bytes per pixel, alpha ignored.
/// Brightness is integer Rec. 601 luma (0.299 R + 0.587 G + 0.114 B),
/// scaled from 0..=255 down to 0..PALETTE_LEN.
#[wasm_bindgen]
pub fn rgb_to_ascii(rgba: &[u8]) -> Vec<u8> {
    rgba.chunks_exact(4)
        .map(|px| {
            let luma = (77 * px[0] as u32 + 150 * px[1] as u32 + 29 * px[2] as u32) >> 8;
            (luma * PALETTE_LEN / 256) as u8
        })
        .collect()
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
}
