// Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { planChunks, splitPixels } from '../www/js/chunks.js';
import { assertSameBytes } from './bytes.mjs';

const SIZES = [80 * 30, 120 * 45, 160 * 60];

test('every pixel lands in exactly one whole-pixel chunk, for 1-64 workers', () => {
    for (const pixels of SIZES) {
        const rgba = new Uint8Array(pixels * 4).map((_, i) => i % 251);
        for (let workers = 1; workers <= 64; workers++) {
            const plan = planChunks(pixels, workers);
            const chunks = splitPixels(rgba, plan.bytesPerChunk);
            const where = `${pixels} px, ${workers} workers`;

            assert.equal(chunks.length, plan.count, where);
            assert.ok(plan.count <= workers, `more chunks than workers: ${where}`);
            assert.ok(chunks.every(c => c.length % 4 === 0), `partial pixel: ${where}`);
            assertSameBytes(Uint8Array.from(chunks.flatMap(c => [...c])), rgba, where);
        }
    }
});

test('zero workers is treated as one', () => {
    assert.deepEqual(planChunks(100, 0), { bytesPerChunk: 400, count: 1 });
});
