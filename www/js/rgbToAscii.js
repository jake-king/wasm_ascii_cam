class RgbToAscii {
  constructor(){
    self.importScripts('../pkg/wasm_ascii_cam.js');
    this.instance = wasm_bindgen({module_or_path: '../pkg/wasm_ascii_cam_bg.wasm'});
  }

  render(data){
    return this.instance.then(()=> wasm_bindgen.rgb_to_ascii(data));
  }
}

let memoized_worker;

onmessage = (event) => {
  if ('init' in event.data) {
    memoized_worker = new RgbToAscii();
  } else {
    memoized_worker.render(event.data.data).then(function(result){
      const frame = result;
      postMessage({index: event.data.index, data: frame});
    }, function(err){
      console.log('Error: ' + err);
    });
  }
};

