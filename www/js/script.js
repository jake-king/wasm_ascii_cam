const ASCII_PALETTE = ['.', '\'', '`', '^', '"', ':', ';', 'I', 
'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', '[', '}', '{', 
'1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 'n', 'u', 'v', 
'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 'Z', 'm', 
'w', 'd', 'b', 'k', 'h', 'a', 'o', '*', '#', 'M', 'W', '&', '8', 
'%', 'B', '@', '$'];

const width = 40;
const height = 30;

const video = document.getElementById('video');
const videoCanvas = document.getElementById('canvas');
let asciiCanvas = document.getElementById('ascii-cam');
let vidCtx = videoCanvas.getContext("2d");
let ctx = asciiCanvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.font = "normal 14px Courier";

const fontWidth =  ctx.measureText('M').width;
const lineHeight = 16;
asciiCanvas.width = (fontWidth*2) * width;
asciiCanvas.height = lineHeight * height;

let imageData = null;
let div = document.getElementById('ascii-cam');

let worker = new Worker('js/rgbToAscii.js');

worker.onmessage = function (event){
    let x = 0;
    let y = lineHeight;
    ctx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);

    for(let i = 0; i < width * height; i++){
        const text = ASCII_PALETTE[event.data[i]] + ASCII_PALETTE[event.data[i]];
        const pos = i * 4;
        ctx.font = "normal 14px Courier";
        ctx.fillStyle = 'rgb(' + imageData.data[pos] + ',' + imageData.data[pos+1] + ',' + imageData.data[pos+2] + ')';
        if(i % 40 === 0 && i !== 0){
            y = y + lineHeight;
            x = 0;
        }
        ctx.fillText(text, x, y);
        x = x + fontWidth * 2;
    }
    
    window.requestAnimationFrame(tick);
}

worker.postMessage({init:'init', width: width});

start();

function start(){
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
        videoCanvas.setAttribute('width', width);
        videoCanvas.setAttribute('height', height);
        window.requestAnimationFrame(tick);
    }, false);
}

function tick(){
    vidCtx.drawImage(video, 0, 0, width, height);
    imageData = vidCtx.getImageData(0, 0, width, height);
    worker.postMessage({width: imageData.width, height: imageData.height, data: imageData.data});
}
