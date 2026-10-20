// Worker: loads the WASM module once, then converts each chunk it is sent.
self.importScripts('../pkg/wasm_ascii_cam.js');
const ready = wasm_bindgen({ module_or_path: '../pkg/wasm_ascii_cam_bg.wasm' });

onmessage = async (event) => {
    const { frame, index, data } = event.data;
    if (data === undefined) return;
    await ready;
    postMessage({ frame, index, data: wasm_bindgen.rgb_to_ascii(data) });
};
