extern crate wasm_bindgen;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// static ASCII_PALETTE: [char;64] = ['.', '\'', '`', '^', '"', 
// ':', ';', 'I', 'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', 
// '[', '}', '{', '1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 
// 'n', 'u', 'v', 'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 
// 'Z', 'm', 'w', 'd', 'b', 'k', 'h', 'a', 'o', '*', '#', 'M', 
// 'W', '&', '8', '%', 'B', '@', '$'];

#[wasm_bindgen]
pub fn rgb_to_ascii(rgb_data: &[u8]) -> Vec<u8>{
    let mut i: usize = 0;
    let mut pos: usize = 0;
    let mut frame: Vec<u8> = Vec::new();
    let pixels: usize = rgb_data.len() / 4;

    while i < pixels {
        let r_avg: u8 = rgb_data[pos]/3;
        let g_avg: u8 = rgb_data[pos+1]/3;
        let b_avg: u8 = rgb_data[pos+2]/3;
        let average: u8 = r_avg + g_avg + b_avg;
        let index: u8 = average/4;
        frame.push(index);
        i = i + 1;
        pos = pos + 4;
    }
    return frame;
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
