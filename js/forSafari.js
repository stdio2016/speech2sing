var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);
var isSafari = navigator.vendor && navigator.vendor.search("Apple") > -1;
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

var audioLocked = isIOS || isSafari;

// Chrome learns the "bad" part of Safari!
if (audioCtx && audioCtx.state === "suspended") {
  audioLocked = true;
}

function resumeContext() {
  if (audioCtx && audioLocked) {
    // try resuming context
    audioCtx.resume();
    
    // play a beep sound
    var r = audioCtx.createOscillator();
    (r.start || r.noteOn).call(r);
    (r.stop || r.noteOff).call(r, audioCtx.currentTime+Math.random()*0.5);
    r.frequency.value = 880;
    r.detune.value = Math.random()*100 - 50;
    var s = audioCtx.createGain();
    s.gain.value = Math.random() * 0.5;
    r.connect(s);
    s.connect(audioCtx.destination);
    audioLocked = false;
  }
}

if (audioLocked) {
  window.addEventListener('load', function () {
    window.addEventListener('touchend', resumeContext); // for mobile
    window.addEventListener('click', resumeContext); // for desktop
  });
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.register('sw.js').then(function(reg) {
    console.log('Registration succeeded. Scope is ' + reg.scope);
  }).catch(function(x) {
    console.log('Registration failed with ' + error);
  });
}
