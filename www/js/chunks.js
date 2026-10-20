// Splitting a frame's RGBA bytes into whole-pixel chunks, one per worker.

export function planChunks(pixels, workers) {
    const perChunk = Math.ceil(pixels / Math.max(1, workers));
    return { bytesPerChunk: perChunk * 4, count: Math.ceil(pixels / perChunk) };
}

export function splitPixels(rgba, bytesPerChunk) {
    const chunks = [];
    for (let start = 0; start < rgba.length; start += bytesPerChunk) {
        chunks.push(rgba.slice(start, start + bytesPerChunk));
    }
    return chunks;
}
