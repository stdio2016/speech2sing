var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var divNotes = document.querySelector('.sound-clips');
var allSongs = [];
var PitchName = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var BeatName = [
  [1/4, "16th"],
  [1/2, "eighth"], [3/4, "dotted eighth"],
  [1, "quarter"], [3/2, "dotted quarter"],
  [2, "half"], [3, "dotted half"],
  [4, "whole"]
];
// this cache has reference counting! use with caution
var cachedFiles = new Map();
var genId = 0;

function startup() {
  // on database initialize
  getSoundNames().then(function (names) {
    allSongs = names;
  })['catch'](function (x) {
    console.error(x);
    alertbox('Cannot load sounds. You can try refreshing this page');
  });
  
  getTrackNames().then(function (names) {
    names.forEach(function (dat) {
      selSong.add(new Option(dat.name, "c_"+dat.name));
    });
    selSong.oninput = loadSong;
  })['catch'](function (x) {
    console.error(x);
    alertbox('Cannot load tracks. You can try refreshing this page');
  });
}

function createClipSelect(def) {
  def = def || {};
  var sel = document.createElement("select");
  sel.id = "selClip_" + genId;
  var choose = null;
  if (def.type === "note") choose = def.clip;
  sel.add(new Option("rest", "rest", false, "rest" === def.type));
  sel.add(new Option("tied", "tied", false, "tied" === def.type));
  allSongs.forEach(function (s) {
    var name = s.name;
    sel.add(new Option(name, "c_"+name, false, name === choose));
  });
  return sel;
}

function getPitchName(midi) {
  return PitchName[midi%12] + Math.floor(midi/12 - 1);
}

function createPitchSelect(def) {
  var sel = document.createElement("select");
  sel.id = "selPitch_" + genId;
  var choose = 60;
  if (def) choose = def.pitch;
  for (var mid = 38; mid <= 84; mid++) {
    sel.add(new Option(getPitchName(mid), mid, false, mid == choose))
  }
  return sel;
}

function createBeatSelect(def) {
  var sel = document.createElement("select");
  sel.id = "selBeat_" + genId;
  var choose = 1;
  if (def) choose = def.beat;
  BeatName.forEach(function (n) {
    sel.add(new Option(n[1], n[0], false, n[0] == choose))
  });
  return sel;
}

function addNoteInterface(before, setting) {
  genId++;
  var note = document.createElement("div");
  note.className = "clip";
  note.id = "note_" + genId;
  var lbl = document.createElement("p");
  
  var btnAdd = document.createElement("button");
  btnAdd.className = "plus";
  btnAdd.textContent = "+";
  btnAdd.onclick = function () {
    addNoteInterface(note);
  };
  lbl.appendChild(btnAdd);
  
  var selClip = createClipSelect(setting);
  var oldClip = selClip.value;
  selClip.oninput = function () {
    if (oldClip.startsWith("c_"))
      unloadFileFromCache(oldClip.substr(2));
    oldClip = selClip.value;
    if (selClip.value.startsWith("c_")) {
      loadFileIntoCache(selClip.value.substr(2)).then(function (dat) {
        updateSegmentOption(selSegment, dat.segments);
      })['catch'](errorbox);
    }
    else {
      updateSegmentOption(selSegment, "-");
    }
  };
  lbl.appendChild(selClip);
  
  var selSegment = document.createElement("select");
  selSegment.id = "selSegment_" + genId;
  selSegment.add(new Option("segment name", ""));
  updateSegmentOption(selSegment, "-");
  lbl.appendChild(new Text(" "));
  lbl.appendChild(selSegment);
  if (oldClip.startsWith("c_")) {
    loadFileIntoCache(oldClip.substr(2)).then(function (dat) {
      updateSegmentOption(selSegment, dat.segments);
      for (var i = 0; i < selSegment.length; i++) {
        if (selSegment[i].value === setting.segment) {
          selSegment[i].selected = true;
          break;
        }
      }
    })['catch'](errorbox);
  }
  
  var selPitch = createPitchSelect(setting);
  var lblPitch = document.createElement("label");
  lblPitch.textContent = " pitch: ";
  lblPitch.htmlFor = selPitch.id;
  lbl.appendChild(lblPitch);
  lbl.appendChild(selPitch);
  
  var selBeat = createBeatSelect(setting);
  var lblBeat = document.createElement("label");
  lblBeat.textContent = " beat: ";
  lblBeat.htmlFor = selBeat.id;
  lbl.appendChild(lblBeat);
  lbl.appendChild(selBeat);
  
  var btnDel = document.createElement("button");
  btnDel.className = "red";
  btnDel.textContent = "Delete";
  btnDel.onclick = function () {
    confirmBox("Really want to delete this note?", function (result) {
      if (result) {
        note.remove();
        if (selClip.value.startsWith("c_"))
          unloadFileFromCache(selClip.value.substr(2));
      }
    });
  };
  lbl.appendChild(btnDel);
  
  note.appendChild(lbl);
  if (!before) before = divNotes.lastElementChild;
  divNotes.insertBefore(note, before);
}

function loadFileIntoCache(name) {
  if (cachedFiles.has(name)) {
    var v = cachedFiles['get'](name);
    v.refCount++;
    if (v.finished) {
      return Promise.resolve(v.result);
    }
    else {
      return new Promise(function (yes, no) {
        v.waiting.push({yes: yes, no: no});
      });
    }
  }
  else {
    var v = {waiting: [], refCount: 1};
    console.log("loading", name);
    return new Promise(function (yes, no) {
      v.waiting.push({yes: yes, no: no});
      cachedFiles['set'](name, v);
      function fail(x) {
        v.finished = true;
        v.result = x;
        console.log("load failed", name);
        v.waiting.forEach(function (e) { e.no(x); });
        v.waiting = [];
      }
      getSound(name).then(function (result) {
        v.result = result;
        var fr = new FileReader();
        fr.onload = function () {
          audioCtx.decodeAudioData(fr.result, function (buf) {
            v.finished = true;
            v.result.buffer = buf;
            console.log("loaded", name);
            v.waiting.forEach(function (e) { e.yes(result); });
            v.waiting = [];
          }, fail);
        };
        fr.onerror = fail;
        fr.readAsArrayBuffer(result.file);
      })['catch'](fail);
    });
  }
}

function unloadFileFromCache(name) {
  if (cachedFiles.has(name)) {
    var v = cachedFiles['get'](name);
    v.refCount--;
    if (v.refCount <= 0) {
      cachedFiles['delete'](name);
      console.log("unloaded", name);
    }
  }
}

function updateSegmentOption(sel, segments) {
  // clear options
  sel.options.length = 0;
  if (segments === "-") {
    sel.hidden = true;
    return ;
  }
  sel.hidden = false;
  if (!segments || segments.length === 0) {
    sel.add(new Option("no segments", ""));
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  segments.forEach(function (seg) {
    sel.add(new Option(seg.name, seg.name));
  });
}

function MyBadSynth() {
  var n = divNotes.children.length - 1;
  var pos = 0;
  var t = audioCtx.currentTime;
  var bpm = +txtBpm.value;
  for (var i = 0; i < n; i++) {
    var ch = divNotes.children[i];
    var id = +ch.id.substr(5);
    var clip = document.getElementById("selClip_" + id).value;
    var seg = document.getElementById("selSegment_" + id).value;
    var pitch = +document.getElementById("selPitch_" + id).value;
    var beat = +document.getElementById("selBeat_" + id).value;
    console.log(clip, seg, pitch, beat);
    if (clip.startsWith("c_")) {
      var f = cachedFiles.get(clip.substr(2)).result;
      var segs = f.segments;
      for (var j = 0; j < segs.length; j++) {
        if (segs[j].name === seg) break;
      }
      var start = segs[j].start;
      var end = segs[j].end;
      var snd = audioCtx.createBufferSource();
      snd.buffer = f.buffer;
      snd.loopStart = start;
      snd.loopEnd = end;
      snd.loop = true;
      snd.connect(audioCtx.destination);
      snd.start(t + pos, start);
      snd.stop(t + pos + beat * 60 / bpm);
    }
    pos += beat * 60 / bpm;
  }
}

function trackToJSON() {
  var n = divNotes.children.length - 1;
  var pos = 0;
  var arr = [];
  for (var i = 0; i < n; i++) {
    var ch = divNotes.children[i];
    var id = +ch.id.substr(5);
    var clip = document.getElementById("selClip_" + id).value;
    var seg = document.getElementById("selSegment_" + id).value;
    var pitch = +document.getElementById("selPitch_" + id).value;
    var beat = +document.getElementById("selBeat_" + id).value;
    if (clip.startsWith("c_")) {
      arr.push({
        type: "note",
        clip: clip.substr(2),
        segment: seg,
        pitch: pitch,
        beat: beat
      });
    }
    else {
      arr.push({type: clip, pitch: pitch, beat: beat});
    }
  }
  return {
    bpm: +txtBpm.value,
    notes: arr
  };
}

function loadSong() {
  var name = selSong.value;
  cachedFiles = new Map();
  var n = divNotes.childNodes.length - 2;
  for (var i = 0; i < n; i++) {
    divNotes.removeChild(divNotes.firstChild);
  }
  if (name.startsWith("c_")) {
    name = name.substr(2);
    getTrack(name).then(function (data) {
      var file = data.file;
      txtBpm.value = file.bpm;
      initNotes(file.notes);
    })['catch'](errorbox);
  }
}

function initNotes(segs) {
  for (var i = 0; i < segs.length; i++) {
    addNoteInterface(null, segs[i]);
  }
}

function saveSong() {
  var name = selSong.value;
  if (name === "new") {
    name = "Song name";
  }
  else if (name.startsWith("c_")) {
    name = name.substr(2);
  }
  var date = new Date();
  promptBox("Enter name of this song", name, function (name) {
    if (!name) return ;
    saveTrack(name, trackToJSON(), date);
  });
}
