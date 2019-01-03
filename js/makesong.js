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
var genId = 0;

function startup() {
  // on database initialize
  getSoundNames().then(function (names) {
    allSongs = names;
  })['catch'](function (x) {
    console.error(x);
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
  if (def) choose = def.pitch;
  BeatName.forEach(function (n) {
    sel.add(new Option(n[1], n[0], false, n[0] == choose))
  });
  return sel;
}

function addNoteInterface(before) {
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
  
  var selClip = createClipSelect();
  lbl.appendChild(selClip);
  
  var selSegment = document.createElement("select");
  selSegment.id = "selSegment_" + genId;
  selSegment.add(new Option("segment name", ""));
  lbl.appendChild(new Text(" "));
  lbl.appendChild(selSegment);
  
  var selPitch = createPitchSelect();
  lbl.appendChild(new Text(" pitch: "));
  lbl.appendChild(selPitch);
  
  var selBeat = createBeatSelect();
  lbl.appendChild(new Text(" beat: "));
  lbl.appendChild(selBeat);
  
  var btnDel = document.createElement("button");
  btnDel.className = "red";
  btnDel.textContent = "Delete";
  btnDel.onclick = function () {
    confirmBox("Really want to delete this note?", function (result) {
      if (result) {
        note.remove();
      }
    });
  };
  lbl.appendChild(btnDel);
  
  note.appendChild(lbl);
  if (!before) before = divNotes.lastElementChild;
  divNotes.insertBefore(note, before);
  console.log("added " + name);
}
