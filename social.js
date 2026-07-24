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
    },
    async srem(k, m) {
      if (redis) return redis.srem(k, m);
      const s = mem.get(k); if (s instanceof Set) s.delete(m);
    },
    async sismember(k, m) {
      if (redis) return (await redis.sismember(k, m)) === 1;
      const s = mem.get(k); return s instanceof Set && s.has(m);
    },
    async scard(k) {
      if (redis) return redis.scard(k);
      const s = mem.get(k); return s instanceof Set ? s.size : 0;
    },
    async exists(k) {
      if (redis) return (await redis.exists(k)) === 1;
      return mem.has(k);
    },
    async rpush(k, v) {
      if (redis) return redis.rpush(k, v);
      const l = Array.isArray(mem.get(k)) ? mem.get(k) : []; l.push(v); mem.set(k, l);
    },
    async lrange(k, a, b) {
      if (redis) return redis.lrange(k, a, b);
      const l = mem.get(k) || [];
      const from = a < 0 ? Math.max(0, l.length + a) : a;
      const to = b < 0 ? l.length + b : b;
      return l.slice(from, to + 1);
    },
    async ltrim(k, a, b) {
      if (redis) return redis.ltrim(k, a, b);
      const l = mem.get(k) || [];
      const from = a < 0 ? Math.max(0, l.length + a) : a;
      const to = b < 0 ? l.length + b : b;
      mem.set(k, l.slice(from, to + 1));
    },
    async incr(k) {
      if (redis) return redis.incr(k);
      const n = (parseInt(mem.get(k)) || 0) + 1; mem.set(k, String(n)); return n;
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
  const calcAge = birthdate => {
    if (!birthdate) return null;
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 && age < 150 ? age : null;
  };
  // 🔵 Founding members: everyone who joined in the first days gets a blue tick.
  // (Also honours a manual `verified: true` flag set directly on a user.)
  const FOUNDER_CUTOFF = Date.parse('2026-07-26T00:00:00Z');
  const isVerified = u => u.verified === true || (u.createdAt && u.createdAt < FOUNDER_CUTOFF);
  const pub = u => ({ id: u.id, name: u.name, bio: u.bio || '', location: u.location || '',
    country: u.country || '', cc: u.cc || '',
    photo: u.photo || null, createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0,
    age: calcAge(u.birthdate), birthdate: u.birthdate || null,
    verified: isVerified(u) });

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

  api.get('/config', (req, res) => res.json({ google: GOOGLE_CLIENT_ID, giphy: process.env.SOC_GIPHY_KEY || null }));

  // suggestion for the "your city" field, from the visitor's IP
  api.get('/geo', async (req, res) => {
    const g = await geoFromIp(reqIp(req));
    res.json({ suggestion: geoLabel(g) });
  });

  // ---- auth ----
  api.post('/signup', async (req, res) => {
    try {
      if (limited(req, 'su', 5)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      let { name, email, password, birthdate } = req.body || {};
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      birthdate = String(birthdate || '').trim();
      if (!/^[a-zA-Z0-9_ ]{3,15}$/.test(name)) return res.status(400).json({ error: 'Name: 3–15 letters, numbers or spaces.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 100) return res.status(400).json({ error: 'That email doesn\'t look right.' });
      if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return res.status(400).json({ error: 'Invalid birthdate format.' });
      if (await db.get('soc:email:' + email)) return res.status(409).json({ error: 'That email is already registered — try logging in.' });
      if (await db.get('soc:uname:' + name.toLowerCase())) return res.status(409).json({ error: 'That name is taken.' });
      const id = crypto.randomBytes(9).toString('hex');
      const geo = await geoFromIp(reqIp(req));
      const user = { id, name, email, passHash: bcrypt.hashSync(password, 10), bio: '', location: geoLabel(geo),
        country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
        birthdate: birthdate || null,
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
          birthdate: null,
          games: 0, wins: 0, createdAt: Date.now(), fresh: true };
        await db.set('soc:user:' + id, JSON.stringify(user));
        await db.set('soc:email:' + email, id);
        await db.set('soc:uname:' + name.toLowerCase(), id);
        await db.sadd('soc:members', id);
      } else if (!user.googleId) {
        user.googleId = g.sub; // link Google to the existing email account
        await db.set('soc:user:' + user.id, JSON.stringify(user));
      }
      // no photo yet? import their Google profile picture automatically
      if (!user.photo && g.picture) {
        try {
          const pu = String(g.picture).replace(/=s\d+(-c)?$/, '=s400-c');
          const pr = await fetch(pu);
          if (pr.ok) {
            const buf = Buffer.from(await pr.arrayBuffer());
            if (buf.length > 100 && buf.length < 3 * 1024 * 1024) {
              const ct = pr.headers.get('content-type') || '';
              const ext = ct.includes('png') ? 'png' : 'jpg';
              for (const old of fs.readdirSync(PHOTO_DIR)) if (old.startsWith(user.id + '.')) fs.unlinkSync(path.join(PHOTO_DIR, old));
              const fname = `${user.id}.${Date.now().toString(36)}.${ext}`;
              fs.writeFileSync(path.join(PHOTO_DIR, fname), buf);
              user.photo = '/social-photos/' + fname;
              await db.set('soc:user:' + user.id, JSON.stringify(user));
            }
          }
        } catch (e) { /* profile photo import is best-effort */ }
      }
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      res.json({ me: pub(user) });
    } catch (e) { console.error('social google:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- email via Brevo (BREVO_API_KEY env) with Resend as a fallback ----
  const BREVO_KEY = process.env.BREVO_API_KEY || null;
  const RESEND_KEY = process.env.SOC_RESEND_KEY || null;
  const MAIL_FROM = process.env.SOC_MAIL_FROM || 'WordSpies <onboarding@resend.dev>';
  const MAIL_NAME = process.env.SOC_MAIL_NAME || 'WordSpies';
  const MAIL_EMAIL = process.env.SOC_MAIL_EMAIL || 'sibghat726@gmail.com';
  async function sendMail(to, subject, text) {
    if (BREVO_KEY) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: MAIL_NAME, email: MAIL_EMAIL }, to: [{ email: to }], subject, textContent: text })
      });
      if (!r.ok) console.error('brevo:', r.status, await r.text());
      return r.ok;
    }
    if (RESEND_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text })
      });
      if (!r.ok) console.error('resend:', r.status, await r.text());
      return r.ok;
    }
    return false;
  }
  // one notification email per person per type per hour, and only when they're away
  async function notifyUser(uid, type, subject, text, skipIfOnline) {
    try {
      if (skipIfOnline && await db.exists('soc:online:' + uid)) return;
      if (await db.exists('soc:notified:' + uid + ':' + type)) return;
      const u = JSON.parse(await db.get('soc:user:' + uid) || 'null');
      if (!u || !u.email) return;
      await db.set('soc:notified:' + uid + ':' + type, '1', 3600);
      sendMail(u.email, subject, text).catch(e => console.error('notify mail:', e.message));
    } catch (e) { console.error('notify:', e.message); }
  }
  api.post('/forgot', async (req, res) => {
    try {
      if (limited(req, 'fp', 4)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const uid = await db.get('soc:email:' + email);
      if (!uid) return res.json({ ok: true }); // don't reveal which emails exist
      if (!BREVO_KEY && !RESEND_KEY) return res.status(503).json({ error: 'Password reset email isn\'t set up yet — if you signed up with this email on Google, use "Sign in with Google", or contact contact@wordspies.co.uk.' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.set('soc:reset:' + email, bcrypt.hashSync(code, 8), 900); // 15 min
      const ok = await sendMail(email, 'Your WordSpies reset code: ' + code,
        `Hi!\n\nYour WordSpies Social password reset code is: ${code}\n\nIt expires in 15 minutes. If you didn't ask for this, just ignore this email.\n\n— WordSpies`);
      if (!ok) return res.status(502).json({ error: 'Could not send the email — try again shortly.' });
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

  api.post('/deleteAccount', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });

      const uid = u.id;
      const email = u.email;
      const name = u.name;

      // Delete user profile data
      await db.del('soc:user:' + uid);
      await db.del('soc:email:' + email);
      await db.del('soc:uname:' + name.toLowerCase());
      await db.srem('soc:members', uid);

      // Untangle follows and conversations
      for (const o of await db.smembers('soc:following:' + uid)) await db.srem('soc:followers:' + o, uid);
      for (const o of await db.smembers('soc:followers:' + uid)) await db.srem('soc:following:' + o, uid);
      await db.del('soc:following:' + uid); await db.del('soc:followers:' + uid);
      for (const o of await db.smembers('soc:convos:' + uid)) {
        await db.srem('soc:convos:' + o, uid);
        await db.del('soc:msgs:' + [uid, o].sort().join(':'));
        await db.del('soc:unread:' + o + ':' + uid);
        await db.del('soc:unread:' + uid + ':' + o);
      }
      await db.del('soc:convos:' + uid);
      await db.del('soc:online:' + uid);

      // Delete photo files
      try {
        const photoFiles = fs.readdirSync(PHOTO_DIR);
        for (const f of photoFiles) {
          if (f.startsWith(uid + '.')) {
            fs.unlinkSync(path.join(PHOTO_DIR, f));
          }
        }
      } catch (e) {
        // Ignore file deletion errors
      }

      // Clear the current session
      const t = cookies(req).soc_sess;
      if (t) await db.del('soc:sess:' + t);
      clearSess(res);

      res.json({ ok: true });
    } catch (e) {
      console.error('social deleteAccount:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
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
      const { bio, location, birthdate } = req.body || {};
      if (bio !== undefined) u.bio = String(bio).slice(0, 200);
      if (location !== undefined) u.location = String(location).slice(0, 40);
      if (birthdate !== undefined) {
        const bd = String(birthdate).trim();
        if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'Invalid birthdate format.' });
        u.birthdate = bd || null;
      }
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
        if (raw) {
          const u = JSON.parse(raw);
          out.push({ ...pub(u), online: await db.exists('soc:online:' + u.id) });
        }
      }
      out.sort((a, b) => b.createdAt - a.createdAt);
      res.json({ members: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- presence: the app pings while open; a user is online while the key lives ----
  api.post('/ping', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await db.set('soc:online:' + u.id, '1', 60);
      let unread = 0;
      for (const o of await db.smembers('soc:convos:' + u.id)) {
        unread += parseInt(await db.get('soc:unread:' + u.id + ':' + o)) || 0;
      }
      res.json({ unread });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- follow ----
  api.get('/user/:id', async (req, res) => {
    try {
      const me = await userFromReq(req);
      const raw = await db.get('soc:user:' + String(req.params.id));
      if (!raw) return res.status(404).json({ error: 'Not found.' });
      const u = JSON.parse(raw);
      res.json({
        user: pub(u),
        online: await db.exists('soc:online:' + u.id),
        followers: await db.scard('soc:followers:' + u.id),
        following: await db.scard('soc:following:' + u.id),
        isFollowing: me ? await db.sismember('soc:following:' + me.id, u.id) : false
      });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/follow', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const id = String((req.body || {}).id || '');
      if (id === me.id || !(await db.get('soc:user:' + id))) return res.status(400).json({ error: 'Bad user.' });
      const already = await db.sismember('soc:followers:' + id, me.id);
      await db.sadd('soc:following:' + me.id, id);
      await db.sadd('soc:followers:' + id, me.id);
      if (!already) notifyUser(id, 'follow', '🎉 ' + me.name + ' started following you on WordSpies',
        `Hi!\n\n${me.name} just started following you on WordSpies Social.\n\nSee who's around: https://wordspies.co.uk/social\n\n— WordSpies`, false);
      res.json({ ok: true, followers: await db.scard('soc:followers:' + id) });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/unfollow', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const id = String((req.body || {}).id || '');
      await db.srem('soc:following:' + me.id, id);
      await db.srem('soc:followers:' + id, me.id);
      res.json({ ok: true, followers: await db.scard('soc:followers:' + id) });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- chat (direct messages, text or GIF) ----
  const cid = (a, b) => [a, b].sort().join(':');

  api.post('/message', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'msg', 40)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const to = String((req.body || {}).to || '');
      const kind = (req.body || {}).kind === 'gif' ? 'gif' : 'text';
      const text = String((req.body || {}).text || '').trim().slice(0, kind === 'gif' ? 300 : 500);
      if (!text || to === me.id || !(await db.get('soc:user:' + to))) return res.status(400).json({ error: 'Nothing to send.' });
      if (kind === 'gif' && !/^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(text)) return res.status(400).json({ error: 'Bad GIF.' });
      const msg = { f: me.id, k: kind, x: text, t: Date.now() };
      const key = 'soc:msgs:' + cid(me.id, to);
      await db.rpush(key, JSON.stringify(msg));
      await db.ltrim(key, -500, -1);
      await db.sadd('soc:convos:' + me.id, to);
      await db.sadd('soc:convos:' + to, me.id);
      await db.incr('soc:unread:' + to + ':' + me.id);
      notifyUser(to, 'msg', '💬 New message from ' + me.name + ' on WordSpies',
        `Hi!\n\n${me.name} sent you a message on WordSpies Social.\n\nRead and reply here: https://wordspies.co.uk/social\n\n— WordSpies`, true);
      res.json({ ok: true, msg });
    } catch (e) { console.error('social message:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.get('/chats', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const out = [];
      for (const o of await db.smembers('soc:convos:' + me.id)) {
        const raw = await db.get('soc:user:' + o);
        if (!raw) continue;
        const u = JSON.parse(raw);
        const last = await db.lrange('soc:msgs:' + cid(me.id, o), -1, -1);
        out.push({
          id: u.id, name: u.name, photo: u.photo || null, cc: u.cc || '',
          verified: isVerified(u),
          online: await db.exists('soc:online:' + o),
          last: last.length ? JSON.parse(last[0]) : null,
          unread: parseInt(await db.get('soc:unread:' + me.id + ':' + o)) || 0
        });
      }
      out.sort((a, b) => ((b.last && b.last.t) || 0) - ((a.last && a.last.t) || 0));
      res.json({ chats: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.get('/chat/:id', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const o = String(req.params.id);
      const raw = await db.get('soc:user:' + o);
      if (!raw) return res.status(404).json({ error: 'Not found.' });
      const u = JSON.parse(raw);
      const convo = cid(me.id, o);
      const msgs = (await db.lrange('soc:msgs:' + convo, -100, -1)).map(m => JSON.parse(m));
      await db.del('soc:unread:' + me.id + ':' + o);
      // mark how far I have read; report how far THEY have read (for ✓✓ seen ticks)
      await db.set('soc:read:' + convo + ':' + me.id, String(Date.now()));
      const theirRead = parseInt(await db.get('soc:read:' + convo + ':' + o)) || 0;
      res.json({
        user: { id: u.id, name: u.name, photo: u.photo || null, verified: isVerified(u), online: await db.exists('soc:online:' + o) },
        messages: msgs,
        theirRead
      });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- game tracking (called by the game module) ----
  // Look up user by social session token to get their ID
  api.post('/linkPlayer', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Not logged in.' });
      res.json({ userId: u.id, name: u.name });
    } catch (e) {
      console.error('social linkPlayer:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Record game results: POST /api/social/recordGame { playerIds: [id1, id2...], winnerId: id, team: 'red'|'blue' }
  // playerIds: list of social user IDs who participated
  // winnerId: the ID of the winning player (for solo/leaderboard games) OR
  // team: the winning team (for team games); all players on winning team get +1 win
  api.post('/recordGame', async (req, res) => {
    try {
      let { playerIds, winnerId, winningTeam } = req.body || {};
      playerIds = Array.isArray(playerIds) ? playerIds : [];

      if (playerIds.length === 0) return res.status(400).json({ error: 'No players provided.' });

      // Increment game count for all players
      for (const uid of playerIds) {
        const raw = await db.get('soc:user:' + uid);
        if (raw) {
          const user = JSON.parse(raw);
          user.games = (user.games || 0) + 1;
          // Check if this player won
          const won = winnerId === uid || (winningTeam && user.lastTeam === winningTeam);
          if (won) {
            user.wins = (user.wins || 0) + 1;
          }
          await db.set('soc:user:' + uid, JSON.stringify(user));
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('social recordGame:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
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
