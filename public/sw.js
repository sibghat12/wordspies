// WordSpies service worker.
//
// This exists so browsers treat WordSpies as an installable app — Chrome and
// Android refuse to offer "Install" without one. It is deliberately NOT a
// caching layer for the game itself: caching index.html would pin players to an
// old client while the server moved on, which is a far worse bug than being
// offline for a moment. So it caches the three static files that never change
// meaningfully, and gets out of the way of everything else.

const CACHE = 'wordspies-static-v1';
const STATIC = ['/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();                       // a new worker takes over immediately
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Anything that isn't one of our frozen static files — the page, the API,
  // socket.io, fonts, ads — goes straight to the network, untouched.
  if (url.origin !== location.origin || !STATIC.includes(url.pathname)) return;

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
