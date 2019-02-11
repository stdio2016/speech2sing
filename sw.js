importScripts('js/storage.js');
var myPath = location.origin + location.pathname;
myPath = myPath.match(/(.*\/)/)[1];
const IdbFolder = "idbSound/";

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  console.log(url, new Date());
  if (!url.startsWith(myPath)) {
    event.respondWith(fetch(event.request));
    return ;
  }
  url = url.substring(myPath.length);
  if (!url.startsWith(IdbFolder)) {
    event.respondWith(fetch(event.request));
    return ;
  }
  var name = decodeURIComponent(url.substring(IdbFolder.length));
  var good = 0;
  event.respondWith(
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
});

addEventListener('install', function () {
  skipWaiting();
});

addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});
