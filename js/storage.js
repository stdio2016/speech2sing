var db = null;
(function (self) {
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
  }
  catch (w) {
    alert(w);
  }
})(window);

function saveSound(name, file) {
  var t = db.transaction("sounds", "readwrite");
  var s = t.objectStore("sounds");
  var req = s.put({name: name, file: file});
  return new Promise(function (resolve, reject) {
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

function getSound(name, file) {
  var t = db.transaction("sounds", "readonly");
  var s = t.objectStore("sounds");
  var req = s['get'](name);
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () {
      resolve(req.result.file);
    };
    req.onerror = reject;
  });
}

function deleteSound(name) {
  var t = db.transaction("sounds", "readwrite");
  var s = t.objectStore("sounds");
  var req = s['delete'](name);
  return new Promise(function (resolve, reject) {
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}
