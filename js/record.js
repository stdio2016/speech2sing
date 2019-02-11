// thanks to https://github.com/mdn/web-dictaphone
var btnRecord = document.getElementById('btnRecord');
var btnStop = document.getElementById('btnStop');
var canvas = document.querySelector('.visualizer');
var audioStream;
var mediaRecorder;
var canvasCtx = canvas.getContext('2d');
var analyserRecord = audioCtx.createAnalyser();
var analyserPlay = audioCtx.createAnalyser();
var analyser = analyserRecord;
var audioStreamNode = null;
var dataArray;
var dataArrayFloat;
var timeOrFreq = document.getElementById('timeOrFreq');
var chunks = [];
var files = {};
var clips = document.querySelector(".sound-clips");
var audioElt = document.querySelector("audio");
var useMimeType = "";
var hasAnySound = false;

var streamForRecord = audioCtx.createGain();

btnRecord.disabled = true;
btnStop.disabled = true;

function startRecord() {
  resumeContext();
  if (mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    btnRecord.innerHTML = "Paused";
  }
  else if (mediaRecorder.state === "paused"){
    mediaRecorder.resume();
    btnRecord.innerHTML = "Recording...";
  }
  else {
    if (!window.MediaRecorder) {
      mediaRecorder.input = audioStreamNode;
    }
    mediaRecorder.start();
    btnRecord.innerHTML = "Recording...";
  }
  btnRecord.classList.add('red');
  btnStop.disabled = false;
  visualize(analyserRecord);
}

function stopRecord() {
  mediaRecorder.stop();
  btnRecord.innerHTML = "Record";
  btnStop.disabled = true;
  btnRecord.classList.remove('red');
  btnRecord.disabled = true;
}

function recordDataHandler(e) {
  useMimeType = mediaRecorder.mimeType;
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
  var mime;
  if (useMimeType === "audio/wav") mime = "audio/wav";
  else if (useMimeType === "video/webm") mime = "audio/webm";
  else {
    mime = "audio/ogg; codecs=opus";
  }
  blob = new Blob(chunks, { 'type' : mime });
  var name = prompt("Enter name for this sound", getDefaultName());
  chunks = [];
  if (name) {
    var now = new Date();
    saveSound(name, blob, now).then(function (e) {
      console.log("saved successfully", e);
    })['catch'](function(e) {
      errorbox(Error(e));
    });
    addClipInterface({name: name, date: now});
  }
  // XXX: looks like Safari doesn't like reusing media stream
  if (isIOS || isSafari) {
    audioStreamNode.disconnect();
    audioStreamNode = null;
    tryToGetRecorder();
  }
  else {
    btnRecord.disabled = false;
  }
}

function tryToGetRecorder() {
  var needs = {
    "audio": {
    }
  };

  function onSuccess(stream) {
    try {
      audioStream = stream;
      audioStreamNode = audioCtx.createMediaStreamSource(stream);
      audioStreamNode.connect(analyserRecord);
      audioStreamNode.connect(streamForRecord);
      if (window.MediaRecorder && !/polyfilltest/.test(location.hash)) {
        mediaRecorder = new MediaRecorder(audioStream);
      }
      else {
        var polyfill = audioRecorderPolyfill(audioCtx);
        mediaRecorder = new polyfill(audioStream, {input: streamForRecord});
      }
      mediaRecorder.addEventListener("dataavailable", recordDataHandler);
      mediaRecorder.addEventListener("stop", stopRecordFinally);
      btnRecord.disabled = false;
      btnRecord.onclick = startRecord;
      btnStop.onclick = stopRecord;
      if (!window.MediaRecorder) {
        mediaRecorder.input = audioStreamNode;
      }
      visualize(analyserRecord);
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
function visualize(source) {
  if (source == null) {
    return ;
  }
  cancelAnimationFrame(visualizeCallbackId);
  analyser.fftSize = 2048;
  var bufferLength = analyser.fftSize;
  dataArray = new Uint8Array(bufferLength);
  dataArrayFloat = [new Float32Array(bufferLength), new Float32Array(bufferLength)];
  analyser = source;
  showWave();
}

function showWave() {
  visualizeCallbackId = requestAnimationFrame(showWave);
  var len;
  var hz = 0;
  if (!hasAnySound) {
    analyserRecord.getByteTimeDomainData(dataArray);
    len = dataArray.length;
    for (var i = 0; i < len; i++) {
      if (dataArray[i] !== 128) hasAnySound = true;
    }
  }
  if (timeOrFreq.value == 'freq') {
    analyser.getByteFrequencyData(dataArray);
    len = analyser.frequencyBinCount * (5000 * 2 / audioCtx.sampleRate);
  }
  else if (timeOrFreq.value == 'autocorrelation') {
    if (analyser.getFloatTimeDomainData)
      analyser.getFloatTimeDomainData(dataArrayFloat[0]);
    else {
      analyser.getByteTimeDomainData(dataArray);
      for (var i = 0; i < dataArray.length; i++) {
        dataArrayFloat[0][i] = (dataArray[i] - 127.5) / 128;
      }
    }
    realTimeAutocorrelation(dataArrayFloat[0], dataArray);
    var min = audioCtx.sampleRate/MaximumPitch | 0;
    var max = audioCtx.sampleRate/MinimumPitch | 0;
    var good = 0.45;
    for (var i = min; i < max; i++) {
      var strength = (dataArray[i]-128)/128 - Math.log2(i) * OctaveCost;
      if (strength > good) {
        hz = audioCtx.sampleRate / i;
        good = strength;
      }
    }
    len = dataArray.length;
  }
  else {
    analyser.getByteTimeDomainData(dataArray);
    len = dataArray.length;
  }

  canvas.width = canvas.clientWidth;
  var width = canvas.width;
  var sliceWidth = width / len;
  var height = canvas.height;
  
  if (analyser == analyserRecord && !hasAnySound) {
    canvasCtx.font = height/3 + "px aries";
    canvasCtx.fillStyle = "red";
    var msg = 'Warning! No sound';
    if (audioLocked) msg = "Please click anywhere on the page";
    canvasCtx.fillText(msg, height/2, height * (1/2 + 1/6*0.6));
    return;
  }

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
  
  if (hz > 0) {
    canvasCtx.font = height/3 + "px aries";
    canvasCtx.fillStyle = "red";
    var pitch = Math.round(Math.log2(hz/440) * 12) + 57;
    var msg = PitchName[pitch%12] + Math.floor(pitch/12);
    canvasCtx.fillText(msg, width/2-10, height * (1/2 + 1/6*0.6));
  }
}

function addClipInterface(nameAndDate) {
  var name = nameAndDate.name;
  if (files['f'+name]) return "Loaded";
  var clip = document.createElement("div");
  clip.className = "clip";
  var lbl = document.createElement("p");
  var lblName = document.createElement("span");
  lblName.textContent = name;
  lbl.appendChild(lblName);
  var date = nameAndDate.date;
  date = date ? "date: "+date.toLocaleDateString() : "date unknown";
  lbl.appendChild(new Text("\n" + date));
  var btnPlay = document.createElement("button");
  btnPlay.textContent = "Play";
  btnPlay.onclick = function () {
    audioElt.hidden = false;
    // move audio control to current clip
    audioElt.remove();
    clip.appendChild(audioElt);
    // unlock audio element in Safari
    audioElt.play();
    resumeContext();
    getSound(name).then(function (result) {
      if (sessionStorage.speech2sing_prevBlobURL) {
        window.URL.revokeObjectURL(sessionStorage.speech2sing_prevBlobURL);
      }
      var audioURL = window.URL.createObjectURL(result.file);
      audioElt.src = audioURL;
      sessionStorage.speech2sing_prevBlobURL = audioURL;
      audioElt.play();
    })['catch'](function (e) {
      errorbox(Error(e.target.error));
    });
  };
  var btnRename = document.createElement("button");
  btnRename.textContent = "Rename";
  btnRename.onclick = function () {
    promptBox("Type a new name: ", name, function (newName) {
      if (newName === name || !newName) return;
      renameSound(name, newName).then(function () {
        lblName.textContent = newName;
        name = newName;
      }).catch(function () {
        alertBox("Unable to rename");
      });
    });
  };

  var btnDel = document.createElement("button");
  btnDel.className = "red";
  btnDel.textContent = "Delete";
  btnDel.onclick = function () {
    if (!confirm("Really want to delete this sound?")) return ;
    deleteSound(name).then(function (e) {
      console.log("deleted successfully", e);
    });
    // prevent memory leak
    if (sessionStorage.speech2sing_prevBlobURL === audioElt.src) {
      window.URL.revokeObjectURL(sessionStorage.speech2sing_prevBlobURL);
      sessionStorage.removeItem("speech2sing_prevBlobURL");
    }
    clip.remove();
    files['f'+name] = 0;
  };
  clip.appendChild(lbl);
  lbl.appendChild(btnPlay);
  lbl.appendChild(btnRename);
  lbl.appendChild(btnDel);
  clips.appendChild(clip);
  files['f'+name] = 1;
  console.log("added " + name);
}

var audioNode = null;
function startup() {
  getSoundNames().then(function (names) {
    names.forEach(addClipInterface);
  })['catch'](function (x) {
    errorbox(new Error(x));
  });
  audioNode = audioCtx.createMediaElementSource(audioElt);
  audioNode.connect(audioCtx.destination);
  audioNode.connect(analyserPlay);
  audioElt.onplay = function () {
    audioNode.source = audioElt;
    visualize(analyserPlay);
  };
  audioElt.onended = function () {
    visualize(analyserRecord);
  };
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    tryToGetRecorder();
  }
  else {
    alert("Your browser does not support audio recording");
  }
}
