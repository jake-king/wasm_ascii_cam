import * as thread from './thread.js';
import * as asciiCam from './asciiCam.js';

const width = 80;
const height = 30;

const totalWorkers = window.navigator.hardwareConcurrency || 1;

const pool = new thread.ThreadPool('js/rgbToAscii.js', totalWorkers);
const cam = new asciiCam.AsciiCam(width, height, pool);

window.onload = function () {
    let cameraSelect = document.getElementById('cameras');
    let count = 1;
    navigator.mediaDevices.enumerateDevices()
    .then(function(devices) {
        const cameras = devices.filter(device => device.kind === 'videoinput');
        cameras.forEach(function(device) {
            const option = document.createElement('option');
            option.value = device.deviceId;
            const label = device.label || `Camera ${count++}`;
            const textNode = document.createTextNode(label);
            option.appendChild(textNode);
            cameraSelect.appendChild(option);
        });
      });
    cameraSelect.addEventListener('change', (event) =>{
        if(cam.video.srcObject !== null){
            cam.active = false;
            cam.track.stop();
            cam.video.srcObject = null;
            cam.chunks = [];
            cam.finishedWorkers = 0;
            window.cancelAnimationFrame(cam.animationRequest);
            if(cameraSelect.value !== 'nocam'){
                cam.init(cameraSelect.value);
            }
        } else if(cameraSelect.value !== 'nocam'){
            cam.init(cameraSelect.value);
        }
    });
    
}