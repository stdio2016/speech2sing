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
      vol += wind[j*2] * wind[j*2];
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
    ans.push([i/smpRate, freq * smpRate/fftSize, Math.sqrt(vol / fftSize)]);
  }
  return ans;
}

// is this autocorrelation?
function realTimeAutocorrelation(current, output) {
  var size = current.length;
  var total = new Float32Array(size * 4);
  for (var i = 0; i < size; i++) {
    total[i*2] = current[i];
  }
  total = stdio2017.FFT.transform(total, true);
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
  var max = 100, min = -100;
  for (var i = 0; i < size; i++) {
    var re = total[i*2];
    if (re > max) max = re;
    if (re < min) min = re;
  }
  var range = Math.max(max, -min);
  for (var i = 0; i < size; i++) {
    var re = total[i*2];
    output[i] = (re + range) / (2 * range) * 255;
  }
}
