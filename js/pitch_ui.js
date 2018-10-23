var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var clips = document.querySelector('.sound-clips');
function addClipInterface(name) {
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
  })['catch'](function (x) {
    console.error(x);
  });
}

function analyzeClip() {
  resumeContext();
  var name = clips.value;
  if (name.substr(0,2) === "r_") {
    name = name.substr(2);
    getSound(name).then(function (file) {
      analyzeFile(file);
    }).catch(function () {
      console.error("Clip \""+name+"\" not found");
    });
  }
}

function analyzeFile(file) {
  resumeContext();
  if (!file) {
    alert("Please choose a file");
    return;
  }
  var fr = new FileReader();
  fr.onload = function () {
    audioCtx.decodeAudioData(fr.result, getBuffer, error);
  };
  fr.readAsArrayBuffer(file);
  var buflen;
  function getBuffer(audioBuf) {
    var buf = audioBuf.getChannelData(0);
    buflen = buf.length;
    showSpectrum(buf, audioCtx.sampleRate);
    analyzePitch2(buf, audioCtx.sampleRate).then(afterAnalyze)
    ['catch'](error);
  }
  function afterAnalyze(ans) {
    showPitch(ans, audioCtx.sampleRate);
    //var snd = audioCtx.createBufferSource();
    var snd = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    //snd.buffer = buf;
    var timbreRe = new Float32Array(21);
    var timbreIm = new Float32Array(21);
    for (var i = 1; i <= 20; i++) timbreIm[i] = Math.exp((i-1) * -0.25);
    var timbre = audioCtx.createPeriodicWave(timbreRe, timbreIm);
    snd.setPeriodicWave(timbre);
    snd.connect(gain);
    gain.gain.value = 0;
    gain.connect(audioCtx.destination);
    (snd.start || snd.noteOn).call(snd);
    ans.forEach(function (pitch) {
      gain.gain.linearRampToValueAtTime(Math.min(pitch[2], 0.5), audioCtx.currentTime + pitch[0]);
      snd.frequency.setValueAtTime(pitch[1], audioCtx.currentTime + pitch[0]);
    });
    var dur = buflen / audioCtx.sampleRate;
    (snd.stop || snd.noteOff).call(snd, audioCtx.currentTime + dur);
  }
  function error(x) {
    switch (x.name) {
      case "EncodingError":
        alert("File is not an audio, or the format is not supported");
        break;
      default:
        alert(x);
    }
    console.error(x);
  }
}

function saveToBrowser(file) {
  if (!file) {
    alert("Please choose a file");
    return;
  }
  var name = prompt("Clip name:");
  if (name) {
    saveSound(name, file);
  }
}

function showSpectrum(buf, smpRate) {
  var ctx = spectrum.getContext('2d');
  var wind = new Float32Array(fftSize * 2);
  var h = (fftSize * 5000 / smpRate)|0;
  var w = 300;
  spectrum.height = h;
  spectrum.width = w;
  var bmp = ctx.getImageData(0, 0, w, h);
  for (x = 0; x < w; x++) {
    if ((x+1)*w > buf.length) break;
    for (j = 0; j < fftSize; j++) {
      wind[j*2] = buf[x*fftSize + j];
    }
    var result = stdio2017.FFT.transform(wind, true);
    for (j = 0; j < h; j++) {
      var re = result[j*2];
      var im = result[j*2+1];
      var amp = Math.sqrt(re*re + im*im);
      bmp.data[(x + (h-j-1) * w)*4+0] = 0;
      bmp.data[(x + (h-j-1) * w)*4+1] = Math.log(amp) * 40;
      bmp.data[(x + (h-j-1) * w)*4+2] = 0;
      bmp.data[(x + (h-j-1) * w)*4+3] = 255;
    }
  }
  ctx.putImageData(bmp, 0, 0);
}

function showPitch(ans, smpRate) {
  var w = spectrum.width;
  var h = spectrum.height;
  var ctx = spectrum.getContext('2d');
  ctx.strokeStyle = "red";
  ctx.beginPath();
  for (var i = 0; i < ans.length; i++) {
    var x = Math.floor(ans[i][0] * smpRate / fftSize);
    var y = h-1 - Math.floor(ans[i][1] / smpRate * fftSize * 2);
    if (x < w) {
      if (i == 0) ctx.moveTo(x,y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);
var audioLocked = isIOS;

function resumeContext() {
  if (audioCtx && audioLocked) {
    audioCtx.resume();
    var r = audioCtx.createOscillator();
    (r.start || r.noteOn).call(r);
    (r.stop || r.noteOff).call(r, audioCtx.currentTime+Math.random()*0.5);
    r.frequency.value = 880;
    r.detune.value = Math.random()*100 - 50;
    var s = audioCtx.createGain();
    s.gain.value = Math.random() * 0.5;
    r.connect(s);
    s.connect(audioCtx.destination);
    audioLocked = false;
  }
}

addEventListener('click', resumeContext);
addEventListener('touchend', resumeContext);
