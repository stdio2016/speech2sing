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

var goodFft = new stdio2018.FFT(fftSize*2);
// is this autocorrelation?
function realTimeAutocorrelation(current, output) {
  var size = current.length;
  var total = new Float64Array(size * 2);
  for (var i = 0; i < size; i++) {
    total[i] = current[i] * hannWindow[i];
  }
  ac = goodFft.realFFT(total, total);
  for (var i = 1; i < size; i++) {
    var re = total[i*2];
    var im = total[i*2+1];
    ac[i*2] = re*re + im*im;
    ac[i*2+1] = 0;
  }
  ac[1] = total[1] * total[1];
  ac[0] = total[0] * total[0];
  total = goodFft.realIFFT(ac, ac);
  var dB = 10 / Math.log(10);
  var offset = Math.log(size) * 2;
  // normalize
  var max = total[0], min = -total[0];
  for (var i = 0; i < size; i++) {
    var re = total[i];
    re /= hannAuto[i];
    total[i] = re;
    if (i*2 < size) {
      if (re > max) max = re;
      if (re < min) min = re;
    }
  }
  var range = Math.max(max, -min);
  for (var i = 0; i < size; i++) {
    var re = total[i];
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
    resolve: null,
    startTime: new Date() // for performance measure
  };
  // get global volume
  var vol = 0;
  for (var i = 0; i < buf.length; i++) {
    if (buf[i] > vol) vol = buf[i];
    if (-buf[i] > vol) vol = -buf[i];
  }
  pitchState.volume = vol;
  pitchDebug = pitchState;
  return new Promise(function (resolve, reject) {
    pitchState.resolve = resolve;
    if (buf.length <= fftSize) reject(new Error("The sound is too short"));
    else analyzePitch2Loop1(pitchState);
  });
}

var StepTime = 0.01;
var MinimumPitch = 70;
var MaximumPitch = 800;
// parameter from Praat source code
// https://github.com/praat/praat/blob/master/fon/Sound_to_Pitch.cpp#L566
var OctaveCost = 0.01;
var VoicingThreshold = 0.45;
var SilenceThreshold = 0.03;
var VoicedUnvoicedCost = 0.14;
var OctaveJumpCost = 0.35;
var MaxCandidates = 15;

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
    state.candidates.push(p);
    i = Math.floor(i + smpRate * StepTime);
  }
  state.pos = i;
  state.secs++;
  if (i + fftSize >= buf.length) {
    viterbiDecidePitch(state);
    setTimeout(function () {
      state.pitch.elapsedTime = new Date() - state.startTime;
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
  var sum = 0;
  for (var i = 0; i < size; i++) {
    var b = buf[pos+i];
    if (b > vol) vol = b;
    if (-b > vol) vol = -b;
    smp[i] = b * hannWindow[i];
    sum += smp[i];
  }
  sum /= size;
  for (var i = 0; i < size; i++) {
    smp[i] -= sum;
  }
  goodFft.realFFT(smp, smp);
  for (var i = 1; i < size; i++) {
    var re = smp[i*2];
    var im = smp[i*2+1];
    smp[i*2] = re*re + im*im;
    smp[i*2+1] = 0;
  }
  smp[1] = smp[1] * smp[1];
  smp[0] = smp[0] * smp[0];
  // corr[i*2] is autocorrelation
  var corr = goodFft.realIFFT(smp, null);
  var normalize = 1/corr[0];
  for (var i = 0; i < size/2; i++) {
    smp[i+500] = corr[i] * normalize / hannAuto[i];
  }
  for (var i = 1; i <= 500; i++) {
    smp[500-i] = corr[i] * normalize / hannAuto[i];
  }
  var lim = smpRate/MinimumPitch | 0;
  var silenceR = VoicingThreshold + Math.max(0,
    2 - (vol/globalVol) / (SilenceThreshold/(1+VoicingThreshold)));
  var candidates = [{frequency: 0, strength: silenceR}];
  for (var i = 0; i < MaxCandidates; i++) {
    candidates.push({frequency: 0, strength: silenceR});
  }
  for (var i = smpRate/MaximumPitch | 0; i < lim; i++) {
    if (smp[499+i] > smp[500+i] || smp[500+i] < smp[501+i]) continue;
    var r0 = smp[499+i];
    var r = smp[500+i];
    var r1 = smp[501+i];
    var peak = r + (r0-r1) * (r0-r1) * 0.125 / (2*r - r0 - r1); 
    var delta =  i + (r0 - r1) * 0.5 / (r0 + r1 - 2 * r);
    var R = peak - OctaveCost * Math.log2(MinimumPitch/smpRate * delta);
    var nn = MaxCandidates;
    while (nn >= 0 && R > candidates[nn].strength) {
      if (nn < MaxCandidates) candidates[nn+1] = candidates[nn];
      nn--;
    }
    if (nn < MaxCandidates) {
      candidates[nn+1] = {frequency: smpRate/delta, strength: R};
    }
  }
  return [(pos+fftSize/2) / smpRate, vol, candidates];
}

function viterbiDecidePitch(state) {
  var candidates = state.candidates;
  var cost = new Float64Array(candidates.length * (MaxCandidates + 1));
  var back = new Int32Array(candidates.length * (MaxCandidates + 1));
  for (var i = 0; i <= MaxCandidates; i++) {
    cost[i] = -candidates[0][2][i].strength;
  }
  for (var t = 1; t < candidates.length; t++) {
    for (var i = 0; i <= MaxCandidates; i++) {
      var next = candidates[t][2][i];
      var best = 999;
      var which = 0;
      for (var j = 0; j <= MaxCandidates; j++) {
        var prev = candidates[t-1][2][j];
        var newCost = cost[(t-1)*(MaxCandidates+1) + j] - next.strength;
        if (prev.frequency === 0 && next.frequency === 0) {
          // unvoiced
          newCost += 0;
        }
        else if (prev.frequency !== 0 && next.frequency !== 0) {
          // voiced
          newCost += OctaveJumpCost * Math.abs(Math.log2(next.frequency / prev.frequency));
        }
        else {
          // voice -> unvoice trnsition
          newCost += VoicedUnvoicedCost;
        }
        
        if (j === 0 || newCost < best) {
          best = newCost;
          which = j;
        }
      }
      cost[t*(MaxCandidates+1)+i] = best;
      back[t*(MaxCandidates+1)+i] = which;
    }
  }
  
  // backtrack
  state.pitch = [];
  var Q = 0;
  var best = 999;
  for (var i = 0; i <= MaxCandidates; i++) {
    if (i === 0 || cost[(candidates.length-1)*(MaxCandidates+1)+i] < best) {
      best = cost[(candidates.length-1)*(MaxCandidates+1)+i];
      Q = i;
    }
  }
  for (var t = candidates.length-1; t > 0; t--) {
    var choose = candidates[t][2][Q];
    var ans = [candidates[t][0], choose.frequency, candidates[t][1]];
    state.pitch.push(ans);
    Q = back[t*(MaxCandidates+1)+Q];
  }
  // last step
  {
    var choose = candidates[0][2][Q];
    var ans = [candidates[0][0], choose.frequency, candidates[0][1]];
    state.pitch.push(ans);
  }
  state.pitch.reverse();
}
