var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var clips = document.querySelector('.sound-clips');
var canvas = document.querySelector('#canvas');
var soundBuffer;
var waveArray = [[]];
var zoomLevel = 14;

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
}

requestAnimationFrame(showWave);
var visualizeCallbackId = 0;

function showWave() {
  visualizeCallbackId = requestAnimationFrame(showWave);
  if (zoomLevel >= waveArray.length) zoomLevel = waveArray.length-1;
  if (zoomLevel < 0) zoomLevel = 0;
  var wav = waveArray[zoomLevel];
  var ctx = canvas.getContext('2d');
  
  canvas.width = canvas.clientWidth;
  var width = canvas.width;
  var sliceWidth = 1;
  var height = canvas.height;
  
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  ctx.moveTo(0, height/2);
  for (var i = 0; i < width; i ++) {
    if (i*2 >= wav.length) break;
    var x = i;
    ctx.lineTo(x, (1 - wav[i*2]) * height/2);
    ctx.lineTo(x, (1 - wav[i*2+1]) * height/2);
  }
  ctx.stroke();
}
