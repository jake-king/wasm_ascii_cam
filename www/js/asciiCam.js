import { planChunks, splitPixels } from './chunks.js';

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

export class AsciiCam {
    constructor(pool, canvas, onStats) {
        this.pool = pool;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onStats = onStats;

        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.playsInline = true;
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

        // Width of one character cell relative to its font size, for this font.
        this.ctx.font = `100px ${FONT_FAMILY}`;
        this.charWidth = this.ctx.measureText('M').width / 100;

        this.setDetail(0);
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
    layout() {
        const box = this.canvas.parentElement;
        const fontSize = Math.max(4, Math.min(
            box.clientWidth / (this.width * this.charWidth),
            box.clientHeight / (this.height * LINE_HEIGHT)));
        this.fontSize = fontSize;
        this.cellWidth = fontSize * this.charWidth;
        this.lineHeight = fontSize * LINE_HEIGHT;

        const cssWidth = Math.floor(this.cellWidth * this.width);
        const cssHeight = Math.floor(this.lineHeight * this.height);
        const dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        this.video.srcObject = stream;
        try {
            await this.video.play();
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
        this.video.srcObject = null;
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
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (!vw || !vh) return;

        const shape = (this.width * this.cellWidth) / (this.height * this.lineHeight);
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
        const ctx = this.ctx;
        const px = this.pixels;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.font = `${this.fontSize}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        if (this.mono) ctx.fillStyle = MONO_COLOUR;

        for (let row = 0, i = 0; row < this.height; row++) {
            const y = row * this.lineHeight;
            for (let col = 0; col < this.width; col++, i++) {
                if (!this.mono) {
                    const p = i * 4;
                    ctx.fillStyle = `rgb(${px[p]},${px[p + 1]},${px[p + 2]})`;
                }
                ctx.fillText(ASCII_PALETTE[indices[i]], col * this.cellWidth, y);
            }
        }
        this.tickStats();
    }

    tickStats() {
        const now = performance.now();
        this.frameTimes.push(now);
        while (this.frameTimes[0] < now - 1000) this.frameTimes.shift();
        this.onStats?.({ fps: this.frameTimes.length });
    }

    drawIdle() {
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const dpr = window.devicePixelRatio || 1;
        // Largest font up to 1.4 cells that fits the message on one line.
        const room = (w / dpr) * 0.94;
        const fit = room / (this.idleMessage.length * this.charWidth);
        ctx.font = `${Math.min(this.fontSize * 1.4, fit)}px ${FONT_FAMILY}`;
        ctx.fillStyle = '#c0c0c0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.idleMessage, w / dpr / 2, h / dpr / 2);
        ctx.textAlign = 'start';
    }
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
