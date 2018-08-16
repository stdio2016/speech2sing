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
  }
};
