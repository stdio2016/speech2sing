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

function MidiToHz(midi) {
  return 440 * Math.pow(2, (midi-69)/12);
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
    //confirmBox("Really want to delete this note?", function (result) {
      //if (result) {
        note.remove();
        if (selClip.value.startsWith("c_"))
          unloadFileFromCache(selClip.value.substr(2));
      //}
    //});
  };
  lbl.appendChild(btnDel);
  
  note.appendChild(lbl);
  if (!before) before = divNotes.lastElementChild;
  divNotes.insertBefore(note, before);
}

function toMonoBuffer(buf) {
  if (buf.numberOfChannels == 1) return buf;
  var monobuf = audioCtx.createBuffer(1, buf.length, buf.sampleRate);
  var dat = monobuf.getChannelData(0);
  var n = buf.numberOfChannels;
  for (var i = 0; i < n; i++) {
    var ch = buf.getChannelData(i);
    for (var j = 0; j < ch.length; j++) {
      dat[j] += ch[j];
    }
  }
  for (var j = 0; j < dat.length; j++) {
    dat[j] = dat[j] / n;
  }
  return monobuf;
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
            v.result.buffer = toMonoBuffer(buf);
            console.log("loaded", name);
            v.waiting.forEach(function (e) { e.yes(result); });
            v.waiting = [];
          }, fail);
        };
        fr.onerror = fail;
        fr.readAsArrayBuffer(result.file);
        result.file = null;
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

function getDefaultName() {
  var now = new Date();
  var y = now.getFullYear();
  var M = ("0"+(now.getMonth()+1)).slice(-2);
  var d = ("0"+now.getDate()).slice(-2);
  var h = ("0"+now.getHours()).slice(-2);
  var m = ("0"+now.getMinutes()).slice(-2);
  var s = ("0"+now.getSeconds()).slice(-2);
  return 'Song '+y+'-'+M+'-'+d+' '+h+'-'+m+'-'+s;
}

function saveSong() {
  var name = selSong.value;
  var date = new Date();
  if (name === "new") {
    name = getDefaultName();
  }
  else if (name.startsWith("c_")) {
    name = name.substr(2);
  }
  promptBox("Enter name of this song", name, function (name) {
    if (!name) return ;
    saveTrack(name, trackToJSON(), date);
    for (var i = 0; i < selSong.length; i++) {
      if (selSong[i].value === "c_"+name) break;
    }
    if (i >= selSong.length) {
      selSong.add(new Option(name, "c_"+name, false, true));
    }
  });
}

function deleteSong() {
  if (selSong.value.startsWith("c_")) {
    confirmBox("Do you really want to delete this song?", function (yesno) {
      if (yesno) {
        deleteTrack(selSong.value.substr(2));
        selSong.selectedOptions[0].remove();
        // select the first built-in song
        selSong[0].selected = true;
        loadSong();
      }
    });
  }
  else {
    alertBox("You cannot delete a built-in song");
  }
}

function processTieAndRest() {
  var song = trackToJSON();
  var bpm = song.bpm;
  var lastNote = null;
  var seq = [];
  var pos = 0;
  for (var i = 0; i < song.notes.length; i++) {
    var note = song.notes[i];
    var duration = 60 / bpm * note.beat;
    if (note.type === "note") {
      var segs = cachedFiles.get(note.clip).result.segments;
      for (var j = 0; j < segs.length; j++) {
        if (segs[j].name === note.segment) break;
      }
      lastNote = {
        clip: note.clip,
        start: segs[j].start,
        vowelStart: segs[j].vowelStart || segs[j].start,
        vowelEnd: segs[j].vowelEnd || segs[j].end,
        end: segs[j].end,
        pitch: [note.pitch],
        pos: [duration],
        time: pos,
        duration: duration
      };
      seq.push(lastNote);
    }
    else if (note.type === "tied") {
      if (lastNote) {
        lastNote.pitch.push(note.pitch);
        lastNote.pos.push(lastNote.duration + duration);
        lastNote.duration += duration;
      }
    }
    else {
      lastNote = null;
    }
    pos += duration;
  }
  return seq;
}

function getSourceFrames(pitches, smpRate, start, end) {
  var frames = [];
  var i = 0;
  var pos = start;
  while (pos < end) {
    for (i = i; i < pitches.length; i++) {
      if (pitches[i][0] > pos) break;
    }
    var pitch = i > 0 ? pitches[i-1][1] : 0;
    var delta = pitch > 0 ? 1/pitch : Math.random() * 0.004 + 0.008;
    frames.push({pitch: pitch, start: pos, end: pos+delta});
    pos += delta;
  }
  return frames;
}

function getPitchAtTime(pitches, times, t) {
  var i;
  for (i = 0; i < times.length; i++) {
    if (times[i] > t) break;
  }
  if (i === times.length) return pitches[times.length-1];
  var border = Math.min(0.05, (times[i] - (i>0 ? times[i-1] : 0)) / 3);
  var r;
  if (i > 0 && t - times[i-1] < border) {
    r = (t - times[i-1]) / border * 0.5 + 0.5;
    return (1-r) * pitches[i-1] + r * pitches[i];
  }
  else if (i < times.length-1 && times[i] - t < border) {
    r = 0.5 - (times[i] - t) / border * 0.5;
    return (1-r) * pitches[i] + r * pitches[i+1];
  }
  return pitches[i];
}

function dstTimeToSrcTime(t, note) {
  var srcDu = note.end - note.start;
  var vowel = note.vowelEnd - note.vowelStart;
  var consonant = srcDu - vowel;
  if (note.duration < consonant * 2) {
    // consonant too long
    return note.start + t / note.duration * srcDu;
  }
  if (note.start + t < note.vowelStart) {
    // begin consonant
    return note.start + t;
  }
  if (note.duration - t < note.end - note.vowelEnd) {
    // end consonant
    return t - note.duration + note.end;
  }
  t = t - (note.vowelStart - note.start);
  var denom = note.duration - consonant;
  return note.vowelStart + t / denom * vowel;
}

function synthSyllabus(note) {
  var clip = cachedFiles.get(note.clip).result;
  var smpRate = clip.buffer.sampleRate;
  var du = Math.floor(note.duration * smpRate);
  var aud = audioCtx.createBuffer(1, du, smpRate);
  var src = clip.buffer.getChannelData(0);
  var dst = aud.getChannelData(0);
  var frames = getSourceFrames(clip.pitch, smpRate, note.start, note.end);
  var srcPos = 0;
  
  var dstT = 0;
  while (dstT < note.duration) {
    var pitch = getPitchAtTime(note.pitch, note.pos, dstT);
    var delta = 1/MidiToHz(pitch);
    var pos = Math.floor(dstT * smpRate);
    var srcT = dstTimeToSrcTime(dstT, note);
    while (srcPos < frames.length-2 && frames[srcPos].end < srcT) {
      srcPos++;
    }
    // copy!
    if (frames[srcPos].start < srcT) {
      var start = Math.floor(frames[srcPos].start * smpRate);
      var end = Math.floor(frames[srcPos+1].end * smpRate);
      for (var i = 0; i < end - start; i++) {
        if (pos+i > du || start+i > src.length) break;
        var w = i / (end - start);
        w = 0.5 - Math.cos(w * Math.PI * 2) * 0.5;
        dst[pos+i] += src[start+i] * w;
      }
    }
    if (frames[srcPos].pitch === 0)
      dstT += Math.random() * 0.004 + 0.008;
    else
      dstT += delta;
  }
  return aud;
}

function MyGoodSynth() {
  var notes = processTieAndRest();
  var bufs = notes.map(synthSyllabus);
  var t = audioCtx.currentTime;
  for (var i = 0; i < bufs.length; i++) {
    var snd = audioCtx.createBufferSource();
    snd.buffer = bufs[i];
    snd.connect(audioCtx.destination);
    snd.start(t + notes[i].time);
  }
}
