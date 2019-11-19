const width = 40;
const height = 30;

let video = null;
let canvas = null;
let ctx = null;
const totalThreads = width * height;
let imageData = null;
let frame = null;
let finishedThreads = 0;
let pos = 0;
let i = 0;
let div = document.getElementById('ascii-cam');

let worker = new Worker('js/rgbToAscii.js');

worker.onmessage = function (event){
    frame[event.data.position] = event.data.tag;
    i = i+4;
    pos = pos + 1;
    finishedThreads = finishedThreads + 1;
    if (finishedThreads === totalThreads){  
        div.innerHTML = frame.toString().replace(/,/g, '');
        window.requestAnimationFrame(tick);
    } else{
        worker.postMessage({position: pos, rgb: imageData.data.slice(i,i+3)});
    }
}

worker.postMessage({init:'init', width: width});

start();

function start(){
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext("2d");

    navigator.mediaDevices.getUserMedia({video: true, audio: false})
    .then((stream) => {
        video.srcObject = stream;
        video.setAttribute("playsinline", true); 
        video.play();
    })
    .catch((err) => {
        console.log("An error occured: " + err);
    });

    video.addEventListener('canplay', () => {
        video.setAttribute('width', width);
        video.setAttribute('height', height);
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        window.requestAnimationFrame(tick);
    }, false);

    
}

function tick(){
    frame = [];
    finishedThreads = 0;
    pos = 0;
    i = 0;
    ctx.drawImage(video, 0, 0, width, height);
    imageData = ctx.getImageData(0, 0, width, height);
    worker.postMessage({position: pos, rgb: imageData.data.slice(i,i+3)});
}
