// Loads a built package (www/<dir>) the way the browser worker does: the
// no-modules glue script, then the .wasm bytes.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export async function load(dir) {
    const glue = readFileSync(new URL(`../www/${dir}/wasm_ascii_cam.js`, import.meta.url), 'utf8');
    // Share this realm's WebAssembly and typed arrays, so buffers pass instanceof checks.
    const context = vm.createContext({ WebAssembly, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Response });
    context.bytes = readFileSync(new URL(`../www/${dir}/wasm_ascii_cam_bg.wasm`, import.meta.url));
    // The options object must come from the glue's own realm: it checks its prototype.
    await vm.runInContext(`${glue}\nthis.wasm_bindgen = wasm_bindgen;\nwasm_bindgen({ module_or_path: bytes })`, context);
    return context.wasm_bindgen;
}
