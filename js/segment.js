var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var clips = document.querySelector('.sound-clips');
function addClipInterface(name) {
  name = name.name;
  var clip = new Option(name, "r_"+name);
  clips.appendChild(clip);
  console.log("added " + name);
}

function startup() {
  getSoundNames().then(function (names) {
    clips.options.remove("loading");
    names.forEach(addClipInterface);
    if (names.length === 0) {
      var no = new Option("No clips ;-(", "");
      clips.options.add(no);
      clips.disabled = true;
      btnAnalyzeClip.disabled = true;
    }
  })['catch'](function (x) {
    console.error(x);
  });
}
