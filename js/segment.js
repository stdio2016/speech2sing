var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var clips = document.querySelector('.sound-clips');
var canvas = document.querySelector('#canvas');
var soundBuffer = {sampleRate: audioCtx.sampleRate};
var waveArray = [[]];
var MaxZoomLevel = 12;
var zoomLevel = MaxZoomLevel;
var zoomPan = 0;
var zoomPanV = 0;
var yAxisZoom = 1;
var playStartTime = 0;
var playingSound = false;
var selected = {start: 0, end: 0.5};
var segments = {};
var segmentId = 0;

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
      var no = new Option("No clips 😢", "");
      clips.options.add(no);
      clips.disabled = true;
      btnOpenClip.disabled = true;
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
  waveArray = [arr.slice(0)];
  var len = arr.length >> 1;
  var lv = 0;
  arr2 = new Float32Array(len * 2);
  for (i = 0; i < len * 2; i += 2) {
    arr2[i] = Math.max(arr[i], arr[i+1]);
    arr2[i+1] = Math.min(arr[i], arr[i+1]);
  }
  lv++;
  len = Math.ceil(len/2);
  while (lv < MaxZoomLevel) {
    arr2 = new Float32Array(len * 2);
    for (var i = 0; i < len*2; i += 2) {
      if (i*2+3 < arr.length) {
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
  for (var i = 0; i < arr.length; i++) {
    range = Math.max(range, Math.abs(arr[i]));
  }
  console.log(range);
  yAxisZoom = Math.min(1 / range, 1000);
}

requestAnimationFrame(showWave);
var mouse = {x: 0, y: 0, vx: 0, px: 0, dragging: false, t: 0, dragBar: 0};
var visualizeCallbackId = 0;

function fixZoomRange() {
  zoomLevel = Math.min(zoomLevel, waveArray.length - 1);
  if (zoomLevel < 0) zoomLevel = 0;
  zoomPan = Math.min(zoomPan, waveArray[zoomLevel].length/2 - canvas.width);
  if (zoomPan < 0) zoomPan = 0;
}

function fixSelectRange(final) {
  if (final && selected.start > selected.end) {
    var tmp = selected.start;
    selected.start = selected.end;
    selected.end = tmp;
  }
  var len = waveArray[0].length / soundBuffer.sampleRate;
  selected.start = Math.min(Math.max(0, selected.start), len);
  selected.end = Math.min(Math.max(0, selected.end), len);
}

function timeToCanvasPos(t) {
  var smpRate = soundBuffer ? soundBuffer.sampleRate : audioCtx.sampleRate;
  return t * smpRate / Math.pow(2, zoomLevel+1) - zoomPan;
}

function showWave() {
  visualizeCallbackId = requestAnimationFrame(showWave);
  canvas.width = canvas.clientWidth;
  var width = canvas.width;
  var height = canvas.height;
  
  var ctx = canvas.getContext('2d');
  if (!mouse.dragging) {
    if (zoomPanV > 0) {
      zoomPanV -= width/600;
      if (zoomPanV < 0) zoomPanV = 0;
    }
    if (zoomPanV < 0) {
      zoomPanV += width/600;
      if (zoomPanV > 0) zoomPanV = 0;
    }
    zoomPan += zoomPanV|0;
  }
  fixZoomRange();
  var wav = waveArray[zoomLevel];
  
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#080';
  ctx.beginPath();
  ctx.moveTo(0, height/2);
  for (var i = 0; i < width; i++) {
    var j = i + zoomPan | 0;
    if (j*2 >= wav.length) break;
    var x = i;
    ctx.lineTo(x, (1 - wav[j*2] * yAxisZoom) * height/2);
    ctx.lineTo(x, (1 - wav[j*2+1] * yAxisZoom) * height/2);
  }
  ctx.stroke();
  if (selected) {
    var x1 = timeToCanvasPos(selected.start);
    var x2 = timeToCanvasPos(selected.end);
    ctx.fillStyle = '#044';
    ctx.fillRect(x1, 0, x2 - x1, height);
  }
  if (playingSound) {
    var t = audioCtx.currentTime - playStartTime;
    var x = timeToCanvasPos(t);
    ctx.fillStyle = '#f0f';
    ctx.fillRect(x - 2, 0, 4, height);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (selected) {
    ctx.fillStyle = 'red';
    ctx.fillRect(x1-2, 0, 4, height);
    ctx.fillStyle = 'blue';
    ctx.fillRect(x2-2, 0, 4, height);
  }
}

function zoomIn() {
  if (zoomLevel > 0) {
    zoomLevel--;
    zoomPan *= 2;
  }
}
function zoomOut() {
  if (zoomLevel < MaxZoomLevel-1) {
    zoomLevel++;
    zoomPan >>= 1;
  }
}
function playRange(from, duration) {
  if (!soundBuffer || duration <= 0) return ;
  if (playingSound) {
    playingSound.onended = function () {};
    playingSound.stop();
  }
  fixZoomRange();
  var node = audioCtx.createBufferSource();
  node.buffer = soundBuffer;
  node.connect(audioCtx.destination);
  
  var start = audioCtx.currentTime;
  playStartTime = start - from;
  playingSound = node;
  node.start(start, from, duration);
  node.onended = function () {
    playingSound = null;
  };
}

function playSelected() {
  if (selected) playRange(selected.start, selected.end - selected.start);
}
function playVisible() {
  if (!soundBuffer) return ;
  var unit = Math.pow(2, zoomLevel+1) / soundBuffer.sampleRate;
  playRange(zoomPan * unit, canvas.width * unit);
}

function canvasMouseDown(e){
  e.preventDefault();
  if (e.button == 0) {
    var newx = e.offsetX;
    mouse.x = newx;
    mouse.vx = 0;
    mouse.px = newx;
    if (Math.abs(newx - timeToCanvasPos(selected.start)) < 10) {
      mouse.dragBar = 1;
    }
    else if (Math.abs(newx - timeToCanvasPos(selected.end)) < 10) {
      mouse.dragBar = 2;
    }
    else mouse.dragging = true;
    mouse.t = e.timeStamp;
  }
}

function canvasMouseMove(e){
  e.preventDefault();
  var newx = e.offsetX;
  if ((e.buttons & 1) && mouse.dragging) {
    zoomPan -= (newx - mouse.x);
    mouse.x = newx;
    var t = e.timeStamp;
    var exp = Math.exp(-16/60);
    var newpx = mouse.px * exp + newx * (1 - exp);
    mouse.vx = newpx - mouse.px;
    mouse.px = newpx;
    mouse.t = t;
  }
  else if ((e.buttons & 1) && mouse.dragBar) {
    var unit = Math.pow(2, zoomLevel+1) / soundBuffer.sampleRate;
    if (mouse.dragBar == 1)
      selected.start += (newx - mouse.x) * unit;
    if (mouse.dragBar == 2)
      selected.end += (newx - mouse.x) * unit;
    fixSelectRange();
  }
  mouse.x = newx;
}
function canvasMouseUp(e){
  e.preventDefault();
  if (e.button == 0 && mouse.dragging) {
    if (e.timeStamp - mouse.t < 200) zoomPanV = -mouse.vx;
    else zoomPanV = 0;
    mouse.dragging = false;
  }
  fixSelectRange(true);
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
  canvasMouseDown({
    timeStamp: e.timeStamp,
    preventDefault: ignore,
    button: 0,
    offsetX: touch[0].offsetX,
    offsetY: touch[0].offsetY
  });
}
function canvasTouchMove(e) {
  e.preventDefault();
  var touch = e.touches;
  if (nofire || touch.length != 1) return;
  canvasMouseMove({
    timeStamp: e.timeStamp,
    preventDefault: ignore,
    buttons: 1,
    offsetX: touch[0].offsetX,
    offsetY: touch[0].offsetY
  });
}
function canvasTouchEnd(e) {
  e.preventDefault();
  var touch = e.touches;
  if (nofire || touch.length!=0) return;
  touch = e.changedTouches;
  canvasMouseUp({
    timeStamp: e.timeStamp,
    preventDefault: ignore,
    button: 0
  });
}
canvas.addEventListener('touchstart', canvasTouchStart, false);
canvas.addEventListener('touchmove', canvasTouchMove, false);
canvas.addEventListener('touchend', canvasTouchEnd, false);
