import assert from 'node:assert/strict';

// Compare large byte arrays without assert.deepEqual: when that fails on two
// big, mostly different arrays, building its diff message takes memory that
// grows with the square of the length (about 80 GB at 65,536 elements).
export function assertSameBytes(actual, expected, label) {
    assert.equal(actual.length, expected.length, `${label}: length`);
    for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            assert.fail(`${label}: first difference at index ${i}: got ${actual[i]}, expected ${expected[i]}`);
        }
    }
}
