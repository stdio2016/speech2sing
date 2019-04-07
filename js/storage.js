var db = null;
var inMem_db = {};
var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);

function getSoundDB() {
  if (db) return Promise.resolve(db);
  return new Promise(function (resolve, reject) {
    try {
    var dbreq = indexedDB.open("speech2sing_records", 4);
    dbreq.onupgradeneeded = function (event) {
      db = dbreq.result;
      var tran = dbreq.transaction;
      if (event.oldVersion < 1) {
        var store = db.createObjectStore("sounds", {keyPath: "name"});
      }
      if (event.oldVersion < 2) addDateField(tran);
      else if (event.oldVersion < 3) speech2singDBV3(db, tran);
      else if (event.oldVersion < 4) speech2singDBV4(db, tran);
    };
    dbreq.onsuccess = function (event) {
      db = dbreq.result;
      resolve(db);
    };
    dbreq.onerror = function (event) {
      reject(event);
    };
    } catch (w) {
      reject(w);
    }
  });
}

addEventListener('load', function () {
  if (!window.errorbox) {
    errorbox = function (){};
  }
  getSoundDB().catch(function () {
    alert("unable to get Indexed DB -- maybe you are in private browsing mode");
  }).then(startup).catch(errorbox);
});

function addDateField(transaction) {
  var req = transaction.objectStore("sounds").openCursor();
  req.onsuccess = function (e) {
    var cur = req.result;
    if (cur) {
      var data = cur.value;
      var regex = /(\d{4})[-/](0?[1-9]|1[0-2])[-/]([0-2]?\d|30|31) ([01]?\d|2[0-3])[-:]([0-5]\d)(?:[-:]([0-5]\d))?/;
      var d = data.name.match(regex);
      if (d) {
        console.log(d);
        if (!d[6]) d[6] = 0;
        data.date = new Date(+d[1], d[2]-1, +d[3], +d[4], +d[5], +d[6]);
        console.log(data.date);
        cur.update(data);
      }
      cur["continue"]();
    }
    else speech2singDBV3(db, transaction);
  };
}

function speech2singDBV3(db, transaction) {
  var names = db.createObjectStore("soundNames", {keyPath: "name"});
  var req = transaction.objectStore("sounds").openCursor();
  req.onsuccess = function (e) {
    var cur = req.result;
    if (cur) {
      var data = cur.value;
      names.add({name: data.name, date: data.date});
      cur["continue"]();
    }
    else speech2singDBV4(db, transaction);
  };
}

function speech2singDBV4() {
  db.createObjectStore("tracks", {keyPath: "name"});
  db.createObjectStore("trackNames", {keyPath: "name"});
}

function saveSound(name, file, now) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      inMem_db[name] = file;
      resolve(null);
    });
  }
  if (isIOS) {
    // need to convert Blob to ArrayBuffer
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      var mime = file.type;
      fr.onload = function () {
        var t = db.transaction(["sounds", "soundNames"], "readwrite");
        var s = t.objectStore("sounds");
        var fakeblob = {isBlob: true, buffer: fr.result, type: mime};
        s.put({name: name, file: fakeblob});
        var s2 = t.objectStore("soundNames");
        s2.put({name: name, date: now});
        t.oncomplete = resolve;
        t.onerror = reject;
      };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  }
  var t = db.transaction(["sounds", "soundNames"], "readwrite");
  var s = t.objectStore("sounds");
  s.put({name: name, file: file});
  var s2 = t.objectStore("soundNames");
  s2.put({name: name, date: now});
  return new Promise(function (resolve, reject) {
    t.oncomplete = resolve;
    t.onerror = reject;
  });
}

function getSound(name) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      if (name in inMem_db) {
        resolve({name: name, file: inMem_db[name]});
      }
      else reject(null);
    });
  }
  var t = db.transaction("sounds", "readonly");
  var s = t.objectStore("sounds");
  var req = s['get'](name);
  var err = new Error('File "' + name + '" Not Found');
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () {
      var result = req.result;
      if (result && result.file) {
        var file = result.file;
        if (!(file instanceof Blob)) {
          result.file = new Blob([file.buffer], {type: file.type});
        }
        resolve(result);
      }
      else {
        reject({target:{error:err}});
      }
    };
    req.onerror = reject;
  });
}

function saveSoundAttribute(name, file, attr) {
  var obj = Object.assign({name: name, file: file}, attr);
  if (!db) {
    return new Promise(function (resolve, reject) {
      resolve(null);
    });
  }
  if (isIOS) {
    // need to convert Blob to ArrayBuffer
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      var mime = file.type;
      fr.onload = function () {
        var t = db.transaction("sounds", "readwrite");
        var s = t.objectStore("sounds");
        var fakeblob = {isBlob: true, buffer: fr.result, type: mime};
        obj.file = fakeblob;
        s.put(obj);
        t.oncomplete = resolve;
        t.onerror = reject;
      };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  }
  var t = db.transaction("sounds", "readwrite");
  var s = t.objectStore("sounds");
  s.put(obj);
  return new Promise(function (resolve, reject) {
    t.oncomplete = resolve;
    t.onerror = reject;
  });
}

function deleteSoundInternal(name, table, nameTable) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      if (name in inMem_db) {
        delete inMem_db[name];
      }
      resolve({target: {result: name}});
    });
  }
  var t = db.transaction([table, nameTable], "readwrite");
  var s = t.objectStore(table);
  s['delete'](name);
  var s2 = t.objectStore(nameTable);
  s2['delete'](name);
  return new Promise(function (resolve, reject) {
    t.oncomplete = resolve;
    t.onerror = reject;
  });
}

function deleteSound(name) {
  return deleteSoundInternal(name, "sounds", "soundNames");
}

function getSoundNamesInternal(table) {
  if (!db) {
    return Promise.resolve(Object.keys(inMem_db));
  }
  var t = db.transaction(table, "readonly");
  var s = t.objectStore(table);
  var req = s.getAll();
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () {
      if (req.result) {
        resolve(req.result);
      }
      else {
        reject({type:'Unreachable'});
      }
    };
    req.onerror = reject;
  }); 
}

function getSoundNames() {
  return getSoundNamesInternal("soundNames");
}

function renameSound(oldName, newName) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      inMem_db[newName] = inMem_db[oldName];
      delete inMem_db[oldName];
      resolve(null);
    });
  }
  var t = db.transaction(["sounds", "soundNames"], "readwrite");
  var s = t.objectStore("sounds");
  var s2 = t.objectStore("soundNames");
  return new Promise(function (resolve, reject) {
    var p1 = new Promise(function (yes, no) {
      var req = s.get(oldName);
      req.onsuccess = yes;
    });
    var p2 = new Promise(function (yes, no) {
      var req = s2.get(oldName);
      req.onsuccess = yes;
    });
    Promise.all([p1, p2]).then(function (all) {
      s['delete'](oldName);
      s2['delete'](oldName);
      var dat = all[0].target.result;
      dat.name = newName;
      var index = all[1].target.result;
      index.name = newName;
      s.put(dat);
      s2.put(index);
    }).catch(reject);
    t.oncomplete = resolve;
    t.onerror = reject;
  });
}

function getTrackNames() {
  return getSoundNamesInternal("trackNames");
}

function saveTrack(name, file, now) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      inMem_db[name] = file;
      resolve(null);
    });
  }
  var t = db.transaction(["tracks", "trackNames"], "readwrite");
  var s = t.objectStore("tracks");
  s.put({name: name, file: file});
  var s2 = t.objectStore("trackNames");
  s2.put({name: name, date: now});
  return new Promise(function (resolve, reject) {
    t.oncomplete = resolve;
    t.onerror = reject;
  });
}

function getTrack(name) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      if (name in inMem_db) {
        resolve(inMem_db[name]);
      }
      else reject(null);
    });
  }
  var t = db.transaction("tracks", "readonly");
  var s = t.objectStore("tracks");
  var req = s['get'](name);
  var err = new Error('Track "' + name + '" Not Found');
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () {
      var result = req.result;
      if (result && result.file) {
        resolve(result);
      }
      else {
        reject({target:{error:err}});
      }
    };
    req.onerror = reject;
  });
}

function deleteTrack(name) {
  return deleteSoundInternal(name, "tracks", "trackNames");
}
