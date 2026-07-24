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

  async function userFromReq(req) {
    const t = cookies(req).soc_sess;
    if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
    const uid = await db.get('soc:sess:' + t);
    if (!uid) return null;
    const raw = await db.get('soc:user:' + uid);
    return raw ? JSON.parse(raw) : null;
  }
  const pub = u => ({ id: u.id, name: u.name, bio: u.bio || '', location: u.location || '',
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
      const user = { id, name, email, passHash: bcrypt.hashSync(password, 10), bio: '', location: '', photo: null,
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
      if (!user || !bcrypt.compareSync(password, user.passHash)) return res.status(401).json({ error: 'Wrong email or password.' });
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social login:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/logout', async (req, res) => {
    const t = cookies(req).soc_sess;
    if (t) await db.del('soc:sess:' + t);
    clearSess(res);
    res.json({ ok: true });
  });

  api.get('/me', async (req, res) => {
    const u = await userFromReq(req);
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
