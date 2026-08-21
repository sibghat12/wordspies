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
    const kind  = (n && n.kind)  || 'ts';
    // WhatsApp-style icon layering:
    //   badge = small silhouette in the status-bar strip (always the
    //           TalkSibi mark — the tiny icon at the top of the screen).
    //   icon  = the large icon on the notification card. For DMs this
    //           is the SENDER's photo so you see WHO messaged you at a
    //           glance; for everything else it's the TalkSibi mark.
    // Owner ask 21 Aug 2026: 'show the user picture as well who send
    // you a message like WhatsApp notification'.
    const icon  = (n && n.photo) ? n.photo : '/icon-192.png';
    const badge = '/icon-192.png';
    // Inline actions on message pushes — WhatsApp pattern. Rest of the
    // events (follow, reference, party) get single-tap notifications.
    const actions = kind === 'msg'
      ? [{ action: 'open', title: 'Open' }, { action: 'dismiss', title: 'Dismiss' }]
      : undefined;
    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: kind,                          // a second message replaces the first rather than stacking
      renotify: true,
      data: { url },
      vibrate: kind === 'party-hand' || kind === 'party-mic' ? [100, 40, 100] : [80],
      actions
    });
  })());
});

// Tapping the notification lands on the right screen and reuses an
// already-open TalkSibi window where possible. Prefers a standalone
// (TWA/PWA) client over any browser tab — when the app is installed,
// the notification should ALWAYS open the app, not a Chrome tab.
// Owner ask 21 Aug 2026: 'if someone has app installed it never goes
// to the web'.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  // Dismiss action just closes the notification — no window open.
  if (e.action === 'dismiss') return;
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // First pass: prefer clients that are top-level TalkSibi windows
    // (the TWA + installed PWA both report frameType === 'top-level').
    // A browser tab that navigated here reports the same, so this
    // primarily filters out iframes.
    let target = null;
    for (const c of all) {
      if (!c.url) continue;
      // Talksibi origin only — never accidentally focus a wordspies.co.uk
      // tab or an about:blank leftover.
      if (!c.url.includes(location.host)) continue;
      // Prefer clients already on an /app or /party path — they're the
      // TalkSibi surfaces the notification is trying to reach.
      if (/\/(app|party|call)(\b|\?|#|\/)/.test(c.url)) { target = c; break; }
      target = target || c;   // fallback: any TalkSibi client
    }
    if (target) {
      try { await target.focus(); } catch (e) {}
      if ('navigate' in target) { try { await target.navigate(url); } catch (e) {} }
      return;
    }
    // No client open — openWindow lets Android/Chrome decide. If the
    // TWA is installed and assetlinks.json verifies talksibi.com, this
    // opens directly in the app. Otherwise it opens Chrome.
    await self.clients.openWindow(url);
  })());
});
