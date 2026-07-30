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
const VOICE_DIR = process.env.SOC_VOICE   || path.join(__dirname, 'social-voice');
// "Continue with Google": set SOC_GOOGLE_CLIENT_ID in the service environment
// to switch the button on. Without it, email sign-up still works fine.
const GOOGLE_CLIENT_ID = process.env.SOC_GOOGLE_CLIENT_ID || null;

function mount(app, redis) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.mkdirSync(VOICE_DIR, { recursive: true });

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
    async lset(k, i, v) {
      if (redis) return redis.lset(k, i, v);
      const l = mem.get(k); if (Array.isArray(l) && i >= 0 && i < l.length) l[i] = v;
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

  // 👑 Kings — the people who were here from the start, by name. They get a crown
  // instead of the blue tick, because a tick everyone else also has says nothing.
  // Matched on the display name, lowercased and trimmed, so it lands the moment
  // they sign up rather than needing their account to exist first. A `king: true`
  // set directly on a user works too, if you ever want to crown someone by hand.
  const KINGS = new Set(['ayoub', 'xman', 'ali', 'pray', 'dem', 'sibi', 'rami', 'earlin', 'ana', 'karina']);
  const isKing = u => u.king === true || KINGS.has(String(u.name || '').trim().toLowerCase());

  // A king's crown replaces the tick rather than sitting beside it — two badges on
  // one name is noise, and the crown is the rarer thing.
  const marks = u => ({ king: isKing(u), verified: isKing(u) ? false : isVerified(u) });

  const pub = u => ({ id: u.id, name: u.name, bio: u.bio || '', location: u.location || '',
    country: u.country || '', cc: u.cc || '',
    photo: u.photo || null, createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0,
    age: calcAge(u.birthdate), birthdate: u.birthdate || null,
    ...marks(u) });

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

  // 🔁 Sliding sessions — stay logged in for as long as you keep coming back.
  // The 90 days used to be counted from the moment you signed in and never
  // moved, so someone who played every single day was still thrown out on day
  // 90 for no reason. Now every visit pushes the expiry back to a full 90 days
  // from today: you only ever get logged out after 90 days of real silence.
  //
  // Both halves have to move together — the cookie in the browser and the
  // token record in Redis — otherwise one outlives the other and the session
  // dies early anyway. We do it at most once a day per session (a cheap marker
  // key with a 1-day TTL) so a chatty page doing twenty calls a minute doesn't
  // rewrite the session twenty times a minute.
  api.use(async (req, res, next) => {
    try {
      const t = cookies(req).soc_sess;
      if (t && /^[a-f0-9]{48}$/.test(t) && !(await db.exists('soc:sessrf:' + t))) {
        const uid = await db.get('soc:sess:' + t);
        if (uid) {
          await db.set('soc:sess:' + t, uid, SESS_TTL);   // no `expire` in the db shim — re-set to refresh
          await db.set('soc:sessrf:' + t, '1', 60 * 60 * 24);
          setSess(res, t);
        }
      }
    } catch (e) { /* never let a refresh failure block the actual request */ }
    next();
  });

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
  async function sendMail(to, subject, text, html) {
    if (BREVO_KEY) {
      const payload = { sender: { name: MAIL_NAME, email: MAIL_EMAIL }, to: [{ email: to }], subject, textContent: text };
      if (html) payload.htmlContent = html;
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) console.error('brevo:', r.status, await r.text());
      return r.ok;
    }
    if (RESEND_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(html ? { from: MAIL_FROM, to: [to], subject, text, html }
                                  : { from: MAIL_FROM, to: [to], subject, text })
      });
      if (!r.ok) console.error('resend:', r.status, await r.text());
      return r.ok;
    }
    return false;
  }

  // ---- 💌 the look of our email ---------------------------------------------
  // Tables and inline styles, because Gmail and Outlook throw away stylesheets.
  // One logo, one line, one button — nothing to read, just something to tap.
  const SITE = 'https://wordspies.co.uk';
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // `peek` is the grey line a phone shows under the subject. It never renders
  // in the body — it just decides whether the notification is worth opening.
  function mailHtml({ peek, heading, line, btn, btnUrl, code, note }) {
    const cell = 'font-family:' + FONT + ';';
    const action = code
      ? `<div style="${cell}display:inline-block;background:#fafafa;border:1px solid #ececef;border-radius:14px;padding:16px 28px;font-size:30px;font-weight:700;letter-spacing:7px;color:#16181f">${esc(code)}</div>`
      : `<a href="${btnUrl}" style="${cell}display:inline-block;background:#e8506b;color:#ffffff;font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:15px 34px;border-radius:999px">${btn}</a>`;
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#fafafa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(peek)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa">
<tr><td align="center" style="padding:34px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#ffffff;border:1px solid #ececef;border-radius:20px">
<tr><td align="center" style="padding:36px 32px 0">
<img src="${SITE}/icon-192.png" width="58" height="58" alt="WordSpies" style="display:block;border:0;border-radius:15px"></td></tr>
<tr><td align="center" style="${cell}padding:22px 32px 0;font-size:22px;line-height:1.25;font-weight:700;color:#16181f;letter-spacing:-.2px">${heading}</td></tr>
<tr><td align="center" style="${cell}padding:10px 32px 0;font-size:15px;line-height:1.55;color:#5c6270">${line}</td></tr>
<tr><td align="center" style="padding:26px 32px 0">${action}</td></tr>
<tr><td align="center" style="${cell}padding:20px 32px 34px;font-size:12px;line-height:1.5;color:#9aa0ab">${note || ''}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px">
<tr><td align="center" style="${cell}padding:18px 8px 0;font-size:12px;color:#9aa0ab">
WordSpies · <a href="${SITE}" style="color:#9aa0ab;text-decoration:none">wordspies.co.uk</a></td></tr>
</table>
</td></tr></table></body></html>`;
  }

  // an email every time, as long as they're not already in the app
  async function notifyUser(uid, type, subject, text, skipIfOnline, html) {
    try {
      if (skipIfOnline && await db.exists('soc:online:' + uid)) return;
      const u = JSON.parse(await db.get('soc:user:' + uid) || 'null');
      if (!u || !u.email) return;
      sendMail(u.email, subject, text, html).catch(e => console.error('notify mail:', e.message));
    } catch (e) { console.error('notify:', e.message); }
  }

  // ---- 📣 web push ----------------------------------------------------------
  // Real push, so a message or a new follower reaches you with the app shut.
  //
  // Two decisions worth explaining. First, the server makes its own VAPID
  // keypair on first boot and keeps it in the database — the same idea as an
  // SSH host key. Nobody has to generate one by hand or paste it into a config
  // file, and it survives restarts because it's stored, not regenerated.
  //
  // Second, we send *payload-less* pushes. Encrypting a payload means pulling
  // in a crypto dependency and getting aes128gcm exactly right; instead the
  // push is an empty knock, and the service worker asks us what it was about.
  // The wording never sits in a third party's queue, which is nicer anyway.
  const b64u = b => Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const VAPID_SUB = 'mailto:' + (process.env.SOC_MAIL_FROM || 'contact@wordspies.co.uk').replace(/^.*<|>.*$/g, '');
  let VAPID = null;
  async function vapidKeys() {
    if (VAPID) return VAPID;
    const raw = await db.get('soc:vapid');
    if (raw) { VAPID = JSON.parse(raw); return VAPID; }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const der = publicKey.export({ type: 'spki', format: 'der' });
    VAPID = {
      pub: b64u(der.subarray(der.length - 65)),          // the raw uncompressed point is the tail of the SPKI
      priv: privateKey.export({ type: 'pkcs8', format: 'pem' })
    };
    await db.set('soc:vapid', JSON.stringify(VAPID));
    return VAPID;
  }
  function vapidAuth(endpoint, v) {
    const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const body = b64u(JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: VAPID_SUB
    }));
    // push services want the raw r||s pair, not the DER wrapper Node defaults to
    const sig = b64u(crypto.sign('sha256', Buffer.from(head + '.' + body),
      { key: v.priv, dsaEncoding: 'ieee-p1363' }));
    return `vapid t=${head}.${body}.${sig}, k=${v.pub}`;
  }
  // Which screen is which. Presence used to be a single flag per account, so a
  // laptop tab left open all day silenced the phone in your pocket — nobody was
  // looking at either, and nothing ever buzzed. Each open page now reports the
  // push endpoint it owns, and only that one endpoint goes quiet, and only
  // while the page is genuinely on screen.
  const epKey = ep => 'soc:at:' + crypto.createHash('sha1').update(ep).digest('hex').slice(0, 20);

  async function sendPush(uid, kind, title, body, url) {
    try {
      const eps = await db.smembers('soc:push:' + uid);
      if (!eps.length) return;
      const live = [];
      for (const ep of eps) if (!(await db.exists(epKey(ep)))) live.push(ep);
      if (!live.length) return;   // every screen they own is already in front of them
      const v = await vapidKeys();
      // what the knock was about — the worker collects this in a moment
      await db.set('soc:pushq:' + uid, JSON.stringify({ kind, title, body, url }), 600);
      for (const ep of live) {
        try {
          const r = await fetch(ep, {
            method: 'POST',
            headers: { Authorization: vapidAuth(ep, v), TTL: '900', Urgency: 'normal' }
          });
          // the browser threw this subscription away — stop writing to it
          if (r.status === 404 || r.status === 410) await db.srem('soc:push:' + uid, ep);
          else if (!r.ok) console.error('push:', r.status, (await r.text()).slice(0, 120));
        } catch (e) { console.error('push send:', e.message); }
      }
    } catch (e) { console.error('push:', e.message); }
  }

  api.get('/push/key', async (req, res) => {
    try { res.json({ key: (await vapidKeys()).pub }); }
    catch (e) { res.json({ key: null }); }
  });
  api.post('/push/subscribe', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const ep = String((req.body || {}).endpoint || '');
      if (!/^https:\/\/[^\s]{10,900}$/.test(ep)) return res.status(400).json({ error: 'Bad subscription.' });
      await db.sadd('soc:push:' + u.id, ep);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });
  api.post('/push/unsubscribe', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await db.srem('soc:push:' + u.id, String((req.body || {}).endpoint || ''));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });
  // the service worker calls this the instant a push lands, to find out what to say
  api.get('/push/peek', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.json({ n: null });
      const raw = await db.get('soc:pushq:' + u.id);
      if (raw) await db.del('soc:pushq:' + u.id);
      res.json({ n: raw ? JSON.parse(raw) : null });
    } catch (e) { res.json({ n: null }); }
  });
  api.post('/forgot', async (req, res) => {
    try {
      if (limited(req, 'fp', 4)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const uid = await db.get('soc:email:' + email);
      if (!uid) return res.json({ ok: true }); // don't reveal which emails exist
      if (!BREVO_KEY && !RESEND_KEY) return res.status(503).json({ error: 'Password reset email isn\'t set up yet — if you signed up with this email on Google, use "Sign in with Google", or contact contact@wordspies.co.uk.' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.set('soc:reset:' + email, bcrypt.hashSync(code, 8), 900); // 15 min
      const ok = await sendMail(email, code + ' is your WordSpies code',
        `Your WordSpies password reset code is ${code}.\n\nIt expires in 15 minutes. If you didn't ask for this, just ignore this email.\n\n— WordSpies`,
        mailHtml({
          peek: 'Expires in 15 minutes.',
          heading: 'Your reset code',
          line: 'Type this into WordSpies to set a new password.',
          code,
          note: 'Expires in 15 minutes. If you didn\'t ask for this, ignore this email — nothing has changed.'
        }));
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
      const { name, bio, location, birthdate } = req.body || {};

      // Your name is your identity here — it's on the wall, in every chat and on
      // the scoreboard — so changing it is allowed but it moves the uniqueness
      // index with it, otherwise the old name would stay reserved forever and
      // someone else could claim the new one at the same moment.
      if (name !== undefined) {
        const nm = String(name).trim();
        if (nm !== u.name) {
          if (limited(req, 'rename', 6)) return res.status(429).json({ error: 'Too many changes — wait a minute.' });
          if (!/^[a-zA-Z0-9_ ]{3,15}$/.test(nm)) return res.status(400).json({ error: 'Name: 3–15 letters, numbers or spaces.' });
          if (nm.toLowerCase() !== u.name.toLowerCase()) {
            const holder = await db.get('soc:uname:' + nm.toLowerCase());
            if (holder && holder !== u.id) return res.status(409).json({ error: 'That name is taken.' });
            await db.del('soc:uname:' + u.name.toLowerCase());
            await db.set('soc:uname:' + nm.toLowerCase(), u.id);
          }
          u.name = nm;                        // same letters, new capitals is fine too
        }
      }

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
  // Voice messages in DMs. Client records a short opus/webm blob (60 s max),
  // POSTs it here as multipart form-data, we save under /social-voice with a
  // random name, return the URL. Client then sends /message with kind:'voice'
  // and text set to that URL.
  const voiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 }
  });
  api.post('/message/voice', (req, res) => {
    voiceUpload.single('clip')(req, res, async err => {
      try {
        if (err) return res.status(400).json({ error: 'Voice clip too large (max 3 MB).' });
        const u = await userFromReq(req);
        if (!u) return res.status(401).json({ error: 'Please log in.' });
        if (limited(req, 'vmsg', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(400).json({ error: 'No audio received.' });
        // Sniff the container so we don't happily accept an executable renamed
        // "clip.webm". Only webm (EBML), ogg, mp4, m4a survive.
        const b = f.buffer;
        const isWebm  = b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3;
        const isOgg   = b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
        const isMp4   = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // 'ftyp' at offset 4
        if (!isWebm && !isOgg && !isMp4) return res.status(400).json({ error: 'Unsupported audio format.' });
        const ext = isWebm ? 'webm' : isOgg ? 'ogg' : 'm4a';
        const fname = u.id + '.' + Date.now().toString(36) + '.' + crypto.randomBytes(3).toString('hex') + '.' + ext;
        fs.writeFileSync(path.join(VOICE_DIR, fname), b);
        res.json({ url: '/social-voice/' + fname });
      } catch (e) { console.error('social voice:', e.message); res.status(500).json({ error: 'Upload failed.' }); }
    });
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
      // the wall's Follow buttons need to know who you already follow
      const me = await userFromReq(req);
      res.json({ members: out, following: me ? await db.smembers('soc:following:' + me.id) : [] });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- presence: the app pings while open; a user is online while the key lives ----
  api.post('/ping', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await db.set('soc:online:' + u.id, '1', 60);
      // ...and, separately, whether *this* screen is the one being looked at.
      // Old clients send no body at all; they simply never claim a screen, so
      // they keep getting push, which is the safe way round to be wrong.
      const b = req.body || {};
      const ep = String(b.endpoint || '');
      if (ep) {
        if (b.visible === false) await db.del(epKey(ep));
        else await db.set(epKey(ep), '1', 90);
      }
      let unread = 0;
      for (const o of await db.smembers('soc:convos:' + u.id)) {
        unread += parseInt(await db.get('soc:unread:' + u.id + ':' + o)) || 0;
      }
      res.json({ unread, followers: await db.scard('soc:followers:' + u.id) });
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
      if (!already) {
        notifyUser(id, 'follow', me.name + ' started following you',
          `${me.name} started following you on WordSpies.\n\nSee who it is: ${SITE}/social\n\n— WordSpies`, true,
          mailHtml({
            peek: 'Say hello, or follow them back.',
            heading: 'New follower',
            line: '<b style="color:#16181f">' + esc(me.name) + '</b> started following you on WordSpies.',
            btn: 'See who it is', btnUrl: SITE + '/social',
            note: 'We only send these when you\'re not already in the app.'
          }));
        sendPush(id, 'follow', '👋 New follower', me.name + ' started following you', '/social');
      }
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

  // ---- 👥 invite friends -------------------------------------------------
  // The people you can pull into a game: anyone you follow, anyone who follows
  // you, and anyone you've ever chatted with. That last group matters — you
  // often play with someone before either of you gets round to following.
  async function inviteCircle(meId) {
    const ids = new Set();
    for (const key of ['soc:following:', 'soc:followers:', 'soc:convos:']) {
      for (const id of await db.smembers(key + meId)) if (id !== meId) ids.add(id);
    }
    return ids;
  }

  api.get('/people', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const [following, followers, convos] = await Promise.all([
        db.smembers('soc:following:' + me.id),
        db.smembers('soc:followers:' + me.id),
        db.smembers('soc:convos:' + me.id)
      ]);
      const fset = new Set(following), rset = new Set(followers), cset = new Set(convos);
      const ids = [...new Set([...following, ...followers, ...convos])].filter(id => id !== me.id);

      const out = [];
      for (const id of ids.slice(0, 300)) {
        const raw = await db.get('soc:user:' + id);
        if (!raw) continue;                       // deleted account — skip quietly
        const u = JSON.parse(raw);
        // When we last spoke, so recent chats float to the top of the list
        let lastAt = 0;
        if (cset.has(id)) {
          const last = await db.lrange('soc:msgs:' + cid(me.id, id), -1, -1);
          if (last.length) { try { lastAt = JSON.parse(last[0]).t || 0; } catch (e) {} }
        }
        out.push({
          id: u.id, name: u.name, photo: u.photo || null, cc: u.cc || '',
          ...marks(u),
          online: await db.exists('soc:online:' + u.id),
          // what they are to you — the panel shows this under the name
          rel: fset.has(id) && rset.has(id) ? 'friend'
             : rset.has(id) ? 'follows you'
             : fset.has(id) ? 'you follow'
             : 'chatted',
          lastAt
        });
      }
      // Online first, then whoever you spoke to most recently, then A–Z.
      out.sort((a, b) =>
        (b.online ? 1 : 0) - (a.online ? 1 : 0) ||
        b.lastAt - a.lastAt ||
        a.name.localeCompare(b.name));
      res.json({ people: out });
    } catch (e) { console.error('social people:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Drop the invite link into each person's chat. The chat renders
  // /play?room=CODE as a Join button already, so the text doubles as a one-tap
  // entry into the game. Anyone who isn't in the app right now also gets a
  // push and an email — a game only starts if people actually turn up.
  api.post('/invite', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'invite', 12)) return res.status(429).json({ error: 'Slow down a little ✋' });

      const body = req.body || {};
      const code = String(body.code || '').toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) return res.status(400).json({ error: 'No game to invite to.' });
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 20);
      if (!ids.length) return res.status(400).json({ error: 'Pick someone first.' });

      // Which game is being invited to. Default stays WordSpies for old callers.
      // Anything unknown falls back to WordSpies so a typo can't 500.
      const GAMES = {
        wordspies: { path: '/codenames', icon: '🎮', label: 'WordSpies' },
        spy:       { path: '/spy',       icon: '🕵️', label: 'Who is the Spy?' },
        ludo:      { path: '/ludo',      icon: '🎲', label: 'Ludo' },
        four:      { path: '/four',      icon: '🔴', label: 'Connect 4' },
        pool:      { path: '/pool',      icon: '🎱', label: '8-Ball Pool' },
        meld:      { path: '/meld',      icon: '🧠', label: 'Mind Meld' }
      };
      const gKey = String(body.game || 'wordspies').toLowerCase();
      const g = GAMES[gKey] || GAMES.wordspies;

      // You can only invite your own circle. Without this the endpoint would be
      // a way to message any member on the site, follow or no follow.
      const circle = await inviteCircle(me.id);
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'wordspies.co.uk').split(',')[0].trim();
      const link = proto + '://' + host + g.path + '?room=' + code;
      const sent = [];

      for (const to of ids) {
        if (!circle.has(to)) continue;
        const raw = await db.get('soc:user:' + to);
        if (!raw) continue;
        const msg = { f: me.id, k: 'text', x: g.icon + ' Come play ' + g.label + ' with me! ' + link, t: Date.now() };
        const key = 'soc:msgs:' + cid(me.id, to);
        await db.rpush(key, JSON.stringify(msg));
        await db.ltrim(key, -500, -1);
        await db.sadd('soc:convos:' + me.id, to);
        await db.sadd('soc:convos:' + to, me.id);
        await db.incr('soc:unread:' + to + ':' + me.id);
        notifyUser(to, 'invite', me.name + ' invited you to a game',
          `${me.name} invited you to a game of ${g.label}.\n\nJoin them: ${link}\n\n— WordSpies`, true,
          mailHtml({
            peek: 'They\'re waiting for you — tap to join.',
            heading: 'Game invite',
            line: '<b style="color:#16181f">' + esc(me.name) + '</b> invited you to a game of <b>' + esc(g.label) + '</b>.',
            btn: 'Join the game', btnUrl: link,
            note: 'We only send these when you\'re not already in the app.'
          }));
        sendPush(to, 'invite', g.icon + ' ' + me.name + ' invited you',
          'Tap to join ' + g.label, g.path + '?room=' + code);
        sent.push(to);
      }
      res.json({ ok: true, sent: sent.length, ids: sent });
    } catch (e) { console.error('social invite:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/message', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'msg', 40)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const to = String((req.body || {}).to || '');
      // Text, GIF, and now voice — voice payloads carry the /social-voice URL
      // returned by /message/voice below, plus an optional duration hint.
      const kRaw = (req.body || {}).kind;
      const kind = kRaw === 'gif' ? 'gif' : kRaw === 'voice' ? 'voice' : 'text';
      const text = String((req.body || {}).text || '').trim().slice(0, kind === 'gif' ? 300 : kind === 'voice' ? 200 : 500);
      if (!text || to === me.id || !(await db.get('soc:user:' + to))) return res.status(400).json({ error: 'Nothing to send.' });
      if (kind === 'gif' && !/^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(text)) return res.status(400).json({ error: 'Bad GIF.' });
      if (kind === 'voice' && !/^\/social-voice\/[a-zA-Z0-9._-]+\.(webm|ogg|mp4|m4a)$/.test(text)) return res.status(400).json({ error: 'Bad voice message.' });
      // Short random id per message so edits / deletes / reactions have something
      // stable to reference. Older messages that predate this field still work by
      // falling back to their timestamp on the lookup side.
      const id = crypto.randomBytes(6).toString('base64url');
      const msg = { id, f: me.id, k: kind, x: text, t: Date.now() };
      // voice messages carry a duration hint so the bubble can render "0:14"
      // next to the play button without the client fetching the audio to
      // measure it. Stored as `vd` because `d` is already used as the
      // tombstone flag for deleted messages — two very different meanings.
      if (kind === 'voice') {
        const d = Math.max(0, Math.min(60, Math.round(+(req.body || {}).d || 0)));
        if (d) msg.vd = d;
      }
      // Optional reply-to: only store the id if the message being quoted really
      // exists in this conversation, otherwise silently drop it.
      const replyTo = String((req.body || {}).reply || '').slice(0, 24);
      const key = 'soc:msgs:' + cid(me.id, to);
      if (replyTo) {
        const recent = await db.lrange(key, -80, -1);
        for (const raw of recent) {
          try {
            const m = JSON.parse(raw);
            if ((m.id && m.id === replyTo) || String(m.t) === replyTo) {
              msg.q = m.id || String(m.t);
              // stash a tiny preview so the client can render the reply strip
              // without needing to walk the thread for every message
              msg.qp = { f: m.f, k: m.k, x: (m.k === 'gif' ? '🖼 GIF' : String(m.x || '').slice(0, 80)) };
              break;
            }
          } catch (e) {}
        }
      }
      await db.rpush(key, JSON.stringify(msg));
      await db.ltrim(key, -500, -1);
      // typing indicator is only meaningful up to the moment you actually send
      await db.del('soc:typing:' + me.id + ':' + to);
      await db.sadd('soc:convos:' + me.id, to);
      await db.sadd('soc:convos:' + to, me.id);
      await db.incr('soc:unread:' + to + ':' + me.id);
      notifyUser(to, 'msg', me.name + ' sent you a message',
        `${me.name} sent you a message on WordSpies.\n\nRead and reply: ${SITE}/social#chat=${me.id}\n\n— WordSpies`, true,
        mailHtml({
          peek: 'Tap to read and reply on WordSpies.',
          heading: 'New message',
          line: '<b style="color:#16181f">' + esc(me.name) + '</b> sent you a message on WordSpies.',
          btn: 'Check message', btnUrl: SITE + '/social#chat=' + me.id,
          note: 'We only send these when you\'re not already in the app.'
        }));
      // sendPush decides per device: whichever screen they're actually looking
      // at stays quiet, every other one buzzes
      sendPush(to, 'msg', '💬 ' + me.name,
        kind === 'text' ? text.slice(0, 120)
          : kind === 'gif' ? 'Sent a GIF'
          : kind === 'voice' ? '🎤 Sent a voice message'
          : 'Sent you something',
        '/social#chat=' + me.id);
      res.json({ ok: true, msg });
    } catch (e) { console.error('social message:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Walk the tail of a chat's message list looking for one specific id.
  // Returns { idx, msg } (idx is the absolute list index for LSET), or null.
  async function findMsg(key, id) {
    const all = await db.lrange(key, 0, -1);
    for (let i = all.length - 1; i >= 0; i--) {
      try {
        const m = JSON.parse(all[i]);
        if ((m.id && m.id === id) || String(m.t) === id) return { idx: i, msg: m };
      } catch (e) {}
    }
    return null;
  }

  // Edit your own text message. WhatsApp-style 15-minute window; the bubble
  // gets an "edited" mark on the client via the `e` timestamp we set here.
  api.post('/message/edit', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'msgedit', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const body = req.body || {};
      const to = String(body.to || '');
      const id = String(body.id || '').slice(0, 24);
      const text = String(body.text || '').trim().slice(0, 500);
      if (!to || !id || !text) return res.status(400).json({ error: 'Nothing to edit.' });
      const key = 'soc:msgs:' + cid(me.id, to);
      const hit = await findMsg(key, id);
      if (!hit) return res.status(404).json({ error: 'Message is gone.' });
      const m = hit.msg;
      if (m.f !== me.id) return res.status(403).json({ error: 'Not your message.' });
      if (m.d) return res.status(400).json({ error: 'That message was deleted.' });
      if (m.k !== 'text') return res.status(400).json({ error: 'Only text can be edited.' });
      if (Date.now() - (m.t || 0) > 15 * 60 * 1000) return res.status(400).json({ error: 'Too old to edit.' });
      m.x = text; m.e = Date.now();
      await db.lset(key, hit.idx, JSON.stringify(m));
      res.json({ ok: true, msg: m });
    } catch (e) { console.error('social edit:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Delete for everyone — replaces the message content with a tombstone that
  // both sides render as "message deleted", instead of physically removing the
  // list entry (which would shift indices and break the id-based lookups).
  api.post('/message/delete', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'msgdel', 40)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const body = req.body || {};
      const to = String(body.to || '');
      const id = String(body.id || '').slice(0, 24);
      if (!to || !id) return res.status(400).json({ error: 'Nothing to delete.' });
      const key = 'soc:msgs:' + cid(me.id, to);
      const hit = await findMsg(key, id);
      if (!hit) return res.status(404).json({ error: 'Message is gone.' });
      const m = hit.msg;
      if (m.f !== me.id) return res.status(403).json({ error: 'Not your message.' });
      m.d = 1; m.x = ''; m.r = null; m.qp = null; m.e = 0;
      await db.lset(key, hit.idx, JSON.stringify(m));
      res.json({ ok: true });
    } catch (e) { console.error('social delete:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Toggle an emoji reaction on any message in a chat you're a party to. The
  // reaction store is { emoji: [userIds] } — small enough to render everywhere,
  // capped so no one can turn a bubble into a wall of emoji.
  api.post('/message/react', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'msgreact', 60)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const body = req.body || {};
      const to = String(body.to || '');
      const id = String(body.id || '').slice(0, 24);
      const emo = String(body.emoji || '').trim().slice(0, 8);
      if (!to || !id || !emo) return res.status(400).json({ error: 'Nothing to react to.' });
      const key = 'soc:msgs:' + cid(me.id, to);
      const hit = await findMsg(key, id);
      if (!hit) return res.status(404).json({ error: 'Message is gone.' });
      const m = hit.msg;
      if (m.d) return res.status(400).json({ error: 'That message was deleted.' });
      const r = m.r && typeof m.r === 'object' ? m.r : {};
      const list = Array.isArray(r[emo]) ? r[emo] : [];
      const i = list.indexOf(me.id);
      if (i >= 0) list.splice(i, 1); else list.push(me.id);
      if (list.length) r[emo] = list; else delete r[emo];
      // Keep reactions bounded so a message can never grow unreasonably large.
      const keys = Object.keys(r);
      if (keys.length > 6) delete r[keys[0]];
      m.r = Object.keys(r).length ? r : null;
      await db.lset(key, hit.idx, JSON.stringify(m));
      res.json({ ok: true, r: m.r });
    } catch (e) { console.error('social react:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // "I'm typing" — a 5-second TTL flag so the other end can render dots while
  // your reply is still forming. Cheap and self-clearing; sendMessage clears it.
  api.post('/typing', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const to = String((req.body || {}).to || '');
      if (!to || to === me.id) return res.json({ ok: true });
      await db.set('soc:typing:' + me.id + ':' + to, '1', 5);
      res.json({ ok: true });
    } catch (e) { res.json({ ok: true }); }
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
          ...marks(u),
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
      const theirTyping = await db.exists('soc:typing:' + o + ':' + me.id);
      res.json({
        user: { id: u.id, name: u.name, photo: u.photo || null, ...marks(u), online: await db.exists('soc:online:' + o) },
        messages: msgs,
        theirRead,
        theirTyping: !!theirTyping
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
  app.use('/social-voice',  express.static(VOICE_DIR, { maxAge: '30d', immutable: true }));
  app.get('/social', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'social.html'));
  });

  console.log('social module: mounted');

  // Called by the game server when a match ends: winners/losers are social
  // profile ids. Everyone gets +1 game played; winners also get +1 win.
  async function recordResult(winnerIds, loserIds) {
    for (const uid of [...winnerIds, ...loserIds]) {
      try {
        const raw = await db.get('soc:user:' + uid);
        if (!raw) continue;
        const u = JSON.parse(raw);
        u.games = (u.games || 0) + 1;
        if (winnerIds.includes(uid)) u.wins = (u.wins || 0) + 1;
        await db.set('soc:user:' + uid, JSON.stringify(u));
      } catch (e) { console.error('recordResult user:', e.message); }
    }
  }
  // Called by the game server when someone arrives with a Social session
  // cookie: hand back just enough of their profile to seat them without
  // asking for a name. Never throws — the game must work if this fails.
  async function profileByUid(uid) {
    if (!uid) return null;
    try {
      const raw = await db.get('soc:user:' + uid);
      if (!raw) return null;
      const u = JSON.parse(raw);
      return { id: u.id, name: u.name || null, photo: u.photo || null };
    } catch (e) {
      console.error('profileByUid:', e.message);
      return null;
    }
  }

  // Session cookie → uid, resolved through *this* module's store rather than
  // the game server reading redis directly. Without this, a deployment with no
  // REDIS_URL logs people in fine over HTTP (the fallback store holds the
  // session) while every socket sees them as an anonymous guest — so their wins
  // are never credited and the failure is completely silent.
  async function uidBySession(token) {
    if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
    try { return await db.get('soc:sess:' + token); }
    catch (e) { console.error('uidBySession:', e.message); return null; }
  }

  return { recordResult, profileByUid, uidBySession, inviteCircle, sendPush };
}

module.exports = { mount };
