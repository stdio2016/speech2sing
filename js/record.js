// thanks to https://github.com/mdn/web-dictaphone
var btnRecord = document.getElementById('btnRecord');
var btnStop = document.getElementById('btnStop');
var canvas = document.querySelector('.visualizer');
var audioStream;
var mediaRecorder;
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var canvasCtx = canvas.getContext('2d');
var analyser = audioCtx.createAnalyser();
var audioStreamNode = null;
var dataArray;
var timeOrFreq = document.getElementById('timeOrFreq');
var chunks = [];
var files = {};

btnRecord.disabled = true;
btnStop.disabled = true;

function startRecord() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  if (mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    btnRecord.innerHTML = "Paused";
  }
  else if (mediaRecorder.state === "paused"){
    mediaRecorder.resume();
    btnRecord.innerHTML = "Recording...";
  }
  else {
    mediaRecorder.start();
    btnRecord.innerHTML = "Recording...";
  }
  btnRecord.classList.add('red');
  btnStop.disabled = false;
  visualize(audioStreamNode);
}

function stopRecord() {
  mediaRecorder.stop();
  btnRecord.innerHTML = "Record";
  btnStop.disabled = true;
  btnRecord.classList.remove('red');
  btnRecord.disabled = true;
}

function recordDataHandler(e) {
  chunks.push(e.data);
}

function stopRecordFinally() {
  var blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
  saveSound("temp", blob);
  chunks = [];
  btnRecord.disabled = false;
  getSound("temp").then(function (result) {
    var audioURL = window.URL.createObjectURL(result);
    document.querySelector("audio").src = audioURL;
  });
}

function tryToGetRecorder() {
  var needs = {
    "audio": {
      "echoCancellation": {exact: false},
      "noiseSuppression": false,
      "sampleSize": 16
    }
  };

  function onSuccess(stream) {
    audioStream = stream;
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = recordDataHandler;
    mediaRecorder.onstop = stopRecordFinally;
    btnRecord.disabled = false;
    btnRecord.onclick = startRecord;
    btnStop.onclick = stopRecord;
    audioStreamNode = audioCtx.createMediaStreamSource(stream);
    visualize(audioStreamNode);
  }

  function onFailure(err) {
    switch (err.name) {
      case "SecurityError":
        alert("Your browser does not allow the use of UserMedia");
        break;
      case "NotAllowedError":
        alert("You don't allow browser to access microphone.\n(You can refresh this page and try again)");
        break;
      case "OverconstrainedError":
        alert("It seems that your device doesn't have a mic, or the browser just doesn't support it.");
        break;
      default:
        alert("The following error occured: " + err);
    }
  }

  navigator.mediaDevices.getUserMedia(needs).then(onSuccess, onFailure);
};

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  tryToGetRecorder();
}
else {
  alert("Your browser does not support audio recording");
}

var visualizeCallbackId = 0;
var visualizedSource = null;
function visualize(source) {
  cancelAnimationFrame(visualizeCallbackId);
  analyser.fftSize = 2048;
  var bufferLength = analyser.fftSize;
  dataArray = new Uint8Array(bufferLength);
  if (visualizedSource !== null) {
    visualizedSource.disconnect(analyser);
  }
  source.connect(analyser);
  visualizedSource = source;
  showWave();
}

function showWave() {
  visualizeCallbackId = requestAnimationFrame(showWave);
  var len;
  if (timeOrFreq.value == 'freq') {
    analyser.getByteFrequencyData(dataArray);
    len = analyser.frequencyBinCount * (5000 * 2 / audioCtx.sampleRate);
  }
  else {
    analyser.getByteTimeDomainData(dataArray);
    len = dataArray.length;
  }

  var width = canvas.width;
  var sliceWidth = width / len;
  var height = canvas.height;
  canvasCtx.fillStyle = "black";
  canvasCtx.fillRect(0, 0, width, height);

  canvasCtx.strokeStyle = "rgb(0, 255, 0)";
  canvasCtx.beginPath();
  var x = 0;
  for (var i = 0; i < len; i++) {
    var y = (1.0 - dataArray[i] / 255.0) * height;
    if (i === 0) canvasCtx.moveTo(x, y);
    else canvasCtx.lineTo(x, y);
    x += sliceWidth;
  }
  canvasCtx.stroke();
}

var audioNode = null;
function startup() {
  var audio = document.querySelector("audio");
  audioNode = audioCtx.createMediaElementSource(audio);
  audioNode.connect(audioCtx.destination);
  audio.onplay = function () {
    audioNode.source = audio;
    visualize(audioNode);
  };
  getSound("temp").then(function (result) {
    var audioURL = window.URL.createObjectURL(result);
    audio.src = audioURL;
  });
}
