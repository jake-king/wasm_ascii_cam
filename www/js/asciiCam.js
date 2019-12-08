export const ASCII_PALETTE = ['.', '\'', '`', '^', '"', ':', ';', 'I', 
'l', '!', 'i', '>', '<', '~', '+', '-', '?', ']', '[', '}', '{', 
'1', ')', '(', '|', '\\', '/', 't', 'f', 'r', 'x', 'n', 'u', 'v', 
'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0', 'O', 'Z', 'm', 
'w', 'd', 'b', 'k', 'h', 'a', 'o', '9', '#', 'M', 'W', '&', '8', 
'%', 'B', '@', '$'];

export class AsciiCam {
    constructor(width, height, threadPool){
        this.active = false;
        this.width = width;
        this.height = height;
        this.video = document.getElementById('video');
        this.videoCanvas = document.getElementById('canvas');
        this.asciiCanvas = document.getElementById('ascii-cam');
        this.vidCtx = this.videoCanvas.getContext("2d");
        this.ctx = this.asciiCanvas.getContext("2d");

        this.fontWidth =  Math.ceil(this.ctx.measureText('M').width);
        this.lineHeight = 16;
        this.asciiCanvas.width = this.fontWidth * this.width;
        this.asciiCanvas.height = this.lineHeight * this.height;

        this.settings = new VideoSettings();
        this.pool = threadPool;
        this.totalWorkers = this.pool.threads.length;
        this.chunkSize = Math.floor((this.width * this.height)/this.totalWorkers) * 4;
        this.chunks = [];
        this.finishedWorkers = 0;
    }

    collect(message){
        this.chunks[message.index] = message.data;
        this.finishedWorkers = this.finishedWorkers + 1;
        if (this.finishedWorkers === this.totalWorkers){
            this.data = this.concatenate(...this.chunks);
            this.chunks = [];
            this.finishedWorkers = 0;
            if (this.active === true){
                this.render();
            }
        }
    }

    concatenate(...arrays) {
        const totalLength = arrays.reduce((total, arr) => {
            return total + arr.length
        }, 0);
        const result = new Uint8Array(totalLength);
        arrays.reduce((offset, arr) => {
            result.set(arr, offset);
            return offset + arr.length;
        }, 0);
        return result;
    }

    chunkImageData(arr){
        let chunkedImageData = [];
        const chunks = Math.floor(arr.length/this.chunkSize);
    
        for(let i = 0; i < chunks; i++){
            chunkedImageData[i] = arr.slice(i*this.chunkSize, (i*this.chunkSize)+this.chunkSize);
        }
    
        if( arr.length % this.chunkSize !== 0 ){
            chunkedImageData[chunks] = arr.slice(chunks, arr.length-1);
        }
    
        return chunkedImageData;
    }

    init(deviceId){
        navigator.mediaDevices.getUserMedia({video: {deviceId: deviceId}, audio: false})
        .then((stream) => {
            this.video.srcObject = stream;
            this.track = stream.getTracks()[0];
            this.video.setAttribute("playsinline", true); 
            this.video.play();
        })
        .catch((err) => {
            console.log("An error occured: " + err);
        });

        this.video.addEventListener('canplay', ()=>{
            this.video.setAttribute('width', this.width);
            this.video.setAttribute('height', this.height);
            this.videoCanvas.setAttribute('width', this.width);
            this.videoCanvas.setAttribute('height', this.height);
            this.ctx.font = "normal 14px monospace";
            this.ctx.imageSmoothingEnabled = false;
            this.active = true;
            this.animationRequest = window.requestAnimationFrame(this.tick.bind(this));
        }, false);
    }

    tick(){
        this.vidCtx.filter = `brightness(${this.settings.brightness}) contrast(${this.settings.contrast})`;
        this.vidCtx.drawImage(this.video, 0, 0, this.width, this.height);
        this.imageData = this.vidCtx.getImageData(0, 0, this.width, this.height);
        let chunkedData = this.chunkImageData(this.imageData.data);
    
        chunkedData.forEach((chunk, index)=> {
            this.pool.queueTask({data: chunk, index: index}, this);
        });
    }

    render(){
        let x = 0;
        let y = this.lineHeight;
        this.ctx.clearRect(0, 0, this.asciiCanvas.width, this.asciiCanvas.height);
        
        for(let i = 0; i < this.width * this.height; i++){
            const text = ASCII_PALETTE[this.data[i]];
            const pos = i * 4;
            
            this.ctx.fillStyle = 'rgb(' + this.imageData.data[pos] + ',' + this.imageData.data[pos+1] + ',' + this.imageData.data[pos+2] + ')';
            if(i % this.width === 0 && i !== 0){
                y = y + this.lineHeight;
                x = 0;
            }
            this.ctx.fillText(text, x, y);
            x = x + this.fontWidth;
        }
        if (this.active === true){
            this.animationRequest = window.requestAnimationFrame(this.tick.bind(this));
        }
    }
}

export class VideoSettings{
    constructor(){
        this.brightness = 1;
        this.contrast = 1;
        document.getElementById('contrast-subtract').addEventListener('click', (event) => {
            event.preventDefault();
            this.adjust('contrast', -0.1);
        });
        document.getElementById('contrast-add').addEventListener('click', (event) => {
            event.preventDefault();
            this.adjust('contrast', 0.1);
        });
        document.getElementById('brightness-subtract').addEventListener('click', (event) => {
            event.preventDefault();
            this.adjust('brightness', -0.1);
        });
        document.getElementById('brightness-add').addEventListener('click', (event) => {
            event.preventDefault();
            this.adjust('brightness', 0.1);
        });
    }

    adjust(setting, value){
        switch(setting){
            case 'brightness':
                this.brightness =  this.brightness + value;
                document.getElementById('brightness').innerText = Math.round(10*this.brightness)/10;
                break;
            case 'contrast':
                this.contrast =  this.contrast + value;
                document.getElementById('contrast').innerText = Math.round(10*this.contrast)/10;
                break;
        }
        
    }
}