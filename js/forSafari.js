var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);
var isSafari = navigator.vendor && navigator.vendor.search("Apple") > -1;
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

var audioLocked = isIOS || isSafari;

addEventListener('load', function () {
  // Chrome learns the "bad" part of Safari!
  if (audioCtx && audioCtx.state === "suspended") {
    audioLocked = true;
  }
  if (audioLocked) {
    window.addEventListener('touchend', resumeContext); // for mobile
    window.addEventListener('click', resumeContext); // for desktop
  }
});

function resumeContext() {
  if (audioCtx && audioCtx.state !== 'running') {
    // try resuming context
    audioCtx.resume()['catch'](function (x) {
      alert('Unable to play sound: ' + x);
    });
    
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
