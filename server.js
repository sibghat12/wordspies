// TalkSibi — a Codenames-style online party game.
// Node.js + Express + Socket.IO. All game state lives in memory (no database).

const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { Server } = require('socket.io');
const { PACKS, CATALOG } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(compression());
// Canonical domain: talksibi.com. Node 301s the tiny set of legacy
// hosts Caddy can't cover (onrender preview + bare www). Everything
// else — bare talksibi.com, wordspies.co.uk, talkfellow.com — is
// handled at the Caddy edge. CRITICAL: talksibi.com must NOT be in
// this list or Node redirects it to itself (loop that broke the
// site at 12:45 UTC on 16 Aug 2026 — root cause was a wide sed
// replace turning 'wordspies.co.uk' into 'talksibi.com' HERE).
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  const legacy = host === 'wordspies.onrender.com'
              || host === 'www.talksibi.com';
  if (legacy && req.path !== '/healthz' && !req.path.startsWith('/socket.io')) {
    return res.redirect(301, 'https://talksibi.com' + req.originalUrl);
  }
  next();
});
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  // Explicitly allow mic + camera + display-capture on our own origin so
  // the TWA (Trusted Web Activity) gets Android's system-level mic prompt
  // when a user joins a party or records a voice note. Without this
  // header, some Chromium builds silently downgrade capability inside a
  // TWA. Nothing else is granted — geolocation, USB, MIDI, etc. stay
  // off. Owner ask 20 Aug 2026 (Android launch prep).
  res.set('Permissions-Policy', 'microphone=(self), camera=(self), display-capture=(self), geolocation=()');
  next();
});
const landing = require('./landing');
// Root routing — landing at / (16 Aug 2026 owner ask: 'we need to
// make the landing page as the root and the other goes from the
// landing page').
//
//   /            → landing.page()   (marketing, was at /home)
//   /app         → the app          (was at /)
//   /home        → /app (301)       (legacy — anyone linking /home still lands)
//   /?room=XYZ   → /codenames?room=XYZ (untouched — every share link ever
//                                       lived at this shape)
//
// Node handles all the redirects so old bookmarks and PWAs land somewhere
// sensible instead of 404ing. Deep links to /social + game codes still work
// because they aren't rooted at /.
app.get('/', (req, res) => {
  if (req.query.room) return res.redirect('/codenames?room=' + encodeURIComponent(String(req.query.room).slice(0, 8)));
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(landing.page());
});
// ── /app slug routes with per-tab metadata ────────────────────────────
// Owner ask 17 Aug 2026: "give them slugs so we can use more meta data".
// Each tab now has its own URL — bookmarkable, shareable, indexable —
// while still serving the same social.html SPA. The server just
// swaps <title> + description + og tags + adds data-initial-tab on
// <body> so the client opens the right tab on load. Cache the file
// contents at boot so this stays fast; a graceful fallback re-reads
// per request if the boot read failed.
const fs = require('fs');
let _appShell = '';
try { _appShell = fs.readFileSync(path.join(__dirname, 'public', 'social.html'), 'utf8'); }
catch (e) { console.error('[app] could not preload social.html:', e.message); }
const APP_TAB_META = {
  community: { tab:'wall',    title:'Community · TalkSibi',                 desc:'Meet native speakers, follow language partners, and start a conversation — free and browser-based.' },
  chats:     { tab:'chats',   title:'Chats · TalkSibi',                     desc:'Your language-exchange conversations with AI experts and real people, with one-tap translation.' },
  games:     { tab:'games',   title:'Language games · TalkSibi',            desc:'Play Codenames, Word Race, Word Chain, Guess the Word, Mind Meld and Who is the Spy? — free, in the browser, with friends.' },
  parties:   { tab:'parties', title:'Live voice parties · TalkSibi',        desc:'Drop into a live language-exchange voice room. Listen, raise your hand, take the mic — anytime, free.' },
  learn:     { tab:'learn',   title:'Build your language plan · TalkSibi',  desc:'AI-generated learning plans tuned to your language, level, focus and daily time. Free, powered by Claude.' },
  me:        { tab:'me',      title:'My profile · TalkSibi',                desc:'Your TalkSibi profile — streak, references, plans and settings.' },
};
function renderApp(slug) {
  if (!_appShell) {
    try { _appShell = fs.readFileSync(path.join(__dirname, 'public', 'social.html'), 'utf8'); }
    catch (e) { return null; }
  }
  const m = APP_TAB_META[slug];
  if (!m) return _appShell;
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ogBlock =
    `<meta property="og:title" content="${esc(m.title)}">\n` +
    `<meta property="og:description" content="${esc(m.desc)}">\n` +
    `<meta property="og:type" content="website">\n` +
    `<meta property="og:url" content="https://talksibi.com/app/${slug}">\n` +
    `<meta name="twitter:card" content="summary_large_image">\n` +
    `<meta name="twitter:title" content="${esc(m.title)}">\n` +
    `<meta name="twitter:description" content="${esc(m.desc)}">\n` +
    `<link rel="canonical" href="https://talksibi.com/app/${slug}">`;
  return _appShell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(m.desc)}">\n${ogBlock}`)
    .replace(/<body([^>]*)>/, `<body$1 data-initial-tab="${m.tab}">`);
}
app.get('/app', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderApp('community') || _appShell);
});
app.get('/app/:slug', (req, res, next) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!APP_TAB_META[slug]) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderApp(slug));
});
app.get('/social', (req, res) => {
  // Legacy — the SPA has always been reachable at /social via internal
  // navigation. Keep serving the same app so nothing breaks; new canonical
  // is /app.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'social.html'));
});
app.get('/home', (req, res) => {
  // Landing used to live here; now it's at /. Redirect old links to root.
  res.redirect(301, '/');
});
// The word game's canonical URL is /codenames — it's what people actually
// search for. /play is kept forever as a 301 because it's baked into every
// invite ever sent, the blog, and the sitemap. The whole query string rides
// along, so ?room=, ?go=1 and ?from=chat: all survive the hop.
app.get('/play', (req, res) => {
  const q = req.url.indexOf('?');
  res.redirect(301, '/codenames' + (q >= 0 ? req.url.slice(q) : ''));
});
app.get('/codenames', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Digital Asset Links — proves talksibi.com owns the Android TWA package
// (app.talksibi.twa). Without this, the TWA falls back to showing a
// Chrome URL bar at the top of the app. Served INLINE from code (not a
// file) because the deploy pipeline drops dotfile directories like
// `public/.well-known/` — so relying on the file 404'd in production.
// The SHA-256 fingerprint is read from TWA_SHA256 env var if set,
// otherwise the placeholder ships (fine for pre-launch — TWA just shows
// a URL bar until the real fingerprint is wired in).
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Type', 'application/json');
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'app.talksibi.twa',
      sha256_cert_fingerprints: [
        // Signing key fingerprint from Bubblewrap init on 21 Aug 2026 —
        // baked into the released TWA (app.talksibi.twa). The env var
        // override stays as an escape hatch if we ever need to rotate.
        process.env.TWA_SHA256 || '06:07:53:EE:76:2A:35:24:CF:03:A1:6F:27:7B:55:0A:EB:24:C3:20:4E:2E:AC:0B:18:77:42:79:80:9F:C3:07'
      ]
    }
  }]);
});

// Legal pages — clean URLs for Play Store submission (Privacy Policy is
// mandatory, Terms + Child Safety expected). Static HTML lives in
// public/; these routes give shorter shareable paths.
app.get('/privacy', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/terms', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});
app.get(['/safety', '/child-safety'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'safety.html'));
});
// Play Store REQUIRES a public account-deletion URL for any app that
// collects user data. In-app deletion exists too (Profile → Settings →
// Delete account) — this page mirrors that flow with an email fallback
// for users who've lost access. Owner ask 20 Aug 2026 (Play Store prep).
app.get('/delete-account', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'delete-account.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    // Owner ask 20 Aug 2026 — "every page I need to refresh so I can
    // see the footer / games". Root cause: express.static was caching
    // ALL .html for 7 days (only index.html was exempt), so game pages
    // held the old chrome / footer / cache-bust version until a hard
    // reload. Every HTML file now gets no-cache so browsers revalidate
    // on each load — the underlying content is still on 7-day cache
    // for images/fonts/etc, but the HTML pointing at cache-busted
    // scripts is always fresh.
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    // Service worker must NEVER be long-cached — Chrome revalidates it
    // on load but only if the cache header allows it.
    if (filePath.endsWith('/sw.js') || filePath.endsWith('\\sw.js')) res.setHeader('Cache-Control', 'no-cache');
    // Manifest same story — if we bump the PWA name/icon/shortcuts we
    // want browsers to see it immediately, not on next-week's revalidate.
    if (filePath.endsWith('manifest.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.get('/healthz', (req, res) => res.send('ok'));

// Which build is this? The value is just the moment the process started —
// every deploy restarts the server, so a change here means "there is a newer
// site than the one you loaded". /a2hs.js polls it and refreshes stale pages,
// which is what stops installed apps living on last week's version.
const BOOT_VERSION = String(Date.now());
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ v: BOOT_VERSION });
});

// Is this invite link still good? Lets the page tell "expired" from "live"
// before it tries to seat anyone. The code is already in the visitor's URL,
// so this leaks nothing — and it deliberately never exposes the watch code.
app.get('/api/room/:code', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.params.code || '').trim().toUpperCase();
  const r = rooms.get(code);
  if (!r) return res.json({ exists: false });
  res.json({
    exists: true,
    state: r.state,
    players: r.players.size,
    started: r.state !== 'lobby'
  });
});

const blog = require('./blog');
app.get('/blog', (req, res) => res.type('html').send(blog.indexPage()));
app.get('/blog/:slug', (req, res) => {
  const page = blog.articlePage(req.params.slug);
  if (!page) return res.redirect('/blog');
  res.type('html').send(page);
});

const pages = require('./pages');
app.get('/about', (req, res) => res.type('html').send(pages.aboutPage()));
app.get('/privacy', (req, res) => res.type('html').send(pages.privacyPage()));
app.get('/terms', (req, res) => res.type('html').send(pages.termsPage()));
app.get('/child-safety', (req, res) => res.type('html').send(pages.childSafetyPage()));
app.get('/become-a-teacher', (req, res) => res.type('html').send(pages.becomeTeacherPage()));

// Per-language SEO landing pages — /learn-spanish, /learn-japanese, etc.
// Owner ask 20 Aug 2026: a dedicated landing page per language with
// heavy keyword targeting + Course/FAQPage JSON-LD. See landing-lang.js
// for the catalogue; add a language there → new route + sitemap entry.
const langLanding = require('./landing-lang');
langLanding.SLUGS.forEach(slug => {
  app.get('/learn-' + slug, (req, res) => res.type('html').send(langLanding.page(slug)));
});

// Teacher applications — public form (no login required). Rate-limited
// per-IP so a bot can't dump the Redis list. Owner ask 13 Aug 2026:
// 'let them a separate page for the teacher form they can submit to
// become a teacher, in footer make a button become a teacher'.
const teacherApplyBucket = new Map();
app.post('/api/teacher/apply', express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    // 5 minutes between applications from the same IP.
    const last = teacherApplyBucket.get(ip) || 0;
    if (now - last < 5 * 60 * 1000) return res.status(429).json({ error: 'Please wait a few minutes before submitting again.' });
    const b = req.body || {};
    const trim = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
    const application = {
      id: require('crypto').randomBytes(6).toString('base64url'),
      t: now,
      ip: ip.slice(0, 45),
      name:      trim(b.name, 60),
      email:     trim(b.email, 100),
      country:   trim(b.country, 40),
      langs:     trim(b.langs, 200),
      years:     trim(b.years, 6),
      quals:     trim(b.quals, 400),
      bio:       trim(b.bio, 1000),
      rate:      trim(b.rate, 40),
      avail:     trim(b.avail, 200),
      portfolio: trim(b.portfolio, 200)
    };
    if (!application.name || !application.email || !application.langs || !application.bio) {
      return res.status(400).json({ error: 'Please fill in name, email, languages, and a short bio.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(application.email)) {
      return res.status(400).json({ error: 'That email doesn\'t look right.' });
    }
    if (redis) {
      try {
        await redis.rpush('soc:teacher-apps', JSON.stringify(application));
        await redis.ltrim('soc:teacher-apps', -500, -1);
      } catch (e) { console.error('teacher-apps redis:', e.message); }
    } else {
      console.log('[teacher] new application (no redis):', JSON.stringify({ ...application, ip: undefined }));
    }
    teacherApplyBucket.set(ip, now);
    res.json({ ok: true });
  } catch (e) { console.error('teacher apply:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
});
app.get('/safety', (req, res) => res.redirect(301, '/child-safety'));
app.get('/how-to-play', (req, res) => res.type('html').send(pages.howToPlayPage()));
// The shared marketing nav used to link `/#how`, which stopped working when
// `/` moved from the landing page to the community app. Anyone who lands on
// the old anchor from a saved link or search result gets sent to the real
// page instead of a silent no-op scroll.
app.get('/how', (req, res) => res.redirect(301, '/how-to-play'));

// Standalone party room page (own URL so links share cleanly). Injects
// window.AGORA_ENABLED=true into the head when the party module reports
// Agora Voice is enabled — client boot picks agora-voice.js instead of
// voice.js in that case. Coder handoff 21 Aug 2026.
let _partyShell = '';
try { _partyShell = fs.readFileSync(path.join(__dirname, 'public', 'party.html'), 'utf8'); }
catch (e) { console.error('[party] could not preload party.html:', e.message); }
app.get('/party', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  try {
    let html = _partyShell;
    if (!html) html = fs.readFileSync(path.join(__dirname, 'public', 'party.html'), 'utf8');
    if (partyMod && typeof partyMod.agoraEnabled === 'function' && partyMod.agoraEnabled()) {
      html = html.replace('</head>', '<script>window.AGORA_ENABLED=true;</script></head>');
    }
    res.type('html').send(html);
  } catch (e) {
    console.error('[party] serve failed:', e.message);
    res.status(500).send('Party page failed to load.');
  }
});
// 1-on-1 voice call — WhatsApp-style minimal UI. Same socket + SFU as
// party, different chrome. Injects window.AGORA_ENABLED=true when the
// party module reports Agora Voice is enabled — call.html then picks
// agora-voice.js instead of voice.js for the same reliability wins
// parties got. Owner ask 21 Aug 2026.
let _callShell = '';
try { _callShell = fs.readFileSync(path.join(__dirname, 'public', 'call.html'), 'utf8'); }
catch (e) { console.error('[call] could not preload call.html:', e.message); }
app.get('/call', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  try {
    let html = _callShell;
    if (!html) html = fs.readFileSync(path.join(__dirname, 'public', 'call.html'), 'utf8');
    if (partyMod && typeof partyMod.agoraEnabled === 'function' && partyMod.agoraEnabled()) {
      html = html.replace('</head>', '<script>window.AGORA_ENABLED=true;</script></head>');
    }
    res.type('html').send(html);
  } catch (e) {
    console.error('[call] serve failed:', e.message);
    res.status(500).send('Call page failed to load.');
  }
});

// Standalone games hub — /games serves the game-picker page. Used as the
// exit destination from every game (Codenames, Word Race, etc.) so the
// user lands somewhere sensible after tapping "Exit game". When called
// with ?embed=1 (from inside the app's game host iframe) the page hides
// its own header so it doesn't stack under the /app topnav. Owner ask
// 21 Aug 2026: '/games not working' — before this route, /games returned
// 404 because express.static only served /games.html.
app.get('/games', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'games.html'));
});

// ── Cloudflare Realtime broker ─────────────────────────────────────────
// Voice runs on Cloudflare's SFU when the two env vars are set; otherwise
// clients fall back to the peer-to-peer STUN path baked into /voice.js.
// Nothing here breaks if the vars are missing — /api/voice/config just
// reports mode:'p2p' and the client stays on the legacy path.
//
// SETUP (owner does this once):
//   1. dash.cloudflare.com → Realtime → SFU → Create App "wordspies-voice"
//   2. Copy the App ID + App Token.
//   3. On the droplet, add to the TalkSibi env file:
//        CF_REALTIME_APP_ID=...
//        CF_REALTIME_APP_TOKEN=...
//      Then: sudo systemctl restart wordspies
//   4. This endpoint will start reporting mode:'cloudflare' automatically.
const CF_APP_ID = process.env.CF_REALTIME_APP_ID || '';
const CF_APP_TOKEN = process.env.CF_REALTIME_APP_TOKEN || '';
const CF_ENABLED = !!(CF_APP_ID && CF_APP_TOKEN);
const CF_BASE = 'https://rtc.live.cloudflare.com/v1/apps';

async function cfFetch(path, opts = {}) {
  if (!CF_ENABLED) throw new Error('Cloudflare Realtime not configured.');
  const url = CF_BASE + '/' + CF_APP_ID + path;
  const r = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      'Authorization': 'Bearer ' + CF_APP_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error('CF ' + r.status + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : {};
}

// Public voice config — tells the client which mode to use. Called once
// per page load so an env-var flip on the droplet is picked up on refresh
// without any client update.
app.get('/api/voice/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    mode: CF_ENABLED ? 'cloudflare' : 'p2p',
    // ICE hints for the peer-to-peer fallback path
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
  });
});

// Create a new participant session on Cloudflare Realtime. Each browser
// tab gets its own session; the game room's socket-io code decides which
// sessions belong to the same conversation.
app.post('/api/voice/cf/session', express.json({ limit: '4kb' }), async (req, res) => {
  if (!CF_ENABLED) return res.status(503).json({ error: 'Voice service not configured.' });
  try {
    const j = await cfFetch('/sessions/new', { method: 'POST' });
    res.json({ sessionId: j.sessionId });
  } catch (e) {
    console.error('cf session:', e.message);
    res.status(502).json({ error: 'Voice service is temporarily unavailable.' });
  }
});

// Proxy an SDP publish or subscribe request through to Cloudflare. The
// client always talks to us, never to Cloudflare directly, so the App
// Token never leaves the server. Body: { sdp, tracks } as documented at
// https://developers.cloudflare.com/realtime/https-api/
app.post('/api/voice/cf/tracks/:sessionId', express.json({ limit: '256kb' }), async (req, res) => {
  if (!CF_ENABLED) return res.status(503).json({ error: 'Voice service not configured.' });
  try {
    const j = await cfFetch('/sessions/' + encodeURIComponent(req.params.sessionId) + '/tracks/new', {
      method: 'POST',
      body: JSON.stringify({
        sessionDescription: req.body.sdp,
        tracks: Array.isArray(req.body.tracks) ? req.body.tracks.slice(0, 8) : []
      })
    });
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Renegotiate an existing session — used when the client answers an SFU
// offer that arrived out of band (e.g. a new remote track becomes available).
app.post('/api/voice/cf/renegotiate/:sessionId', express.json({ limit: '256kb' }), async (req, res) => {
  if (!CF_ENABLED) return res.status(503).json({ error: 'Voice service not configured.' });
  try {
    const j = await cfFetch('/sessions/' + encodeURIComponent(req.params.sessionId) + '/renegotiate', {
      method: 'PUT',
      body: JSON.stringify({ sessionDescription: req.body.sdp })
    });
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Close a track that the local participant published. Called when the mic
// is turned off. The tracks array holds the CF-assigned trackName + mid.
app.post('/api/voice/cf/close/:sessionId', express.json({ limit: '4kb' }), async (req, res) => {
  if (!CF_ENABLED) return res.status(503).json({ error: 'Voice service not configured.' });
  try {
    const j = await cfFetch('/sessions/' + encodeURIComponent(req.params.sessionId) + '/tracks/close', {
      method: 'PUT',
      body: JSON.stringify({
        tracks: Array.isArray(req.body.tracks) ? req.body.tracks.slice(0, 8) : [],
        force: !!req.body.force,
        sessionDescription: req.body.sdp || undefined
      })
    });
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Peek at a session — mostly for debugging when a peer reports "I can't
// hear them". Read-only, harmless to leave on.
app.get('/api/voice/cf/session/:sessionId', async (req, res) => {
  if (!CF_ENABLED) return res.status(503).json({ error: 'Voice service not configured.' });
  try {
    const j = await cfFetch('/sessions/' + encodeURIComponent(req.params.sessionId));
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

console.log('voice: mode=' + (CF_ENABLED ? 'cloudflare (SFU)' : 'p2p (STUN only — fallback)'));

// ── My open games ─────────────────────────────────────────────────────
// Signed-in users get a persistent list of rooms they've created (across
// every game module). Owner explicitly asked for this — "the game should
// stay until I close it, and show as my games". These endpoints back the
// "My open games" strip in the community app.
//
// Identity: we resolve the caller's soc_sess cookie into a uid via the
// social module (same code path as the socket handshake). If they aren't
// logged in, we return an empty list rather than 401 — the strip just
// stays hidden.
async function uidFromCookie(req) {
  try {
    const m = String(req.headers.cookie || '').match(/(?:^|;\s*)soc_sess=([a-f0-9]{48})/);
    if (!m) return null;
    if (social && social.uidBySession) return await social.uidBySession(m[1]);
    return null;
  } catch (e) { return null; }
}

// Enumerate every game module's rooms Map and pluck rooms whose creatorUid
// matches. Kept as a small explicit list so a fresh game module can't
// silently miss the roll-call.
function scanMyRooms(uid) {
  const out = [];
  const push = (game, r, extra) => out.push(Object.assign({
    game, code: r.code, state: r.state,
    createdAt: r.creatorSince || r.createdAt || null,
    lastActivity: r.lastActivity || r.touched || 0,
    players: 0, cap: null, href: null, watchers: 0
  }, extra));

  // Main TalkSibi (server.js's own `rooms` Map)
  for (const r of rooms.values()) {
    if (r.creatorUid !== uid) continue;
    const seated = [...r.players.values()].filter(p => !p.watcher);
    push('wordspies', r, {
      icon: '🕵️', title: 'TalkSibi',
      players: seated.length,
      href: '/codenames?room=' + r.code,
      watchers: [...r.players.values()].filter(p => p.watcher && p.connected).length
    });
  }

  // Mind Meld
  if (meldMod && meldMod.rooms) {
    for (const r of meldMod.rooms.values()) {
      if (r.creatorUid !== uid) continue;
      push('meld', r, {
        icon: '🧠', title: 'Mind Meld',
        players: r.players ? r.players.size : 0,
        href: '/meld?room=' + r.code,
        watchers: r.watchers ? r.watchers.size : 0
      });
    }
  }

  // Who is the Spy?
  if (spyMod && spyMod.rooms) {
    for (const r of spyMod.rooms.values()) {
      if (r.creatorUid !== uid) continue;
      push('spy', r, {
        icon: '🎭', title: 'Who is the Spy?',
        players: r.players ? r.players.size : 0,
        href: '/spy?room=' + r.code,
        watchers: r.watchers ? r.watchers.size : 0
      });
    }
  }

  // Word Chain
  if (wordChainMod && wordChainMod.rooms) {
    for (const r of wordChainMod.rooms.values()) {
      if (r.creatorUid !== uid) continue;
      push('wordchain', r, {
        icon: '🔗', title: 'Word Chain',
        players: r.players ? r.players.size : 0,
        href: '/wordchain?room=' + r.code,
        watchers: r.watchers ? r.watchers.size : 0
      });
    }
  }

  // Guess the Word
  if (guessWordMod && guessWordMod.rooms) {
    for (const r of guessWordMod.rooms.values()) {
      if (r.creatorUid !== uid) continue;
      push('guessword', r, {
        icon: '❓', title: 'Guess the Word',
        players: r.players ? r.players.size : 0,
        href: '/guessword?room=' + r.code,
        watchers: r.watchers ? r.watchers.size : 0
      });
    }
  }

  // Word Race
  if (wordRaceMod && wordRaceMod.rooms) {
    for (const r of wordRaceMod.rooms.values()) {
      if (r.creatorUid !== uid) continue;
      push('wordrace', r, {
        icon: '🏁', title: 'Word Race',
        players: r.players ? r.players.size : 0,
        href: '/wordrace?room=' + r.code,
        watchers: r.watchers ? r.watchers.size : 0
      });
    }
  }

  // Parties are NOT games — owner ask 14 Aug 2026: "a party is just a
  // party, it shouldn't also show as a game card." The party strip
  // (wpStrip) + Parties tab already surface my open party; showing it
  // here again duplicated it as a game. Do not push parties into
  // scanMyRooms.

  // Most-recently-touched first — "my current game" always at the top.
  out.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  return out;
}

app.get('/api/social/my-rooms', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const uid = await uidFromCookie(req);
  if (!uid) return res.json({ rooms: [] });
  res.json({ rooms: scanMyRooms(uid) });
});

// Close one of MY rooms. Verifies session uid matches creatorUid, then
// deletes across whichever module owns the room.
app.post('/api/social/my-rooms/close', express.json({ limit: '2kb' }), async (req, res) => {
  const uid = await uidFromCookie(req);
  if (!uid) return res.status(401).json({ error: 'Please log in.' });
  const game = String((req.body || {}).game || '').toLowerCase();
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!game || !code) return res.status(400).json({ error: 'Nothing to close.' });

  // Look up the room in the right module and verify ownership.
  const closeIn = (table, hook) => {
    const r = table && table.get(code); if (!r || r.creatorUid !== uid) return false;
    if (hook) hook(r);
    table.delete(code);
    return true;
  };
  let ok = false;
  if (game === 'wordspies') ok = closeIn(rooms, r => { try { io.to(r.code).emit('roomClosed', { code: r.code }); } catch (e) {} });
  if (!ok && meldMod && meldMod.rooms && game === 'meld') ok = closeIn(meldMod.rooms, () => { try { io.of('/meld').to(code).emit('roomClosed', { code }); } catch (e) {} });
  if (!ok && spyMod  && spyMod.rooms  && game === 'spy')  ok = closeIn(spyMod.rooms,  () => { try { io.of('/spy' ).to(code).emit('roomClosed', { code }); } catch (e) {} });
  if (!ok && wordChainMod && wordChainMod.rooms && game === 'wordchain') ok = closeIn(wordChainMod.rooms, () => { try { io.of('/wordchain').to(code).emit('roomClosed', { code }); } catch (e) {} });
  if (!ok && guessWordMod && guessWordMod.rooms && game === 'guessword') ok = closeIn(guessWordMod.rooms, () => { try { io.of('/guessword').to(code).emit('roomClosed', { code }); } catch (e) {} });
  if (!ok && wordRaceMod  && wordRaceMod.rooms  && game === 'wordrace')  ok = closeIn(wordRaceMod.rooms,  () => { try { io.of('/wordrace').to(code).emit('roomClosed', { code }); } catch (e) {} });
  // Parties are keyed by hostUid instead of creatorUid, so closeIn's default
  // check doesn't apply — do the ownership test explicitly here.
  if (!ok && partyMod && partyMod.rooms && game === 'party') {
    const r = partyMod.rooms.get(code);
    if (r && r.hostUid === uid) {
      try { io.of('/party').to(code).emit('closed'); } catch (e) {}
      partyMod.rooms.delete(code);
      ok = true;
    }
  }

  if (!ok) return res.status(404).json({ error: 'Room not found or not yours.' });
  res.json({ ok: true });
});

// ── 1-on-1 voice calls ─────────────────────────────────────────────────
// A "call" is a 2-person private party. The caller creates the party via
// this endpoint; the callee is notified by polling /calls/incoming (the
// community app already polls chat every 3 s, so we tack this in).
//
//   POST /api/social/call/ring     { to }        → { code }
//   GET  /api/social/call/incoming                → { call: {...} | null }
//   POST /api/social/call/decline  { code }      → { ok }
//
// A pending call auto-expires after 45 s if the callee doesn't answer.
// pendingCalls stores at most one pending call per callee uid — a new
// ring from a different caller replaces the old (so a busy signal isn't
// needed for MVP; the newer caller wins).
const pendingCalls = new Map();  // calleeUid → { code, fromUid, fromName, fromPhoto, at }

setInterval(() => {
  const now = Date.now();
  for (const [uid, c] of pendingCalls) {
    if (now - (c.at || 0) > 45 * 1000) {
      pendingCalls.delete(uid);
      // Also destroy the call room + log a missed-call entry (guarded).
      if (partyMod && partyMod.rooms && partyMod.rooms.has(c.code)) {
        const r = partyMod.rooms.get(c.code);
        if (!r.ended) {
          r.ended = true;
          try { io.of('/party').to(c.code).emit('closed'); } catch (e) {}
          try {
            if (social && social.postCallLog) social.postCallLog({
              hostUid: c.fromUid, calleeUid: uid,
              startedAt: 0, endedAt: Date.now(), answered: false
            });
          } catch (e) {}
        }
        partyMod.rooms.delete(c.code);
      }
    }
  }
}, 15 * 1000).unref?.();

app.post('/api/social/call/ring', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const uid = await uidFromCookie(req);
    if (!uid) return res.status(401).json({ error: 'Please log in.' });
    const to = String((req.body || {}).to || '');
    if (!to || to === uid) return res.status(400).json({ error: 'Bad callee.' });
    if (!partyMod || !partyMod.rooms) return res.status(503).json({ error: 'Call service unavailable.' });

    // Look up caller's own profile for the ring UI on the callee's side.
    let me = null;
    try { me = social && social.profileByUid ? await social.profileByUid(uid) : null; } catch (e) {}
    // Check callee exists too.
    let target = null;
    try { target = social && social.profileByUid ? await social.profileByUid(to) : null; } catch (e) {}
    if (!target) return res.status(404).json({ error: 'They\'re not on TalkSibi yet.' });

    // Create a 2-person private party for this call. Reuses the whole
    // WebRTC + presence machinery we already tested.
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = ''; do {
      code = ''; for (let i = 0; i < 4; i++) code += A[Math.floor(Math.random() * A.length)];
    } while (partyMod.rooms.has(code));
    partyMod.rooms.set(code, {
      code, title: 'Call with ' + ((me && me.name) || 'you'), subtitle: '',
      visibility: 'private',
      hostUid: uid, hostId: null,
      cap: 2,
      members: new Map(),
      messages: [],
      createdAt: Date.now(), touched: Date.now(),
      // Mark this as a call — the party page can use this later to render
      // a call-style UI instead of the full party layout.
      isCall: true,
      // Whitelist callee so the private-party gate lets them in even if
      // they're not in the caller's circle.
      callWhitelist: new Set([uid, to])
    });

    pendingCalls.set(to, {
      code, fromUid: uid,
      fromName: (me && me.name) || 'Someone',
      fromPhoto: (me && me.photo) || null,
      at: Date.now()
    });

    // Try a push notification too so the callee's phone lights up if the
    // app isn't foreground. Best-effort — no error if push isn't set up.
    try {
      if (social && social.sendPush) {
        social.sendPush(to, 'call', '📞 ' + ((me && me.name) || 'Someone') + ' is calling',
          'Tap to answer', '/social#call=' + code);
      }
    } catch (e) {}

    console.log('[call] ring', code, 'from=' + uid.slice(0, 8), 'to=' + to.slice(0, 8));
    res.json({ code });
  } catch (e) {
    console.error('call ring:', e.message);
    res.status(500).json({ error: 'Ring failed.' });
  }
});

app.get('/api/social/call/incoming', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const uid = await uidFromCookie(req);
  if (!uid) return res.json({ call: null });
  const c = pendingCalls.get(uid);
  if (!c) return res.json({ call: null });
  // Verify the party room still exists — if the caller cancelled or the
  // party auto-swept, the ring is stale.
  if (!partyMod || !partyMod.rooms || !partyMod.rooms.get(c.code)) {
    pendingCalls.delete(uid);
    return res.json({ call: null });
  }
  res.json({ call: {
    code: c.code, fromUid: c.fromUid, fromName: c.fromName, fromPhoto: c.fromPhoto, at: c.at
  }});
});

app.post('/api/social/call/decline', express.json({ limit: '2kb' }), async (req, res) => {
  const uid = await uidFromCookie(req);
  if (!uid) return res.status(401).json({ error: 'Please log in.' });
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const c = pendingCalls.get(uid);
  if (!c || c.code !== code) return res.json({ ok: true });   // idempotent
  pendingCalls.delete(uid);
  // Delete the call room so the caller sees "they declined" (party socket
  // will emit 'closed' to whoever's in it) + post a "Missed call" log
  // entry to their DM chat so it shows up like WhatsApp.
  if (partyMod && partyMod.rooms && partyMod.rooms.has(code)) {
    const r = partyMod.rooms.get(code);
    // Same double-fire guard as party.js: only one log entry per call.
    if (!r.ended) {
      r.ended = true;
      try { io.of('/party').to(code).emit('closed'); } catch (e) {}
      try {
        if (social && social.postCallLog) social.postCallLog({
          hostUid: r.hostUid, calleeUid: uid,
          startedAt: 0, endedAt: Date.now(), answered: false
        });
      } catch (e) {}
    }
    partyMod.rooms.delete(code);
  }
  console.log('[call] decline', code, 'by=' + uid.slice(0, 8));
  res.json({ ok: true });
});

// Callee accepted — server just clears the pending slot; the client
// navigates to the party room to actually join the audio.
app.post('/api/social/call/answer', express.json({ limit: '2kb' }), async (req, res) => {
  const uid = await uidFromCookie(req);
  if (!uid) return res.status(401).json({ error: 'Please log in.' });
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const c = pendingCalls.get(uid);
  if (!c || c.code !== code) return res.json({ ok: true });
  pendingCalls.delete(uid);
  console.log('[call] answer', code, 'by=' + uid.slice(0, 8));
  res.json({ ok: true });
});

process.on('uncaughtException', err => console.error('uncaught:', err));
process.on('unhandledRejection', err => console.error('unhandled:', err));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// In-memory rooms
// ---------------------------------------------------------------------------
const rooms = new Map(); // code -> room

// ---------------------------------------------------------------------------
// Optional persistence (Redis / Render Key Value): rooms survive restarts and
// deploys. Enabled when REDIS_URL is set. After a restart, players walk right
// back into their game — their saved session token rejoins them automatically.
// ---------------------------------------------------------------------------
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    redis.on('error', e => console.error('redis:', e.message));
    console.log('redis persistence: on');
  } catch (e) { console.error('redis init failed:', e.message); redis = null; }
}

// TalkSibi Social (community pages) — fully isolated module; if it ever
// fails to load, the game itself keeps running untouched.
let social = null;
try { social = require('./social').mount(app, redis) || null; } catch (e) { console.error('social module failed to load (game unaffected):', e.message); }

// Per-user "already in a game" guard — owner ask 4 Aug 2026. Each game
// module runs POSTs to /api/{game}/new through activeGame.guardCreate,
// which returns 409 + { activeGame } if the user already has one going.
// The client shows a 'close current game or continue?' dialog when it
// sees that response. Redis-backed with a Map fallback (see activegame.js).
const activeGame = require('./activegame').make(redis);
// Verifier for the TalkSibi main game — lets getVerified drop the key
// as soon as the referenced room dies (game ended, host disconnected,
// TTL swept it). Every other module registers its own verifier inside
// its mount() below.
activeGame.registerVerifier('wordspies', code => rooms.has(code));

// Read + clear endpoints for the client. The playcard tap in /social
// calls GET first (pre-check UX); a game page that hits 409 calls
// DELETE when the user chooses 'close & start new'.
app.get('/api/user/active-game', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const uid = await uidFromCookie(req);
  if (!uid) return res.json({ activeGame: null });
  // Verified read — if the room the record points at no longer exists,
  // the key is dropped and this returns null so the client's playcard
  // isn't blocked by a ghost game.
  res.json({ activeGame: await activeGame.getVerified(uid) });
});
app.delete('/api/user/active-game', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const uid = await uidFromCookie(req);
  if (uid) await activeGame.clear(uid);
  res.json({ ok: true });
});

// 🧠 Mind Meld — the two-player side game at /meld. Same deal as social: its
// own module, its own socket namespace, its own rooms. If it fails to load the
// main game does not notice. It borrows nothing but the identity lookup, so a
// signed-in player is seated under their own name and photo.
// Every game module gets identify + uidFromReq + activeGame so the shared
// 'already in a game' guard can wrap their POST /api/{game}/new endpoints.
const gameOpts = { identify: resolveSocialIdentity, uidFromReq: uidFromCookie, activeGame };

let meldMod = null;
try { meldMod = require('./meld').mount(app, io, gameOpts) || null; }
catch (e) { console.error('meld module failed to load (game unaffected):', e.message); }

// 🕵️ Who is the Spy? — the party word game at /spy.
let spyMod = null;
try { spyMod = require('./spy').mount(app, io, gameOpts) || null; }
catch (e) { console.error('spy module failed to load (game unaffected):', e.message); }

// 🔗 Word Chain — turn-based vocabulary game at /wordchain.
let wordChainMod = null;
try { wordChainMod = require('./wordchain').mount(app, io, gameOpts) || null; }
catch (e) { console.error('wordchain module failed to load (game unaffected):', e.message); }

// ❓ Guess the Word — describer-and-guessers vocabulary game at /guessword.
let guessWordMod = null;
try { guessWordMod = require('./guessword').mount(app, io, gameOpts) || null; }
catch (e) { console.error('guessword module failed to load (game unaffected):', e.message); }

// 🏁 Word Race — 60-second vocabulary sprint at /wordrace. First game
// added under the LingoLand pivot's 'language-learning multiplayer'
// bucket (owner ask 4 Aug 2026).
let wordRaceMod = null;
try { wordRaceMod = require('./wordrace').mount(app, io, gameOpts) || null; }
catch (e) { console.error('wordrace module failed to load (game unaffected):', e.message); }

// 🎉 Parties — audio rooms with speakers + listeners + rationed listener chat.
// Uses the same Cloudflare Realtime pipeline the games do. Own namespace at
// /party, own rooms map, own REST endpoints under /api/parties.
let partyMod = null;
try {
  partyMod = require('./party').mount(app, io, {
    identify: resolveSocialIdentity,
    uidFromReq: uidFromCookie,
    // For private-party gating: social module tells us who's in the host's
    // circle (follows / followers / recent chats).
    socialCircle: social && social.inviteCircle ? social.inviteCircle : null,
    // Party push notifications — fires on raiseHand (to host) and on
    // promote (to the promoted listener). sendPush skips foregrounded
    // devices internally so an already-watching user won't be pinged.
    // Owner ask 21 Aug 2026. Silent no-op if social module didn't load.
    sendPush: social && social.sendPush ? social.sendPush : null,
    // When a call room ends, drop a system message into the DM chat so both
    // sides see "📞 Call · 1:24" (or "Missed call") in the thread. Handled
    // by social.postCallLog when available; silent no-op otherwise.
    onCallEnd: (info) => {
      try { if (social && social.postCallLog) social.postCallLog(info); }
      catch (e) { console.error('onCallEnd:', e.message); }
    }
  }) || null;
} catch (e) { console.error('party module failed to load (rest of site unaffected):', e.message); }

// ── Live ──────────────────────────────────────────────────────────────────
// Every game actually being played right now, in one list. The point is that
// an empty-looking site and a busy one should not look the same: if four
// people are mid-game you should be able to see it, look in, and either ask
// for a seat or just watch. Nothing in here is private — names and photos are
// what players already show at the table, and no board position, hand or
// spymaster key is included. Rooms with nobody but bots in them are skipped,
// because "6 games live" is a lie if five of them are a computer alone.
const teamName = t => t === 'red' ? 'Red' : t === 'blue' ? 'Blue' : null;
function wordspiesLive() {
  const out = [];
  // Grace window: a room stays visible on the Live tab for two minutes after
  // its last activity even if every socket has disconnected. Before this, a
  // simple page refresh made the room vanish from Live for a few seconds,
  // and closing the tab made a lobby (waiting-for-friend) room vanish
  // forever with no way for the friend to join.
  const now = Date.now();
  const GRACE_MS = 120 * 1000;
  for (const r of rooms.values()) {
    const players = [...r.players.values()].filter(p => !p.watcher);
    if (!players.length) continue;
    // "Seated recently" — anyone connected right now, OR seen in the last
    // GRACE_MS window (so a rejoinable seat still shows).
    const activeIsh = (r.lastActivity || 0) > now - GRACE_MS;
    const anyConnected = players.some(p => p.connected);
    if (!anyConnected && !activeIsh) continue;
    const rem = r.board ? { red: remaining(r, 'red'), blue: remaining(r, 'blue') } : null;
    out.push({
      game: 'wordspies', icon: '🕵️', title: 'TalkSibi',
      code: r.code, href: '/play?room=' + r.code, watchHref: '/play?watch=' + r.code,
      state: r.state, cap: null,
      players: players.map(p => ({
        name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected, team: p.team || null
      })),
      seatsFree: null,
      lead: r.state === 'over'
        ? ((teamName(r.winner) || 'Nobody') + ' won it')
        : (rem ? 'Red ' + rem.red + ' — Blue ' + rem.blue + ' left' : 'Picking teams'),
      turnName: r.state === 'playing' && r.turn
        ? teamName(r.turn.team) + (r.turn.phase === 'clue' ? ' — writing a clue' : ' — guessing')
        : null,
      watchers: [...r.players.values()].filter(p => p.watcher && p.connected).length,
      since: r.lastActivity || Date.now()
    });
  }
  return out;
}

app.get('/api/live', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let games = [];
  const add = (fn) => { try { if (fn) games = games.concat(fn() || []); } catch (e) { /* one game's bad day is not the tab's */ } };
  add(wordspiesLive);
  add(meldMod && meldMod.live);
  add(spyMod && spyMod.live);
  add(wordChainMod && wordChainMod.live);
  add(guessWordMod && guessWordMod.live);
  add(wordRaceMod && wordRaceMod.live);
  add(partyMod && partyMod.live);
  // Games actually being played first, then the ones still filling up, and
  // within each the ones that moved most recently — a game someone touched a
  // minute ago is far more worth looking at than one idling since lunchtime.
  const rank = g => (g.state === 'playing' ? 0 : g.state === 'lobby' ? 1 : 2);
  games.sort((a, b) => rank(a) - rank(b) || (b.since || 0) - (a.since || 0));
  res.json({
    games,
    playing: games.filter(g => g.state === 'playing').length,
    total: games.length,
    people: games.reduce((n, g) => n + g.players.filter(p => !p.bot).length, 0),
    watching: games.reduce((n, g) => n + (g.watchers || 0), 0)
  });
});

// 🧪 Unlocks the test hatch: /play?test=<this>. Lives here rather than in the
// client bundle so it isn't discoverable by reading the page source. Set
// TEST_KEY in the environment to rotate it, or to '' to disable the hatch.
const TEST_KEY = process.env.TEST_KEY !== undefined ? process.env.TEST_KEY : 'sq7-bench';

const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // clean up rooms idle for 6 hours
const OWNER_ROOM_TTL_MS = 1000 * 60 * 60 * 24; // signed-in creators keep for 24 h
const saveTimers = new Map();
function saveRoom(room) {
  if (!redis || saveTimers.has(room.code)) return;
  saveTimers.set(room.code, setTimeout(() => {
    saveTimers.delete(room.code);
    if (!rooms.has(room.code)) return;
    const data = {
      code: room.code, watchCode: room.watchCode, hostId: room.hostId, state: room.state, settings: room.settings,
      board: room.board, turn: room.turn, clue: room.clue, winner: room.winner,
      winReason: room.winReason, log: room.log, score: room.score, spySwapped: room.spySwapped || {},
      lastActivity: room.lastActivity,
      players: [...room.players.entries()].map(([id, p]) => [id, { ...p }])
    };
    redis.set('ws:room:' + room.code, JSON.stringify(data), 'EX', Math.floor(ROOM_TTL_MS / 1000))
      .catch(e => console.error('redis save:', e.message));
  }, 400));
}

function dropRoom(code) {
  rooms.delete(code);
  if (redis) redis.del('ws:room:' + code).catch(() => {});
}

async function restoreRooms() {
  if (!redis) return;
  try {
    const keys = await redis.keys('ws:room:*');
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const d = JSON.parse(raw);
      const room = {
        code: d.code, watchCode: d.watchCode || ('W' + crypto.randomBytes(4).toString('hex').toUpperCase()),
        hostId: d.hostId, players: new Map(),
        state: d.state, settings: d.settings || { categories: [], timer: 0 },
        board: d.board, turn: d.turn, clue: d.clue, winner: d.winner,
        winReason: d.winReason, log: d.log || [], score: d.score || { red: 0, blue: 0 },
        spySwapped: d.spySwapped || {},
        timerEnd: null, timerHandle: null, lastActivity: Date.now()
      };
      for (const [id, p] of d.players || []) room.players.set(id, { ...p, connected: false });
      rooms.set(room.code, room);
      if (room.state === 'playing' && room.settings.timer) armTimer(room);
    }
    if (keys.length) console.log(`restored ${keys.length} room(s) from redis`);
  } catch (e) { console.error('redis restore:', e.message); }
}
restoreRooms();

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const ttl = room.creatorUid ? OWNER_ROOM_TTL_MS : ROOM_TTL_MS;
    if (now - room.lastActivity > ttl) dropRoom(code);
  }
}, 1000 * 60 * 10);

const AVATARS = ['🦊','🐼','🐸','🐙','🦁','🐯','🐨','🐰','🐵','🐧','🦄','🐢','🐝','🦋','🐳','🦉','🐹','🐮','🐷','🦒'];
function pickAvatar(room) {
  const used = new Set([...room.players.values()].map(p => p.avatar));
  return AVATARS.find(a => !used.has(a)) || AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_CATS = Object.keys(PACKS);
function createBoard(categories) {
  // 25 random words drawn from the selected categories (deduped).
  // best-quality boards: single words only, max 11 letters (fits tiles perfectly)
  let keys = Array.isArray(categories) ? categories.filter(k => PACKS[k]) : [];
  if (!keys.length) keys = ALL_CATS; // fallback to everything
  let pool = [...new Set(keys.flatMap(k => PACKS[k].words))]
    .filter(w => !w.includes(' ') && !w.includes('-') && w.length <= 11);
  // safety: if a tiny selection can't fill 25 unique tiles, top up from all packs
  if (pool.length < 25) {
    pool = [...new Set([...pool, ...Object.values(PACKS).flatMap(p => p.words)])]
      .filter(w => !w.includes(' ') && !w.includes('-') && w.length <= 11);
  }
  const words = shuffle(pool).slice(0, 25);
  const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
  const otherTeam = startingTeam === 'red' ? 'blue' : 'red';
  // Both teams get the same number of cards — 8 each. (Classic Codenames gives
  // the first team 9 as a handicap for going first; an even board is simply
  // easier to read and feels fairer at the table.) The freed card becomes a
  // neutral, so the 25 still add up: 8 + 8 + 8 + 1 assassin.
  const colors = shuffle([
    ...Array(8).fill(startingTeam),
    ...Array(8).fill(otherTeam),
    ...Array(8).fill('neutral'),
    'assassin'
  ]);
  return {
    startingTeam,
    cards: words.map((word, i) => ({ word, color: colors[i], revealed: false }))
  };
}

function createRoom(hostName) {
  const code = makeCode();
  const room = {
    code,
    // secret view-only code — sharing this link lets people WATCH the match
    // without ever learning the join code
    watchCode: 'W' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    hostId: null,
    players: new Map(), // socketId -> {id, name, team, role, connected}
    state: 'lobby', // lobby | playing | over
    settings: { categories: [], timer: 0 }, // [] = mix all categories; timer secs (0=off)
    board: null,
    turn: null, // {team, phase: 'clue'|'guess'}
    clue: null, // {word, count, guessesLeft}
    winner: null,
    winReason: null,
    log: [],
    score: { red: 0, blue: 0 },
    timerEnd: null,
    timerHandle: null,
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function addLog(room, entry) {
  room.log.push({ ...entry, t: Date.now() });
  if (room.log.length > 200) room.log.shift();
}

function remaining(room, team) {
  return room.board.cards.filter(c => c.color === team && !c.revealed).length;
}

// 👑 The people this whole thing was built for. They wear a crown instead of the
// blue tick — a tick that nearly everyone has stopped meaning anything. Kept in
// step with the same list in social.js. The crown needs a real signed-in account
// behind it, so nobody can put on a name in the join box and borrow one.
const KINGS = new Set(['ayoub', 'xman', 'ali', 'pray', 'dem', 'sibi', 'rami', 'earlin', 'ana', 'karina']);
const isKingName = p => !!p.socUid && KINGS.has(String(p.name || '').trim().toLowerCase());

// Public view of the room. Spymasters (and everyone when the game is over)
// also receive card colors.
function publicState(room, forPlayer) {
  const isSpymaster = forPlayer && forPlayer.role === 'spymaster';
  const revealAll = room.state === 'over';
  const isWatcher = forPlayer && forPlayer.watcher;
  return {
    // watchers never see the join code or the watch code — their link is all they get
    code: isWatcher ? null : room.code,
    watchCode: isWatcher ? null : room.watchCode,
    state: room.state,
    spySwapped: room.spySwapped || {},
    hostId: room.hostId,
    settings: room.settings,
    catalog: CATALOG,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, role: p.role, connected: p.connected, avatar: p.avatar, avatarSeed: p.avatarSeed, watcher: !!p.watcher,
      photo: p.photo || null, verified: !!p.socUid && !isKingName(p), king: isKingName(p)
    })),
    board: room.board ? {
      startingTeam: room.board.startingTeam,
      cards: room.board.cards.map(c => ({
        word: c.word,
        revealed: c.revealed,
        by: c.revealed ? (c.by || null) : null,
        color: (c.revealed || isSpymaster || revealAll) ? c.color : null
      }))
    } : null,
    remaining: room.board ? { red: remaining(room, 'red'), blue: remaining(room, 'blue') } : null,
    turn: room.turn,
    clue: room.clue,
    winner: room.winner,
    winReason: room.winReason,
    log: room.log,
    score: room.score,
    timerEnd: room.timerEnd
  };
}

function broadcast(room) {
  room.lastActivity = Date.now();
  for (const [sockId, player] of room.players) {
    const sock = io.sockets.sockets.get(sockId);
    if (sock) sock.emit('state', publicState(room, player));
  }
  saveRoom(room);
}

function clearTimer(room) {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = null;
  room.timerEnd = null;
}

function armTimer(room) {
  clearTimer(room);
  if (!room.settings.timer || room.state !== 'playing') return;
  room.timerEnd = Date.now() + room.settings.timer * 1000;
  room.timerHandle = setTimeout(() => {
    if (room.state !== 'playing') return;
    const team = room.turn.team;
    addLog(room, { type: 'timeout', team });
    endTurn(room);
    armTimer(room);
    broadcast(room);
  }, room.settings.timer * 1000);
}

function endTurn(room) {
  room.turn = { team: room.turn.team === 'red' ? 'blue' : 'red', phase: 'clue' };
  room.clue = null;
}

function endGame(room, winner, reason) {
  room.state = 'over';
  room.winner = winner;
  room.winReason = reason;
  room.score[winner]++;
  clearTimer(room);
  addLog(room, { type: 'gameover', team: winner, reason });
  // Credit the match to any players who are logged into TalkSibi Social:
  // everyone seated gets +1 game, the winning team also gets +1 win.
  if (social && social.recordResult) {
    const seated = [...room.players.values()].filter(p => p.socUid && p.team && !p.watcher);
    const winners = [...new Set(seated.filter(p => p.team === winner).map(p => p.socUid))];
    const losers = [...new Set(seated.filter(p => p.team !== winner).map(p => p.socUid))].filter(u => !winners.includes(u));
    if (winners.length || losers.length) social.recordResult(winners, losers).catch(e => console.error('recordResult:', e.message));
  }
}

function startGame(room) {
  room.board = createBoard(room.settings.categories);
  room.state = 'playing';
  room.winner = null;
  room.winReason = null;
  room.clue = null;
  room.turn = { team: room.board.startingTeam, phase: 'clue' };
  room.spySwapped = {}; // each team gets one emergency spymaster swap per game
  // The board arriving shouldn't cut the room off mid-sentence. Wiping the log
  // clears out the moves of the last game, which is right, but the chat people
  // were having while they waited carries on into this one — so the last few
  // lines of it come with us.
  room.log = room.log.filter(e => e.type === 'chat').slice(-6);
  addLog(room, { type: 'start', team: room.board.startingTeam });
  armTimer(room);
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
// If the visitor is logged into TalkSibi Social, their session cookie rides
// along on the socket handshake — resolve it to a profile id so wins can be
// credited to their profile. Server-side lookup, so it can't be spoofed.
async function resolveSocialUid(socket) {
  try {
    const m = String(socket.handshake.headers.cookie || '').match(/(?:^|;\s*)soc_sess=([a-f0-9]{48})/);
    if (!m) return null;
    // Ask the social module — it owns the session store and knows whether that's
    // redis or its in-memory fallback. Reading redis directly here would return
    // null on any redis-less deploy even though the person is properly logged in.
    if (social && social.uidBySession) return await social.uidBySession(m[1]);
    if (!redis) return null;
    return await redis.get('soc:sess:' + m[1]);
  } catch (e) { return null; }
}

// Cookie → { uid, name, photo }. Everything a logged-in player needs to be
// seated without typing anything. Resolves to null for guests, and guests
// must keep working — playing without an account is the whole pitch.
async function resolveSocialIdentity(socket) {
  const uid = await resolveSocialUid(socket);
  if (!uid) return null;
  let profile = null;
  if (social && social.profileByUid) {
    try { profile = await social.profileByUid(uid); } catch (e) { console.error('identity:', e.message); }
  }
  return { uid, name: (profile && profile.name) || null, photo: (profile && profile.photo) || null };
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  socket.socUid = null;
  socket.socProfile = null;
  // Hold the promise, not just the result. Auto-join fires the instant the
  // socket connects, so a handler that read socket.socUid directly would race
  // this lookup and silently seat a logged-in player as an anonymous guest —
  // their win would then never be credited. Handlers await this instead.
  socket.socReady = resolveSocialIdentity(socket)
    .then(idn => {
      socket.socUid = idn ? idn.uid : null;
      socket.socProfile = idn;
      return idn;
    })
    .catch(() => null);

  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (err) { console.error(err); }
  };

  // `room` is only assigned after an await, so two rapid create/join events
  // could both pass the `if (room)` check. This closes that window.
  let entering = false;

  socket.on('create', guard(async ({ name }) => {
    if (room || entering) return;
    entering = true;
    try {
      const idn = await socket.socReady;
      // 'Already in a game' guard for TalkSibi main — the other games
      // enforce this in their REST /new endpoint, but this one enters
      // via socket. Same UX: fire an event the client turns into the
      // 'close current game or continue?' dialog.
      if (idn && idn.uid) {
        const active = await activeGame.getVerified(idn.uid);
        if (active) { socket.emit('activeGame', active); return; }
      }
      // No name typed (auto-join from a link) → use the profile name.
      name = String(name || '').trim().slice(0, 20) || (idn && idn.name) || 'Player';
      room = createRoom(name);
      player = {
        id: socket.id, name, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(),
        socUid: idn ? idn.uid : null, photo: idn ? idn.photo : null
      };
      room.hostId = socket.id;
      // Signed-in creator? Stamp their uid so the room survives all-sockets-
      // disconnected and shows in their "My games" list, and register the
      // room in the active-game guard so a second /new call is blocked.
      if (idn && idn.uid) {
        room.creatorUid = idn.uid;
        room.creatorName = idn.name || name;
        room.creatorPhoto = idn.photo || null;
        activeGame.set(idn.uid, { game: 'wordspies', code: room.code, url: '/play?code=' + room.code }).catch(() => {});
      }
      room.players.set(socket.id, player);
      socket.join(room.code);
      socket.emit('session', { code: room.code, token: player.token, name: player.name });
      addLog(room, { type: 'join', name });
      broadcast(room);
    } finally { entering = false; }
  }));

  socket.on('join', guard(async ({ code, name }) => {
    if (room || entering) return;
    entering = true;
    try {
      code = String(code || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) { socket.emit('errorMsg', 'Room not found. Check the code and try again.'); return; }
      const idn = await socket.socReady;
      if (!rooms.has(code)) { socket.emit('errorMsg', 'Room not found. Check the code and try again.'); return; }
      name = String(name || '').trim().slice(0, 20) || (idn && idn.name) || 'Player';
      // avoid duplicate names
      const names = new Set([...r.players.values()].map(p => p.name));
      let finalName = name; let n = 2;
      while (names.has(finalName)) finalName = `${name} ${n++}`;
      room = r;
      player = {
        id: socket.id, name: finalName, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(),
        socUid: idn ? idn.uid : null, photo: idn ? idn.photo : null
      };
      room.players.set(socket.id, player);
      socket.join(room.code);
      socket.emit('session', { code: room.code, token: player.token, name: player.name });
      addLog(room, { type: 'join', name: finalName });
      broadcast(room);
    } finally { entering = false; }
  }));

  // Watch-only entry: a secret link (?watch=Wxxxxxxxx) that shows the match
  // live — board, clues, players — but can never join a team or act.
  // Since the Live tab, a plain room code works here too ({ code }). That is
  // not a hole: the room code is the *join* code, so anyone holding it could
  // already walk in and take a seat — arriving as a silent viewer instead is
  // strictly the more polite door. The secret watchCode still exists for the
  // case it was built for, handing someone a link that can only ever watch.
  socket.on('watch', guard(({ watchCode, code }) => {
    if (room) return;
    watchCode = String(watchCode || '').trim().toUpperCase();
    const plain = String(code || '').trim().toUpperCase();
    const key = watchCode || plain;
    const r = [...rooms.values()].find(x => x.watchCode === key) || (key ? rooms.get(key) : null);
    if (!r) { socket.emit('errorMsg', 'This game is no longer running.'); return; }
    let n = [...r.players.values()].filter(p => p.watcher).length + 1;
    room = r;
    player = { id: socket.id, name: 'Viewer ' + n, team: null, role: 'operative', watcher: true, connected: true, avatar: pickAvatar(room), token: crypto.randomUUID() };
    room.players.set(socket.id, player);
    socket.join(room.code);
    broadcast(room);
  }));

  socket.on('rejoin', guard(async ({ code, token }) => {
    if (room || entering) return;
    code = String(code || '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) { socket.emit('sessionExpired'); return; }
    const entry = [...r.players.entries()].find(([, p]) => p.token === token);
    if (!entry) { socket.emit('sessionExpired'); return; }
    const idn = await socket.socReady;
    if (room) return;                       // a join landed while we were waiting
    const [oldId, p] = entry;
    r.players.delete(oldId);
    p.id = socket.id;
    p.connected = true;
    // Someone who logged in mid-session gets credited from here on.
    if (idn) {
      if (!p.socUid) p.socUid = idn.uid;
      if (!p.photo && idn.photo) p.photo = idn.photo;
    }
    r.players.set(socket.id, p);
    if (r.hostId === oldId) r.hostId = socket.id;
    room = r; player = p;
    socket.join(r.code);
    socket.emit('session', { code: r.code, token: p.token, name: p.name });
    broadcast(r);
  }));

  socket.on('setTeamRole', guard(({ team, role }) => {
    if (!room || !player) return;
    if (!['red', 'blue'].includes(team)) return;
    if (!['operative', 'spymaster'].includes(role)) return;
    // Only one spymaster per team
    if (role === 'spymaster') {
      const taken = [...room.players.values()].some(p => p !== player && p.team === team && p.role === 'spymaster');
      if (taken) { socket.emit('errorMsg', 'That team already has a spymaster.'); return; }
    }
    // 👁 Watch-only visitors can never take a seat
    if (player.watcher) {
      socket.emit('errorMsg', '👁 This is a watch-only link — you can see the game but not play.');
      return;
    }
    // Can't switch teams during a game
    if (room.state === 'playing' && player.team && player.team !== team) {
      socket.emit('errorMsg', 'You can\'t switch teams during a game.');
      return;
    }
    // No new spymasters mid-game: the original spymaster saw the colors and can
    // rejoin their seat at any time — replacing them would compromise the round.
    if (room.state === 'playing' && role === 'spymaster' && player.role !== 'spymaster') {
      socket.emit('errorMsg', 'Spymasters can\'t be changed mid-game. Finish this round or start a new game.');
      return;
    }
    player.team = team;
    player.role = role;
    broadcast(room);
  }));

  // ---- 🧪 test hatch ----------------------------------------------------
  // Fills a room with dummy players and can force a result, so the wheel and
  // the win→profile loop can be exercised on the live site without rounding up
  // three friends. Gated on a key that only appears server-side: without it,
  // anyone could inflate their own win count.
  socket.on('testFill', guard(({ key }) => {
    if (!TEST_KEY || key !== TEST_KEY || !room || socket.id !== room.hostId) return;
    if (room.state !== 'lobby') return;
    room.test = true;
    for (const nm of ['Robo', 'Pixel', 'Widget']) {
      if ([...room.players.values()].some(p => p.name === nm)) continue;
      const id = 'bot_' + crypto.randomUUID().slice(0, 8);
      room.players.set(id, {
        id, name: nm, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(), bot: true,
        socUid: null, photo: null
      });
      addLog(room, { type: 'join', name: nm });
    }
    broadcast(room);
  }));

  socket.on('testWin', guard(({ key, team }) => {
    if (!TEST_KEY || key !== TEST_KEY || !room || !room.test || socket.id !== room.hostId) return;
    if (!['red', 'blue'].includes(team) || room.state !== 'playing') return;
    // Goes through the normal ending, so profiles are credited exactly as they
    // would be in a real game — that's the whole point of testing it here.
    endGame(room, team, 'allfound');
    broadcast(room);
  }));

  // 🎡 Spin the wheel: the host shuffles everyone into teams at random, so
  // nobody has to negotiate who plays with whom. Lobby only — re-dealing seats
  // mid-game would hand the board's colors to the wrong people.
  socket.on('spinTeams', guard(() => {
    if (!room || socket.id !== room.hostId) return;
    if (room.state !== 'lobby') { socket.emit('errorMsg', 'You can only spin for teams before the game starts.'); return; }
    // 👁 Watchers are never dealt in — they asked to watch.
    const pool = shuffle([...room.players.values()].filter(p => !p.watcher));
    if (pool.length < 2) { socket.emit('errorMsg', 'You need at least 2 players to spin for teams.'); return; }

    // Deal alternately rather than splitting the list in half: that's what
    // guarantees the two teams can never differ by more than one player.
    pool.forEach((p, i) => {
      p.team = i % 2 === 0 ? 'red' : 'blue';
      // First one dealt to each side takes the spymaster seat.
      p.role = i < 2 ? 'spymaster' : 'operative';
    });

    addLog(room, { type: 'spin' });
    // The client animates a wheel over this order, then reveals the new lobby.
    io.to(room.code).emit('teamsSpun', {
      order: pool.map(p => ({ id: p.id, name: p.name, team: p.team, role: p.role }))
    });
    broadcast(room);
  }));

  // Host moderation: only the party creator can remove someone from their
  // seat — spymaster or team — sending them back to the spectator bench.
  socket.on('kick', guard(({ playerId }) => {
    if (!room || socket.id !== room.hostId) return;
    const target = room.players.get(String(playerId || ''));
    if (!target || target.id === room.hostId || !target.team) return;
    target.team = null;
    target.role = 'operative';
    addLog(room, { type: 'kick', name: target.name });
    broadcast(room);
  }));

  // 🆘 Emergency rescue: if a spymaster loses connection (or leaves) mid-game,
  // the host can promote a teammate to spymaster so the game isn't stuck.
  // Allowed ONCE per team per game, and only while that team's spymaster is
  // actually gone — the replaced spymaster is benched to spectators, since
  // they've already seen the colors.
  socket.on('promoteSpymaster', guard(({ playerId }) => {
    if (!room || socket.id !== room.hostId || room.state !== 'playing') return;
    const target = room.players.get(String(playerId || ''));
    if (!target || target.watcher || !target.team || target.role === 'spymaster') return;
    const team = target.team;
    const currentSpy = [...room.players.values()].find(p => p.team === team && p.role === 'spymaster');
    if (currentSpy && currentSpy.connected) {
      socket.emit('errorMsg', 'That team\'s spymaster is still connected — you can only replace one who lost connection or left.');
      return;
    }
    room.spySwapped = room.spySwapped || {};
    if (room.spySwapped[team]) {
      socket.emit('errorMsg', 'That team already used its one emergency spymaster swap this game.');
      return;
    }
    room.spySwapped[team] = true;
    if (currentSpy) { currentSpy.team = null; currentSpy.role = 'operative'; } // bench the old spymaster
    target.role = 'spymaster';
    addLog(room, { type: 'spyswap', team, name: target.name });
    broadcast(room);
  }));

  socket.on('setSettings', guard(({ timer, categories }) => {
    if (!room || socket.id !== room.hostId || room.state === 'playing') return;
    if (typeof timer === 'number' && [0, 60, 90, 120, 180].includes(timer)) room.settings.timer = timer;
    if (Array.isArray(categories)) {
      room.settings.categories = categories.filter(k => PACKS[k]); // [] allowed = mix all
    }
    broadcast(room);
  }));

  socket.on('shuffleAvatar', guard(() => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.avatarSeed = crypto.randomUUID().slice(0, 8);
    broadcast(room);
  }));

  socket.on('start', guard(() => {
    if (!room || socket.id !== room.hostId) return;
    if (room.state === 'playing') return;
    const ps = [...room.players.values()];
    const redSpy = ps.some(p => p.team === 'red' && p.role === 'spymaster');
    const blueSpy = ps.some(p => p.team === 'blue' && p.role === 'spymaster');
    const redOp = ps.some(p => p.team === 'red' && p.role === 'operative');
    const blueOp = ps.some(p => p.team === 'blue' && p.role === 'operative');
    if (!redSpy || !blueSpy || !redOp || !blueOp) {
      socket.emit('errorMsg', 'Each team needs at least 1 spymaster and 1 operative to start.');
      return;
    }
    startGame(room);
    broadcast(room);
  }));

  socket.on('clue', guard(({ word, count }) => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'clue') return;
    if (player.role !== 'spymaster' || player.team !== room.turn.team) return;
    word = String(word || '').trim().slice(0, 30);
    count = parseInt(count, 10);
    if (!word || isNaN(count) || count < 0 || count > 9) return;
    // Clue can't be a visible word on the board
    const visible = room.board.cards.filter(c => !c.revealed).map(c => c.word.toLowerCase());
    if (visible.includes(word.toLowerCase())) {
      socket.emit('errorMsg', 'Your clue can\'t be a word that\'s on the board.');
      return;
    }
    room.clue = { word, count, guessesLeft: count === 0 ? Infinity : count + 1 };
    room.turn.phase = 'guess';
    addLog(room, { type: 'clue', team: player.team, name: player.name, word, count });
    armTimer(room);
    broadcast(room);
  }));

  socket.on('guess', guard(({ index }) => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'guess') return;
    if (player.role !== 'operative' || player.team !== room.turn.team) return;
    index = parseInt(index, 10);
    const card = room.board.cards[index];
    if (!card || card.revealed) return;

    card.revealed = true;
    card.by = player.name;
    const team = player.team;
    addLog(room, { type: 'guess', team, name: player.name, word: card.word, color: card.color });

    if (card.color === 'assassin') {
      endGame(room, team === 'red' ? 'blue' : 'red', 'assassin');
      broadcast(room);
      return;
    }

    // Win checks (revealing the other team's last card also ends the game)
    for (const t of ['red', 'blue']) {
      if (remaining(room, t) === 0) {
        endGame(room, t, 'allfound');
        broadcast(room);
        return;
      }
    }

    if (card.color === team) {
      if (room.clue.guessesLeft !== Infinity) room.clue.guessesLeft--;
      if (room.clue.guessesLeft <= 0) {
        addLog(room, { type: 'turnend', team, reason: 'noguesses' });
        endTurn(room);
        armTimer(room);
      }
    } else {
      addLog(room, { type: 'turnend', team, reason: 'wrong' });
      endTurn(room);
      armTimer(room);
    }
    broadcast(room);
  }));

  socket.on('pass', guard(() => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'guess') return;
    if (player.role !== 'operative' || player.team !== room.turn.team) return;
    addLog(room, { type: 'turnend', team: player.team, reason: 'pass' });
    endTurn(room);
    armTimer(room);
    broadcast(room);
  }));

  socket.on('rematch', guard(() => {
    if (!room || socket.id !== room.hostId || room.state !== 'over') return;
    room.state = 'lobby';
    room.board = null;
    room.turn = null;
    room.clue = null;
    room.winner = null;
    broadcast(room);
  }));

  socket.on('chat', guard(({ text }) => {
    if (!room || !player || player.watcher) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    addLog(room, { type: 'chat', name: player.name, team: player.team, text });
    broadcast(room);
  }));

  socket.on('leaveRoom', guard(() => {
    if (!room || !player) return;
    const r = room, p = player, sockId = socket.id;
    r.players.delete(sockId);
    addLog(r, { type: 'leave', name: p.name });
    room = null; player = null;
    socket.leave(r.code);
    if (r.hostId === sockId) {
      const next = [...r.players.keys()][0];
      r.hostId = next || null;
      if (!next) { clearTimer(r); dropRoom(r.code); return; }
    }
    broadcast(r);
  }));

  socket.on('disconnect', guard(() => {
    if (!room || !player) return;
    player.connected = false;
    // Give the player 3 minutes to come back (refresh, or leaving the app and
    // returning to the same URL) before removing them from the room.
    const r = room, p = player, sockId = socket.id;
    setTimeout(() => {
      const current = r.players.get(sockId);
      if (current && !current.connected) {
        r.players.delete(sockId);
        addLog(r, { type: 'leave', name: p.name });
        if (r.hostId === sockId) {
          const next = [...r.players.keys()][0];
          r.hostId = next || null;
          if (!next) { clearTimer(r); dropRoom(r.code); return; }
        }
        broadcast(r);
      }
    }, 180000);
    broadcast(room);
  }));
});

server.listen(PORT, () => {
  console.log(`TalkSibi running → http://localhost:${PORT}`);
});
