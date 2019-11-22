const ASCII_PALETTE = ['.', '\'', '`', '^', '"', ':', ';', 'I', 
'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', '[', '}', '{', 
'1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 'n', 'u', 'v', 
'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 'Z', 'm', 
'w', 'd', 'b', 'k', 'h', 'a', 'o', '9', '#', 'M', 'W', '&', '8', 
'%', 'B', '@', '$'];

const width = 80;
const height = 30;

const video = document.getElementById('video');
const videoCanvas = document.getElementById('canvas');
const asciiCanvas = document.getElementById('ascii-cam');
const vidCtx = videoCanvas.getContext("2d");
const ctx = asciiCanvas.getContext("2d");

const fontWidth =  ctx.measureText('M').width;
const lineHeight = 16;
asciiCanvas.width = fontWidth * width;
asciiCanvas.height = lineHeight * height;

let imageData = null;

let worker = new Worker('js/rgbToAscii.js');

worker.onmessage = function (event){
    let x = 0;
    let y = lineHeight;
    ctx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
    ctx.font = "normal 14px Courier";
    ctx.imageSmoothingEnabled = false;

    for(let i = 0; i < width * height; i++){
        // const text = ASCII_PALETTE[event.data[i]] + ASCII_PALETTE[event.data[i]];
        const text = ASCII_PALETTE[event.data[i]];
        const pos = i * 4;
        
        ctx.fillStyle = 'rgb(' + imageData.data[pos] + ',' + imageData.data[pos+1] + ',' + imageData.data[pos+2] + ')';
        if(i % width === 0 && i !== 0){
            y = y + lineHeight;
            x = 0;
        }
        ctx.fillText(text, x, y);
        x = x + fontWidth;
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
