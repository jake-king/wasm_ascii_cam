import { ThreadPool } from './thread.js';
import { AsciiCam, DETAIL_LEVELS, Superseded } from './asciiCam.js';

const workers = window.navigator.hardwareConcurrency || 1;
const pool = new ThreadPool('js/rgbToAscii.js', workers);
const status = document.getElementById('status');
let fps = 0;
let renderMs = 0;

// The workers use the SIMD build when the browser can compile it.
let instructionSet = 'wasm';
fetch('pkg-simd/wasm_ascii_cam_bg.wasm')
    .then(response => response.arrayBuffer())
    .then(bytes => { instructionSet = WebAssembly.validate(bytes) ? 'simd' : 'scalar'; showStatus(); });

// ?renderer=2d forces the Canvas 2D renderer, for comparison.
const requested = new URLSearchParams(location.search).get('renderer') === '2d' ? 'canvas2d' : 'webgl2';
const cam = new AsciiCam(pool, document.getElementById('ascii-cam'), document.getElementById('overlay'),
    stats => {
        ({ fps, renderMs } = stats);
        showStatus();
    }, requested);

function showStatus() {
    const { width, height } = DETAIL_LEVELS[cam.detail];
    const where = `${width}×${height} · ${cam.renderer.name} · ${instructionSet} · ${workers} workers`;
    status.textContent = cam.active
        ? `${cam.source === 'file' ? 'video' : 'camera'} · ${fps} fps · draw ${renderMs.toFixed(2)} ms · ${where}`
        : `idle · ${where}`;
}

// Camera menu. Until the page has camera permission, browsers hide camera
// names and ids, so an option's value may be empty: that opens the default
// camera, and the list is refreshed with real names and ids once it starts.
const cameras = document.getElementById('cameras');
const OFF = 'off';

async function listCameras(selected = cameras.value) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras.length = 1;
    devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
        cameras.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId));
    });
    cameras.value = selected;
}

const IDLE = '[ no camera: choose one under Controls ]';
const CAMERA_ERRORS = {
    NotAllowedError: '[ camera blocked: allow it in the address bar, then choose a camera ]',
    NotFoundError: '[ no camera found ]',
    NotReadableError: '[ camera is busy or unavailable ]',
};

async function openCamera(deviceId) {
    try {
        exporting?.abort();
        showFileControls(false);
        setToggle('mirror', true);
        setToggle('fit', false);
        const opened = await cam.start(deviceId);
        await listCameras(opened);
    } catch (err) {
        if (err instanceof Superseded) return;   // a newer choice is starting
        console.error(`Could not open the camera: ${err}`);
        cam.stop(CAMERA_ERRORS[err.name] ?? `[ camera error: ${err.message || err} ]`);
        await listCameras(OFF);
    }
    showStatus();
}

cameras.addEventListener('change', () => {
    if (cameras.value === OFF) {
        cam.stop(IDLE);
        showStatus();
    } else {
        openCamera(cameras.value);
    }
});

// Detail: one radio-style button per level.
const detail = document.getElementById('detail');
DETAIL_LEVELS.forEach(({ width, height }, level) => {
    const button = document.createElement('button');
    button.setAttribute('role', 'radio');
    button.textContent = `${width}×${height}`;
    button.addEventListener('click', () => setDetail(level));
    detail.append(button);
});

function setDetail(level) {
    cam.setDetail(level);
    [...detail.children].forEach((b, i) => b.setAttribute('aria-checked', String(i === level)));
    showStatus();
}

// Brightness and contrast, 0.1 to 3.0.
function adjust(setting, step) {
    cam[setting] = Math.min(3, Math.max(0.1, Math.round((cam[setting] + step) * 10) / 10));
    document.getElementById(setting).textContent = cam[setting].toFixed(1);
}

function reset(setting) {
    cam[setting] = 1;
    document.getElementById(setting).textContent = '1.0';
}

document.querySelectorAll('[data-adjust]').forEach(button => {
    button.addEventListener('click', () => adjust(button.dataset.adjust, Number(button.dataset.step)));
});
document.querySelectorAll('[data-reset]').forEach(button => {
    button.addEventListener('click', () => reset(button.dataset.reset));
});

// Mirror and mono toggles.
function setToggle(setting, on) {
    cam[setting] = on;
    const button = document.querySelector(`[data-toggle="${setting}"]`);
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? '[x]' : '[ ]';
}

function toggle(setting) {
    setToggle(setting, !cam[setting]);
}

document.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => toggle(button.dataset.toggle));
});

// Snapshots: download the current frame as PNG or text.
function download(blob, extension) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-`
        + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `asciicam-${stamp}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function nothingToSave() {
    status.textContent = 'nothing to save yet: start a camera first';
}

async function savePng() {
    const blob = await cam.snapshotPng();
    if (blob) download(blob, 'png'); else nothingToSave();
}

function saveText() {
    const text = cam.snapshotText();
    if (text) download(new Blob([text], { type: 'text/plain' }), 'txt'); else nothingToSave();
}

document.getElementById('save-png').addEventListener('click', savePng);
document.getElementById('save-txt').addEventListener('click', saveText);

// Video files: play as the source, seek, and export the whole clip.
const fileInput = document.getElementById('video-file');
const fileControls = document.querySelector('.file-only');
const playPause = document.getElementById('play-pause');
const position = document.getElementById('position');
const seekBar = document.getElementById('seek');
const exportButton = document.getElementById('export');
const exportStatus = document.getElementById('export-status');
let exporting = null;   // AbortController while an export runs

function showFileControls(visible) {
    fileControls.hidden = !visible;
}

document.getElementById('open-video').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (!file) return;
    exporting?.abort();
    cameras.value = OFF;
    try {
        await cam.startFile(file);
        setToggle('mirror', false);
        setToggle('fit', true);
        showFileControls(true);
    } catch (err) {
        if (err instanceof Superseded) return;
        console.error(`Could not play the video: ${err}`);
        cam.stop(`[ cannot play ${file.name}: ${err.message || err.name} ]`);
        showFileControls(false);
    }
    showStatus();
});

function clock(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let seeking = false;
seekBar.addEventListener('pointerdown', () => { seeking = true; });
seekBar.addEventListener('change', () => { seeking = false; });
seekBar.addEventListener('input', () => {
    const state = cam.playback();
    if (state) cam.seek(seekBar.value / 1000 * state.duration);
});

playPause.addEventListener('click', () => cam.togglePause());

// Keep the playback row current.
setInterval(() => {
    const state = cam.playback();
    if (!state) return;
    playPause.textContent = state.paused ? '[>]' : '[||]';
    position.textContent = `${clock(state.currentTime)} / ${clock(state.duration)}`;
    if (!seeking && state.duration) seekBar.value = Math.round(state.currentTime / state.duration * 1000);
}, 200);

exportButton.addEventListener('click', async () => {
    if (exporting) {
        exporting.abort();
        return;
    }
    exporting = new AbortController();
    exportButton.textContent = '[cancel]';
    seekBar.disabled = playPause.disabled = true;
    try {
        const blob = await cam.exportVideo({
            signal: exporting.signal,
            onProgress: fraction => { exportStatus.textContent = `recording ${Math.round(fraction * 100)}%`; },
        });
        download(blob, 'webm');
        exportStatus.textContent = 'saved';
    } catch (err) {
        exportStatus.textContent = err.name === 'AbortError' ? 'cancelled' : `failed: ${err.message || err}`;
        if (err.name !== 'AbortError') console.error(`Export failed: ${err}`);
    } finally {
        exporting = null;
        exportButton.textContent = '[webm]';
        seekBar.disabled = playPause.disabled = false;
    }
});

// Keyboard shortcuts, as listed in the footer.
const KEYS = {
    '1': () => setDetail(0), '2': () => setDetail(1), '3': () => setDetail(2),
    'b': () => adjust('brightness', -0.1), 'B': () => adjust('brightness', 0.1),
    'c': () => adjust('contrast', -0.1), 'C': () => adjust('contrast', 0.1),
    'r': () => { reset('brightness'); reset('contrast'); },
    'm': () => toggle('mirror'), 'g': () => toggle('mono'),
    'f': () => toggle('fill'), 'w': () => toggle('fit'),
    's': savePng, 't': saveText,
    'o': () => fileInput.click(),
    ' ': () => { if (!exporting) cam.togglePause(); },
    'ArrowLeft': () => { if (!exporting) cam.seek((cam.playback()?.currentTime ?? 0) - 5); },
    'ArrowRight': () => { if (!exporting) cam.seek((cam.playback()?.currentTime ?? 0) + 5); },
};

document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    const action = KEYS[event.key];
    if (action) {
        event.preventDefault();
        action();
    }
});

new ResizeObserver(() => cam.layout()).observe(document.getElementById('screen'));
// On load, ask for camera permission and start the default camera.
setDetail(DETAIL_LEVELS.length - 1);
// Firefox holds the permission prompt until the page has focus, and a
// request made while unfocused can stay unanswered even after focus
// arrives. So when the page opens unfocused (e.g. typed into the address
// bar), wait for a click in the page before asking for the camera.
const CLICK_TO_START = '[ click here to start the camera ]';
if (document.hasFocus()) {
    openCamera('');
} else {
    cam.stop(CLICK_TO_START);
    document.addEventListener('pointerdown', () => {
        if (!cam.active && cam.idleMessage === CLICK_TO_START) openCamera('');
    }, { once: true });
}
