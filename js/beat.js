var clips;
var osc = audioCtx.createOscillator();
osc.frequency.value = 440;
osc.type = 'square';
osc.start();

function addClipInterface(name) {
  name = name.name;
  var clip = new Option(name, "r_"+name);
  clips.appendChild(clip);
  console.log("added " + name);
}

function startup() {
  clips = document.querySelector('.sound-clips');
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

var sndbuf, sndbuf8192;
var spectrogram;
var OSC, smoothOSC, trendOSC;
var finalOSC, OSCacf;
var scrollAmount = 40;
var zoomOut = 4;
var scale, scaleAcf;
var currentSound = null;
var currentBeat = null;
var bpm = 0;
var beatStart = 0;

function showStatus(txt) {
  lblStatus.textContent = txt;
}

function analyzeClip() {
  resumeContext();
  var name = clips.value;
  if (name.substr(0,2) === "r_") {
    name = name.substr(2);
    getSound(name).then(function (rec) {
      analyzeBeat(rec.file);
    }).catch(function () {
      console.error("Clip \""+name+"\" not found");
    });
  }
}

function analyzeFile() {
  analyzeBeat(fin.files[0]);
}

function analyzeBeat(file) {
  if (!file) {
    showStatus("Please choose a sound file");
    alert("Please choose a sound file");
    return ;
  }
  var fr = new FileReader();
  showStatus("decoding audio");
  fr.onload = function () {
    audioCtx.decodeAudioData(fr.result, function (buf) {
      console.log("loaded");
      loadedAudio(buf);
    }, fail);
  };
  fr.onerror = fail;
  fr.readAsArrayBuffer(file);
  
  function fail(x) {
    showStatus("decoding failed");
    if (x.name === "EncodingError") {
      alert("This file is not audio file, or your browser doesn't support that format");
    }
    else {
      errorbox(x);
    }
  }
}

function drawSpectrogram() {
  if (!spectrogram) return ;
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var off = +scrTime.value * scrollAmount;
  var bmp = ctx.getImageData(0, 0, w, h);
  for (x = 0; x < w; x++) {
    if (x*256 >= spectrogram.length) break;
    for (j = 0; j < h; j++) {
      var re = spectrogram[j*2 + (x*zoomOut+off)*256];
      var im = spectrogram[j*2+1 + (x*zoomOut+off)*256];
      var amp = re*re + im*im + 1e-10;
      var db = Math.log10(amp / 256) * 5;
      bmp.data[(x + (h-j-1) * w)*4+0] = 0;
      bmp.data[(x + (h-j-1) * w)*4+1] = 220 + db * 10;
      bmp.data[(x + (h-j-1) * w)*4+2] = 0;
      bmp.data[(x + (h-j-1) * w)*4+3] = 255;
    }
  }
  ctx.putImageData(bmp, 0, 0);
  var ctx2 = canvas2.getContext('2d');
  canvas2.height = canvas2.height;
  var ctx3 = canvas3.getContext('2d');
  canvas3.height = canvas3.height;
  if (OSC) {
    ctx2.strokeStyle = "red";
    drawCurve(ctx2, OSC, w, 60, scale);
  }
  if (smoothOSC) {
    ctx2.strokeStyle = "orange";
    drawCurve(ctx2, smoothOSC, w, 60, scale);
  }
  if (trendOSC) {
    ctx2.strokeStyle = "green";
    drawCurve(ctx2, trendOSC, w, 60, scale);
  }
  if (trendOSC) {
    ctx2.strokeStyle = "green";
    drawCurve(ctx2, trendOSC, w, 60, scale);
  }
  if (finalOSC) {
    ctx2.strokeStyle = "cyan";
    drawCurve(ctx2, finalOSC, w, 60, scale);
  }
  if (OSCacf) {
    ctx3.strokeStyle = "lime";
    drawCurve(ctx3, OSCacf, w, 60, scaleAcf);
  }
}

function drawCurve(ctx, curve, w, h, scale) {
  var off = +scrTime.value * scrollAmount;
  ctx.beginPath();
  for (var i = 0; i < w; i++) {
    if (i*zoomOut+off < curve.length) {
      if (i == 0) ctx.moveTo(i, h*(1-curve[i*zoomOut+off]/scale));
      else ctx.lineTo(i, h*(1-curve[i*zoomOut+off]/scale));
    }
  }
  ctx.stroke();
}
// actual computation from here
function loadedAudio(buf) {
  showStatus("resampling");
  setTimeout(toResample, 100);
  function toResample() {
    var chn = buf.numberOfChannels, len = buf.length;
    sndbuf = new Float64Array(len);
    for (var ch = 0; ch < chn; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        sndbuf[i] += d[i];
      }
    }
    for (var i = 0; i < len; i++) {
      sndbuf[i] /= chn;
    }
    sndbuf8192 = myResample(sndbuf, buf.sampleRate, 8192);
    showStatus("calculating spectrogram");
    setTimeout(toSpectrogram, 100);
  }
  
  function toSpectrogram() {
    spectrogram = getSpectrogram(sndbuf8192, 256, 32);
    showStatus("calculating OSC");
    setTimeout(toOSC, 100);
  }
  
  function toOSC() {
    scrTime.max = Math.max(0, Math.floor((spectrogram.length / 256 - 300) / scrollAmount) + 1);
    OSC = computeOSC(spectrogram, 256);
    smoothOSC = gaussFilter(OSC, 50, 1);
    trendOSC = gaussFilter(smoothOSC, 300, 1);
    scale = 0.1;
    for (var i = 0; i < OSC.length; i++) {
      scale = Math.max(scale, OSC[i]);
    }
    finalOSC = new Float64Array(OSC.length);
    for (var i = 0; i < OSC.length; i++) {
      finalOSC[i] = Math.max(0, smoothOSC[i] - trendOSC[i]); // truncate minus to 0
    }
    scaleAcf = 0.1;
    OSCacf = getAcf(finalOSC);
    for (var i = 0; i < OSCacf.length; i++) {
      scaleAcf = Math.max(scaleAcf, OSCacf[i]);
    }
    drawSpectrogram();
    showStatus("OSC finished");
    setTimeout(toBPM, 100);
  }
  
  function toBPM() {
    var sec = 8192 / 32;
    var periodMin = Math.floor(60 / 250 * sec);
    var periodMax = Math.ceil(60 / 50 * sec);
    console.log(periodMax, periodMin);
    var best = -1;
    for (var i = periodMin; i < periodMax; i++) {
      if ((best == -1 || OSCacf[i] > OSCacf[best])
        // local maximum
        && OSCacf[i] > OSCacf[i+1] && OSCacf[i] > OSCacf[i-1]) {
        best = i;
      }
    }
    bpm = (60 * sec) / best;
    showStatus("bpm is " + Math.round(bpm));
    // very bad beat tracking, sorry
    var candPos = new Float64Array(best);
    for (var i = 0; i < OSC.length; i++) {
      candPos[i % best] += OSC[i];
    }
    var pos = 0;
    for (var i = 1; i < best; i++) {
      if (candPos[i] > candPos[pos]) pos = i;
    }
    beatStart = pos / sec;
    toPlaySound();
  }
  
  function toPlaySound() {
    var nn = audioCtx.createBuffer(1, sndbuf8192.length, 8192);
    var ch0 = nn.getChannelData(0);
    for (var i = 0; i < sndbuf8192.length; i++) ch0[i] = sndbuf8192[i];
    if (currentSound) {
      currentSound.stop();
    }
    if (currentBeat) {
      currentBeat.disconnect();
      osc.disconnect();
    }
    var snd = audioCtx.createBufferSource();
    snd.buffer = nn;
    snd.connect(audioCtx.destination);
    snd.start();
    currentSound = snd;
    currentBeat = audioCtx.createGain();
    currentBeat.gain.value = 0;
    osc.connect(currentBeat);
    currentBeat.connect(audioCtx.destination);

    var t = beatStart;
    var t0 = audioCtx.currentTime;
    while (t < nn.duration) {
      // very bad beat tracking, sorry
      currentBeat.gain.setValueAtTime(0.03, t0 + t);
      currentBeat.gain.setValueAtTime(0, t0 + t + 0.1);
      t += 60 / bpm;
    }
    currentBeat.connect(audioCtx.destination);
  }
}

function myResample(buf, smprate, target) {
  // use ideal lowpass filter to do antialiasing
  // very slow!
  var n = buf.length;
  var fftsize = 2048;
  while (fftsize < n) fftsize *= 2;
  var fft = new stdio2018.FFT(fftsize);
  var freq = new Float64Array(fftsize);
  for (var i = 0; i < n; i++) freq[i] = buf[i];
  freq = fft.realFFT(freq, freq);
  // remove high frequency part
  var low = Math.floor(target / smprate * fftsize / 2) * 2;
  freq[1] = 0;
  for (var i = low; i < fftsize; i += 2) {
    freq[i] = 0;
    freq[i+1] = 0;
  }
  freq = fft.realIFFT(freq, freq);
  // scale value
  for (var i = 0; i < fftsize; i++) {
    freq[i] /= fftsize;
  }
  // linear resample
  fft = null;
  var newn = Math.floor(n * target / smprate);
  var out = new Float64Array(newn);
  for (var i = 0; i < n; i++) {
    var from = i * smprate / target;
    var j = Math.floor(from);
    var p = from - j;
    if (from < fftsize)
      out[i] = (1-p) * freq[j] + p * freq[j+1];
  }
  return out;
}

function getSpectrogram(x, fftsize, step) {
  var N = x.length;
  var fft = new stdio2018.FFT(fftsize);
  var n = Math.floor((N - fftsize + step) / step);
  var out = new Float64Array(n * fftsize);
  var inn = new Float64Array(fftsize);
  for (var i = 0; i < n; i++) {
    fft.realFFT(
      x.subarray(i * step, i * step + fftsize),
      out.subarray(i * fftsize, i * fftsize + fftsize)
    );
  }
  return out;
}

function computeOSC(spectrogram, bins) {
  var n = spectrogram.length / bins;
  var OSC = new Float64Array(n - 1);
  for (var i = 1; i < n; i++) {
    var j = bins * i;
    for (var k = 0; k < bins; k++) {
      var nx = spectrogram[j + k];
      var ny = spectrogram[j + k+1];
      var px = spectrogram[j + k-bins];
      var py = spectrogram[j + k-bins+1];
      var namp = Math.sqrt(nx*nx + ny*ny);
      var pamp = Math.sqrt(px*px + py*py);
      if (namp > pamp) {
        OSC[i] += namp - pamp;
      }
    }
  }
  return OSC;
}

function gaussFilter(x, smpRate, cutoff) {
  // compute kernel
  var sigmaf = cutoff / smpRate / Math.sqrt(2 * Math.log(2));
  var sigma = 1 / (2 * Math.PI) / sigmaf;
  var N = Math.ceil(sigma * 3);
  var L = 2*N+1;
  var kern = new Float64Array(L);
  var sum = 0;
  for (var t = -N; t <= N; t++) {
    var a = t / sigma;
    kern[N+t] = Math.exp(-a * a / 2);
    sum += kern[N+t];
  }
  for (var i = 0; i < L; i++) {
    kern[i] /= sum;
  }
  // compute convolution
  var n = x.length;
  var y = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    for (var j = -N; j <= N; j++) {
      if (i+j >= 0 && i+j < n) {
        y[i+j] += x[i] * kern[N+j];
      }
    }
  }
  return y;
}

function getAcf(x) {
  var fftsize = 32;
  var n = x.length;
  while (fftsize < n * 2) fftsize *= 2;
  var X = new Float64Array(fftsize);
  X.set(x);
  var fft = new stdio2018.FFT(fftsize);
  fft.realFFT(X, X);
  for (var i = 2; i < fftsize; i += 2) {
    X[i] = X[i]*X[i] + X[i+1]*X[i+1];
    X[i+1] = 0;
  }
  X[1] *= X[1];
  X[0] *= X[0];
  fft.realIFFT(X, X);
  var out = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    out[i] = X[i] / (n - i);
  }
  return out;
}
