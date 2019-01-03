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
}

function createClipSelect(def) {
  var sel = document.createElement("select");
  sel.id = "selClip_" + genId;
  var choose = "";
  if (def) choose = def.clip;
  sel.add(new Option("rest", "rest", false, "rest" === choose));
  sel.add(new Option("tied", "tied", false, "tied" === choose));
  allSongs.forEach(function (s) {
    var value = "c_" + s.name;
    sel.add(new Option(s.name, value, false, value === choose));
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
      }).catch(errorbox);
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
  
  var selPitch = createPitchSelect(setting);
  lbl.appendChild(new Text(" pitch: "));
  lbl.appendChild(selPitch);
  
  var selBeat = createBeatSelect(setting);
  lbl.appendChild(new Text(" beat: "));
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
  console.log("added " + name);
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
      getSound(name).then(function (result) {
        v.finished = true;
        v.result = result;
        console.log("loaded", name);
        v.waiting.forEach(function (e) { e.yes(result); });
        v.waiting = [];
      }).catch(function (x) {
        v.finished = true;
        v.result = x;
        console.log("load failed", name);
        v.waiting.forEach(function (e) { e.no(x); });
        v.waiting = [];
      });
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
