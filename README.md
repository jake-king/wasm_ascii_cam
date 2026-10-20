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
4. The main thread reassembles the chunks in order and draws each glyph in its source pixel's colour, or in phosphor green in Mono mode, with WebGL (below). Frames are tagged with an id, so results from before a size or camera change are dropped.

## Rendering

Drawing 9,600 coloured characters with Canvas 2D `fillText` took most of each frame, so the grid is drawn with WebGL2 instead:

- The 64 glyphs are drawn once into an atlas texture, at a whole number of device pixels per cell.
- Each frame uploads two 160×60 textures: the glyph indices (from the WASM step) and the cell colours.
- One full-screen triangle is drawn. The fragment shader works out which cell each pixel is in, then looks up that cell's glyph in the atlas and its colour.

That is one draw call per frame and no per-cell JavaScript. Canvas 2D remains as a fallback when WebGL2 is unavailable, and can be forced with `?renderer=2d`.

Measured with [`www/bench.html`](www/bench.html): random 160×60 frames (every cell a different colour, the worst case), waiting for each frame to finish drawing, including GPU work.

| Browser | Renderer | Colour | Mono |
|---|---|---|---|
| Chromium 154 | Canvas 2D | 72.8 ms | 11.2 ms |
| Chromium 154 | WebGL2 | 0.15 ms | 0.14 ms |
| Firefox 157 | Canvas 2D | 14.7 ms | 9.8 ms |
| Firefox 157 | WebGL2 | 0.12 ms | 0.09 ms |

Intel i5-12600KF, NVIDIA RTX 5060 Ti, Linux. At 60 fps a frame has 16.7 ms, so Canvas 2D used most or all of it; WebGL2 uses under 1%. The WASM conversion step takes about 0.01 ms per frame.

## Controls

| Key | Action |
|---|---|
| `1` `2` `3` | Detail: 80×30, 120×45, 160×60 |
| `b` / `B` | Brightness down / up |
| `c` / `C` | Contrast down / up |
| `r` | Reset brightness and contrast |
| `m` | Mirror on/off |
| `g` | Mono (green) on/off |
| `s` / `t` | Save the current frame as PNG / text |

## Build and run

Requires Rust with the `wasm32-unknown-unknown` target, plus [wasm-pack](https://github.com/wasm-bindgen/wasm-pack).

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

cargo test                                    # unit tests for the Rust core
node --test                                   # unit tests for frame chunking (Node 22+)
wasm-pack build --release --target no-modules --no-typescript --out-dir www/pkg
python3 serve.py                              # then open http://localhost:8000
```

Browsers only allow camera access on `https://` or `localhost`.

## Project layout

| Path | What it is |
|---|---|
| `src/lib.rs` | Pixel → glyph-index conversion, compiled to WebAssembly |
| `www/js/asciiCam.js` | Camera capture, cropping, and frame scheduling |
| `www/js/renderer.js` | WebGL2 renderer (glyph atlas + fragment shader) and Canvas 2D fallback |
| `www/js/chunks.js` | Splits a frame into whole-pixel chunks, one per worker |
| `www/js/script.js` | Controls, keyboard shortcuts, and status bar |
| `www/js/thread.js` | Small Web Worker thread pool |
| `www/js/rgbToAscii.js` | Worker script that loads the WASM module |
| `www/bench.html` | Renderer benchmark |
| `test/` | Node tests for the chunking logic |
| `.github/workflows/pages.yml` | Tests, builds and deploys to GitHub Pages |

## License

[MIT](LICENSE)
