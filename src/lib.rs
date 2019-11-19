extern crate wasm_bindgen;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

static ASCII_PALETTE: [char;64] = ['.', '\'', '`', '^', '"', 
':', ';', 'I', 'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', 
'[', '}', '{', '1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 
'n', 'u', 'v', 'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 
'Z', 'm', 'w', 'd', 'b', 'k', 'h', 'a', 'o', '*', '#', 'M', 
'W', '&', '8', '%', 'B', '@', '$'];

#[wasm_bindgen]
pub fn average_brightness(r:u8, g:u8, b:u8) -> u8{
    let r_avg: u8 = r/3;
    let g_avg: u8 = g/3;
    let b_avg: u8 = b/3;
    let average: u8 = r_avg + g_avg + b_avg;
    return average;
}

#[wasm_bindgen]
pub fn rgb_to_ascii(r:u8, g:u8, b:u8) -> String {
    let average: u8 = average_brightness(r, g, b);
    let val: u8 = average/4;
    let ascii_val = format!("<span style=\"color:#{0:2X}{1:2X}{2:2X}\">{3}{3}</span>", r, g, b, ASCII_PALETTE[val as usize].to_string());
    return ascii_val;
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
