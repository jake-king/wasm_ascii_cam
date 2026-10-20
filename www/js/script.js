import { ThreadPool } from './thread.js';
import { AsciiCam, DETAIL_LEVELS, Superseded } from './asciiCam.js';

const workers = window.navigator.hardwareConcurrency || 1;
const pool = new ThreadPool('js/rgbToAscii.js', workers);
const status = document.getElementById('status');
let fps = 0;
let renderMs = 0;

// ?renderer=2d forces the Canvas 2D renderer, for comparison.
const requested = new URLSearchParams(location.search).get('renderer') === '2d' ? 'canvas2d' : 'webgl2';
const cam = new AsciiCam(pool, document.getElementById('ascii-cam'), document.getElementById('overlay'),
    stats => {
        ({ fps, renderMs } = stats);
        showStatus();
    }, requested);

function showStatus() {
    const { width, height } = DETAIL_LEVELS[cam.detail];
    const where = `${width}×${height} · ${cam.renderer.name} · ${workers} workers`;
    status.textContent = cam.active
        ? `${fps} fps · draw ${renderMs.toFixed(2)} ms · ${where}`
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
    'r': () => { reset('brightness'); reset('contrast'); },
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
// On load, ask for camera permission and start the default camera.
setDetail(DETAIL_LEVELS.length - 1);
// Firefox holds the permission prompt until the page has focus, e.g. after
// the address bar was used to open it.
cam.stop(document.hasFocus()
    ? '[ waiting for camera permission ]'
    : '[ click here to enable the camera ]');
window.addEventListener('focus', () => {
    if (!cam.active && cam.idleMessage === '[ click here to enable the camera ]') {
        cam.stop('[ waiting for camera permission ]');
    }
});
openCamera('');
