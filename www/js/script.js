import * as thread from './thread.js';
import * as asciiCam from './asciiCam.js';

const width = 80;
const height = 30;

const totalWorkers = window.navigator.hardwareConcurrency || 1;

const pool = new thread.ThreadPool('js/rgbToAscii.js', totalWorkers);
const cam = new asciiCam.AsciiCam(width, height, pool);

window.onload = function () {
    cam.init();
}