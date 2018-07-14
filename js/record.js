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
var clips = document.querySelector(".sound-clips");
var audioElt = document.querySelector("audio");

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

function getDefaultName() {
  var now = new Date();
  var y = now.getFullYear();
  var M = ("0"+(now.getMonth()+1)).slice(-2);
  var d = ("0"+now.getDate()).slice(-2);
  var h = ("0"+now.getHours()).slice(-2);
  var m = ("0"+now.getMinutes()).slice(-2);
  var s = ("0"+now.getSeconds()).slice(-2);
  return 'record '+y+'-'+M+'-'+d+' '+h+'-'+m+'-'+s;
}

function stopRecordFinally() {
  var blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
  var name = prompt("Enter name for this sound", getDefaultName());
  chunks = [];
  if (name) {
    saveSound(name, blob);
    addClipInterface(name);
  }
  btnRecord.disabled = false;
}

function tryToGetRecorder() {
  var needs = {
    "audio": {
    }
  };

  function onSuccess(stream) {
    try {
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
    catch (e) {
      errorbox(e);
    }
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

var visualizeCallbackId = 0;
var visualizedSource = null;
function visualize(source) {
  if (source == null) {
    return ;
  }
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

function addClipInterface(name) {
  if (files['f'+name]) return "Loaded";
  var clip = document.createElement("div");
  clip.className = "clip";
  var lbl = document.createElement("p");
  lbl.textContent = name;
  var btnPlay = document.createElement("button");
  btnPlay.textContent = "Play";
  btnPlay.onclick = function () {
    audioElt.hidden = false;
    // move audio control to current clip
    audioElt.remove();
    clip.appendChild(audioElt);
    getSound(name).then(function (result) {
      if (sessionStorage.speech2sing_prevBlobURL) {
        window.URL.revokeObjectURL(sessionStorage.speech2sing_prevBlobURL);
      }
      var audioURL = window.URL.createObjectURL(result);
      audioElt.src = audioURL;
      sessionStorage.speech2sing_prevBlobURL = audioURL;
      audioElt.play();
    });
  };
  var btnDel = document.createElement("button");
  btnDel.className = "red";
  btnDel.textContent = "Delete";
  btnDel.onclick = function () {
    if (!confirm("Really want to delete this sound?")) return ;
    deleteSound(name);
    clip.remove();
    files['f'+name] = 0;
  };
  clip.appendChild(lbl);
  lbl.appendChild(btnPlay);
  lbl.appendChild(btnDel);
  clips.appendChild(clip);
  files['f'+name] = 1;
  console.log("added" + name);
}

var audioNode = null;
function startup() {
  getSoundNames().then(function (names) {
    names.forEach(addClipInterface);
  })['catch'](function (x) {
    console.error(x);
  });
  audioNode = audioCtx.createMediaElementSource(audioElt);
  audioNode.connect(audioCtx.destination);
  audioElt.onplay = function () {
    audioNode.source = audioElt;
    visualize(audioNode);
  };
  audioElt.onended = function () {
    visualize(audioStreamNode);
  };
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    tryToGetRecorder();
  }
  else {
    alert("Your browser does not support audio recording");
  }
}
