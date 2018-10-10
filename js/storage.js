var db = null;
var inMem_db = {};
var isIOS = /iP[ao]d|iPhone/.test(navigator.userAgent);

window.addEventListener('load', function () {
  try {
    var dbreq = indexedDB.open("speech2sing_records");
    dbreq.onupgradeneeded = function (event) {
      db = dbreq.result;
      if (event.oldVersion < 1) {
        var store = db.createObjectStore("sounds", {keyPath: "name"});
      }
    };
    dbreq.onsuccess = function (event) {
      db = dbreq.result;
      console.log(db);
      startup();
    };
    dbreq.onerror = function (event) {
      alert("unable to load sounds, maybe you are in private browsing mode");
      startup();
    };
  }
  catch (w) {
    alert(w);
  }
});

function saveSound(name, file) {
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
        var t = db.transaction("sounds", "readwrite");
        var s = t.objectStore("sounds");
        var fakeblob = {isBlob: true, buffer: fr.result, type: mime};
        var req = s.put({name: name, file: fakeblob});
        req.onsuccess = resolve;
        req.onerror = reject;
      };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  }
  var t = db.transaction("sounds", "readwrite");
  var s = t.objectStore("sounds");
  var req = s.put({name: name, file: file});
  return new Promise(function (resolve, reject) {
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

function getSound(name, file) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      if (name in inMem_db) {
        resolve(inMem_db[name]);
      }
      else reject(null);
    });
  }
  var t = db.transaction("sounds", "readonly");
  var s = t.objectStore("sounds");
  var req = s['get'](name);
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () {
      if (req.result && req.result.file) {
        var file = req.result.file;
        if (!(file instanceof Blob)) {
          resolve(new Blob([file.buffer], {type: file.type}));
        }
        resolve(req.result.file);
      }
      else {
        reject({type: 'NotFound'});
      }
    };
    req.onerror = reject;
  });
}

function deleteSound(name) {
  if (!db) {
    return new Promise(function (resolve, reject) {
      if (name in inMem_db) {
        delete inMem_db[name];
      }
      else reject({type:'NotFound'});
    });
  }
  var t = db.transaction("sounds", "readwrite");
  var s = t.objectStore("sounds");
  var req = s['delete'](name);
  return new Promise(function (resolve, reject) {
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

function getSoundNames() {
  if (!db) {
    return new Promise(function (resolve, reject) {
      resolve(Object.keys(inMem_db));
    });
  }
  var t = db.transaction("sounds", "readonly");
  var s = t.objectStore("sounds");
  var req = s.getAllKeys();
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
