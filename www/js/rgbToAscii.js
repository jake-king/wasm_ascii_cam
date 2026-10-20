// Worker: loads the WASM module once, then converts each chunk it is sent.
// The SIMD build is used when this browser can compile it; otherwise the
// scalar build. Both produce identical output.
const ready = fetch('../pkg-simd/wasm_ascii_cam_bg.wasm')
    .then(response => response.arrayBuffer())
    .then(bytes => {
        if (WebAssembly.validate(bytes)) {
            self.importScripts('../pkg-simd/wasm_ascii_cam.js');
            return wasm_bindgen({ module_or_path: bytes });
        }
        self.importScripts('../pkg/wasm_ascii_cam.js');
        return wasm_bindgen({ module_or_path: '../pkg/wasm_ascii_cam_bg.wasm' });
    });

onmessage = async (event) => {
    const { frame, index, data } = event.data;
    if (data === undefined) return;
    await ready;
    postMessage({ frame, index, data: wasm_bindgen.rgb_to_ascii(data) });
};
