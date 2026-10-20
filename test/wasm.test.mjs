// Tests the built WebAssembly packages exactly as the browser loads them.
// Build first: npm run build
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { load } from './load-wasm.mjs';
import { assertSameBytes } from './bytes.mjs';


const built = existsSync('www/pkg/wasm_ascii_cam_bg.wasm') && existsSync('www/pkg-simd/wasm_ascii_cam_bg.wasm');

test('each package reports the right instruction set', { skip: !built && 'run npm run build first' }, async () => {
    assert.equal((await load('pkg')).simd_enabled(), false);
    assert.equal((await load('pkg-simd')).simd_enabled(), true);
});

test('SIMD output equals scalar output for every RGB colour', { skip: !built && 'run npm run build first' }, async () => {
    const simd = await load('pkg-simd');
    const scalar = await load('pkg');
    const rgba = new Uint8Array(65536 * 4);
    for (let r = 0; r < 256; r++) {
        for (let i = 0; i < 65536; i++) {
            rgba[i * 4] = r;
            rgba[i * 4 + 1] = i >> 8;
            rgba[i * 4 + 2] = i & 255;
            rgba[i * 4 + 3] = (i * 7) & 255;
        }
        const expected = scalar.rgb_to_ascii(rgba);
        assertSameBytes(simd.rgb_to_ascii(rgba), expected, `red = ${r}`);
        assertSameBytes(simd.rgb_to_ascii_scalar(rgba), expected, `red = ${r}, scalar export`);
    }
});

test('SIMD handles every length around the 16-pixel groups', { skip: !built && 'run npm run build first' }, async () => {
    const simd = await load('pkg-simd');
    const scalar = await load('pkg');
    for (let pixels = 0; pixels <= 50; pixels++) {
        for (const extraBytes of [0, 1, 2, 3]) {
            const rgba = Uint8Array.from({ length: pixels * 4 + extraBytes }, (_, i) => (i * 97 + 13) & 255);
            assertSameBytes(simd.rgb_to_ascii(rgba), scalar.rgb_to_ascii(rgba), `${pixels} px + ${extraBytes} bytes`);
        }
    }
});
