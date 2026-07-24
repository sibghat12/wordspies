// WordSpies Social — community module (accounts, profiles, photos).
// Entirely separate from the game: own routes (/social, /api/social/*),
// own data keys (soc:*), own page (public/social.html). The game never
// depends on anything in this file; if it fails to load, the game runs on.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const SESS_TTL = 60 * 60 * 24 * 90; // 90 days
const PHOTO_DIR = process.env.SOC_PHOTOS || path.join(__dirname, 'social-photos');
// "Continue with Google": set SOC_GOOGLE_CLIENT_ID in the service environment
// to switch the button on. Without it, email sign-up still works fine.
const GOOGLE_CLIENT_ID = process.env.SOC_GOOGLE_CLIENT_ID || null;

function mount(app, redis) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });

  // ---- tiny store: redis when available, in-memory otherwise (local dev) ----
  const mem = new Map();
  const db = {
    async get(k) { return redis ? redis.get(k) : (mem.get(k) ?? null); },
    async set(k, v, ttl) {
      if (redis) return ttl ? redis.set(k, v, 'EX', ttl) : redis.set(k, v);
      mem.set(k, v);
    },
    async del(k) { return redis ? redis.del(k) : mem.delete(k); },
    async sadd(k, m) {
      if (redis) return redis.sadd(k, m);
      const s = mem.get(k) instanceof Set ? mem.get(k) : new Set(); s.add(m); mem.set(k, s);
    },
    async smembers(k) {
      if (redis) return redis.smembers(k);
      const s = mem.get(k); return s instanceof Set ? [...s] : [];
    }
  };

  // ---- helpers ----
  const cookies = req => Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(p => p[0])
  );
  const setSess = (res, token) => res.setHeader('Set-Cookie',
    `soc_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESS_TTL}${process.env.NODE_ENV === 'production' || process.env.REDIS_URL ? '; Secure' : ''}`);
  const clearSess = res => res.setHeader('Set-Cookie', 'soc_sess=; Path=/; HttpOnly; Max-Age=0');

  // Rough location from IP (country reliable, city approximate). Free, no key.
  function reqIp(req) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xf || req.socket.remoteAddress || '';
  }
  async function geoFromIp(ip) {
    try {
      ip = ip.replace(/^::ffff:/, '');
      if (!ip || ip === '127.0.0.1' || ip === '::1') return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch('https://ipwho.is/' + encodeURIComponent(ip), { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.success) return null;
      return { city: j.city || '', country: j.country || '', cc: (j.country_code || '').toUpperCase() };
    } catch (e) { return null; }
  }
  const geoLabel = g => !g ? '' : (g.city && g.country ? g.city + ', ' + g.country : g.country || '');

  async function userFromReq(req) {
    const t = cookies(req).soc_sess;
    if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
    const uid = await db.get('soc:sess:' + t);
    if (!uid) return null;
    const raw = await db.get('soc:user:' + uid);
    return raw ? JSON.parse(raw) : null;
  }
  const pub = u => ({ id: u.id, name: u.name, bio: u.bio || '', location: u.location || '',
    country: u.country || '', cc: u.cc || '',
    photo: u.photo || null, createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0 });

  // ---- simple rate limit (per ip per route bucket) ----
  const hits = new Map();
  function limited(req, bucket, max) {
    const key = bucket + ':' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?');
    const now = Date.now();
    const rec = hits.get(key) || { n: 0, t: now };
    if (now - rec.t > 60_000) { rec.n = 0; rec.t = now; }
    rec.n++; hits.set(key, rec);
    if (hits.size > 5000) hits.clear();
    return rec.n > max;
  }

  const api = express.Router();
  api.use(express.json({ limit: '8kb' }));

  api.get('/config', (req, res) => res.json({ google: GOOGLE_CLIENT_ID }));

  // suggestion for the "your city" field, from the visitor's IP
  api.get('/geo', async (req, res) => {
    const g = await geoFromIp(reqIp(req));
    res.json({ suggestion: geoLabel(g) });
  });

  // ---- auth ----
  api.post('/signup', async (req, res) => {
    try {
      if (limited(req, 'su', 5)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      let { name, email, password } = req.body || {};
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      if (!/^[a-zA-Z0-9_ ]{3,15}$/.test(name)) return res.status(400).json({ error: 'Name: 3–15 letters, numbers or spaces.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 100) return res.status(400).json({ error: 'That email doesn\'t look right.' });
      if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      if (await db.get('soc:email:' + email)) return res.status(409).json({ error: 'That email is already registered — try logging in.' });
      if (await db.get('soc:uname:' + name.toLowerCase())) return res.status(409).json({ error: 'That name is taken.' });
      const id = crypto.randomBytes(9).toString('hex');
      const geo = await geoFromIp(reqIp(req));
      const user = { id, name, email, passHash: bcrypt.hashSync(password, 10), bio: '', location: geoLabel(geo),
        country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
        games: 0, wins: 0, createdAt: Date.now() };
      await db.set('soc:user:' + id, JSON.stringify(user));
      await db.set('soc:email:' + email, id);
      await db.set('soc:uname:' + name.toLowerCase(), id);
      await db.sadd('soc:members', id);
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social signup:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/login', async (req, res) => {
    try {
      if (limited(req, 'li', 8)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const password = String((req.body || {}).password || '');
      const uid = await db.get('soc:email:' + email);
      const raw = uid && await db.get('soc:user:' + uid);
      const user = raw && JSON.parse(raw);
      if (user && !user.passHash) return res.status(401).json({ error: 'This account uses Google — tap "Continue with Google".' });
      if (!user || !bcrypt.compareSync(password, user.passHash)) return res.status(401).json({ error: 'Wrong email or password.' });
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social login:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // "Continue with Google" — the browser sends Google's signed ID token; we
  // verify it with Google, then log the person in (creating their profile on
  // first visit). Same email = same account, so Google + email users never split.
  api.post('/google', async (req, res) => {
    try {
      if (!GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google sign-in is not enabled yet.' });
      if (limited(req, 'gg', 10)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const credential = String((req.body || {}).credential || '');
      if (!credential || credential.length > 4096) return res.status(400).json({ error: 'Bad Google response.' });
      const gr = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      if (!gr.ok) return res.status(401).json({ error: 'Google sign-in failed — try again.' });
      const g = await gr.json();
      if (g.aud !== GOOGLE_CLIENT_ID || g.email_verified !== 'true' || !g.email ||
          (g.exp && Date.now() / 1000 > Number(g.exp) + 60)) {
        return res.status(401).json({ error: 'Google sign-in failed — try again.' });
      }
      const email = String(g.email).toLowerCase();
      let uid = await db.get('soc:email:' + email);
      let user = uid ? JSON.parse(await db.get('soc:user:' + uid) || 'null') : null;
      if (!user) {
        // first visit: create a profile with a friendly unique name
        let base = String(g.given_name || g.name || email.split('@')[0])
          .replace(/[^a-zA-Z0-9_ ]/g, '').trim().slice(0, 15) || 'Spy';
        if (base.length < 3) base = 'Spy ' + base;
        let name = base, n = 1;
        while (await db.get('soc:uname:' + name.toLowerCase())) { n++; name = (base.slice(0, 12) + ' ' + n).trim(); }
        const id = crypto.randomBytes(9).toString('hex');
        const geo = await geoFromIp(reqIp(req));
        user = { id, name, email, passHash: null, googleId: g.sub, bio: '', location: geoLabel(geo),
          country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
          games: 0, wins: 0, createdAt: Date.now(), fresh: true };
        await db.set('soc:user:' + id, JSON.stringify(user));
        await db.set('soc:email:' + email, id);
        await db.set('soc:uname:' + name.toLowerCase(), id);
        await db.sadd('soc:members', id);
      } else if (!user.googleId) {
        user.googleId = g.sub; // link Google to the existing email account
        await db.set('soc:user:' + user.id, JSON.stringify(user));
      }
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social google:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- forgot password: 6-digit code by email (needs SOC_RESEND_KEY to send) ----
  const RESEND_KEY = process.env.SOC_RESEND_KEY || null;
  const MAIL_FROM = process.env.SOC_MAIL_FROM || 'WordSpies <onboarding@resend.dev>';
  api.post('/forgot', async (req, res) => {
    try {
      if (limited(req, 'fp', 4)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const uid = await db.get('soc:email:' + email);
      if (!uid) return res.json({ ok: true }); // don't reveal which emails exist
      if (!RESEND_KEY) return res.status(503).json({ error: 'Password reset email isn\'t set up yet — if you signed up with this email on Google, use "Sign in with Google", or contact contact@wordspies.co.uk.' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.set('soc:reset:' + email, bcrypt.hashSync(code, 8), 900); // 15 min
      const mr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: MAIL_FROM, to: [email], subject: 'Your WordSpies reset code: ' + code,
          text: `Hi!\n\nYour WordSpies Social password reset code is: ${code}\n\nIt expires in 15 minutes. If you didn't ask for this, just ignore this email.\n\n— WordSpies`
        })
      });
      if (!mr.ok) { console.error('resend:', mr.status, await mr.text()); return res.status(502).json({ error: 'Could not send the email — try again shortly.' }); }
      res.json({ ok: true });
    } catch (e) { console.error('social forgot:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/reset', async (req, res) => {
    try {
      if (limited(req, 'rs', 6)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const code = String((req.body || {}).code || '').trim();
      const password = String((req.body || {}).password || '');
      if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      const hash = await db.get('soc:reset:' + email);
      if (!hash || !/^\d{6}$/.test(code) || !bcrypt.compareSync(code, hash)) return res.status(401).json({ error: 'Wrong or expired code.' });
      const uid = await db.get('soc:email:' + email);
      const user = uid && JSON.parse(await db.get('soc:user:' + uid) || 'null');
      if (!user) return res.status(401).json({ error: 'Wrong or expired code.' });
      user.passHash = bcrypt.hashSync(password, 10);
      await db.set('soc:user:' + user.id, JSON.stringify(user));
      await db.del('soc:reset:' + email);
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social reset:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/logout', async (req, res) => {
    const t = cookies(req).soc_sess;
    if (t) await db.del('soc:sess:' + t);
    clearSess(res);
    res.json({ ok: true });
  });

  api.get('/me', async (req, res) => {
    const u = await userFromReq(req);
    // backfill country for members who joined before geo existed
    if (u && !u.cc) {
      const geo = await geoFromIp(reqIp(req));
      if (geo && geo.cc) {
        u.country = geo.country; u.cc = geo.cc;
        if (!u.location) u.location = geoLabel(geo);
        await db.set('soc:user:' + u.id, JSON.stringify(u));
      }
    }
    res.json({ me: u ? pub(u) : null });
  });

  // ---- profile ----
  api.post('/profile', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const { bio, location } = req.body || {};
      if (bio !== undefined) u.bio = String(bio).slice(0, 200);
      if (location !== undefined) u.location = String(location).slice(0, 40);
      await db.set('soc:user:' + u.id, JSON.stringify(u));
      res.json({ me: pub(u) });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 }
  });
  api.post('/photo', (req, res) => {
    upload.single('photo')(req, res, async err => {
      try {
        if (err) return res.status(400).json({ error: 'Photo too large (max 2 MB).' });
        const u = await userFromReq(req);
        if (!u) return res.status(401).json({ error: 'Please log in.' });
        const f = req.file;
        if (!f) return res.status(400).json({ error: 'No photo received.' });
        const sig = f.buffer.slice(0, 12);
        const isJpg = sig[0] === 0xFF && sig[1] === 0xD8;
        const isPng = sig[0] === 0x89 && sig[1] === 0x50;
        const isWebp = sig.slice(8, 12).toString() === 'WEBP';
        if (!isJpg && !isPng && !isWebp) return res.status(400).json({ error: 'Use a JPG, PNG or WebP image.' });
        const ext = isJpg ? 'jpg' : isPng ? 'png' : 'webp';
        // remove any previous photo, then save under a fresh cache-busting name
        for (const old of fs.readdirSync(PHOTO_DIR)) if (old.startsWith(u.id + '.')) fs.unlinkSync(path.join(PHOTO_DIR, old));
        const fname = `${u.id}.${Date.now().toString(36)}.${ext}`;
        fs.writeFileSync(path.join(PHOTO_DIR, fname), f.buffer);
        u.photo = '/social-photos/' + fname;
        await db.set('soc:user:' + u.id, JSON.stringify(u));
        res.json({ me: pub(u) });
      } catch (e) { console.error('social photo:', e.message); res.status(500).json({ error: 'Upload failed.' }); }
    });
  });

  // ---- members wall ----
  api.get('/members', async (req, res) => {
    try {
      const ids = await db.smembers('soc:members');
      const out = [];
      for (const id of ids.slice(0, 500)) {
        const raw = await db.get('soc:user:' + id);
        if (raw) out.push(pub(JSON.parse(raw)));
      }
      out.sort((a, b) => b.createdAt - a.createdAt);
      res.json({ members: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  app.use('/api/social', api);
  app.use('/social-photos', express.static(PHOTO_DIR, { maxAge: '30d', immutable: true }));
  app.get('/social', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'social.html'));
  });

  console.log('social module: mounted');
}

module.exports = { mount };
