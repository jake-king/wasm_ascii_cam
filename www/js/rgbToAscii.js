class RgbToAscii {
  constructor(){
    self.importScripts('./wasm_ascii_cam.js');
    this.instance = wasm_bindgen('./wasm_ascii_cam_bg.wasm');
  }

  render(width, height, data){
    return this.instance.then(()=> wasm_bindgen.rgb_to_ascii(width, height, data));
  }
}

let memoized_worker;

onmessage = (event) => {
  if ('init' in event.data) {
    memoized_worker = new RgbToAscii();
  } else {
    memoized_worker.render(event.data.width, event.data.height, event.data.data).then(function(result){
    const frame = result;
    postMessage(frame);
  }, function(err){
      console.log('Error: ' + err);
    });
  }
};

