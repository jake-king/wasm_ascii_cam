class RgbToAscii {
  constructor(){
    self.importScripts('./wasm_ascii_cam.js');
    this.instance = wasm_bindgen('./wasm_ascii_cam_bg.wasm');
  }

  render(r, g, b){
    return this.instance.then(()=> wasm_bindgen.rgb_to_ascii(r,g,b));
  }
}

let memoized_worker;
let width;

onmessage = (event) => {
  if ('init' in event.data) {
    memoized_worker = new RgbToAscii();
    width = event.data.width;
    // console.log("Worker initialized...");
  } else {
    let ascii;
    memoized_worker.render(event.data.rgb[0], event.data.rgb[1], event.data.rgb[2]).then(function(result){
    ascii = result;
    if( (event.data.position % width === 0) && (event.data.position !== 0) ){
      ascii = '<br>' + ascii;
    }
    postMessage({position: event.data.position, tag: ascii});
  }, function(err){
      console.log('Error: ' + err);
    });
  }
};

