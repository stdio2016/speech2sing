importScripts("../lib/fft.js");
var fftSize = 2048;
var hannWindow, hannAuto;
var goodFft = new stdio2018.FFT(fftSize*2);

function buildHannWindow() {
  hannWindow = new Float64Array(fftSize);
  hannAuto = new Float64Array(fftSize);
  var k = 2 * Math.PI / fftSize;
  for (var i = 0; i < fftSize; i++) {
    var t = i / fftSize;
    hannWindow[i] = 0.5 - 0.5 * Math.cos(k * i);
    hannAuto[i] = (1 - i/fftSize) * (2/3 + 1/3 * Math.cos(k*i)) + 1/(2*Math.PI) * Math.sin(k*i);
  }
}
buildHannWindow();

var StepTime = 0.01;
var MinimumPitch = 55 * Math.pow(2, 2.5/12);
var MaximumPitch = 880 * Math.pow(2, 3.5/12);
// parameter from Praat source code
// https://github.com/praat/praat/blob/master/fon/Sound_to_Pitch.cpp#L566
var OctaveCost = 0.01;
var VoicingThreshold = 0.45;
var SilenceThreshold = 0.03;
var VoicedUnvoicedCost = 0.14;
var OctaveJumpCost = 0.35;
var MaxCandidates = 15;

onmessage = function onmessage(e) {
  var msg = e.data;
  if (msg.kind === "start") {
    postMessage({kind: "finish", id: msg.id, candidates: []});
  }
  else if (msg.kind === "compute") {
    //console.log("work on", msg.secs, msg.pos);
    var ans = [], i = 0;
    var start = msg.pos / msg.smpRate;
    while (i + fftSize < msg.buf.length) {
      ans.push(getSegmentCandidates(msg.buf, i, fftSize, msg.smpRate, msg.globalVol, start));
      i = Math.floor(i + msg.smpRate * StepTime);
    }
    postMessage({kind: "finish", id: msg.id, candidates: ans});
  }
};

function getSegmentCandidates(buf, pos, size, smpRate, globalVol, secs) {
  var vol = 0;
  // multiply with Hann window
  var smp = new Float64Array(size * 2);
  var sum = 0;
  for (var i = 0; i < size; i++) {
    sum += buf[pos+i];
  }
  sum /= size;
  for (var i = 0; i < size; i++) {
    smp[i] = buf[pos+i] - sum;
  }
  for (var i = 0; i < size; i++) {
    var b = smp[i];
    if (b > vol) vol = b;
    if (-b > vol) vol = -b;
    smp[i] = b * hannWindow[i];
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
    candidates.push({frequency: 0, strength: 0});
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
  return [(pos+size/2) / smpRate + secs, vol, candidates];
}
