# wasm_ascii_cam

Live webcam video rendered as coloured ASCII art in the browser. The per-pixel work runs in Rust compiled to WebAssembly, spread across a pool of Web Workers.

**[Live demo](https://jake-king.github.io/wasm_ascii_cam/)**. Allow camera access when asked; switch cameras under Controls. Video never leaves your machine; everything runs locally in the page.

The interface is styled after a curses terminal app: box-drawn windows, inverse title and key bars, and keyboard shortcuts.

![AsciiCam at 160×60, rendering a camera test pattern](docs/screenshot.png)

## How it works

```
camera ─► <video> ─► grid-sized canvas ─► split into chunks ─► Web Workers (Rust/WASM) ─► reassemble ─► draw glyphs
          (brightness/contrast                              luma → palette index
           applied as a canvas filter)
```

1. Each animation frame, the camera image is cropped to the grid's shape, mirrored if enabled, and scaled down to one pixel per character (80×30, 120×45 or 160×60) on a hidden canvas, with brightness and contrast applied as a canvas filter.
2. The RGBA pixels are split into whole-pixel chunks, one per CPU core, and sent to a pool of Web Workers.
3. Each worker runs `rgb_to_ascii` (Rust, [`src/lib.rs`](src/lib.rs)). It computes Rec. 601 luma for each pixel and maps it to one of 64 glyphs, from `.` (dark) to `$` (bright).
4. The main thread reassembles the chunks in order and draws each glyph in its source pixel's colour, or in phosphor green in Mono mode. Frames are tagged with an id, so results from before a size or camera change are dropped.

## Controls

| Key | Action |
|---|---|
| `1` `2` `3` | Detail: 80×30, 120×45, 160×60 |
| `b` / `B` | Brightness down / up |
| `c` / `C` | Contrast down / up |
| `m` | Mirror on/off |
| `g` | Mono (green) on/off |

## Build and run

Requires Rust with the `wasm32-unknown-unknown` target, plus [wasm-pack](https://github.com/wasm-bindgen/wasm-pack).

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

cargo test                                    # unit tests for the Rust core
node --test                                   # unit tests for frame chunking (Node 22+)
wasm-pack build --release --target no-modules --no-typescript --out-dir www/pkg
python3 -m http.server --directory www 8000   # then open http://localhost:8000
```

Browsers only allow camera access on `https://` or `localhost`.

## Project layout

| Path | What it is |
|---|---|
| `src/lib.rs` | Pixel → glyph-index conversion, compiled to WebAssembly |
| `www/js/asciiCam.js` | Camera capture, cropping, and rendering |
| `www/js/chunks.js` | Splits a frame into whole-pixel chunks, one per worker |
| `www/js/script.js` | Controls, keyboard shortcuts, and status bar |
| `www/js/thread.js` | Small Web Worker thread pool |
| `www/js/rgbToAscii.js` | Worker script that loads the WASM module |
| `test/` | Node tests for the chunking logic |
| `.github/workflows/pages.yml` | Tests, builds and deploys to GitHub Pages |

## License

[MIT](LICENSE)
