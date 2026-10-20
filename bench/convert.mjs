// Times the WASM pixel-to-glyph conversion, SIMD and scalar builds.
// Build first: npm run build. Run: npm run bench
import { load } from '../test/load-wasm.mjs';

const SIZES = { '160×60': 160 * 60, '1920×1080': 1920 * 1080 };
const builds = { scalar: await load('pkg'), simd: await load('pkg-simd') };

function time(fn, iterations) {
    for (let i = 0; i < Math.ceil(iterations / 10); i++) fn();
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    return Number(process.hrtime.bigint() - start) / iterations / 1e6;
}

console.log('| Frame | Measured | Scalar | SIMD | Speed-up |\n|---|---|---|---|---|');
for (const [label, pixels] of Object.entries(SIZES)) {
    const rgba = Uint8Array.from({ length: pixels * 4 }, (_, i) => (i * 2654435761) >>> 24);
    const iterations = Math.max(20, Math.round(1e8 / pixels));
    const rows = {
        'conversion only (inside WASM)': w => time(() => w.convert_repeatedly(rgba, 10), iterations / 10) / 10,
        'with JS↔WASM copies': w => time(() => w.rgb_to_ascii(rgba), iterations),
    };
    for (const [what, measure] of Object.entries(rows)) {
        const scalar = measure(builds.scalar), simd = measure(builds.simd);
        console.log(`| ${label} | ${what} | ${scalar.toFixed(3)} ms | ${simd.toFixed(3)} ms | ${(scalar / simd).toFixed(1)}× |`);
    }
}
