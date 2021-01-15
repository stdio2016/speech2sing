// thanks to https://github.com/mdn/web-dictaphone
var canvas = document.querySelector('.visualizer');
var audioStream;
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
var audioElt = document.querySelector("audio");
var useMimeType = "";
var hasAnySound = false;
var runnedFrame = 0;

var streamForRecord = audioCtx.createGain();
var echo = audioCtx.createDelay();
var echoDecay = audioCtx.createGain();
var echoFilter = audioCtx.createBiquadFilter();
echo.delayTime.value = 0.2;
echoDecay.gain.value = 0.5;
streamForRecord.connect(echo);
echo.connect(echoDecay);
echoDecay.connect(echoFilter);
echoFilter.connect(echo);

streamForRecord.connect(audioCtx.destination);
echoFilter.connect(audioCtx.destination);

function tryToGetRecorder() {
  var needs = {
    "audio": {
      'noiseSuppression': false,
      'echoCancellation': true
    }
  };

  function onSuccess(stream) {
    try {
      audioStream = stream;
      audioStreamNode = audioCtx.createMediaStreamSource(stream);
      audioStreamNode.connect(analyserRecord);
      audioStreamNode.connect(streamForRecord);
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
  if (FPS.value == '0') return;
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
  else if (timeOrFreq.value == 'autocorrelation' || timeOrFreq.value == 'cepstrum') {
    if (analyser.getFloatTimeDomainData)
      analyser.getFloatTimeDomainData(dataArrayFloat[0]);
    else {
      analyser.getByteTimeDomainData(dataArray);
      for (var i = 0; i < dataArray.length; i++) {
        dataArrayFloat[0][i] = (dataArray[i] - 127.5) / 128;
      }
    }
    if (timeOrFreq.value == 'autocorrelation')
      realTimeAutocorrelation(dataArrayFloat[0], dataArray);
    else
      realTimeCepstrum(dataArrayFloat[0], dataArray);
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
  
  // control frame rate
  runnedFrame += FPS.value / 60;
  if (runnedFrame < 1) return ;
  runnedFrame -= 1;

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

var audioNode = null;
function startup() {
  audioNode = audioCtx.createMediaElementSource(audioElt);
  var splitter = audioCtx.createChannelSplitter();
  var myOut = audioCtx.createGain();
  var filter = audioCtx.createGain();
  audioNode.connect(splitter);
  splitter.connect(filter, 0);
  splitter.connect(myOut, 1);
  myOut.gain.value = -1;
  myOut.connect(filter);
  filter.connect(audioCtx.destination);
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    tryToGetRecorder();
  }
  else {
    alert("Your browser does not support audio recording");
  }
}

function loadAcc(result) {
  var audioURL = window.URL.createObjectURL(result.files[0]);
  audioElt.src = audioURL;
}
