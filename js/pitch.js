var fftSize = 2048;
function analyzePitch(buf, smpRate) {
  var i;
  var wind = new Float32Array(fftSize * 2);
  var amps = new Float32Array(fftSize/2);
  var ans = [];
  var ctx = spectrum.getContext('2d');
  var h = (fftSize * 5000 / smpRate)|0;
  var w = 300;
  spectrum.height = h;
  spectrum.width = w;
  var bmp = ctx.getImageData(0, 0, w, h);
  for (i = fftSize; i < buf.length; i += fftSize) {
    var x = (i/fftSize)|0; // for visualization
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
      if (i / fftSize < w && j < h) {
        bmp.data[(x + (h-j-1) * w)*4+0] = 0;
        bmp.data[(x + (h-j-1) * w)*4+1] = Math.log(amps[j]) * 40;
        bmp.data[(x + (h-j-1) * w)*4+2] = 0;
        bmp.data[(x + (h-j-1) * w)*4+3] = 255;
      }
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
    if (x < w) {
      bmp.data[(x + (h-freq*2-1) * w)*4+0] = 255;
      bmp.data[(x + (h-freq*2-1) * w)*4+1] = 0;
      bmp.data[(x + (h-freq*2-1) * w)*4+2] = 0;
    }
  }
  ctx.putImageData(bmp, 0, 0);
  return ans;
}

// is this autocorrelation?
function realTimeAutocorrelation(current, output) {
  var size = current.length;
  var total = new Float32Array(size * 4);
  for (var i = 0; i < size; i++) {
    total[i*2] = current[i] * hannWindow[i];
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
