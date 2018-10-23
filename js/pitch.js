var fftSize = 2048;
function analyzePitch(buf, smpRate) {
  var i;
  var wind = new Float32Array(fftSize * 2);
  var amps = new Float32Array(fftSize/2);
  var ans = [];
  for (i = fftSize; i < buf.length; i += fftSize) {
    var j = 0;
    var vol = 0;
    for (j = 0; j < fftSize; j++) {
      wind[j*2] = buf[i - fftSize + j];
      vol = Math.max(Math.abs(wind[j*2]), vol);
    }
    var result = stdio2017.FFT.transform(wind, true);
    for (j = 0; j < fftSize/2; j++) {
      var re = result[j*2];
      var im = result[j*2+1];
      amps[j] = Math.sqrt(re*re + im*im);
    }
    var max = 0, freq = 0;
    for (j = Math.floor(fftSize/smpRate * 80); j < fftSize/smpRate * 800; j++) {
      var smp1 = (amps[j]);
      var smp2 = (amps[j*2] + amps[j*2+1]) / 2;
      var smp3 = (amps[j*3] + amps[j*3+1] + amps[j*3+2]) / 3;
      var smp4 = (amps[j*4] + amps[j*4+1] + amps[j*4+2] + amps[j*4+3]) / 4;
      // exponential decay
      var totle = (smp1 + smp2/1.2 + smp3/1.4 + smp4/1.7) / Math.sqrt(j);
      if (totle > max) {
        max = totle;
        freq = j;
      }
    }
    ans.push([i/smpRate, freq * smpRate/fftSize, vol]);
  }
  return new Promise(function (a) {a(ans);});
}

// is this autocorrelation?
function realTimeAutocorrelation(current, output) {
  var size = current.length;
  var total = new Float32Array(size * 2);
  for (var i = 0; i < size; i++) {
    total[i] = current[i] * hannWindow[i];
  }
  total = stdio2017.FFT.realFFT(total);
  for (var i = 0; i < size*2; i++) {
    var re = total[i*2];
    var im = total[i*2+1];
    total[i*2] = re*re + im*im;
    total[i*2+1] = 0;
  }
  total = stdio2017.FFT.transform(total, false);
  var dB = 10 / Math.log(10);
  var offset = Math.log(size) * 2;
  // normalize
  var max = total[0], min = -total[0];
  for (var i = 0; i < size; i++) {
    var re = total[i*2];
    re /= hannAuto[i];
    total[i*2] = re;
    if (i*2 < size) {
      if (re > max) max = re;
      if (re < min) min = re;
    }
  }
  var range = Math.max(max, -min);
  for (var i = 0; i < size; i++) {
    var re = total[i*2];
    var out = (re + range) / (2 * range) * 255;
    output[i] = Math.min(Math.max(out, 0), 255);
  }
}

var hannWindow, hannAuto;
function buildHannWindow() {
  hannWindow = new Float32Array(fftSize);
  hannAuto = new Float32Array(fftSize);
  var k = 2 * Math.PI / fftSize;
  for (var i = 0; i < fftSize; i++) {
    var t = i / fftSize;
    hannWindow[i] = 0.5 - 0.5 * Math.cos(k * i);
    hannAuto[i] = (1 - i/fftSize) * (2/3 + 1/3 * Math.cos(k*i)) + 1/(2*Math.PI) * Math.sin(k*i);
  }
}
buildHannWindow();

var pitchDebug;
function showProgress(text) {
  if (text) {
    txtProgress.textContent = text;
  }
  else {
    txtProgress.textContent = "";
  }
}

function analyzePitch2(buf, smpRate) {
  var pitchState = {
    buf: buf,
    smpRate: smpRate,
    pos: 0,
    secs: 0,
    fftSize: fftSize,
    candidates: [],
    pitch: [],
    resolve: null
  };
  // get global volume
  var vol = 0;
  for (var i = 0; i < buf.length; i++) {
    if (buf[i] > vol) vol = buf[i];
    if (-buf[i] > vol) vol = -buf[i];
  }
  pitchState.volume = vol;
  pitchDebug = pitchState;
  return new Promise(function (resolve) {
    pitchState.resolve = resolve;
    analyzePitch2Loop1(pitchState);
  });
}

var StepTime = 0.01;
var MinimumPitch = 70;
var MaximumPitch = 800;
var OctaveCost = 0.01;
var VoicingThreshold = 0.4;
var SilenceThreshold = 0.05;

function analyzePitch2Loop1(state) {
  var i = state.pos;
  var smpRate = state.smpRate;
  var secs = state.secs;
  var fftSize = state.fftSize;
  var buf = state.buf;
  showProgress("calculating pitch candidate at " + secs + "s");
  var end = Math.min((secs+1) * smpRate, buf.length);
  while (i + fftSize < end) {
    var p = getSegmentCandidates(buf, i, fftSize, smpRate, state.volume);
    state.pitch.push(p);
    i = Math.floor(i + smpRate * StepTime);
  }
  state.pos = i;
  state.secs++;
  if (i + fftSize >= buf.length) {
    setTimeout(function () {
      state.resolve(state.pitch);
    }, 30);
  }
  else {
    setTimeout(analyzePitch2Loop1.bind(this, state), 30);
  }
}

function getSegmentCandidates(buf, pos, size, smpRate, globalVol) {
  var vol = 0;
  // multiply with Hann window
  var smp = new Float32Array(size * 2);
  for (var i = 0; i < size; i++) {
    var b = buf[pos+i];
    if (b > vol) vol = b;
    if (-b > vol) vol = -b;
    smp[i] = b * hannWindow[i];
  }
  var fftOut = stdio2017.FFT.realFFT(smp);
  for (var i = 0; i < size*2; i++) {
    var re = fftOut[i*2];
    var im = fftOut[i*2+1];
    fftOut[i*2] = re*re + im*im;
    fftOut[i*2+1] = 0;
  }
  // corr[i*2] is autocorrelation
  var corr = stdio2017.FFT.transform(fftOut, false);
  var normalize = 1/corr[0];
  for (var i = 0; i < size/2; i++) {
    smp[i+500] = corr[i*2] * normalize / hannAuto[i];
  }
  for (var i = 1; i <= 500; i++) {
    smp[500-i] = corr[i*2] * normalize / hannAuto[i];
  }
  var lim = smpRate/MinimumPitch | 0;
  var high = VoicingThreshold + Math.max(0,
    2 - (vol/globalVol) / (SilenceThreshold/(1+VoicingThreshold)));
  var freq = 1;
  for (var i = smpRate/MaximumPitch | 0; i < lim; i++) {
    var r = smp[500+i];
    var R = r - OctaveCost * Math.log2(MinimumPitch/smpRate * i);
    if (R > high) {
      high = R;
      freq = i;
    }
  }
  return [(pos+fftSize/2) / smpRate, smpRate / freq, high * vol];
}
