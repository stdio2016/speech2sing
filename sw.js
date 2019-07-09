importScripts('js/storage.js');
var myPath = location.origin + location.pathname;
myPath = myPath.match(/(.*\/)/)[1];
const IdbFolder = "idbSound/";
const CacheFolder = 'cacheControl/';
const AppName = 'speech2sing';
const Version = 'v1.0.1';
const CacheName = AppName + '-' + Version;
const AppFiles = [
  '.',
  'index.html',
  'record.html',
  'changepitch.html',
  'pitch.html',
  'segment.html',
  'makesong.html',
  'demo.html',
  'lib/alertbox.js',
  'lib/fft.js',
  'lib/IndexedDB-getAll-shim.js',
  'lib/audio-recorder-polyfill/index.js',
  'lib/audio-recorder-polyfill/wave-encoder.js',
  'js/forSafari.js',
  'js/makesong.js',
  'js/pitch_ui.js',
  'js/pitch.js',
  'js/pitchworker.js',
  'js/record.js',
  'js/segment.js',
  'js/storage.js',
  'css/alertbox.css',
  'css/style.css'
];

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  console.log(url, new Date());
  if (url.startsWith(myPath + IdbFolder)) {
    event.respondWith(SoundDBUrl(url.substring(myPath.length + IdbFolder.length)));
    return ;
  }
  else if (url.startsWith(myPath + CacheFolder)) {
    event.respondWith(CacheControlUrl(url.substring(myPath.length + CacheFolder.length)));
    return ;
  }
  event.respondWith(TryReadFromCache(event.request));
});
  
function SoundDBUrl(name) {
  name = decodeURIComponent(name);
  var good = 0;
  return (
    getSoundDB().then(function (db) {
      good = 1;
      return getSound(name);
    }).then(function (sound) {
      good = 2;
      var ret = new Response(sound.file);
      ret.headers.set('Content-Type', sound.file.type);
      ret.headers.set('Content-Length', sound.file.size);
      return ret;
    }).catch(function (x) {
      if (good == 0)
        return new Response('indexeddb not usable', {status: 500});
      if (good == 1)
        return new Response('file not found', {status: 404});
    })
  );
}

function CacheControlUrl(url) {
  if (url === 'update') {
    return addFiles().then(function () {
      return new Response('ok');
    })['catch'](function (x) {
      return new Response(x);
    })
  }
  if (url === 'drop') {
    return caches['delete'](CacheName).then(function () {
      return new Response('ok');
    });
  }
  return new Response('file not found', {status: 404});
}

function TryReadFromCache(req) {
  return caches.open(CacheName).then(function (c) {
    return c.match(req);
  }).then(function (response) {
    if (response) return response;
    return fetch(req);
  })['catch'](function () {
    return new Response('file not found', {status: 404});
  });
}

addEventListener('install', function (event) {
  skipWaiting();
  console.log("update or install files");
  event.waitUntil(addFiles());
});

addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
  caches.keys().then(function (keys) {
    keys.forEach(function (name) {
      if (name.startsWith(AppName) && name !== CacheName) {
        caches['delete'](name);
      }
    });
  });
});

function addFiles() {
  return caches.open(CacheName).then(function (c) {
    return c.addAll(AppFiles);
  });
}
