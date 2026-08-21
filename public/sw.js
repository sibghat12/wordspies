// TalkSibi service worker.
//
// Two jobs: (1) make Chrome/Android treat the site as installable so the
// PWA + TWA install flows work, and (2) show a friendly offline page
// instead of Chrome's dinosaur when the network dies mid-navigation.
//
// The site itself is NOT cached — that would pin players to a stale
// client while the server moves on. Only frozen static assets + the
// offline fallback are cached. Everything else goes straight to network.

// Cache-name change forces every installed SW to invalidate its old
// cache on activate. Bump this on any static-asset change.
const CACHE = 'talksibi-static-v9';
const STATIC = [
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  '/offline.html'
];

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

  // Navigation requests (the user hitting a URL): network-first, and if
  // the network fails, fall back to the cached offline page instead of
  // Chrome's dinosaur. This is what makes the TWA feel like a real app
  // when the phone loses signal mid-tap.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/offline.html').then(r => r || new Response(
        '<h1>Offline</h1><p>TalkSibi needs an internet connection.</p>',
        { headers: { 'Content-Type': 'text/html' } }
      )))
    );
    return;
  }

  // Cross-origin, API, socket, fonts, ads — untouched network.
  if (url.origin !== location.origin || !STATIC.includes(url.pathname)) return;

  // Static assets we own: cache-first, refresh in background.
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

// ---------- 📣 push ----------
// The server sends an empty knock rather than an encrypted payload, so
// we ask it what the knock was about. If that fails — offline by the
// time it arrives, or the session has gone — we still show something,
// because the browser revokes push permission from workers that take a
// push and stay silent.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let n = null;
    try {
      const r = await fetch('/api/social/push/peek', { credentials: 'include', cache: 'no-store' });
      if (r.ok) n = (await r.json()).n;
    } catch (err) {}
    const title = (n && n.title) || 'TalkSibi';
    const body  = (n && n.body)  || 'You have something new to check.';
    const url   = (n && n.url)   || '/app';
    await self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: (n && n.kind) || 'ts',        // a second message replaces the first rather than stacking
      renotify: true,
      data: { url }
    });
  })());
});

// Tapping the notification lands on the right screen and reuses an
// already-open tab where possible.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes('/app')) { await c.focus(); if ('navigate' in c) await c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
