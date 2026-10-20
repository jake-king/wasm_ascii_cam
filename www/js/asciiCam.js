import { planChunks, splitPixels } from './chunks.js';
import { WebGlRenderer, Canvas2dRenderer } from './renderer.js';

// 64 glyphs, darkest to brightest; index = the WASM core's output.
export const ASCII_PALETTE = ['.', '\'', '`', '^', '"', ':', ';', 'I',
'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', '[', '}', '{',
'1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 'n', 'u', 'v',
'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 'Z', 'm',
'w', 'd', 'b', 'k', 'h', 'a', 'o', '9', '#', 'M', 'W', '&', '8',
'%', 'B', '@', '$'];

// Grid sizes in characters. All share one shape, so the picture keeps its framing.
export const DETAIL_LEVELS = [
    { width: 80, height: 30 },
    { width: 120, height: 45 },
    { width: 160, height: 60 },
];

const FONT_FAMILY = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';
const LINE_HEIGHT = 1.2;   // line height as a multiple of font size
const MONO_COLOUR = '#33ff66';
const MONO_RGB = [0x33 / 255, 0xff / 255, 0x66 / 255];

export class AsciiCam {
    // renderer: 'webgl2' (default; falls back to canvas2d) or 'canvas2d'.
    constructor(pool, canvas, overlay, onStats, renderer = 'webgl2') {
        this.pool = pool;
        this.canvas = canvas;
        this.overlay = overlay;
        this.onStats = onStats;
        this.renderer = (renderer === 'webgl2' && WebGlRenderer.create(canvas))
            || new Canvas2dRenderer(canvas);

        this.video = null;
        this.frameCanvas = document.createElement('canvas');
        this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true });

        this.brightness = 1;
        this.contrast = 1;
        this.mirror = true;
        this.mono = false;
        this.idleMessage = '[ no camera: choose one under Controls ]';

        this.stream = null;
        this.active = false;
        this.frame = 0;          // id of the newest frame sent to the workers
        this.inFlight = null;    // id of the frame being converted, or null
        this.frameTimes = [];
        this.renderMs = 0;       // smoothed main-thread time per render()

        // Width of one character cell relative to its font size, for this font.
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = `100px ${FONT_FAMILY}`;
        this.charWidth = measure.measureText('M').width / 100;

        this.setDetail(DETAIL_LEVELS.length - 1);
    }

    setDetail(level) {
        this.detail = level;
        ({ width: this.width, height: this.height } = DETAIL_LEVELS[level]);
        this.plan = planChunks(this.width * this.height, this.pool.size);
        this.frameCanvas.width = this.width;
        this.frameCanvas.height = this.height;
        this.inFlight = null;    // results for the old size are dropped by frame id
        this.layout();
    }

    // Size the output canvas to fill its container at the current grid size.
    // Cells are a whole number of device pixels, so glyphs map 1:1 to pixels.
    layout() {
        const box = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const fontSize = Math.max(4, Math.min(
            box.clientWidth * dpr / (this.width * this.charWidth),
            box.clientHeight * dpr / (this.height * LINE_HEIGHT)));
        const cellWidth = Math.max(1, Math.floor(fontSize * this.charWidth));
        const cellHeight = Math.max(1, Math.floor(fontSize * LINE_HEIGHT));

        this.canvas.width = cellWidth * this.width;
        this.canvas.height = cellHeight * this.height;
        this.canvas.style.width = `${this.canvas.width / dpr}px`;
        this.canvas.style.height = `${this.canvas.height / dpr}px`;
        this.renderer.resize({
            columns: this.width, rows: this.height, cellWidth, cellHeight,
            fontSize, fontFamily: FONT_FAMILY, textTop: (cellHeight - fontSize) / 2,
            palette: ASCII_PALETTE, monoColour: MONO_RGB, monoCss: MONO_COLOUR,
        });
        this.cellAspect = cellWidth / cellHeight;
        if (!this.active) this.drawIdle();
    }

    // Start a camera by device id, or the default camera when the id is empty
    // (browsers hide ids until the page has camera permission).
    // Resolves to the id of the camera actually opened. Some cameras take
    // seconds to start; a later start() or stop() supersedes this one, which
    // then releases its camera and rejects with Superseded.
    async start(deviceId) {
        this.stop('[ starting camera... ]');
        const request = this.request;
        const video = { width: { ideal: 640 } };
        if (deviceId) video.deviceId = { exact: deviceId };

        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (request !== this.request) {
            stream.getTracks().forEach(track => track.stop());
            throw new Superseded();
        }
        this.stream = stream;
        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.autoplay = true;
        // Kept in the page (hidden): some browser extensions re-play detached
        // video elements, which aborts our own play() call.
        this.video.hidden = true;
        document.body.append(this.video);
        this.video.srcObject = stream;
        try {
            await whenPlaying(this.video);
        } catch (err) {
            throw request !== this.request ? new Superseded() : err;
        }
        if (request !== this.request) throw new Superseded();
        this.active = true;
        this.loop();
        return this.stream.getVideoTracks()[0].getSettings().deviceId;
    }

    stop(message) {
        this.request = (this.request ?? 0) + 1;   // cancels a start() in progress
        this.idleMessage = message ?? this.idleMessage;
        this.active = false;
        this.inFlight = null;
        window.cancelAnimationFrame(this.raf);
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
        if (this.video) {
            this.video.srcObject = null;
            this.video.remove();
        }
        this.video = null;
        this.frameTimes = [];
        this.drawIdle();
    }

    loop() {
        if (!this.active) return;
        if (this.inFlight === null) this.capture();
        this.raf = window.requestAnimationFrame(() => this.loop());
    }

    // Draw the camera into the small frame canvas, cropped to the grid's shape,
    // then hand the pixels to the workers.
    capture() {
        if (!this.video) return;
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (!vw || !vh) return;

        const shape = (this.width / this.height) * this.cellAspect;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (vw / vh > shape) { sw = vh * shape; sx = (vw - sw) / 2; }
        else { sh = vw / shape; sy = (vh - sh) / 2; }

        const ctx = this.frameCtx;
        ctx.save();
        ctx.filter = `brightness(${this.brightness}) contrast(${this.contrast})`;
        if (this.mirror) { ctx.translate(this.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, this.width, this.height);
        ctx.restore();

        this.pixels = ctx.getImageData(0, 0, this.width, this.height).data;
        this.inFlight = ++this.frame;
        this.chunks = [];
        this.received = 0;
        splitPixels(this.pixels, this.plan.bytesPerChunk).forEach((data, index) => {
            this.pool.queueTask({ frame: this.frame, index, data }, this);
        });
    }

    collect(message) {
        if (message.frame !== this.inFlight) return;   // stale: size or camera changed
        this.chunks[message.index] = message.data;
        this.received += 1;
        if (this.received === this.plan.count) {
            this.render(concatenate(this.chunks));
            this.inFlight = null;
        }
    }

    render(indices) {
        const start = performance.now();
        this.renderer.draw(indices, this.pixels, this.mono);
        this.renderMs += (performance.now() - start - this.renderMs) * 0.1;
        this.overlay.hidden = true;
        this.tickStats();
    }

    tickStats() {
        const now = performance.now();
        this.frameTimes.push(now);
        while (this.frameTimes[0] < now - 1000) this.frameTimes.shift();
        this.onStats?.({ fps: this.frameTimes.length, renderMs: this.renderMs });
    }

    drawIdle() {
        this.renderer.clear();
        this.overlay.textContent = this.idleMessage;
        this.overlay.hidden = false;
    }
}

// Resolves when the video is playing. Firefox can reject play() with
// AbortError for a camera stream that then plays anyway (autoplay), so the
// 'playing' event decides; give up if nothing plays within 15 seconds.
function whenPlaying(video) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('the camera did not start')), 15000);
        video.addEventListener('playing', () => { clearTimeout(timer); resolve(); }, { once: true });
        video.play().catch(err => {
            if (err.name !== 'AbortError') { clearTimeout(timer); reject(err); }
        });
    });
}

// A camera start that was cancelled by a newer start() or stop().
export class Superseded extends Error {
    constructor() {
        super('camera start superseded');
        this.name = 'Superseded';
    }
}

function concatenate(arrays) {
    const result = new Uint8Array(arrays.reduce((total, arr) => total + arr.length, 0));
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
