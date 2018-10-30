if (!window.stdio2017) {
  window.stdio2017 = {};
}

stdio2017.FFT = {
  /** permute requires an input
  * arr: an array of complex numbers
  * looks like [re0, im0, re1, im1, ...]
  */
  permute: function (arr) {
    var size = 0;
    var len = arr.length;
    while ((2<<size) < len) {
      size++;
    }
    var out = [];
    function permuteHelper(level, index) {
      if (level == size) {
        out.push(index >= len ? 0 : arr[index]);
        out.push(index+1 >= len ? 0 : arr[index+1]);
      }
      else {
        permuteHelper(level+1, index | 0);
        permuteHelper(level+1, index | 2<<level);
      }
    }
    permuteHelper(0, 0);
    return out;
  },
  // I don't know if this is FFT or IFFT
  // flag: true/false to choose FFT or IFFT
  // At least 2 complex numbers to do FFT
  transform: function (arr, flag) {
    var perm = stdio2017.FFT.permute(arr);
    var len = perm.length; // 2 * actual complex number count
    var out = [];
    for (var i = 0; i < len; i += 4) {
      out.push(perm[i+0] + perm[i+2]);
      out.push(perm[i+1] + perm[i+3]);
      out.push(perm[i+0] - perm[i+2]);
      out.push(perm[i+1] - perm[i+3]);
    }
    // build sine table of size "len"
    var sinetable = [];
    for (var i = 0; i < len/4; i++) {
      sinetable.push(Math.sin((Math.PI*2/len) * i));
    }
    sinetable.push(1);
    for (var i = 0; i < len/4; i++) {
      sinetable.push(sinetable[len/4 - i - 1]);
    }
    for (var i = 0; i < len/2; i++) {
      sinetable.push(-sinetable[i + 1]);
    }
    function onestep(input, out, step) {
      var omega = len/step;
      for (var i = 0; i < len; i += step * 2) {
        // multiply by omega^n
        for (var j = 0; j < step/2; j ++) {
          var re = input[i + step + j*2+0];
          var im = input[i + step + j*2+1];
          var sin = sinetable[j * omega], cos = sinetable[len/4 + j * omega];
          if (flag) {
            sin = -sin;
          }
          input[i + step + j*2+0] = re * cos - im * sin;
          input[i + step + j*2+1] = re * sin + im * cos;
        }
        // add
        for (var j = 0; j < step/2; j ++) {
          out[i + j*2+0] = input[i + j*2+0] + input[i + step + j*2+0];
          out[i + j*2+1] = input[i + j*2+1] + input[i + step + j*2+1];
        }
        // subtract
        for (var j = 0; j < step/2; j ++) {
          out[i + step + j*2+0] = input[i + j*2+0] - input[i + step + j*2+0];
          out[i + step + j*2+1] = input[i + j*2+1] - input[i + step + j*2+1];
        }
      }
    }
    var step = 4;
    while (step * 2 <= len) {
      onestep(out, perm, step);
      step *= 2;
      if (step * 2 > len) return perm;
      onestep(perm, out, step);
      step *= 2;
    }
    return out;
  },
  realFFT: function(arr) {
    // I derived this during a class
    // interactive audio processing!
    var n = arr.length/2;
    var F = stdio2017.FFT.transform(arr, true);
    var out = new Float32Array(n * 4);
    for (var k = 0; k < n; k++) {
      var fk = F[k*2], fki = F[k*2+1];
      var fnk, fnki;
      if (k === 0) { fnk = F[0]; fnki = F[1]; }
      else { fnk = F[(n-k)*2]; fnki = F[(n-k)*2+1]; }
      
      var a = (fk + fnk) * 0.5;
      var b = (fki - fnki) * 0.5;
      var c = (fki + fnki) * 0.5;
      var d = (fnk - fk) * 0.5;
      var phi = -Math.PI/n * k;
      var cos = Math.cos(phi), sin = Math.sin(phi);
      out[k*2] = a + c * cos - d * sin;
      out[k*2+1] = b + c * sin + d * cos;
      out[n*2+k*2] = a - c * cos + d * sin;
      out[n*2+k*2+1] = b - c * sin - d * cos;
    }
    return out;
  }
};

// write faster version
var stdio2018 = stdio2018 || {};

stdio2018.FFT = function (size) {
  if (!(this instanceof stdio2018.FFT))
    throw new TypeError('calling a constructor without new is forbidden');
  if ((size|0) !== size) throw new TypeError('size must be an integer');
  if (size <= 0) throw new RangeError('size must be > 0');
  if (size & (size-1)) throw new RangeError('size must be power of 2');

  this.N = size;
  this.lv = Math.round(Math.log(size) / Math.log(2));
  this.buildSine(size);
};

stdio2018.FFT.prototype = {
  buildSine: function (N) {
    this.sin = new Float64Array(N * 2);
    for (var i = 2; i < N; i *= 2) {
      for (var j = 0; j < i/2; j++) {
        this.sin[(i+j)*2] = Math.cos(Math.PI * (j / i));
        this.sin[(i+j)*2+1] = Math.sin(Math.PI * (j / i));
      }
      for (var j = i/2; j < i; j++) {
        this.sin[(i+j)*2] = -this.sin[i+j*2+1];
        this.sin[(i+j)*2+1] = this.sin[i+j*2];
      }
    }

    this.perm = new Uint32Array(N);
    this.perm[0] = 0;
    for (var i = 1, B = N/2; i < N; i *= 2, B >>= 1) {
      for (var j = 0; j < i; j++) {
        this.perm[i+j] = this.perm[j] | B;
      }
    }
  },
  
  permute: function (din, dout) {
    var N = din.length / 2;
    var lv = Math.round(Math.log(N) / Math.log(2));
    var decr = this.lv - lv;
    for (var i = 0; i < N; i++) {
      var p = this.perm[i] >>> decr;
      dout[p*2] = din[i*2];
      dout[p*2+1] = din[i*2+1];
    }
  },
  
  permuteInPlace: function (d) {
    var N = d.length / 2;
    var lv = Math.round(Math.log(N) / Math.log(2));
    var decr = this.lv - lv;
    for (var i = 0; i < N; i++) {
      var p = this.perm[i] >>> decr;
      if (p < i) {
        var t1 = d[i*2];
        var t2 = d[i*2+1];
        d[i*2] = d[p*2];
        d[i*2+1] = d[p*2+1];
        d[p*2] = t1;
        d[p*2+1] = t2;
      }
    }
  },
  
  transform: function (din, dout, inverse) {
    var N = Math.min(din.length, this.N*2);
    if (N < 2 || (N & N-1)) {
      throw new RangeError('input array size must be power of 2');
    }
    if (din === dout) {
      dout = din;
      this.permuteInPlace(din);
    }
    else {
      if (!dout) dout = new Float64Array(N);
      this.permute(din, dout);
    }
    
    // first round
    for (var i = 0; i < N; i += 4) {
      var a = dout[i];
      var b = dout[i+1];
      var c = dout[i+2];
      var d = dout[i+3];
      dout[i] = a + c;
      dout[i+1] = b + d;
      dout[i+2] = a - c;
      dout[i+3] = b - d;
    }
    
    // more round
    var cos = this.sin;
    for (var step = 4; step < N; step *= 2) {
      for (var j = step; j < N; j += step) {
        for (var i = 0; i < step; i+=2) {
          var a = dout[j];
          var b = dout[j+1];
          j -= step;
          var sin = cos[step+i+1];
          sin = inverse ? sin : -sin;
          var c = a * cos[step+i] - b * sin;
          var d = a * sin + b * cos[step+i];
          a = dout[j];
          b = dout[j+1];
          dout[j] = a + c;
          dout[j+1] = b + d;
          j += step;
          dout[j] = a - c;
          dout[j+1] = b - d;
          j += 2;
        }
      }
    }
    return dout;
  },
  
  /**
  * output format: 
  *     0: F[0] re
  *     1: F[N/2] re
  *    2k: F[k] re, for k>=1
  *  2k+1: F[k] im, for k>=1
  */
  realFFT: function (din, dout) {
    var n = din.length/2;
    dout = this.transform(din, dout, false);
    var a = dout[0];
    var b = dout[1];
    dout[0] = a + b; // real part of F[0]
    dout[1] = a - b; // real part of F[N/2]
    for (var k = 1; k <= n/2; k++) {
      var fk = dout[k*2];
      var fki = dout[k*2+1];
      var fnk = dout[(n-k)*2];
      var fnki = dout[(n-k)*2+1];
      
      var cos = this.sin[(n+k)*2];
      var sin = this.sin[(n+k)*2+1];
      a = fki + fnki;
      b = fnk - fk;
      var c = a * cos + b * sin;
      var d = b * cos - a * sin;
      a = fk + fnk;
      b = fki - fnki;
      dout[k*2] = (a + c) * 0.5;
      dout[k*2+1] = (d + b) * 0.5;
      dout[(n-k)*2] = (a - c) * 0.5;
      dout[(n-k)*2+1] = (d - b) * 0.5;
    }
    return dout;
  }
};

(function stdio2018FftTest(){
  var repeat = 1;
  var a = new stdio2018.FFT(2048);
  var b = new Float64Array(2048);
  for (var i = 0; i < 2048; i++) {
    b[i] = Math.random();
  }
  var newc, oldc;
  console.time('new real FFT');
  for (var i = 0; i < repeat; i++) {
    newc = a.realFFT(b, null);
  }
  console.timeEnd('new real FFT');
  console.log(newc);
  
  console.time('old real FFT');
  for (var i = 0; i < repeat; i++) {
    oldc = stdio2017.FFT.realFFT(b);
  }
  console.timeEnd('old real FFT');
  console.log(oldc);
  
  var d = 0;
  newc.forEach(function (x, i) {
    if (i !== 1) // because newc[1] is F[N/2]
    d = Math.max(Math.abs(x - oldc[i]), d);
  });
  d = Math.max(Math.abs(newc[1] - oldc[2048]), d);
  console.log('max diff = ', d);
})();
