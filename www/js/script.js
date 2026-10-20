import { ThreadPool } from './thread.js';
import { AsciiCam, DETAIL_LEVELS } from './asciiCam.js';

const workers = window.navigator.hardwareConcurrency || 1;
const pool = new ThreadPool('js/rgbToAscii.js', workers);
const status = document.getElementById('status');
let fps = 0;

const cam = new AsciiCam(pool, document.getElementById('ascii-cam'), stats => {
    fps = stats.fps;
    showStatus();
});

function showStatus() {
    const { width, height } = DETAIL_LEVELS[cam.detail];
    status.textContent = cam.active
        ? `${fps} fps · ${width}×${height} · ${workers} workers`
        : `idle · ${width}×${height} · ${workers} workers`;
}

// Camera menu. Names are hidden until the page has camera permission,
// so the list is refreshed after a camera starts.
const cameras = document.getElementById('cameras');

async function listCameras() {
    const selected = cameras.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras.length = 1;
    devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
        cameras.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId));
    });
    cameras.value = selected;
}

cameras.addEventListener('change', async () => {
    if (!cameras.value) {
        cam.stop();
    } else {
        try {
            await cam.start(cameras.value);
            await listCameras();
        } catch (err) {
            console.error(`Could not open the camera: ${err}`);
            cameras.value = '';
            cam.stop();
        }
    }
    showStatus();
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

document.querySelectorAll('[data-adjust]').forEach(button => {
    button.addEventListener('click', () => adjust(button.dataset.adjust, Number(button.dataset.step)));
});

// Mirror and mono toggles.
function toggle(setting) {
    cam[setting] = !cam[setting];
    const button = document.querySelector(`[data-toggle="${setting}"]`);
    button.setAttribute('aria-pressed', String(cam[setting]));
    button.textContent = cam[setting] ? '[x]' : '[ ]';
}

document.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => toggle(button.dataset.toggle));
});

// Keyboard shortcuts, as listed in the footer.
const KEYS = {
    '1': () => setDetail(0), '2': () => setDetail(1), '3': () => setDetail(2),
    'b': () => adjust('brightness', -0.1), 'B': () => adjust('brightness', 0.1),
    'c': () => adjust('contrast', -0.1), 'C': () => adjust('contrast', 0.1),
    'm': () => toggle('mirror'), 'g': () => toggle('mono'),
};

document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLSelectElement) return;
    const action = KEYS[event.key];
    if (action) {
        event.preventDefault();
        action();
    }
});

new ResizeObserver(() => cam.layout()).observe(document.getElementById('screen'));
setDetail(0);
listCameras();
