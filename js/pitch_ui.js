var clips = document.querySelector('.sound-clips');
var spectrMove = 0;
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
    getSound(name).then(function (rec) {
      analyzeFile(rec.file);
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
    showProgress("decoding audio");
    audioCtx.decodeAudioData(fr.result, getBuffer, error);
  };
  fr.readAsArrayBuffer(file);
  var buflen;
  var bb;
  var detector;
  function getBuffer(audioBuf) {
    var buf = audioBuf.getChannelData(0);
    buflen = buf.length;
    bb = audioBuf;
    spectrMove = 0;
    showSpectrum(buf, audioCtx.sampleRate);
    detector = new PitchDetector();
    detector.showProgress = function (prog, total) {
      showProgress("calculating pitch candidate at " + prog + "s");
    };
    detector.analyze(buf, audioCtx.sampleRate).then(afterAnalyze)
    ['catch'](error);
    pitchDebug = detector;
  }
  function afterAnalyze(ans) {
    detector.destroy();
    showPitch(ans, audioCtx.sampleRate);
    if (selOutput.value === "hum") {
      humPitch(buflen, ans);
    }
    else if (selOutput.value === "noEffect") {
      bypassAllEffects(bb);
      showProgress("playing original sound");
    }
    else if (selOutput.value === "resynth") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {
        return nearestPitch(p, +selKey.value);
      });
      showProgress("playing sound in " + selKey.selectedOptions[0].text);
    }
    else if (selOutput.value === "robotic") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p > 1000 ? p : 174.61;});
      showProgress("playing robotic voice");
    }
    else if (selOutput.value === "highVoice") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p*2;});
      showProgress("playing sound one octave higher");
    }
    else if (selOutput.value === "lowVoice") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p*0.5;});
      showProgress("playing sound one octave lower");
    }
    else if (selOutput.value === "mute") {
      showProgress("finished, took " + ans.elapsedTime + "ms");
    }
    else if (selOutput.value === "girl") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p*1.5;}, 1.2);
      showProgress("change to female voice");
    }
    else if (selOutput.value === "boy") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p/1.5;}, 1/1.2);
      showProgress("change to male voice");
    }
    else if (selOutput.value === "harmonic") {
      var a1 = simpleSynth(bb.getChannelData(0), ans, function (p) {
        return p;
      }, 1, true);
      var a2 = simpleSynth(bb.getChannelData(0), ans, function (p) {
        return nearestHarmonic(p, -2, +selKey.value);
      }, 1, true);
      var t = audioCtx.currentTime;
      a1.start(t);
      a2.start(t);
      showProgress("playing harmonic effect");
    }
    else if (selOutput.value === "helium") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p}, 1.6);
      showProgress("change to helium voice");
    }
    else if (selOutput.value === "SF6") {
      simpleSynth(bb.getChannelData(0), ans, function (p) {return p}, 1/1.6);
      showProgress("change to sulfur hexafluoride voice");
    }
    window.bb = {buffer: bb, pitch: ans};
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
    throw x;
  }
}

function humPitch(buflen, pitchArr) {
  showProgress("humming pitch");
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
  pitchArr.forEach(function (pitch) {
    gain.gain.linearRampToValueAtTime(Math.min(pitch[2], 0.5), audioCtx.currentTime + pitch[0]);
    snd.frequency.setValueAtTime(pitch[1], audioCtx.currentTime + pitch[0]);
  });
  var dur = buflen / audioCtx.sampleRate;
  (snd.stop || snd.noteOff).call(snd, audioCtx.currentTime + dur);
  snd.onended = function () {
    showProgress("finished");
  };
}

function saveToBrowser(file) {
  if (!file) {
    alert("Please choose a file");
    return;
  }
  var name = prompt("Clip name:");
  if (name) {
    saveSound(name, file, new Date(file.lastModified));
  }
}

function showSpectrum(buf, smpRate) {
  var ctx = spectrum.getContext('2d');
  var wind = new Float32Array(fftSize);
  var h = (fftSize * 5000 / smpRate)|0;
  var w = 300;
  spectrum.height = h;
  spectrum.width = w;
  var bmp = ctx.getImageData(0, 0, w, h);
  for (x = 0; x < w; x++) {
    var idx = (x+spectrMove)*fftSize;
    if (idx+fftSize > buf.length) break;
    for (j = 0; j < fftSize; j++) {
      wind[j] = buf[idx + j];
    }
    var result = goodFft.realFFT(wind);
    var scale = 10 / Math.log(10);
    var norm = Math.log(fftSize) * 2 * scale;
    idx = (x + (h-1) * w)*4;
    for (j = 0; j < h; j++, idx -= w*4) {
      var re = result[j*2];
      var im = result[j*2+1];
      var amp = re*re + im*im;
      var db = amp > 0 ? Math.log(amp) * scale - norm : -100;
      var pre = Math.max(0, (db - -100) / 70);
      bmp.data[idx+0] = 0;
      bmp.data[idx+1] = pre * pre * 255;
      bmp.data[idx+2] = 0;
      bmp.data[idx+3] = 255;
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
    var x = Math.floor(ans[i][0] * smpRate / fftSize) - spectrMove;
    var y = h-1 - Math.floor(ans[i][1] / smpRate * fftSize * 2);
    if (x < w) {
      ctx.moveTo(x,y);
      ctx.lineTo(x+1,y);
    }
  }
  ctx.stroke();
}

// currently only supports C major
function nearestPitch(hz, key) {
  if (hz > 4000) return hz;
  var n = Math.log(hz / 440) / Math.log(2) * 12 + 9 - key;
  var arr = [0, 2, 4, 5, 7, 9, 11];
  var octave = Math.round(n / 12);
  var dist = 999;
  var best = n;
  for (var o = octave-1; o <= octave+1; o++) {
    for (var p = 0; p < arr.length; p++) {
      var r = arr[p] + o*12;
      if (Math.abs(r-n) < dist) {
        dist = Math.abs(r-n);
        best = r;
      }
    }
  }
  return 440 * Math.pow(2, (best-9 + key) / 12);
}

function nearestHarmonic(hz, which, key) {
  if (hz > 4000) return hz;
  var n = Math.log(hz / 440) / Math.log(2) * 12 + 9 - key;
  var arr = [0, 2, 4, 5, 7, 9, 11];
  var octave = Math.round(n / 12);
  var dist = 999;
  var best = n, bestp = n;
  for (var o = octave-1; o <= octave+1; o++) {
    for (var p = 0; p < arr.length; p++) {
      var r = arr[p] + o*12;
      if (Math.abs(r-n) < dist) {
        dist = Math.abs(r-n);
        best = o * 7 + p;
        bestp = o * 12 + arr[p];
      }
    }
  }
  var use = best + which;
  var o2 = Math.floor(use / 7);
  var p2 = use - o2 * 7;
  return hz * Math.pow(2, (o2 + (arr[p2]-bestp)/12));
}

// I ask Web Audio API to do overlap and add for me! XD
function simpleSynth(buf, pitch, pitchFun, formantShift, dontStart) {
  formantShift = formantShift || 1.0;
  var rate = audioCtx.sampleRate;
  var start = audioCtx.currentTime;
  var t = 0;
  var choose = 0;
  var outbuf = audioCtx.createBuffer(1, buf.length, audioCtx.sampleRate);
  var out = outbuf.getChannelData(0);
  for (var i = 0; i < pitch.length-1; i++) {
    var delta = pitch[i][1] ? 1/pitch[i][1] : Math.random() * 0.004 + 0.008;
    
    while (t < pitch[i+1][0]) {
      while (choose < t) choose += delta;
      var from = (t-delta/formantShift) * rate | 0;
      var to = (t+delta/formantShift) * rate | 0;
      for (var j = from; j < to; j++) {
        var w = (j - t*rate) / (delta*rate) * formantShift;
        w = Math.cos(w * Math.PI) * 0.5 + 0.5;
        var pos = choose * rate + (j - from) * formantShift;
        if (pos < buf.length-1) {
          var frac = pos - Math.floor(pos);
          var h = Math.floor(pos);
          out[j] += w * ((1-frac) * buf[h] + frac * buf[h+1]);
        }
      }
      if (pitch[i][1] > 1) {
        t += 1/pitchFun(pitch[i][1]);
      }
      else {
        // unvoiced
        t += delta;
      }
    }
  }
  var n = audioCtx.createBufferSource();
  n.connect(audioCtx.destination);
  n.buffer = outbuf;
  n.onended = function () {
    showProgress("finished");
  };
  if (!dontStart) n.start(start);
  return n;
}

function bypassAllEffects(audio) {
  var n = audioCtx.createBufferSource();
  n.connect(audioCtx.destination);
  n.buffer = audio;
  n.onended = function () {
    showProgress("finished");
  };
  n.start();
}

function showProgress(text) {
  if (text) {
    txtProgress.textContent = text;
  }
  else {
    txtProgress.textContent = "";
  }
}

function moveSpec(cnt) {
  if (!bb) return;
  spectrMove += cnt;
  if (spectrMove < 0) spectrMove = 0;
  var buf = bb.buffer.getChannelData(0);
  showSpectrum(buf, audioCtx.sampleRate);
  showPitch(bb.pitch, audioCtx.sampleRate);
}
