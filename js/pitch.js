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

var pitchDebug;

var MaxThreadCount = navigator.hardwareConcurrency;
function PitchDetector() {
  this.workers = [];
  var goodThread = Math.max(MaxThreadCount/2, 1);
  //goodThread = 1;
  for (var i = 0; i < goodThread; i++) {
    this.workers.push(new Worker("js/pitchworker.js"));
    this.workers[i].onmessage = this.distributeWork.bind(this);
  }
  this.msgId = 0;
  this.showProgress = function (progress, total) {
    //console.log("finished " + progress + "s/" + (total|0) + "s");
  };
}

PitchDetector.prototype.analyze = function (buf, smpRate) {
  var id = ++this.msgId;
  this.buf = buf;
  this.smpRate = smpRate;
  this.candidates = [];
  this.pitch = [];
  this.pos = 0;
  this.secs = 0;
  this.finished = -this.workers.length;
  this.startTime = new Date(); // for performance measure
  // get global volume
  var vol = 0;
  for (var i = 0; i < buf.length; i++) {
    if (buf[i] > vol) vol = buf[i];
    if (-buf[i] > vol) vol = -buf[i];
  }
  this.volume = vol;
  if (buf.length <= fftSize)
    return Promise.reject(new Error("The sound is too short"));

  if (!(smpRate >= 8000))
    return Promise.reject(new Error("The sample rate is too small"));
  var me = this;
  return new Promise(function (resolve, reject) {
    me.resolve = resolve;
    for (var i = 0; i < me.workers.length; i++) {
      // just do it like MPI
      me.workers[i].postMessage({id: id, kind: "start"});
    }
  });
};

PitchDetector.prototype.abort = function () {
  this.resolve = function () {};
};

PitchDetector.prototype.destroy = function () {
  this.abort();
  this.workers.forEach(function (x) {
    x.terminate();
  });
};

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

PitchDetector.prototype.distributeWork = function (e) {
  var msg = e.data;
  if (msg.id === this.msgId && msg.kind === "finish") {
    for (var i = 0; i < msg.candidates.length; ++i) {
      this.candidates.push(msg.candidates[i]);
    }
    this.finished++;
  }
  //console.log("finish", this.finished);
  var i = this.pos;
  var smpRate = this.smpRate;
  var secs = this.secs;
  var buf = this.buf;
  if (this.finished > 0) {
    this.showProgress(this.finished, buf.length / smpRate);
  }
  if (i + fftSize >= buf.length) {
    if (this.finished === secs) {
      this.candidates.sort(function (a,b) {
        if (a[0] > b[0]) return 1;
        if (a[0] == b[0]) return 0;
        return -1;
      });
      this.viterbiDecidePitch();
      this.pitch.elapsedTime = new Date() - this.startTime;
      this.resolve(this.pitch);
    }
  }
  else {
    var end = Math.min((secs+1) * smpRate, buf.length);
    while (i + fftSize < end) {
      i = Math.floor(i + smpRate * StepTime);
    }
    var slice = buf.slice(this.pos, i + fftSize);
    e.target.postMessage({
      id: this.msgId, kind: "compute",
      secs: secs,
      buf: slice,
      smpRate: smpRate,
      globalVol: this.volume,
      pos: this.pos
    }, [slice.buffer]);
    this.pos = i;
    this.secs++;
  }
};

PitchDetector.prototype.viterbiDecidePitch = function () {
  var state = this;
  var candidates = state.candidates;
  if (candidates.length == 0) {
    state.pitch = [];
    return ;
  }
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
};
