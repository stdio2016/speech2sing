var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);
var isSafari = navigator.vendor && navigator.vendor.search("Apple") > -1;

var audioLocked = isIOS || isSafari;

function resumeContext() {
  if (audioCtx && audioLocked) {
    audioCtx.resume();
    var r = audioCtx.createOscillator();
    (r.start || r.noteOn).call(r);
    (r.stop || r.noteOff).call(r, audioCtx.currentTime+Math.random()*0.5);
    r.frequency.value = 880;
    r.detune.value = Math.random()*100 - 50;
    var s = audioCtx.createGain();
    s.gain.value = Math.random() * 0.5;
    r.connect(s);
    s.connect(audioCtx.destination);
    window.removeEventListener('touchend', resumeContext);
    audioLocked = false;
  }
}

if (audioLocked) {
  window.addEventListener('onload', function () {
    window.addEventListener('touchend', resumeContext); // for mobile
    window.addEventListener('click', resumeContext); // for desktop
  });
}
