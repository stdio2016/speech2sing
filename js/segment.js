var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var clips = document.querySelector('.sound-clips');
var canvas = document.querySelector('#canvas');
var soundBuffer;
var waveArray = [[]];
var zoomLevel = 14;
var zoomPan = 0;
var zoomPanV = 0;
var yAxisZoom = 1;

function addClipInterface(name) {
  name = name.name;
  var clip = new Option(name, "r_"+name);
  clips.appendChild(clip);
  console.log("added " + name);
}

function startup() {
  getSoundNames().then(function (names) {
    clips.options.remove("loading");
    names.forEach(addClipInterface);
    if (names.length === 0) {
      var no = new Option("No clips ;-(", "");
      clips.options.add(no);
      clips.disabled = true;
      btnAnalyzeClip.disabled = true;
    }
  })['catch'](errorbox);
}

function openClip() {
  resumeContext();
  var name = clips.value;
  if (name.substr(0,2) === "r_") {
    name = name.substr(2);
    
    // get file from indexedDB
    getSound(name).then(function (result) {
      // convert file to ArrayBuffer
      var fr = new FileReader();
      fr.readAsArrayBuffer(result.file);
      fr.onload = function () {
        audioCtx.decodeAudioData(fr.result, decodeSuccess, decodeError);
      };
    })['catch'](errorbox);
  }

  function decodeSuccess(audioBuf) {
    soundBuffer = audioBuf;
    buildWaveArray();
    // zoom to fit
    zoomLevel = Math.log2(waveArray[0].length / canvas.width) | 0;
  }
  
  function decodeError(err) {
    throw err;
    if (err.name == 'EncodingError') {
      alertBox("File is not an audio, or the format is not supported");
    }
    else throw err;
  }
}

// build a wave table to make drawing faster
function buildWaveArray() {
  var arr = soundBuffer.getChannelData(0), arr2;
  waveArray = [arr];
  var len = arr.length >> 1;
  var lv = 0;
  arr2 = new Float32Array(len * 2);
  for (i = 0; i < len * 2; i += 2) {
    arr2[i] = Math.max(arr[i], arr[i+1]);
    arr2[i+1] = Math.min(arr[i], arr[i+1]);
  }
  lv++;
  len = Math.ceil(len/2);
  while (lv < 14) {
    arr2 = new Float32Array(len * 2);
    for (var i = 0; i < len*2; i += 2) {
      if (i*2+2 < arr.length) {
        arr2[i] = Math.max(arr[i*2], arr[i*2+2]);
        arr2[i+1] = Math.min(arr[i*2+1], arr[i*2+3]);
      }
      else {
        arr2[i] = arr[i*2];
        arr2[i+1] = arr[i*2+1];
      }
    }
    waveArray.push(arr2);
    arr = arr2;
    len = Math.ceil(len/2);
    lv++;
  }
  
  var range = 0;
  for (var i = 0; i < len*2; i++) {
    range = Math.max(range, Math.abs(arr[i]));
  }
  yAxisZoom = Math.min(1 / range, 1000);
}

requestAnimationFrame(showWave);
var mouse = {x: 0, y: 0, vx: 0, px: 0, dragging: false, t: 0};
var visualizeCallbackId = 0;

function showWave() {
  visualizeCallbackId = requestAnimationFrame(showWave);
  if (zoomLevel >= waveArray.length) zoomLevel = waveArray.length-1;
  if (zoomLevel < 0) zoomLevel = 0;
  var wav = waveArray[zoomLevel];
  var ctx = canvas.getContext('2d');
  if (!mouse.dragging) {
    if (zoomPanV > 0) {
      zoomPanV -= 1;
      if (zoomPanV < 0) zoomPanV = 0;
    }
    if (zoomPanV < 0) {
      zoomPanV += 1;
      if (zoomPanV > 0) zoomPanV = 0;
    }
    zoomPan += zoomPanV|0;
  }
  
  canvas.width = canvas.clientWidth;
  var width = canvas.width;
  var sliceWidth = 1;
  var height = canvas.height;
  zoomPan = Math.min(zoomPan, waveArray[zoomLevel].length/2 - width);
  if (zoomPan < 0) zoomPan = 0;
  
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  ctx.moveTo(0, height/2);
  for (var i = 0; i < width; i++) {
    var j = i + zoomPan;
    if (j*2 >= wav.length) break;
    var x = i;
    ctx.lineTo(x, (1 - wav[j*2] * yAxisZoom) * height/2);
    ctx.lineTo(x, (1 - wav[j*2+1] * yAxisZoom) * height/2);
  }
  ctx.stroke();
}

function canvasMouseDown(e){
  e.preventDefault();
  if (e.button == 0) {
    var newx = e.clientX;
    mouse.x = newx;
    mouse.vx = 0;
    mouse.px = newx;
    mouse.dragging = true;
    mouse.t = e.timeStamp;
  }
}

function canvasMouseMove(e){
  e.preventDefault();
  var newx = e.clientX;
  if (e.buttons & 1 && mouse.dragging) {
    zoomPan -= (newx - mouse.x);
    mouse.x = newx;
    var t = e.timeStamp;
    var exp = Math.exp((mouse.t - t)/60);
    var newpx = mouse.px * exp + newx * (1 - exp);
    mouse.vx = newpx - mouse.px;
    mouse.px = newpx;
    mouse.t = t;
  }
  mouse.x = newx;
}
function canvasMouseUp(e){
  e.preventDefault();
  if (e.button == 0 && mouse.dragging) {
    var t = e.timeStamp;
    if (t - mouse.t < 200) zoomPanV = -mouse.vx;
    else zoomPanV = 0;
    mouse.dragging = false;
  }
}
canvas.addEventListener('mousedown', canvasMouseDown);
canvas.addEventListener('mousemove', canvasMouseMove);
canvas.addEventListener('mouseup', canvasMouseUp);

var nofire = false;
function ignore () {}
function canvasTouchStart(e) {
  e.preventDefault();
  var touch = e.touches;
  if (touch.length != 1) {
    nofire = true;
    return;
  }
  else{
    nofire = false;
  }
  mouseDown({preventDefault: ignore, button: 0, clientX: touch[0].clientX, clientY: touch[0].clientY});
}
function canvasTouchMove(e) {
  e.preventDefault();
  var touch = e.touches;
  if (nofire || touch.length != 1) return;
  mouseMove({preventDefault: ignore, buttons: 1, clientX: touch[0].clientX, clientY: touch[0].clientY});
}
function canvasTouchEnd(e) {
  e.preventDefault();
  var touch = e.touches;
  if (nofire || touch.length!=0) return;
  touch = e.changedTouches;
  mouseUp({preventDefault: ignore, button: 0});
}
canvas.addEventListener('touchstart', canvasTouchStart, false);
canvas.addEventListener('touchmove', canvasTouchMove, false);
canvas.addEventListener('touchend', canvasTouchEnd, false);
