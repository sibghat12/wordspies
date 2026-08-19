// TalkSibi Social — community module (accounts, profiles, photos).
// Entirely separate from the game: own routes (/social, /api/social/*),
// own data keys (soc:*), own page (public/social.html). The game never
// depends on anything in this file; if it fails to load, the game runs on.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
// Anthropic SDK loaded lazily so the module still works if the dep is
// missing on a fresh clone. AI features silently disable without it.
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); }
catch (e) { /* AI features off */ }

const SESS_TTL = 60 * 60 * 24 * 90; // 90 days
const PHOTO_DIR = process.env.SOC_PHOTOS || path.join(__dirname, 'social-photos');
const VOICE_DIR = process.env.SOC_VOICE   || path.join(__dirname, 'social-voice');
const IMAGE_DIR = process.env.SOC_IMAGES  || path.join(__dirname, 'social-images');
// TTS cache — every unique {text, lang, voice} hits ElevenLabs at most
// once site-wide. Files land under /opt/wordspies/tts-cache/<sha>.mp3
// in prod. LRU-evicted when total size exceeds TTS_CACHE_MAX_MB (500MB
// default). Per-user daily unique-text cap gates the write path too.
// See /api/social/tts below.
const TTS_CACHE_DIR = process.env.SOC_TTS_CACHE || path.join(__dirname, 'tts-cache');
const TTS_CACHE_MAX_MB = parseInt(process.env.TTS_CACHE_MAX_MB || '500', 10);
const TTS_CACHE_MAX_BYTES = TTS_CACHE_MAX_MB * 1024 * 1024;
const TTS_USER_DAILY_LIMIT = parseInt(process.env.TTS_USER_DAILY_LIMIT || '200', 10);
// "Continue with Google": set SOC_GOOGLE_CLIENT_ID in the service environment
// to switch the button on. Without it, email sign-up still works fine.
const GOOGLE_CLIENT_ID = process.env.SOC_GOOGLE_CLIENT_ID || null;

function mount(app, redis) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

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
    async llen(k) {
      if (redis) return redis.llen(k);
      const l = mem.get(k);
      return Array.isArray(l) ? l.length : 0;
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
  const KINGS = new Set(['ayoub', 'xman', 'ali', 'pray', 'dem', 'sibi', 'rami', 'earlin', 'ana', 'karina', 'munzer']);
  const isKing = u => u.king === true || KINGS.has(String(u.name || '').trim().toLowerCase());

  // A king's crown replaces the tick rather than sitting beside it — two badges on
  // one name is noise, and the crown is the rarer thing.
  //
  // 👑 Founder crown (14 Aug 2026): a second path to the crown badge.
  // Users who invite 5+ friends via /refer earn `crown: true` on their
  // record. `founderUntil` stamps a 1-year entitlement window that the
  // future paywall will honour (see /refer/credit below — this is a
  // FUTURE-facing flag, no paid features exist yet). isKing wins if
  // both apply (kings are hand-picked, founders self-earn).
  const isFounder = u => u.crown === true || isKing(u);
  const marks = u => ({ king: isKing(u), crown: isFounder(u), verified: isFounder(u) ? false : isVerified(u) });

  const pub = u => ({ id: u.id, name: u.name, bio: u.bio || '', location: u.location || '',
    country: u.country || '', cc: u.cc || '',
    photo: u.photo || null,
    // Extra profile-gallery photos (owner ask 10 Aug 2026 — 'let user
    // add more images'). Same file store as the avatar, just multiple.
    photos: Array.isArray(u.photos) ? u.photos : [],
    createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0,
    age: calcAge(u.birthdate), birthdate: u.birthdate || null,
    // Speaky-style profile fields — languages spoken/learning, interests,
    // goals, a short "Let's talk about" quote, and recommendations.
    talkAbout: u.talkAbout || '',
    // Owner ask 2 Aug 2026 v7 — plain-language prompts on the profile.
    purpose: u.purpose || '',
    partnerType: u.partnerType || '',
    speaks: Array.isArray(u.speaks) ? u.speaks : [],
    learns: Array.isArray(u.learns) ? u.learns : [],
    // Owner ask 9 Aug 2026: expose the saved translation targets so
    // the client can gate the first-run picker + skip it on next taps.
    xlatLangs: Array.isArray(u.xlatLangs) ? u.xlatLangs : [],
    interests: Array.isArray(u.interests) ? u.interests : [],
    goals: Array.isArray(u.goals) ? u.goals : [],
    recs: u.recs || '',
    goal: u.goal || '',
    onboardedAt: u.onboardedAt || null,
    // Wizard resume marker. Owner ask 2 Aug 2026: 'if I refresh the
    // page it makes me logged in already; should keep my state and
    // bring me to the same place'. obStep = the last completed step
    // (0 = nothing yet, 5 = ready for welcome). Persisted server-side
    // so refresh / new device continues the wizard where the user
    // left off. `onboardedAt` is still the source-of-truth 'fully done'.
    obStep: Number.isFinite(u.obStep) ? u.obStep : 0,
    isAI: !!u.isAI,
    // AI persona regional tags (owner ask 14 Aug 2026 — broad accent
    // coverage). Only present on isAI:true records; empty string on
    // real users. Client uses `accent` as a chip on the wall card and
    // `dialect` for the secondary accent-filter row.
    dialect: u.dialect || '',
    accent: u.accent || '',
    // Referral programme (owner ask 14 Aug 2026 — "invite your friends,
    // win 1 year free"). refCode is generated lazily on first share so
    // grandfathered users don't need a bulk migration. founderUntil is
    // a millis timestamp — the future paywall must honour it as a free
    // pass. See /refer/* endpoints and creditReferral() below.
    refCode: u.refCode || null,
    founderUntil: u.founderUntil || null,
    // RM-A03 streak (in-app only, no push job yet). See bumpStreak() below.
    streak: (u.streak && typeof u.streak === 'object') ? {
      count: u.streak.count || 0,
      best: u.streak.best || 0,
      lastDay: u.streak.lastDay || null
    } : { count: 0, best: 0, lastDay: null },
    ...marks(u) });

  // ---- streak counter (RM-A03) ------------------------------------
  // Fire-and-forget: bumpStreak(uid) on any qualifying action (wall
  // post, DM send, lesson-done, AI reply, party join). Counts a max
  // of one bump per day per user. No push job overnight — that needs
  // owner review of cadence + copy. In-app celebration only.
  async function bumpStreak(uid) {
    if (!uid) return null;
    try {
      const raw = await db.get('soc:user:' + uid);
      if (!raw) return null;
      let u; try { u = JSON.parse(raw); } catch (e) { return null; }
      const today = new Date().toISOString().slice(0, 10); // UTC day
      const s = (u.streak && typeof u.streak === 'object') ? u.streak : { count: 0, best: 0, lastDay: null };
      if (s.lastDay === today) return { ...s, bumped: false };
      // Gap detection: yesterday means +1; anything else means reset.
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const nextCount = (s.lastDay === yesterday) ? (s.count + 1) : 1;
      const nextBest = Math.max(s.best || 0, nextCount);
      u.streak = { count: nextCount, best: nextBest, lastDay: today };
      await db.set('soc:user:' + uid, JSON.stringify(u));
      return { ...u.streak, bumped: true, wasReset: s.lastDay && s.lastDay !== yesterday };
    } catch (e) { console.warn('[streak] bump failed:', e.message); return null; }
  }

  // ---- simple rate limit (per ip per route bucket) ----
  // WORDSPIES_TEST_MODE bypasses this so /tmp/*.js suites can create
  // many test accounts in a burst. Never set in production.
  const RATE_LIMITS_OFF = process.env.WORDSPIES_TEST_MODE === '1';
  const hits = new Map();
  function limited(req, bucket, max) {
    if (RATE_LIMITS_OFF) return false;
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

  // ─── Onboarding gate ──────────────────────────────────────────────
  // Owner ask 2 Aug 2026 v4: 'he cant login until all his steps are
  // complete'. Block state-changing endpoints for signed-in users who
  // haven't finished the wizard yet. The wizard's own endpoints
  // (/profile, /photo, /account/pending) are whitelisted so users
  // can actually progress. Also lets /deleteAccount through so a
  // user can bail out mid-wizard rather than being trapped.
  //
  // GET/HEAD/OPTIONS pass unconditionally — reads leak no state that
  // isn't already public, and the wizard needs GET /me to hydrate.
  //
  // GRANDFATHER: only enforced for accounts created on/after
  // 2026-08-02 (when the wizard shipped). Older accounts had no
  // wizard to complete — retro-forcing them into it would strand
  // returning users with no way through.
  const OB_CUTOFF = Date.parse('2026-08-02T00:00:00Z');
  // A user's account is 'active' (visible + interactive) once they've
  // finished the wizard. Grandfathered accounts (createdAt < cutoff)
  // are always active. Owner ask 2 Aug 2026 v5: 'account active or
  // display or login only if he succeeded to all steps'.
  function isOnboarded(u) {
    if (!u) return false;
    if (u.createdAt && u.createdAt < OB_CUTOFF) return true;
    return !!u.onboardedAt;
  }
  // Every required wizard field must have landed before a user is
  // allowed to flip onboardedAt on themselves — see profile.js.
  // Owner ask 2 Aug 2026 v5 pared step 4 back to just talkAbout,
  // so goal + speaks + learns are no longer required to activate.
  function wizardFieldsComplete(u) {
    if (!u) return false;
    if (!u.name || u.name.length < 3) return false;
    if (!u.birthdate) return false;
    if (!u.photo) return false;
    if (!u.talkAbout || u.talkAbout.length < 4) return false;
    return true;
  }
  const OB_ALLOW = new Set([
    '/profile', '/photo', '/account/pending',
    '/push/subscribe', '/push/unsubscribe',
    '/deleteAccount', '/me',
    // Un-onboarded users must still be able to report abuse — a
    // victim mid-signup should not be gagged. Audit fix 2 Aug v8.
    '/report',
    // The referral credit fires immediately post-signup (before the
    // wizard is complete). Blocking it here would silently drop every
    // credit. GET /refer/state passes as GET regardless.
    '/refer/credit'
  ]);
  api.use(async (req, res, next) => {
    try {
      const m = req.method;
      if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
      if (OB_ALLOW.has(req.path)) return next();
      const u = await userFromReq(req);
      if (!u) return next();                   // anonymous → let auth routes handle
      if (u.onboardedAt) return next();        // already finished
      if (!(u.createdAt && u.createdAt >= OB_CUTOFF)) return next();  // grandfathered
      return res.status(403).json({
        error: 'Please finish setting up your account first.',
        needsOnboarding: true,
        obStep: Number.isFinite(u.obStep) ? u.obStep : 0
      });
    } catch (e) { next(); }   // fail-open on our own errors, never wedge signups
  });

  // Cache the developer's UID once we can look it up. OWNER_EMAIL env
  // (or a hard fallback for the current owner) points at the account
  // that gets the "Chat with developer" button on every user's Me tab.
  const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'sibghat726@gmail.com').toLowerCase();
  let ownerCache = null;
  async function ownerInfo() {
    if (ownerCache && ownerCache._at > Date.now() - 60_000) return ownerCache;
    const uid = await db.get('soc:email:' + OWNER_EMAIL);
    if (!uid) return null;
    const raw = await db.get('soc:user:' + uid);
    if (!raw) return null;
    const u = JSON.parse(raw);
    ownerCache = { id: u.id, name: u.name, photo: u.photo || null, _at: Date.now() };
    return ownerCache;
  }
  api.get('/config', async (req, res) => {
    const owner = await ownerInfo();
    res.json({
      google: GOOGLE_CLIENT_ID,
      giphy: process.env.SOC_GIPHY_KEY || null,
      // Small public developer profile so the client can render a
      // "Chat with developer" pill. Null if the account doesn't exist yet.
      dev: owner ? { id: owner.id, name: owner.name, photo: owner.photo } : null
    });
  });

  // suggestion for the "your city" field, from the visitor's IP
  api.get('/geo', async (req, res) => {
    const g = await geoFromIp(reqIp(req));
    res.json({ suggestion: geoLabel(g) });
  });

  // ── age gate helpers ────────────────────────────────────────────────
  // 18+ ONLY. Enforced on both /signup and /google (new-user path). Owner
  // asked (2026-08-01) for a hard block: never create the account, never
  // issue a session. We store a short-lived "age-fail" marker per email so
  // someone can't just re-submit the same form with a plausible-looking
  // DOB after being told 'you're under 18'.
  const MIN_AGE = 18;
  const AGE_FAIL_TTL = 60 * 60 * 24 * 30;   // 30 days
  function ageFromISO(iso) {
    // iso = "YYYY-MM-DD". Returns age in whole years today, or NaN if bad.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return NaN;
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    const dob = new Date(Date.UTC(y, mo, d));
    if (isNaN(dob.getTime())) return NaN;
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    const passedBday = (now.getUTCMonth() > mo) ||
      (now.getUTCMonth() === mo && now.getUTCDate() >= d);
    if (!passedBday) age--;
    return age;
  }
  function isPlausibleDob(iso) {
    // Reject dates that are missing, in the future, or absurdly old (>120y).
    const age = ageFromISO(iso);
    return Number.isFinite(age) && age >= 0 && age <= 120;
  }
  async function markAgeFail(email) {
    const key = 'soc:agefail:' + crypto.createHash('sha256').update(String(email || '')).digest('hex').slice(0, 24);
    try { await db.set(key, '1', AGE_FAIL_TTL); } catch (e) {}
  }
  async function isRecentAgeFail(email) {
    const key = 'soc:agefail:' + crypto.createHash('sha256').update(String(email || '')).digest('hex').slice(0, 24);
    try { return !!(await db.get(key)); } catch (e) { return false; }
  }

  // ---- auth ----
  // ALL account-lifecycle endpoints live in ./auth.js:
  //   /signup /login /google /forgot /reset /logout
  // social.js still owns the shared helpers (db, session cookie writer,
  // rate limiter, geo, pub, age gate, email dispatch) and passes them
  // as ctx. This split is the first stage of the wider modularisation
  // push (owner ask 1 Aug 2026: 'make the code bit more maintainable so
  // it work so better and no fix again and again'). Same URL surface,
  // same cookie, same Redis keys — pure refactor.
  // NOTE: the auth.mount() call below is placed AFTER sendMail +
  // mailHtml are defined; do not move it above them or /forgot will
  // resolve to undefined and reset emails silently die.

  // ---- email via Brevo (BREVO_API_KEY env) with Resend as a fallback ----
  const BREVO_KEY = process.env.BREVO_API_KEY || null;
  const RESEND_KEY = process.env.SOC_RESEND_KEY || null;
  const MAIL_FROM = process.env.SOC_MAIL_FROM || 'TalkSibi <onboarding@resend.dev>';
  const MAIL_NAME = process.env.SOC_MAIL_NAME || 'TalkSibi';
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
  const SITE = 'https://talksibi.com';
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
<img src="${SITE}/icon-192.png" width="58" height="58" alt="TalkSibi" style="display:block;border:0;border-radius:15px"></td></tr>
<tr><td align="center" style="${cell}padding:22px 32px 0;font-size:22px;line-height:1.25;font-weight:700;color:#16181f;letter-spacing:-.2px">${heading}</td></tr>
<tr><td align="center" style="${cell}padding:10px 32px 0;font-size:15px;line-height:1.55;color:#5c6270">${line}</td></tr>
<tr><td align="center" style="padding:26px 32px 0">${action}</td></tr>
<tr><td align="center" style="${cell}padding:20px 32px 34px;font-size:12px;line-height:1.5;color:#9aa0ab">${note || ''}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px">
<tr><td align="center" style="${cell}padding:18px 8px 0;font-size:12px;color:#9aa0ab">
TalkSibi · <a href="${SITE}" style="color:#9aa0ab;text-decoration:none">talksibi.com</a></td></tr>
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
  const VAPID_SUB = 'mailto:' + (process.env.SOC_MAIL_FROM || 'contact@talksibi.com').replace(/^.*<|>.*$/g, '');
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

  // ---- 🔔 in-app notification inbox --------------------------------------
  // Persistent list of "someone did a thing that concerns you" entries per
  // user — shown in the bell dropdown in the top nav. Web Push (above) is
  // best-effort and payload-less; this list is the durable, ordered record.
  // Kind is a short string ('club-mention', extend later); text is the
  // pre-rendered line; url is the deep-link target when tapped.
  //
  // Keys:
  //   soc:notif:<uid>        LIST of JSON blobs, newest last (LTRIM 200)
  //   soc:notif:<uid>:unread STRING — count of unread since last mark-read
  //
  // pushNotif is exposed to child modules via the mount opts so /clubs
  // (and future modules) can drop a notification with one call.
  async function pushNotif(uid, entry) {
    try {
      if (!uid || !entry) return;
      const rec = {
        id: crypto.randomBytes(6).toString('base64url'),
        at: Date.now(),
        kind: String(entry.kind || 'info').slice(0, 32),
        text: String(entry.text || '').slice(0, 240),
        url:  String(entry.url  || '/social').slice(0, 300),
        meta: entry.meta || null,
      };
      await db.rpush('soc:notif:' + uid, JSON.stringify(rec));
      await db.ltrim('soc:notif:' + uid, -200, -1);
      await db.incr('soc:notif:' + uid + ':unread');
      try { await db.expire('soc:notif:' + uid + ':unread', 60 * 60 * 24 * 60); } catch (e) {}
    } catch (e) { console.error('pushNotif:', e.message); }
  }

  // GET /notif/list — last N notifications for the signed-in user, newest
  // first, plus the current unread count so the bell badge can render
  // without a second round-trip.
  api.get('/notif/list', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 20));
      const raws = await db.lrange('soc:notif:' + u.id, -limit, -1);
      const items = [];
      for (const r of raws.reverse()) { try { items.push(JSON.parse(r)); } catch (e) {} }
      const unread = parseInt(await db.get('soc:notif:' + u.id + ':unread')) || 0;
      res.json({ items, unread });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /notif/mark-read — clears the unread counter. Individual items
  // stay in the list so the bell dropdown keeps a history.
  api.post('/notif/mark-read', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await db.del('soc:notif:' + u.id + ':unread');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });
  // Mount auth here — AFTER sendMail + mailHtml + BREVO_KEY / RESEND_KEY
  // are all defined, since auth.js needs them for /forgot. Same
  // Router (`api`), so the URL surface is unchanged.
  require('./auth').mount(api, {
    db, SESS_TTL,
    limited, setSess, cookies, clearSess,
    reqIp, geoFromIp, geoLabel, pub,
    MIN_AGE, ageFromISO, isPlausibleDob, markAgeFail, isRecentAgeFail,
    GOOGLE_CLIENT_ID,
    PHOTO_DIR,
    BREVO_KEY, RESEND_KEY,
    sendMail, mailHtml
  });

  // ─── 👑 REFERRAL / "Invite your friends, win 1 year free" ─────────────
  // Owner ask 14 Aug 2026: 'people can invite their friends on social
  // media … you'll get the crown badge and free access to all features
  // for 1 complete year if you invite at least 5 people from your link.'
  //
  // Data model (all under soc:*):
  //   soc:user:<uid>.refCode    — 6-char alnum, unique, lazy-created
  //   soc:refCode:<code>        — reverse index → uid
  //   soc:refBy:<uid>           — Set of referred uids (dedupes)
  //   soc:refLog                — audit list of every credit event
  //   soc:refCredit:<ip>        — daily counter for /credit abuse
  //   soc:user:<uid>.crown      — true once refBy hits 5 (badge flag)
  //   soc:user:<uid>.founderUntil — millis expiry of the 1-year pass
  //
  // FUTURE PAYWALL NOTE: `founderUntil` is a promise, not a gate.
  // When paid features land, honour `user.founderUntil > Date.now()`
  // as a free-pass everywhere the paywall checks entitlement.
  const REF_GOAL = 5;
  const REF_ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — copy-paste safe
  function newRefCodeCandidate() {
    let s = '';
    for (let i = 0; i < 6; i++) s += REF_ALPH[Math.floor(Math.random() * REF_ALPH.length)];
    return s;
  }
  async function ensureRefCode(user) {
    if (user.refCode) return user.refCode;
    // Try a few candidates in case of collision. 32^6 ≈ 1B keys — collision
    // is astronomically unlikely at any realistic scale, but we retry
    // rather than throw so the modal never sits there blank.
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = newRefCodeCandidate();
      const taken = await db.get('soc:refCode:' + code);
      if (taken) continue;
      user.refCode = code;
      await db.set('soc:refCode:' + code, user.id);
      await db.set('soc:user:' + user.id, JSON.stringify(user));
      return code;
    }
    // Ultimate fallback: 8-char code — collision probability now
    // vanishingly small even if the RNG is degraded.
    const code = newRefCodeCandidate() + newRefCodeCandidate().slice(0, 2);
    user.refCode = code;
    await db.set('soc:refCode:' + code, user.id);
    await db.set('soc:user:' + user.id, JSON.stringify(user));
    return code;
  }

  // GET /refer/state — current referral status for the signed-in user.
  // Returns { code, count, goal, crown, founderUntil }. Called by the
  // client to populate the modal's progress ring + celebration state.
  api.get('/refer/state', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await ensureRefCode(u);
      const count = await db.scard('soc:refBy:' + u.id);
      res.json({
        code: u.refCode,
        count: Number(count) || 0,
        goal: REF_GOAL,
        crown: !!u.crown,
        founderUntil: u.founderUntil || null
      });
    } catch (e) {
      console.error('refer state:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // POST /refer/credit — called from the client on signup completion.
  // Body: { code: 'ABC123' }. Fires-and-forgets from the client's
  // perspective; failures never block signup. Returns { ok, credited,
  // reason } so a curious client can log why (self-ref, same-ip, etc.).
  api.post('/refer/credit', async (req, res) => {
    try {
      // Cheap per-IP daily rate limit — 20 credit attempts / IP / day.
      // Uses a plain incr on a bucket key with 24h TTL.
      const ip = reqIp(req);
      const bkKey = 'soc:refCredit:' + (ip || 'unknown').replace(/[^0-9a-f.:]/gi, '');
      const bkN = await db.incr(bkKey);
      if (bkN === 1) { try { await db.set(bkKey, '1', 60 * 60 * 24); } catch(e){} }
      if (bkN > 20) return res.json({ ok: false, credited: false, reason: 'rate' });

      const code = String((req.body || {}).code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5,10}$/.test(code)) return res.json({ ok: false, credited: false, reason: 'badcode' });
      const referrerId = await db.get('soc:refCode:' + code);
      if (!referrerId) return res.json({ ok: false, credited: false, reason: 'unknown' });

      const me = await userFromReq(req);
      if (!me) return res.json({ ok: false, credited: false, reason: 'noauth' });
      if (me.id === referrerId) return res.json({ ok: false, credited: false, reason: 'self' });

      // Anti-fraud: same-IP-as-referrer signups don't count. Simpler than
      // the "pending review" queue in the spec — just refuse silently.
      // Owner audit note: revisit if legitimate flatmates start hitting
      // this. Store the referrer's signup IP so we can compare later.
      const rRaw = await db.get('soc:user:' + referrerId);
      if (!rRaw) return res.json({ ok: false, credited: false, reason: 'unknown' });
      const referrer = JSON.parse(rRaw);
      if (referrer.signupIp && ip && referrer.signupIp === ip) {
        return res.json({ ok: false, credited: false, reason: 'sameip' });
      }

      // Dedupe: SADD returns 0 if already a member.
      const before = await db.scard('soc:refBy:' + referrerId);
      await db.sadd('soc:refBy:' + referrerId, me.id);
      const after = await db.scard('soc:refBy:' + referrerId);
      const isNew = Number(after) > Number(before);

      // Audit log — one line per credit attempt (successful adds only).
      if (isNew) {
        try {
          await db.rpush('soc:refLog', JSON.stringify({
            at: Date.now(), referrer: referrerId, referred: me.id, ip
          }));
        } catch (e) {}
      }

      // Milestone: first time the count hits REF_GOAL, stamp the crown +
      // founderUntil, and queue a push so the referrer sees it next open.
      let milestone = false;
      if (isNew && Number(after) >= REF_GOAL && !referrer.crown) {
        referrer.crown = true;
        referrer.founderUntil = Date.now() + 365 * 24 * 60 * 60 * 1000;
        await db.set('soc:user:' + referrerId, JSON.stringify(referrer));
        milestone = true;
        // Best-effort in-app notification via the existing push queue.
        try {
          await db.set('soc:pushq:' + referrerId, JSON.stringify({
            kind: 'founder',
            title: 'You unlocked the Founder crown 👑',
            body: 'You brought 5 friends to TalkSibi. 1 year of everything, on us.',
            at: Date.now()
          }), 60 * 60 * 24 * 7);
        } catch (e) {}
      }

      res.json({ ok: true, credited: isNew, milestone, count: Number(after) });
    } catch (e) {
      console.error('refer credit:', e.message);
      res.json({ ok: false, credited: false, reason: 'err' });
    }
  });

  // ─── SAFETY / MODERATION ──────────────────────────────────────────────
  // App-store compliance (Apple Guideline 1.2, Google UGC policy): every
  // user can (1) report other users, (2) report specific messages, and
  // (3) block users completely. Reports queue for moderator review, blocks
  // take effect immediately in both directions.

  // Cheap wordlist filter — Google requires "a method for filtering
  // objectionable material." A small list satisfies the letter of the
  // policy without pretending to be clever. Rejects, doesn't silently
  // drop, so users see the friction.
  const BAD_WORDS = [
    'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'retard', 'whore',
    'slut', 'kike', 'chink', 'spic', 'tranny', 'dyke', 'pedo', 'rape'
  ];
  function containsProfanity(s) {
    const t = String(s || '').toLowerCase();
    for (const w of BAD_WORDS) {
      const re = new RegExp('\\b' + w + '\\b', 'i');
      if (re.test(t)) return w;
    }
    return null;
  }

  // Are A and B blocked either direction? Used at every ingestion point
  // that could show one to the other (messages, member wall, chats).
  async function isBlocked(a, b) {
    if (!a || !b || a === b) return false;
    if (await db.sismember('soc:blocks:' + a, b)) return true;
    if (await db.sismember('soc:blocks:' + b, a)) return true;
    return false;
  }

  // Account-verification queue: onboarding wizard writes here after
  // the profile has enough content for a moderator to review. Owner
  // ('you') walks the queue via the admin portal (next session).
  // Redis key = 'soc:new-accounts', a rolling list of user ids. Users
  // can safely appear multiple times if they call this again — we
  // dedupe on read in the admin surface.
  api.post('/account/pending', async (req, res) => {
    try {
      // Cap at 3/min per IP so a bad script can't ltrim-flush the
      // 2000-slot queue and evict real pending accounts. Audit fix
      // 2 Aug v8. Wizard finish only fires this once per session, so
      // legit users never hit the ceiling.
      if (limited(req, 'pend', 3)) return res.status(429).json({ ok: false });
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      // Per-user dedup with a 24h TTL — a signup only needs to appear
      // in the queue once. Re-calls (wizard resume, retry) short-circuit.
      const dedup = 'soc:pending-mark:' + u.id;
      if (await db.exists(dedup)) return res.json({ ok: true, deduped: true });
      const entry = JSON.stringify({ t: Date.now(), uid: u.id, name: u.name, email: u.email });
      await db.rpush('soc:new-accounts', entry);
      await db.ltrim('soc:new-accounts', -2000, -1);
      await db.set(dedup, '1', 24 * 60 * 60);
      res.json({ ok: true });
    } catch (e) { console.error('account/pending:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Learn-tab interest capture (v1). The Learn shelf is a coming-soon
  // placeholder; this endpoint just appends whatever the user typed to a
  // Redis list so the owner can read the most-requested things while the
  // real Learn surface gets built. Rate-limited per session so nobody can
  // fill the list up with a script. Anonymous-tolerant: no login required
  // (encourages more input in the earliest days).
  api.post('/learn-idea', async (req, res) => {
    try {
      if (limited(req, 'learn-idea', 6)) return res.status(429).json({ error: 'Thanks — one at a time please.' });
      const idea = String((req.body || {}).idea || '').trim().slice(0, 400);
      if (!idea) return res.status(400).json({ error: 'Please tell us what would help.' });
      const me = await userFromReq(req).catch(() => null);
      const entry = { t: Date.now(), uid: (me && me.id) || null, name: (me && me.name) || null, idea };
      await db.rpush('soc:learn-ideas', JSON.stringify(entry));
      await db.ltrim('soc:learn-ideas', -1000, -1);   // cap at last 1000
      // Owner ask 10 Aug 2026 — email each new learn-tab idea straight
      // to the owner's inbox so they can see requests without visiting
      // an admin page. Fire-and-forget: never let a mail failure break
      // the response for the user.
      (async () => {
        try {
          const who = entry.name ? entry.name : 'A visitor';
          const subject = `📚 New Learn request from ${who}`;
          const text = `${who} wants to learn:\n\n${entry.idea}\n\n—\nTalkSibi · ${new Date(entry.t).toISOString()}`;
          const html = `<p><strong>${esc(who)}</strong> wants to learn:</p><blockquote style="border-left:3px solid #0f7500;padding:6px 12px;margin:12px 0;color:#333">${esc(entry.idea).replace(/\n/g, '<br>')}</blockquote><p style="color:#888;font-size:12px">TalkSibi · ${new Date(entry.t).toISOString()}</p>`;
          await sendMail('sibikhan1234@gmail.com', subject, text, html);
        } catch (e) { console.error('learn-idea mail:', e.message); }
      })();
      res.json({ ok: true });
    } catch (e) { console.error('learn-idea:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // References — a written testimonial one member can leave for
  // another. Tandem-style trust signal. Owner ask 1 Aug 2026.
  //
  //   POST /reference           — write one for another member
  //     body: { targetId, text }  (text up to 1000 chars, min 20)
  //   GET  /references/:id      — read all references for a member,
  //                               newest first, with author info.
  //
  // Storage:
  //   soc:refs:<targetId>       — Redis LIST of JSON entries.
  //   soc:refwrote:<fromId>:<targetId> — dedup marker (one per pair)
  //                                       so a user can't spam refs.
  //   Entry shape:
  //     { id, fromId, fromName, fromPhoto, text, createdAt }
  //
  // Ownership: the RECIPIENT can't edit or delete a reference (would
  // defeat the trust signal). Author-withdraw (/reference/delete) and
  // a cheap /count endpoint were originally planned but never
  // implemented — /members reads via LLEN now (audit 2 Aug v8). We
  // soft-cap at last 200 refs per user.
  api.post('/reference', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'ref', 5)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const b = req.body || {};
      const targetId = String(b.targetId || '').slice(0, 32);
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!targetId || targetId === me.id) return res.status(400).json({ error: 'Choose someone else to reference.' });
      if (text.length < 20) return res.status(400).json({ error: 'Please write at least a couple of sentences (20+ characters).' });
      // Target must exist.
      const tRaw = await db.get('soc:user:' + targetId);
      if (!tRaw) return res.status(404).json({ error: 'That person doesn\'t exist.' });
      // Block guard both ways.
      if (await db.sismember('soc:blocks:' + me.id, targetId)
       || await db.sismember('soc:blocks:' + targetId, me.id)) {
        return res.status(403).json({ error: 'Cannot reference a blocked user.' });
      }
      // One reference per author→recipient. Second attempt UPDATES the
      // existing one instead of stacking (kept simple: delete old + append
      // new so ordering reflects the latest edit).
      const dupKey = 'soc:refwrote:' + me.id + ':' + targetId;
      const already = await db.get(dupKey);
      if (already) {
        try {
          const list = await db.lrange('soc:refs:' + targetId, 0, -1);
          const filtered = list.filter(raw => {
            try { const e = JSON.parse(raw); return e.fromId !== me.id; } catch (e) { return true; }
          });
          // Overwrite: rebuild the list. In-memory shim doesn't have a
          // native way to replace by predicate so we del + rpush all.
          await db.del('soc:refs:' + targetId);
          for (const r of filtered) await db.rpush('soc:refs:' + targetId, r);
        } catch (e) {}
      }
      const entry = {
        id: crypto.randomBytes(6).toString('hex'),
        fromId: me.id, fromName: me.name, fromPhoto: me.photo || null,
        text, createdAt: Date.now()
      };
      await db.rpush('soc:refs:' + targetId, JSON.stringify(entry));
      await db.ltrim('soc:refs:' + targetId, -200, -1);
      await db.set(dupKey, '1');
      // Notify the recipient — audit follow-up 2 Aug v8. Refs are a
      // headline trust signal; a silent write was surprising.
      try {
        notifyUser(targetId, 'ref', me.name + ' left you a reference',
          `${me.name} wrote a reference for you on TalkSibi. See it on your profile.`,
          true, mailHtml({
            peek: 'One more voice for your wall.',
            heading: 'New reference',
            line: '<b style="color:#16181f">' + esc(me.name) + '</b> left you a reference on TalkSibi.',
            btn: 'See it', btnUrl: SITE + '/social',
            note: 'We only send these when you\'re not already in the app.'
          }));
        sendPush(targetId, 'ref', '✍️ New reference', me.name + ' wrote a reference for you', '/social');
      } catch (e) { /* notify never blocks the write */ }
      res.json({ ok: true, ref: entry });
    } catch (e) { console.error('reference:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.get('/references/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').slice(0, 32);
      if (!id) return res.status(400).json({ error: 'Missing id.' });
      const list = await db.lrange('soc:refs:' + id, 0, -1);
      const me = await userFromReq(req);
      const myBlocks = me ? new Set(await db.smembers('soc:blocks:' + me.id)) : new Set();
      const out = [];
      // Prefetch the authors we haven't seen so we can skip dormant
      // ones without an N+1. Owner audit 2 Aug v8.
      const parsed = [];
      const authorIds = new Set();
      for (const raw of list) {
        try {
          const e = JSON.parse(raw);
          if (myBlocks.has(e.fromId)) continue;
          parsed.push(e);
          authorIds.add(e.fromId);
        } catch (e2) {}
      }
      const dormant = new Set();
      for (const aid of authorIds) {
        const uraw = await db.get('soc:user:' + aid);
        if (uraw) {
          try { if (!isOnboarded(JSON.parse(uraw))) dormant.add(aid); }
          catch (e3) {}
        } else {
          dormant.add(aid);   // author deleted → hide their ref
        }
      }
      for (const e of parsed) {
        if (dormant.has(e.fromId)) continue;
        out.push(e);
      }
      out.sort((a, b) => b.createdAt - a.createdAt);
      res.json({ references: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Report a user or a message. Written to a rolling list a moderator
  // (owner) can walk through. Store enough context to act without a
  // second query — reporter id, target id, reason category, free-text
  // note, and if it's about a message, a snapshot of the message text.
  api.post('/report', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (limited(req, 'report', 8)) return res.status(429).json({ error: 'Slow down a little ✋' });
      const body = req.body || {};
      const kind = body.kind === 'message' ? 'message' : 'user';
      const targetId = String(body.targetId || '').slice(0, 32);
      const reason = String(body.reason || '').slice(0, 40) || 'other';
      const note = String(body.note || '').trim().slice(0, 500);
      if (!targetId || targetId === me.id) return res.status(400).json({ error: 'Nothing to report.' });
      // Dedup: one active report per (reporter, target, kind, msgId?).
      // 24h TTL — after that, a genuinely new incident can be reported
      // again. Prevents spam-report abuse against a single victim.
      // Audit fix 2 Aug v8.
      const dupKey = 'soc:reported:' + me.id + ':' + kind + ':' + targetId
                   + (body.msgId ? ':' + String(body.msgId).slice(0, 24) : '');
      if (await db.exists(dupKey)) return res.json({ ok: true, deduped: true });
      let snapshot = null;
      if (kind === 'message') {
        const msgId = String(body.msgId || '').slice(0, 24);
        if (!msgId) return res.status(400).json({ error: 'Missing message reference.' });
        // Pull a snapshot of the reported message so we can moderate even
        // if the sender deletes it after the report.
        const msgs = await db.lrange('soc:msgs:' + cid(me.id, targetId), -200, -1);
        for (const raw of msgs) {
          try {
            const m = JSON.parse(raw);
            if ((m.id && m.id === msgId) || String(m.t) === msgId) {
              snapshot = { id: m.id || String(m.t), k: m.k, x: String(m.x || '').slice(0, 500), t: m.t };
              break;
            }
          } catch (e) {}
        }
      }
      const entry = { id: crypto.randomBytes(6).toString('base64url'), by: me.id, target: targetId, kind, reason, note, snapshot, at: Date.now() };
      await db.rpush('soc:reports', JSON.stringify(entry));
      await db.ltrim('soc:reports', -1000, -1);
      await db.set(dupKey, '1', 24 * 60 * 60);
      console.log('[report]', me.id.slice(0, 6), '→', targetId.slice(0, 6), kind, reason);
      res.json({ ok: true });
    } catch (e) { console.error('social report:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Block a user — hides them everywhere, both directions.
  // Push a system message into the chat thread between two users so
  // BOTH sides see the block state, not just the person who blocked.
  // Owner ask 1 Aug 2026. Both directions of the block (block/unblock)
  // write their own marker; the message thread is shared between the
  // pair (cid() sorts uids), so the same entry surfaces for both.
  async function pushSysMsg(fromId, toId, kind, byId) {
    const key = 'soc:msgs:' + cid(fromId, toId);
    const entry = {
      id: crypto.randomBytes(6).toString('base64url'),
      f: 'system',           // client uses this to render as a centred pill
      by: byId,              // which side triggered the state change
      k: kind,               // 'sys-block' | 'sys-unblock'
      t: Date.now()
    };
    await db.rpush(key, JSON.stringify(entry));
    await db.ltrim(key, -500, -1);
  }

  api.post('/block', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const targetId = String((req.body || {}).targetId || '').slice(0, 32);
      if (!targetId || targetId === me.id) return res.status(400).json({ error: 'Nothing to block.' });
      if (!(await db.get('soc:user:' + targetId))) return res.status(404).json({ error: 'That user is gone.' });
      const already = await db.sismember('soc:blocks:' + me.id, targetId);
      await db.sadd('soc:blocks:' + me.id, targetId);
      // Unfollow both directions so the block also breaks the graph.
      await db.srem('soc:following:' + me.id, targetId);
      await db.srem('soc:followers:' + targetId, me.id);
      await db.srem('soc:following:' + targetId, me.id);
      await db.srem('soc:followers:' + me.id, targetId);
      // Insert the sys marker only on a fresh block (repeat calls are
      // idempotent, and duplicating pills in the thread would be noise).
      if (!already) await pushSysMsg(me.id, targetId, 'sys-block', me.id);
      res.json({ ok: true });
    } catch (e) { console.error('social block:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });
  api.post('/unblock', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const targetId = String((req.body || {}).targetId || '').slice(0, 32);
      if (!targetId) return res.status(400).json({ error: 'Nothing to unblock.' });
      const was = await db.sismember('soc:blocks:' + me.id, targetId);
      await db.srem('soc:blocks:' + me.id, targetId);
      if (was) await pushSysMsg(me.id, targetId, 'sys-unblock', me.id);
      res.json({ ok: true });
    } catch (e) { console.error('social unblock:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });
  api.get('/blocks', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const ids = await db.smembers('soc:blocks:' + me.id);
      const out = [];
      for (const id of ids) {
        const raw = await db.get('soc:user:' + id);
        if (!raw) continue;
        const u = JSON.parse(raw);
        out.push({ id: u.id, name: u.name, photo: u.photo || null });
      }
      res.json({ blocked: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
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

  // ---- profile (GET /me, POST /profile, POST /photo) ----
  // Moved to ./profile.js on 1 Aug 2026 as the second modularisation
  // slice. Same URL surface, same Redis keys, same photo directory —
  // pure refactor.
  require('./profile').mount(api, {
    db, userFromReq, pub,
    reqIp, geoFromIp, geoLabel,
    limited,
    PHOTO_DIR,
    // Age-gate helpers so /profile's DOB write can enforce 18+ for
    // Gmail signups that deferred DOB (owner ask 2 Aug 2026 —
    // 'remove that popup entirely, DOB goes in the wizard').
    // markAgeFail/isRecentAgeFail plug the wizard-write gap: without
    // them a user could retry <18 DOBs from the wizard endlessly.
    MIN_AGE, ageFromISO, markAgeFail, isRecentAgeFail,
    // Wizard completion gate — profile.js rejects onboardedAt writes
    // that don't correspond to a fully-populated profile so a
    // tampered client can't self-activate.
    wizardFieldsComplete
  });
  // Language Clubs — topic communities (owner ask 11 Aug 2026 re-land
  // after the 901ab12 revert). Isolated module, own Redis keys, own
  // route prefix; failure to load can't take down the rest of social.
  try { require('./clubs').mount(app, api, db, { userFromReq, pushNotif, sendPush, isBlocked }); }
  catch (e) { console.error('clubs module failed to load:', e.message); }

  // ─── WhatsApp-Web-style single active session (owner ask 14 Aug 2026) ──
  // When the same account opens TalkSibi in a NEW tab / browser / device,
  // the new tab wins and the old tabs politely disable themselves with a
  // "You opened TalkSibi in another window — click here to resume" overlay.
  // Nothing destructive: the cookie stays valid, so the user can reclaim
  // the session with one tap (which then supersedes the new tab, and so on).
  //
  // Mechanics:
  //   1. Client calls POST /session/register on load (post-login). Server
  //      writes a fresh random sessionId to soc:activeSess:<uid> with a
  //      short TTL and returns it. Client keeps it in memory.
  //   2. Client polls GET /session/check?sid=<mine> every ~5s while the
  //      tab is visible. Server returns { current: sid === stored }.
  //   3. When current === false, the client shows the soft overlay + stops
  //      most background work. Clicking "Take over" just calls /register
  //      again — the older tab is now the "current" one and any OTHER tab
  //      that was current will discover it on its next poll.
  //   4. Party / active-game tabs SKIP registration entirely so the mic
  //      never gets kicked mid-conversation (owner constraint).
  //
  // Redis key: soc:activeSess:<uid> → sessionId (hex). TTL == SESS_TTL
  // so a truly abandoned account eventually falls out.
  const SID_TTL = 60 * 60 * 24 * 7;   // 7 days — plenty for the poll to refresh
  const ACTIVE_SID_KEY = uid => 'soc:activeSess:' + uid;

  api.post('/session/register', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const sid = crypto.randomBytes(16).toString('hex');
      await db.set(ACTIVE_SID_KEY(u.id), sid, SID_TTL);
      res.json({ sid });
    } catch (e) { console.error('session/register:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.get('/session/check', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const u = await userFromReq(req);
      if (!u) return res.json({ current: true, loggedOut: true });
      const mine = String(req.query.sid || '');
      if (!/^[a-f0-9]{32}$/.test(mine)) {
        // BUG-019 fix: log malformed sid so a "client stuck" report can be
        // traced back to a broken sid rather than a silent 200. Truncate uid
        // in the log so we don't leak full ids at info level.
        if (mine) console.warn('[session/check] malformed sid from uid=' + String(u.id).slice(0,8));
        return res.json({ current: true });   // no sid → don't kick
      }
      const stored = await db.get(ACTIVE_SID_KEY(u.id));
      // If Redis has forgotten (TTL expired, restart on in-memory), consider
      // the caller current rather than kicking them out on our own housekeeping.
      if (!stored) return res.json({ current: true });
      res.json({ current: stored === mine });
    } catch (e) { console.error('session/check:', e.message); res.json({ current: true }); }
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

  // Image messages — user picks a photo, we save it under /social-images
  // and return the URL. Client then sends /message with kind:'image'
  // and text set to that URL. Same pattern as voice messages above.
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }   // 5 MB — larger than profile pic
  });
  api.post('/message/image', (req, res) => {
    imageUpload.single('image')(req, res, async err => {
      try {
        if (err) return res.status(400).json({ error: 'Image too large (max 5 MB).' });
        const u = await userFromReq(req);
        if (!u) return res.status(401).json({ error: 'Please log in.' });
        if (limited(req, 'imgmsg', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(400).json({ error: 'No image received.' });
        // Sniff the bytes so someone can't rename an .exe to .jpg.
        const sig = f.buffer.slice(0, 12);
        const isJpg  = sig[0] === 0xFF && sig[1] === 0xD8;
        const isPng  = sig[0] === 0x89 && sig[1] === 0x50;
        const isWebp = sig.slice(8, 12).toString() === 'WEBP';
        const isGif  = sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46;
        if (!isJpg && !isPng && !isWebp && !isGif) return res.status(400).json({ error: 'Use a JPG, PNG, WebP or GIF image.' });
        const ext = isJpg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : 'gif';
        const fname = u.id + '.' + Date.now().toString(36) + '.' + crypto.randomBytes(3).toString('hex') + '.' + ext;
        fs.writeFileSync(path.join(IMAGE_DIR, fname), f.buffer);
        res.json({ url: '/social-images/' + fname });
      } catch (e) { console.error('social image:', e.message); res.status(500).json({ error: 'Upload failed.' }); }
    });
  });

  // (/photo moved to ./profile.js above along with GET /me + POST /profile.)

  // ---- members wall ----
  api.get('/members', async (req, res) => {
    try {
      const ids = await db.smembers('soc:members');
      const me = await userFromReq(req);
      // Hide anyone I blocked, and anyone who blocked me. Both directions
      // so a blocked user can't spot me on the wall either.
      const iBlocked = me ? new Set(await db.smembers('soc:blocks:' + me.id)) : new Set();
      const out = [];
      for (const id of ids.slice(0, 500)) {
        if (me && (iBlocked.has(id) || await db.sismember('soc:blocks:' + id, me.id))) continue;
        const raw = await db.get('soc:user:' + id);
        if (raw) {
          const u = JSON.parse(raw);
          // Skip accounts that haven't completed the wizard —
          // dormant profiles must not appear in Community. Owner
          // ask 2 Aug 2026 v5.
          if (!isOnboarded(u)) continue;
          const ls = await db.get('soc:lastseen:' + u.id);
          // Refs: LLEN for count + LRANGE(-1,-1) for the newest.
          // Was previously reading the entire list just for its
          // length — O(N) parse per user per /members call (audit
          // fix 2 Aug v8). Skip AI users (no refs).
          let refCount = 0, latestRefAt = 0;
          if (!u.isAI) {
            try {
              refCount = await db.llen('soc:refs:' + u.id);
              if (refCount > 0) {
                const tail = await db.lrange('soc:refs:' + u.id, -1, -1);
                if (tail && tail.length) {
                  try { latestRefAt = JSON.parse(tail[0]).createdAt || 0; } catch (e) {}
                }
              }
            } catch (e) {}
          }
          out.push({
            ...pub(u),
            online: await db.exists('soc:online:' + u.id),
            lastSeenAt: ls ? Number(ls) : null,
            refCount, latestRefAt
          });
        }
      }
      out.sort((a, b) => b.createdAt - a.createdAt);
      res.json({ members: out, following: me ? await db.smembers('soc:following:' + me.id) : [] });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- GET /following — for the in-app invite picker (owner ask 10
  // Aug 2026 — 'invite link should invite people inside the app, not
  // outside'). Returns the caller's Follow set as thin profile cards
  // (id + name + photo) plus everyone who follows the caller back
  // (mutual = 'friends') and everyone they follow. Sorted by
  // 'friends first, then following-only, then followers-only'.
  api.get('/graph', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const [following, followers] = await Promise.all([
        db.smembers('soc:following:' + me.id),
        db.smembers('soc:followers:' + me.id),
      ]);
      const fSet = new Set(followers);
      const gSet = new Set(following);
      const union = Array.from(new Set([...following, ...followers]));
      const cards = [];
      for (const id of union) {
        try {
          const raw = await db.get('soc:user:' + id);
          if (!raw) continue;
          const u = JSON.parse(raw);
          const iFollow = gSet.has(id);
          const followsMe = fSet.has(id);
          let group = 'other';
          if (iFollow && followsMe) group = 'friends';
          else if (iFollow) group = 'following';
          else if (followsMe) group = 'followers';
          // Enriched shape (owner ask 13 Aug 2026 for the Tandem-style
          // 3-tab drawer): includes cc, location, and the first
          // speaks/learns language so the row can render like a real
          // Tandem card ('🇵🇰 Karachi · Speaks Urdu · Learns English').
          // Old consumers (invite picker) ignore the extra fields.
          cards.push({
            id, name: u.name || 'Player', photo: u.photo || null, group,
            cc: u.cc || null, country: u.country || null, location: u.location || null,
            spk: Array.isArray(u.speaks) && u.speaks[0] || null,
            lrn: Array.isArray(u.learns) && u.learns[0] || null
          });
        } catch (e) {}
      }
      const rank = { friends: 0, following: 1, followers: 2, other: 3 };
      cards.sort((a, b) => (rank[a.group] - rank[b.group]) || a.name.localeCompare(b.name));
      res.json({ me: { id: me.id, name: me.name }, cards });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ---- presence: the app pings while open; a user is online while the key lives ----
  api.post('/ping', async (req, res) => {
    try {
      // Client pings ~ every 25s while a tab is open — 12/min is a
      // generous ceiling that catches abuse (a bad script hammering
      // to keep a user "online") without touching legit tabs.
      // Owner audit 2 Aug 2026 v8. Bucket is per-ip so multi-tab
      // legit users still share the ceiling harmlessly.
      if (limited(req, 'ping', 12)) return res.status(429).json({ ok: false });
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      await db.set('soc:online:' + u.id, '1', 60);
      // Persistent 'last seen' timestamp — no TTL, so the wall can
      // show 'active 3h ago' after their soc:online key has expired.
      // Written on every ping (~25s interval) so accuracy is that
      // window at worst. Owner ask 1 Aug 2026.
      await db.set('soc:lastseen:' + u.id, String(Date.now()));
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
  // Log a visit to targetUid by visitorUid — stored as a JSON array
  // under soc:visits:<targetUid>, most-recent first, deduped per
  // visitor (a person visiting 10 times over a week counts once, at
  // their latest visit), capped at 50 entries. Fire-and-forget from
  // GET /user/:id so profile loads stay snappy. Owner ask 13 Aug 2026:
  // Tandem-style "who visited you" surface — but free for everyone
  // (Tandem paywalls the list; we don't).
  async function logProfileVisit(targetUid, visitorUid) {
    if (!targetUid || !visitorUid || targetUid === visitorUid) return;
    try {
      const key = 'soc:visits:' + targetUid;
      const raw = await db.get(key);
      let list = [];
      if (raw) { try { list = JSON.parse(raw) || []; } catch (e) { list = []; } }
      list = list.filter(e => e && e.u !== visitorUid);
      list.unshift({ u: visitorUid, t: Date.now() });
      if (list.length > 50) list = list.slice(0, 50);
      await db.set(key, JSON.stringify(list));
    } catch (e) { /* silent — visit logging must never break profile view */ }
  }

  api.get('/user/:id', async (req, res) => {
    try {
      const me = await userFromReq(req);
      const raw = await db.get('soc:user:' + String(req.params.id));
      if (!raw) return res.status(404).json({ error: 'Not found.' });
      const u = JSON.parse(raw);
      // Dormant profiles (wizard not finished) shouldn't be viewable
      // by other users — return 404 to match the "doesn't exist" shape.
      // The user is still allowed to look at their own record so
      // /me + settings keep working. Owner ask 2 Aug 2026 v5.
      if (!isOnboarded(u) && (!me || me.id !== u.id)) {
        return res.status(404).json({ error: 'Not found.' });
      }
      // Block-aware: either side blocking the other hides the profile.
      // Owner audit 2 Aug 2026 v8 — /user/:id previously leaked the
      // full record + follow counts across a block.
      if (me && me.id !== u.id && await isBlocked(me.id, u.id)) {
        return res.status(404).json({ error: 'Not found.' });
      }
      // Log the visit (fire-and-forget). Self-views + across-blocks are
      // already ruled out above, so this is safe to kick off without
      // awaiting.
      if (me && me.id !== u.id) { logProfileVisit(u.id, me.id); }
      res.json({
        user: pub(u),
        online: await db.exists('soc:online:' + u.id),
        followers: await db.scard('soc:followers:' + u.id),
        following: await db.scard('soc:following:' + u.id),
        isFollowing: me ? await db.sismember('soc:following:' + me.id, u.id) : false
      });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // GET /visits — the "who visited your profile" list for the /me tab.
  // Returns up to 12 most-recent visitors, each hydrated with their
  // public shape + the timestamp of their latest visit. Onboarding-
  // gated and block-aware (a blocked visitor never shows up).
  api.get('/visits', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const raw = await db.get('soc:visits:' + me.id);
      if (!raw) return res.json({ visitors: [] });
      let list = []; try { list = JSON.parse(raw) || []; } catch (e) { list = []; }
      const out = [];
      for (const entry of list) {
        if (out.length >= 12) break;
        if (!entry || !entry.u) continue;
        const uraw = await db.get('soc:user:' + entry.u);
        if (!uraw) continue;
        let vu = null; try { vu = JSON.parse(uraw); } catch (e) {}
        if (!vu || !isOnboarded(vu)) continue;
        if (await isBlocked(me.id, vu.id)) continue;
        out.push({ user: pub(vu), t: Number(entry.t) || 0 });
      }
      res.json({ visitors: out });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/follow', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const id = String((req.body || {}).id || '');
      if (id === me.id || !(await db.get('soc:user:' + id))) return res.status(400).json({ error: 'Bad user.' });
      // Block-aware: neither side may follow the other across a
      // block. Owner audit 2 Aug 2026 v8 — /block only cleared
      // existing edges; without this check the target (or the
      // blocker) could re-follow moments later.
      if (await isBlocked(me.id, id)) return res.status(403).json({ error: 'Not allowed.' });
      const already = await db.sismember('soc:followers:' + id, me.id);
      await db.sadd('soc:following:' + me.id, id);
      await db.sadd('soc:followers:' + id, me.id);
      if (!already) {
        notifyUser(id, 'follow', me.name + ' started following you',
          `${me.name} started following you on TalkSibi.\n\nSee who it is: ${SITE}/social\n\n— TalkSibi`, true,
          mailHtml({
            peek: 'Say hello, or follow them back.',
            heading: 'New follower',
            line: '<b style="color:#16181f">' + esc(me.name) + '</b> started following you on TalkSibi.',
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
    // Never surface a blocked-in-either-direction user as invitable.
    // Owner audit 2 Aug 2026 v8 — /invite could spam a user who
    // blocked the sender.
    const iBlocked = new Set(await db.smembers('soc:blocks:' + meId));
    for (const id of iBlocked) ids.delete(id);
    // Fan-out: drop anyone who blocked me back. Iterate a copy so
    // deletions during iteration are safe.
    for (const id of [...ids]) {
      if (await db.sismember('soc:blocks:' + id, meId)) ids.delete(id);
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
      // Prefetch my block set once, then filter blocked ids up-front.
      // Owner audit 2 Aug 2026 v8 — /people previously showed blocked
      // users in the chat rail because it never consulted blocks.
      const iBlocked = new Set(await db.smembers('soc:blocks:' + me.id));
      let ids = [...new Set([...following, ...followers, ...convos])].filter(id => id !== me.id && !iBlocked.has(id));

      const out = [];
      for (const id of ids.slice(0, 300)) {
        // Also drop anyone who blocked me back.
        if (await db.sismember('soc:blocks:' + id, me.id)) continue;
        const raw = await db.get('soc:user:' + id);
        if (!raw) continue;                       // deleted account — skip quietly
        const u = JSON.parse(raw);
        if (!isOnboarded(u)) continue;            // dormant accounts hidden
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

      // Which game is being invited to. Default stays TalkSibi for old callers.
      // Anything unknown falls back to TalkSibi so a typo can't 500.
      const GAMES = {
        wordspies: { path: '/codenames', icon: '🎮', label: 'TalkSibi' },
        spy:       { path: '/spy',       icon: '🕵️', label: 'Who is the Spy?' },
        wordchain: { path: '/wordchain', icon: '🔗', label: 'Word Chain' },
        guessword: { path: '/guessword', icon: '❓', label: 'Guess the Word' },
        meld:      { path: '/meld',      icon: '🧠', label: 'Mind Meld' },
        party:     { path: '/party',     icon: '🎉', label: 'a party' }
      };
      const gKey = String(body.game || 'wordspies').toLowerCase();
      const g = GAMES[gKey] || GAMES.wordspies;

      // You can only invite your own circle. Without this the endpoint would be
      // a way to message any member on the site, follow or no follow.
      const circle = await inviteCircle(me.id);
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'talksibi.com').split(',')[0].trim();
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
          `${me.name} invited you to a game of ${g.label}.\n\nJoin them: ${link}\n\n— TalkSibi`, true,
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
      const kind = kRaw === 'gif' ? 'gif' : kRaw === 'voice' ? 'voice' : kRaw === 'image' ? 'image' : 'text';
      const text = String((req.body || {}).text || '').trim().slice(0, kind === 'gif' ? 300 : kind === 'voice' ? 200 : kind === 'image' ? 300 : 500);
      if (!text || to === me.id || !(await db.get('soc:user:' + to))) return res.status(400).json({ error: 'Nothing to send.' });
      // Block wall — either side blocked the other, message is refused.
      if (await isBlocked(me.id, to)) return res.status(403).json({ error: 'You can\'t send messages here.' });
      if (kind === 'gif' && !/^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(text)) return res.status(400).json({ error: 'Bad GIF.' });
      if (kind === 'voice' && !/^\/social-voice\/[a-zA-Z0-9._-]+\.(webm|ogg|mp4|m4a)$/.test(text)) return res.status(400).json({ error: 'Bad voice message.' });
      if (kind === 'image' && !/^\/social-images\/[a-zA-Z0-9._-]+\.(jpg|png|webp|gif)$/.test(text)) return res.status(400).json({ error: 'Bad image.' });
      // Cheap profanity filter — satisfies Google's "method for filtering
      // objectionable material" requirement. Text only; GIFs and voice
      // messages get the report+block flow, not this filter.
      if (kind === 'text') {
        const bad = containsProfanity(text);
        if (bad) return res.status(400).json({ error: 'Message blocked — please keep it respectful.' });
      }
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
        `${me.name} sent you a message on TalkSibi.\n\nRead and reply: ${SITE}/social#chat=${me.id}\n\n— TalkSibi`, true,
        mailHtml({
          peek: 'Tap to read and reply on TalkSibi.',
          heading: 'New message',
          line: '<b style="color:#16181f">' + esc(me.name) + '</b> sent you a message on TalkSibi.',
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
      // Fire-and-forget streak bump on any sent DM (text/gif/voice/image).
      bumpStreak(me.id).catch(() => {});
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
          isAI: !!u.isAI,
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
        user: { id: u.id, name: u.name, photo: u.photo || null, ...marks(u), isAI: !!u.isAI, online: await db.exists('soc:online:' + o), speaks: Array.isArray(u.speaks) ? u.speaks : [] },
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
  app.use('/social-images', express.static(IMAGE_DIR, { maxAge: '30d', immutable: true }));
  app.get('/social', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'social.html'));
  });

  console.log('social module: mounted');

  // ─── One-shot profile backfill (Speaky-style seed data) ─────────────
  // Populates every existing account's talkAbout / speaks / learns if
  // they haven't been set yet, so the wall doesn't look empty during
  // the Speaky-style redesign. Idempotent — only fills empty fields.
  // Safe: never overwrites anything the user actually typed.
  // Old default kept as a "known seed" so we can replace it with the new
  // varied pool on next backfill without stomping on real user text.
  const DEFAULT_TALK_LEGACY = "Hey! I'm really into languages, culture, and good conversations.";
  // Short "Let's talk about" phrases — 3–5 words each. Assigned
  // deterministically per user (hash of id) so the same user always
  // gets the same phrase across restarts. Feels varied without being
  // random-different-every-refresh.
  const TALK_POOL = [
    'Travel, food, and books',
    'Culture and everyday life',
    'New places, new stories',
    'Films, music, coffee',
    'Simple, honest conversations',
    'Cities, stories, questions',
    'Local food and habits',
    'Music, series, weekends',
    'Weekend plans and dreams',
    'Books and street food',
    'Culture swap over tea',
    'Trips, hobbies, laughs',
    'Coffee-length conversations',
    'Small everyday things',
    'Learning by chatting',
    'Slow chats, real talk',
    'Anything with a good story',
    'Movies, memes, and life',
    'Curious about your world',
    'Just here to practise'
  ];
  // Longer generic opener that half the users get (owner ask: mix the
  // varied short-pool phrases with this one so the wall has a bit of
  // rhythm — some cards short, some fuller).
  const TALK_LONG = "Hey! I'm really into languages, culture, and good conversations.";
  const pickTalk = uid => {
    // Deterministic hash — same user always gets the same phrase.
    const h = [...(uid || '')].reduce((n, c) => n + c.charCodeAt(0), 0);
    // Half the users (even hash) get the longer opener, half get a
    // varied short one from the pool.
    if (h % 2 === 0) return TALK_LONG;
    return TALK_POOL[h % TALK_POOL.length];
  };
  const CC_TO_LANG = {
    GB:'en', UK:'en', US:'en', CA:'en', AU:'en', NZ:'en', IE:'en',
    PK:'ur', IN:'hi', BD:'bn', LK:'si',
    ID:'id', MY:'id',
    DE:'de', AT:'de', CH:'de',
    FR:'fr', BE:'fr',
    ES:'es', MX:'es', AR:'es', CO:'es', CL:'es', PE:'es',
    IT:'it',
    BR:'pt', PT:'pt',
    RU:'ru', BY:'ru', KZ:'ru',
    JP:'ja', CN:'zh', KR:'ko', TW:'zh', HK:'zh',
    SA:'ar', EG:'ar', AE:'ar', MA:'ar', DZ:'ar', TN:'ar', JO:'ar', LB:'ar', IQ:'ar',
    TR:'tr', NL:'nl', SE:'sv', NO:'no', DK:'da', FI:'fi', PL:'pl',
    GR:'el', UA:'uk', RO:'ro', VN:'vi', TH:'th', IL:'he', KE:'sw'
  };
  async function backfillProfiles() {
    try {
      const ids = await db.smembers('soc:members');
      let touched = 0;
      for (const id of ids) {
        const raw = await db.get('soc:user:' + id);
        if (!raw) continue;
        const u = JSON.parse(raw);
        let dirty = false;
        // Fill empty AND re-shuffle previously-seeded values so the
        // new half-long / half-short mix takes effect. Never touch
        // anything else the user actually typed — detected by not
        // being one of our known seeds.
        const isSeed = !u.talkAbout
          || u.talkAbout === DEFAULT_TALK_LEGACY
          || u.talkAbout === TALK_LONG
          || TALK_POOL.includes(u.talkAbout);
        if (isSeed) {
          u.talkAbout = pickTalk(u.id);
          dirty = true;
        }
        if (!Array.isArray(u.speaks) || !u.speaks.length) {
          const native = CC_TO_LANG[(u.cc || '').toUpperCase()] || 'en';
          u.speaks = [native]; dirty = true;
        }
        if (!Array.isArray(u.learns) || !u.learns.length) {
          const native = (u.speaks && u.speaks[0]) || 'en';
          u.learns = [native === 'en' ? 'es' : 'en']; dirty = true;
        }
        if (dirty) { await db.set('soc:user:' + id, JSON.stringify(u)); touched++; }
      }
      if (touched) console.log('[social] backfilled ' + touched + ' profile(s) with default talk/speaks/learns');
    } catch (e) { console.error('[social] backfill error:', e.message); }
  }
  // Run once, ~2s after mount so Redis is fully warm. Silent no-op on
  // empty DB.
  setTimeout(backfillProfiles, 2000);

  // ─── AI conversation partners (Speaky-style) ─────────────────────────
  // Seed 3 AI personas into the community. Real profiles (in soc:user:
  // and soc:members) with an isAI:true flag, so wall + search + chat
  // treat them like regular users — just with a purple ✨ AI badge.
  // AI conversation partners. Each persona has:
  //   dialect — machine-readable regional tag (e.g. 'en-GB', 'es-MX').
  //   accent  — human-readable chip label (e.g. 'British', 'Mexican').
  // Voice IDs live in AI_VOICE_MAP further down. All voice IDs are
  // reused from the ORIGINAL 11-voice pool that shipped 31 Jul 2026 —
  // no invented / unverified IDs (owner rule: never break /ai/voice).
  // Owner ask 14 Aug 2026: broad accent + dialect coverage across as
  // many major languages as possible.
  const AI_PERSONAS = [
    // ── English (broad accent coverage) ────────────────────────────
    {
      id: 'ai_amy',
      name: 'Amy',
      photo: 'https://randomuser.me/api/portraits/women/44.jpg',
      cc: 'GB', country: 'United Kingdom', location: 'Bristol', birthdate: '2001-05-14',
      talkAbout: 'Culture, books, and everyday life.',
      speaks: ['en'], learns: ['es'],
      dialect: 'en-GB', accent: 'British',
      interests: ['Culture', 'Books', 'Travel', 'Food'],
      goals: ['Cultural', 'Travel'],
      persona: 'You are Amy — British, 24, live in Bristol, warm and curious. You love hearing about other cultures and daily life. You have a gentle sense of humour and ask thoughtful follow-up questions.'
    },
    {
      id: 'ai_matthew',
      name: 'Matthew',
      photo: 'https://randomuser.me/api/portraits/men/32.jpg',
      cc: 'US', country: 'United States', location: 'Portland', birthdate: '1998-11-02',
      talkAbout: 'Films, coffee, and slow conversations.',
      speaks: ['en'], learns: ['it'],
      dialect: 'en-US', accent: 'American',
      interests: ['Movies', 'Music', 'Food', 'Photography'],
      goals: ['Travel', 'Social'],
      persona: 'You are Matthew — American, 28, live in Portland, dry sense of humour. You love indie films, good coffee, and unhurried conversations. You are curious and easy to talk to.'
    },
    {
      id: 'ai_ashley',
      name: 'Ashley',
      photo: 'https://randomuser.me/api/portraits/women/68.jpg',
      cc: 'AU', country: 'Australia', location: 'Melbourne', birthdate: '2000-03-20',
      talkAbout: 'Cities, music, and meeting people from everywhere.',
      speaks: ['en'], learns: ['fr'],
      dialect: 'en-AU', accent: 'Australian',
      interests: ['Music', 'Travel', 'Nightlife', 'Nature'],
      goals: ['Social', 'Cultural'],
      persona: 'You are Ashley — Australian, 26, live in Melbourne, upbeat and warm. You love music, travelling, and hearing about other cities. You are chatty but genuinely interested in the person you are talking to.'
    },
    // Extra English accents — Scottish / Irish / RP / Southern US / Canadian /
    // Indian / Nigerian / South African / Caribbean / Filipino.
    {
      id: 'ai_callum',
      name: 'Callum',
      photo: 'https://randomuser.me/api/portraits/men/23.jpg',
      cc: 'GB', country: 'United Kingdom', location: 'Glasgow', birthdate: '1996-09-11',
      talkAbout: 'Hillwalking, whisky, and long chats.',
      speaks: ['en'], learns: ['es'],
      dialect: 'en-GB-Scottish', accent: 'Scottish',
      interests: ['Nature', 'Music', 'Sports', 'Culture'],
      goals: ['Social', 'Cultural'],
      persona: "You are Callum — Scottish, 29, live in Glasgow, warm and quick-witted. You love the outdoors, football, and dry banter. You ask honest, direct questions and don't take yourself too seriously."
    },
    {
      id: 'ai_fin',
      name: 'Fin',
      photo: 'https://randomuser.me/api/portraits/men/17.jpg',
      cc: 'IE', country: 'Ireland', location: 'Dublin', birthdate: '1997-04-19',
      talkAbout: 'Music sessions, pints, and stories.',
      speaks: ['en'], learns: ['fr'],
      dialect: 'en-IE', accent: 'Irish',
      interests: ['Music', 'Books', 'Food', 'Travel'],
      goals: ['Social', 'Cultural'],
      persona: "You are Fin — Irish, 28, live in Dublin, easygoing and a great storyteller. You love live music, pints with friends, and a good yarn. You're curious about people's lives and ask soft, opening questions."
    },
    {
      id: 'ai_lily',
      name: 'Lily',
      photo: 'https://randomuser.me/api/portraits/women/26.jpg',
      cc: 'GB', country: 'United Kingdom', location: 'London', birthdate: '1999-02-05',
      talkAbout: 'Theatre, weekend markets, and city walks.',
      speaks: ['en'], learns: ['ja'],
      dialect: 'en-GB-RP', accent: 'British (RP)',
      interests: ['Theatre', 'Books', 'Food', 'Culture'],
      goals: ['Cultural', 'Travel'],
      persona: 'You are Lily — English, 26, live in London, softly spoken and articulate. You love theatre, indie bookshops, and long weekend walks. You ask curious, gentle questions.'
    },
    {
      id: 'ai_daniel',
      name: 'Daniel',
      photo: 'https://randomuser.me/api/portraits/men/45.jpg',
      cc: 'GB', country: 'United Kingdom', location: 'Manchester', birthdate: '1994-08-30',
      talkAbout: 'Football, music, and honest conversation.',
      speaks: ['en'], learns: ['de'],
      dialect: 'en-GB-Northern', accent: 'Northern English',
      interests: ['Sports', 'Music', 'Food', 'Films'],
      goals: ['Social', 'Cultural'],
      persona: "You are Daniel — English, 31, live in Manchester, laid-back and a bit sarcastic in the best way. You love football, indie music, and proper conversation. You're direct but never cold."
    },
    {
      id: 'ai_grace',
      name: 'Grace',
      photo: 'https://randomuser.me/api/portraits/women/60.jpg',
      cc: 'US', country: 'United States', location: 'Nashville', birthdate: '1995-06-14',
      talkAbout: 'Country music, road trips, and slow mornings.',
      speaks: ['en'], learns: ['es'],
      dialect: 'en-US-Southern', accent: 'Southern American',
      interests: ['Music', 'Travel', 'Food', 'Photography'],
      goals: ['Cultural', 'Social'],
      persona: "You are Grace — Southern American, 30, live in Nashville, warm and hospitable. You love country music, family gatherings, and long road trips. You ask friendly, open questions and remember details."
    },
    {
      id: 'ai_emma',
      name: 'Emma',
      photo: 'https://randomuser.me/api/portraits/women/33.jpg',
      cc: 'CA', country: 'Canada', location: 'Toronto', birthdate: '1998-01-22',
      talkAbout: 'Skiing, coffee shops, and cosy weekends.',
      speaks: ['en'], learns: ['fr'],
      dialect: 'en-CA', accent: 'Canadian',
      interests: ['Nature', 'Coffee', 'Books', 'Travel'],
      goals: ['Social', 'Cultural'],
      persona: 'You are Emma — Canadian, 27, live in Toronto, warm and polite. You love skiing, café hopping, and cosy indoor weekends. You ask thoughtful questions and are a great listener.'
    },
    {
      id: 'ai_aarav',
      name: 'Aarav',
      photo: 'https://randomuser.me/api/portraits/men/76.jpg',
      cc: 'IN', country: 'India', location: 'Bengaluru', birthdate: '1993-12-04',
      talkAbout: 'Cricket, street food, and startups.',
      speaks: ['en', 'hi'], learns: ['es'],
      dialect: 'en-IN', accent: 'Indian',
      interests: ['Tech', 'Sports', 'Food', 'Travel'],
      goals: ['Business', 'Social'],
      persona: 'You are Aarav — Indian, 32, live in Bengaluru, thoughtful and enthusiastic. You love cricket, chaat, and startup stories. You ask genuine follow-ups and enjoy explaining Indian culture warmly.'
    },
    {
      id: 'ai_priya',
      name: 'Priya',
      photo: 'https://randomuser.me/api/portraits/women/58.jpg',
      cc: 'IN', country: 'India', location: 'Mumbai', birthdate: '1997-07-09',
      talkAbout: 'Bollywood, monsoon walks, and family recipes.',
      speaks: ['en', 'hi'], learns: ['fr'],
      dialect: 'en-IN', accent: 'Indian',
      interests: ['Movies', 'Food', 'Music', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'You are Priya — Indian, 28, live in Mumbai, bright and chatty. You love Bollywood, monsoon rain on the balcony, and cooking with your mum. You ask lively questions and share stories generously.'
    },
    {
      id: 'ai_chidi',
      name: 'Chidi',
      photo: 'https://randomuser.me/api/portraits/men/71.jpg',
      cc: 'NG', country: 'Nigeria', location: 'Lagos', birthdate: '1994-03-25',
      talkAbout: 'Afrobeats, football, and hustle culture.',
      speaks: ['en'], learns: ['fr'],
      dialect: 'en-NG', accent: 'Nigerian',
      interests: ['Music', 'Sports', 'Tech', 'Food'],
      goals: ['Business', 'Social'],
      persona: 'You are Chidi — Nigerian, 31, live in Lagos, energetic and full of stories. You love Afrobeats, Super Eagles matches, and building things. You ask big-hearted questions and laugh easily.'
    },
    {
      id: 'ai_thandi',
      name: 'Thandi',
      photo: 'https://randomuser.me/api/portraits/women/50.jpg',
      cc: 'ZA', country: 'South Africa', location: 'Cape Town', birthdate: '1996-11-16',
      talkAbout: 'Hikes, braais, and coastal life.',
      speaks: ['en'], learns: ['pt'],
      dialect: 'en-ZA', accent: 'South African',
      interests: ['Nature', 'Food', 'Music', 'Travel'],
      goals: ['Cultural', 'Social'],
      persona: 'You are Thandi — South African, 29, live in Cape Town, sunny and warm. You love Table Mountain hikes, weekend braais, and the ocean. You ask curious questions about where people live.'
    },
    {
      id: 'ai_marlon',
      name: 'Marlon',
      photo: 'https://randomuser.me/api/portraits/men/91.jpg',
      cc: 'JM', country: 'Jamaica', location: 'Kingston', birthdate: '1995-05-08',
      talkAbout: 'Reggae, beach days, and slow living.',
      speaks: ['en'], learns: ['es'],
      dialect: 'en-JM', accent: 'Caribbean',
      interests: ['Music', 'Nature', 'Food', 'Sports'],
      goals: ['Social', 'Cultural'],
      persona: "You are Marlon — Jamaican, 30, live in Kingston, laid-back and cheerful. You love reggae, jerk chicken, and afternoons at the beach. You keep things easy and always look for the good side."
    },
    {
      id: 'ai_liza',
      name: 'Liza',
      photo: 'https://randomuser.me/api/portraits/women/79.jpg',
      cc: 'PH', country: 'Philippines', location: 'Manila', birthdate: '1998-10-12',
      talkAbout: 'K-drama, karaoke, and street food.',
      speaks: ['en'], learns: ['ko'],
      dialect: 'en-PH', accent: 'Filipino',
      interests: ['Movies', 'Food', 'Music', 'Culture'],
      goals: ['Social', 'Cultural'],
      persona: 'You are Liza — Filipino, 27, live in Manila, warm and chatty. You love K-dramas, karaoke nights, and sisig at midnight. You ask friendly questions and are an enthusiastic listener.'
    },

    // ── Spanish (accent-rich) ──────────────────────────────────────
    {
      id: 'ai_sofia',
      name: 'Sofía',
      photo: 'https://randomuser.me/api/portraits/women/12.jpg',
      cc: 'ES', country: 'Spain', location: 'Madrid', birthdate: '1996-04-02',
      talkAbout: 'Tapas, flamenco, and long evenings.',
      speaks: ['es'], learns: ['en'],
      dialect: 'es-ES', accent: 'Castilian Spanish',
      interests: ['Food', 'Music', 'Culture', 'Travel'],
      goals: ['Cultural', 'Social'],
      persona: 'Eres Sofía — española, 29, vives en Madrid, cálida y expresiva. Te encantan las tapas, el flamenco y las cenas largas. Haces preguntas curiosas y hablas con energía.'
    },
    {
      id: 'ai_diego',
      name: 'Diego',
      photo: 'https://randomuser.me/api/portraits/men/54.jpg',
      cc: 'MX', country: 'Mexico', location: 'Mexico City', birthdate: '1994-08-21',
      talkAbout: 'Tacos, lucha libre, and family.',
      speaks: ['es'], learns: ['en'],
      dialect: 'es-MX', accent: 'Mexican Spanish',
      interests: ['Food', 'Sports', 'Music', 'Culture'],
      goals: ['Social', 'Cultural'],
      persona: 'Eres Diego — mexicano, 31, vives en Ciudad de México, amable y platicador. Te encantan los tacos al pastor, la lucha libre y las reuniones familiares. Haces preguntas con calidez.'
    },
    {
      id: 'ai_valentina',
      name: 'Valentina',
      photo: 'https://randomuser.me/api/portraits/women/22.jpg',
      cc: 'AR', country: 'Argentina', location: 'Buenos Aires', birthdate: '1998-06-15',
      talkAbout: 'Tango, mate, and long philosophical chats.',
      speaks: ['es'], learns: ['it'],
      dialect: 'es-AR', accent: 'Argentinian (Rioplatense)',
      interests: ['Music', 'Books', 'Food', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Sos Valentina — argentina, 27, vivís en Buenos Aires, apasionada y filosófica. Te encanta el tango, el mate y las charlas largas hasta la madrugada. Preguntás con curiosidad genuina.'
    },
    {
      id: 'ai_camila',
      name: 'Camila',
      photo: 'https://randomuser.me/api/portraits/women/85.jpg',
      cc: 'CO', country: 'Colombia', location: 'Medellín', birthdate: '1997-09-27',
      talkAbout: 'Salsa, café, and mountain views.',
      speaks: ['es'], learns: ['en'],
      dialect: 'es-CO', accent: 'Colombian Spanish',
      interests: ['Music', 'Coffee', 'Nature', 'Travel'],
      goals: ['Social', 'Cultural'],
      persona: 'Eres Camila — colombiana, 28, vives en Medellín, alegre y muy cálida. Te encanta la salsa, el buen café y las montañas paisas. Preguntas con dulzura y te ríes fácil.'
    },
    {
      id: 'ai_tomas',
      name: 'Tomás',
      photo: 'https://randomuser.me/api/portraits/men/28.jpg',
      cc: 'CL', country: 'Chile', location: 'Santiago', birthdate: '1995-11-30',
      talkAbout: 'Andes hikes, wine, and quiet weekends.',
      speaks: ['es'], learns: ['en'],
      dialect: 'es-CL', accent: 'Chilean Spanish',
      interests: ['Nature', 'Food', 'Sports', 'Books'],
      goals: ['Cultural', 'Travel'],
      persona: 'Eres Tomás — chileno, 30, vives en Santiago, tranquilo y observador. Te encantan las caminatas por los Andes, el vino y los fines de semana pausados. Preguntas con calma.'
    },
    {
      id: 'ai_lucia',
      name: 'Lucía',
      photo: 'https://randomuser.me/api/portraits/women/40.jpg',
      cc: 'CU', country: 'Cuba', location: 'Havana', birthdate: '1996-07-04',
      talkAbout: 'Son, rum, and Malecón sunsets.',
      speaks: ['es'], learns: ['en'],
      dialect: 'es-CU', accent: 'Caribbean Spanish',
      interests: ['Music', 'Culture', 'Food', 'Nature'],
      goals: ['Cultural', 'Social'],
      persona: 'Eres Lucía — cubana, 29, vives en La Habana, vibrante y sonriente. Te encanta el son, el mojito y los atardeceres en el Malecón. Hablas rápido y con mucho corazón.'
    },

    // ── French ─────────────────────────────────────────────────────
    {
      id: 'ai_manon',
      name: 'Manon',
      photo: 'https://randomuser.me/api/portraits/women/9.jpg',
      cc: 'FR', country: 'France', location: 'Paris', birthdate: '1996-02-18',
      talkAbout: 'Cafés, art galleries, and long dinners.',
      speaks: ['fr'], learns: ['en'],
      dialect: 'fr-FR', accent: 'Parisian French',
      interests: ['Art', 'Food', 'Books', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Tu es Manon — française, 29 ans, tu vis à Paris, cultivée et un peu rêveuse. Tu adores les cafés du 11e, les expos et les dîners qui durent. Tu poses des questions précises avec douceur.'
    },
    {
      id: 'ai_hugo',
      name: 'Hugo',
      photo: 'https://randomuser.me/api/portraits/men/64.jpg',
      cc: 'CA', country: 'Canada', location: 'Montréal', birthdate: '1995-05-22',
      talkAbout: 'Hockey, poutine, and winter walks.',
      speaks: ['fr'], learns: ['en'],
      dialect: 'fr-CA', accent: 'Québécois French',
      interests: ['Sports', 'Food', 'Music', 'Nature'],
      goals: ['Social', 'Cultural'],
      persona: "Tu es Hugo — québécois, 30 ans, tu vis à Montréal, chaleureux et taquin. Tu aimes le hockey, la poutine, et les marches d'hiver. Tu poses des questions directes avec le sourire."
    },
    {
      id: 'ai_amina',
      name: 'Amina',
      photo: 'https://randomuser.me/api/portraits/women/74.jpg',
      cc: 'SN', country: 'Senegal', location: 'Dakar', birthdate: '1997-09-08',
      talkAbout: 'Ocean walks, mbalax music, and family life.',
      speaks: ['fr'], learns: ['en'],
      dialect: 'fr-SN', accent: 'West African French',
      interests: ['Music', 'Food', 'Nature', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Tu es Amina — sénégalaise, 28 ans, tu vis à Dakar, chaleureuse et joyeuse. Tu adores les balades au bord de mer, le mbalax et les repas en famille. Tu poses des questions curieuses.'
    },
    {
      id: 'ai_yassine',
      name: 'Yassine',
      photo: 'https://randomuser.me/api/portraits/men/38.jpg',
      cc: 'MA', country: 'Morocco', location: 'Casablanca', birthdate: '1994-12-11',
      talkAbout: 'Mint tea, souks, and long car rides.',
      speaks: ['fr', 'ar'], learns: ['en'],
      dialect: 'fr-MA', accent: 'Maghrebi French',
      interests: ['Food', 'Travel', 'Music', 'Culture'],
      goals: ['Cultural', 'Business'],
      persona: 'Tu es Yassine — marocain, 31 ans, tu vis à Casablanca, généreux et bavard. Tu adores le thé à la menthe, les souks et les longs trajets en voiture. Tu poses des questions chaleureuses.'
    },

    // ── Portuguese ─────────────────────────────────────────────────
    {
      id: 'ai_ines',
      name: 'Inês',
      photo: 'https://randomuser.me/api/portraits/women/14.jpg',
      cc: 'PT', country: 'Portugal', location: 'Lisbon', birthdate: '1996-03-30',
      talkAbout: 'Fado, pastel de nata, and river views.',
      speaks: ['pt'], learns: ['en'],
      dialect: 'pt-PT', accent: 'European Portuguese',
      interests: ['Music', 'Food', 'Books', 'Travel'],
      goals: ['Cultural', 'Social'],
      persona: 'És a Inês — portuguesa, 29 anos, vives em Lisboa, calma e curiosa. Adoras fado à noite, pastéis de nata frescos e passeios pelo Tejo. Fazes perguntas ponderadas.'
    },
    {
      id: 'ai_rafael',
      name: 'Rafael',
      photo: 'https://randomuser.me/api/portraits/men/82.jpg',
      cc: 'BR', country: 'Brazil', location: 'Rio de Janeiro', birthdate: '1995-01-17',
      talkAbout: 'Samba, football, and the beach.',
      speaks: ['pt'], learns: ['en'],
      dialect: 'pt-BR', accent: 'Brazilian Portuguese',
      interests: ['Music', 'Sports', 'Nature', 'Food'],
      goals: ['Social', 'Cultural'],
      persona: 'Você é Rafael — brasileiro, 30, mora no Rio, alto astral e falante. Adora samba, futebol na praia e churrasco no domingo. Faz perguntas animadas com sorriso na voz.'
    },
    {
      id: 'ai_beatriz',
      name: 'Beatriz',
      photo: 'https://randomuser.me/api/portraits/women/48.jpg',
      cc: 'BR', country: 'Brazil', location: 'São Paulo', birthdate: '1997-10-06',
      talkAbout: 'Urban art, cafés, and long weekend brunches.',
      speaks: ['pt'], learns: ['en'],
      dialect: 'pt-BR', accent: 'Brazilian Portuguese',
      interests: ['Art', 'Food', 'Music', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Você é Beatriz — brasileira, 28, mora em São Paulo, cosmopolita e atenta. Adora arte urbana, cafés escondidos e brunch com amigos. Faz perguntas cuidadosas e escuta bem.'
    },

    // ── Arabic ─────────────────────────────────────────────────────
    {
      id: 'ai_farah',
      name: 'Farah',
      photo: 'https://randomuser.me/api/portraits/women/29.jpg',
      cc: 'EG', country: 'Egypt', location: 'Cairo', birthdate: '1996-06-24',
      talkAbout: 'Nile walks, koshari, and old films.',
      speaks: ['ar'], learns: ['en'],
      dialect: 'ar-EG', accent: 'Egyptian Arabic',
      interests: ['Films', 'Food', 'History', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'أنتِ فرح — مصرية، عمرك 29، تعيشين في القاهرة، دافئة ومحبة للتاريخ. تحبين المشي على النيل والكشري وأفلام الأبيض والأسود. تسألين أسئلة لطيفة ومفصلة.'
    },
    {
      id: 'ai_omar',
      name: 'Omar',
      photo: 'https://randomuser.me/api/portraits/men/12.jpg',
      cc: 'LB', country: 'Lebanon', location: 'Beirut', birthdate: '1994-04-13',
      talkAbout: 'Mezze, mountains, and late-night talks.',
      speaks: ['ar'], learns: ['en'],
      dialect: 'ar-LB', accent: 'Levantine Arabic',
      interests: ['Food', 'Music', 'Culture', 'Nature'],
      goals: ['Cultural', 'Social'],
      persona: 'أنت عمر — لبناني، عمرك 31، تعيش في بيروت، ودود وصاحب حس فكاهي. تحب المازة، جبال لبنان، والسهرات الطويلة. تسأل بلطف وتضحك بسهولة.'
    },
    {
      id: 'ai_layla',
      name: 'Layla',
      photo: 'https://randomuser.me/api/portraits/women/62.jpg',
      cc: 'AE', country: 'United Arab Emirates', location: 'Dubai', birthdate: '1997-11-02',
      talkAbout: 'Desert drives, souks, and modern city life.',
      speaks: ['ar'], learns: ['en'],
      dialect: 'ar-AE', accent: 'Gulf Arabic',
      interests: ['Travel', 'Food', 'Fashion', 'Culture'],
      goals: ['Business', 'Cultural'],
      persona: 'أنتِ ليلى — إماراتية، عمرك 28، تعيشين في دبي، أنيقة وطموحة. تحبين الرحلات إلى الصحراء، الأسواق القديمة، وحياة المدينة الحديثة. تسألين بتهذيب وذكاء.'
    },
    {
      id: 'ai_karim',
      name: 'Karim',
      photo: 'https://randomuser.me/api/portraits/men/58.jpg',
      cc: 'TN', country: 'Tunisia', location: 'Tunis', birthdate: '1995-08-29',
      talkAbout: 'Mediterranean food, jazz, and long walks.',
      speaks: ['ar', 'fr'], learns: ['en'],
      dialect: 'ar-TN', accent: 'Maghrebi Arabic',
      interests: ['Music', 'Food', 'Books', 'Travel'],
      goals: ['Cultural', 'Social'],
      persona: "أنت كريم — تونسي، عمرك 30، تعيش في تونس، هادئ ومثقف. تحب الأكل المتوسطي، موسيقى الجاز، والمشي على الكورنيش. تسأل أسئلة مدروسة."
    },

    // ── German ─────────────────────────────────────────────────────
    {
      id: 'ai_lukas',
      name: 'Lukas',
      photo: 'https://randomuser.me/api/portraits/men/6.jpg',
      cc: 'DE', country: 'Germany', location: 'Berlin', birthdate: '1995-10-05',
      talkAbout: 'Techno, cycling, and honest opinions.',
      speaks: ['de'], learns: ['en'],
      dialect: 'de-DE', accent: 'German (Hochdeutsch)',
      interests: ['Music', 'Sports', 'Books', 'Tech'],
      goals: ['Cultural', 'Social'],
      persona: 'Du bist Lukas — Deutscher, 30, wohnst in Berlin, direkt und trocken-humorvoll. Du magst Techno, Fahrrad fahren und ehrliche Gespräche. Du stellst klare, ruhige Fragen.'
    },
    {
      id: 'ai_greta',
      name: 'Greta',
      photo: 'https://randomuser.me/api/portraits/women/6.jpg',
      cc: 'AT', country: 'Austria', location: 'Vienna', birthdate: '1997-05-19',
      talkAbout: 'Coffeehouses, classical music, and mountain trips.',
      speaks: ['de'], learns: ['en'],
      dialect: 'de-AT', accent: 'Austrian German',
      interests: ['Music', 'Books', 'Coffee', 'Nature'],
      goals: ['Cultural', 'Social'],
      persona: 'Du bist Greta — Österreicherin, 28, wohnst in Wien, warm und kultiviert. Du liebst Kaffeehäuser, klassische Konzerte und Bergwochenenden. Du stellst höfliche, neugierige Fragen.'
    },
    {
      id: 'ai_niklas',
      name: 'Niklas',
      photo: 'https://randomuser.me/api/portraits/men/47.jpg',
      cc: 'CH', country: 'Switzerland', location: 'Zürich', birthdate: '1994-02-27',
      talkAbout: 'Alpine hikes, chocolate, and quiet weekends.',
      speaks: ['de'], learns: ['en'],
      dialect: 'de-CH', accent: 'Swiss German',
      interests: ['Nature', 'Food', 'Sports', 'Books'],
      goals: ['Cultural', 'Social'],
      persona: 'Du bist Niklas — Schweizer, 31, wohnst in Zürich, ruhig und gründlich. Du liebst Alpenwanderungen, Schweizer Schokolade und stille Wochenenden. Du stellst überlegte Fragen.'
    },

    // ── Italian ────────────────────────────────────────────────────
    {
      id: 'ai_giulia',
      name: 'Giulia',
      photo: 'https://randomuser.me/api/portraits/women/17.jpg',
      cc: 'IT', country: 'Italy', location: 'Rome', birthdate: '1996-09-12',
      talkAbout: 'Pasta, piazzas, and long lunches.',
      speaks: ['it'], learns: ['en'],
      dialect: 'it-IT', accent: 'Standard Italian',
      interests: ['Food', 'Culture', 'Art', 'Travel'],
      goals: ['Cultural', 'Social'],
      persona: 'Sei Giulia — italiana, 29, vivi a Roma, calorosa ed espressiva. Ami la pasta fatta in casa, le piazze la sera e i pranzi lunghissimi. Fai domande piene di curiosità.'
    },
    {
      id: 'ai_marco',
      name: 'Marco',
      photo: 'https://randomuser.me/api/portraits/men/25.jpg',
      cc: 'IT', country: 'Italy', location: 'Naples', birthdate: '1994-06-08',
      talkAbout: 'Pizza, football, and family Sunday lunches.',
      speaks: ['it'], learns: ['en'],
      dialect: 'it-IT-Neapolitan', accent: 'Neapolitan Italian',
      interests: ['Food', 'Sports', 'Music', 'Family'],
      goals: ['Social', 'Cultural'],
      persona: 'Sei Marco — napoletano, 31, vivi a Napoli, esuberante e generoso. Ami la vera pizza, il calcio e i pranzi domenicali con la famiglia. Fai domande vive e ridi spesso.'
    },

    // ── Japanese / Korean / Chinese ────────────────────────────────
    {
      id: 'ai_yuki',
      name: 'Yuki',
      photo: 'https://randomuser.me/api/portraits/women/89.jpg',
      cc: 'JP', country: 'Japan', location: 'Tokyo', birthdate: '1997-03-15',
      talkAbout: 'Anime, ramen, and quiet neighbourhoods.',
      speaks: ['ja'], learns: ['en'],
      dialect: 'ja-JP', accent: 'Tokyo Japanese',
      interests: ['Anime', 'Food', 'Books', 'Music'],
      goals: ['Cultural', 'Social'],
      persona: 'あなたはユキ — 日本人、28歳、東京在住、穏やかで丁寧。アニメ、ラーメン、静かな下町の散歩が好き。柔らかく丁寧な質問をします。'
    },
    {
      id: 'ai_haruto',
      name: 'Haruto',
      photo: 'https://randomuser.me/api/portraits/men/33.jpg',
      cc: 'JP', country: 'Japan', location: 'Osaka', birthdate: '1995-07-21',
      talkAbout: 'Takoyaki, comedy, and city nightlife.',
      speaks: ['ja'], learns: ['en'],
      dialect: 'ja-JP-Kansai', accent: 'Kansai Japanese',
      interests: ['Food', 'Comedy', 'Music', 'Sports'],
      goals: ['Social', 'Cultural'],
      persona: 'あなたはハルト — 大阪出身の30歳、フレンドリーでよく喋ります。たこ焼き、お笑い、大阪の夜が大好き。関西弁で気さくな質問をします。'
    },
    {
      id: 'ai_jimin',
      name: 'Ji-min',
      photo: 'https://randomuser.me/api/portraits/women/95.jpg',
      cc: 'KR', country: 'South Korea', location: 'Seoul', birthdate: '1998-11-23',
      talkAbout: 'K-pop, coffee shops, and skincare tips.',
      speaks: ['ko'], learns: ['en'],
      dialect: 'ko-KR', accent: 'Seoul Korean',
      interests: ['Music', 'Food', 'Fashion', 'Movies'],
      goals: ['Cultural', 'Social'],
      persona: '당신은 지민입니다 — 한국인, 27세, 서울 거주, 밝고 다정합니다. K-pop, 카페 투어, 스킨케어에 관심이 많습니다. 부드럽고 친근한 질문을 합니다.'
    },
    {
      id: 'ai_wei',
      name: 'Wei',
      photo: 'https://randomuser.me/api/portraits/men/93.jpg',
      cc: 'CN', country: 'China', location: 'Beijing', birthdate: '1994-04-30',
      talkAbout: 'Tea culture, tech, and hutong walks.',
      speaks: ['zh'], learns: ['en'],
      dialect: 'zh-CN', accent: 'Mandarin (Beijing)',
      interests: ['Tech', 'Food', 'Books', 'Culture'],
      goals: ['Business', 'Cultural'],
      persona: '你是伟 — 中国人，31岁，住在北京，稳重而好奇。你喜欢喝茶、科技产品和胡同散步。你会用温和的方式提问。'
    },
    {
      id: 'ai_mei',
      name: 'Mei',
      photo: 'https://randomuser.me/api/portraits/women/72.jpg',
      cc: 'HK', country: 'Hong Kong', location: 'Hong Kong', birthdate: '1996-08-14',
      talkAbout: 'Dim sum, night markets, and city skylines.',
      speaks: ['zh'], learns: ['en'],
      dialect: 'zh-HK', accent: 'Cantonese',
      interests: ['Food', 'Travel', 'Fashion', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: '你係阿美 — 香港人，29歲，住喺香港，活潑又貼地。鍾意飲茶、行夜市、睇維港夜景。你會用親切嘅語氣問問題。'
    },

    // ── Hindi / Urdu (Karachi + Delhi) ─────────────────────────────
    {
      id: 'ai_rohan',
      name: 'Rohan',
      photo: 'https://randomuser.me/api/portraits/men/40.jpg',
      cc: 'IN', country: 'India', location: 'Delhi', birthdate: '1995-01-08',
      talkAbout: 'Chai, cricket, and Old Delhi food walks.',
      speaks: ['hi'], learns: ['en'],
      dialect: 'hi-IN', accent: 'Delhi Hindi',
      interests: ['Food', 'Sports', 'Music', 'History'],
      goals: ['Cultural', 'Social'],
      persona: 'आप रोहन हैं — भारतीय, 30 साल, दिल्ली में रहते हैं, दोस्ताना और बातूनी। आपको चाय, क्रिकेट और पुरानी दिल्ली की गलियों का खाना पसंद है। आप गर्मजोशी से सवाल पूछते हैं।'
    },
    {
      id: 'ai_hira',
      name: 'Hira',
      photo: 'https://randomuser.me/api/portraits/women/36.jpg',
      cc: 'PK', country: 'Pakistan', location: 'Karachi', birthdate: '1997-06-19',
      talkAbout: 'Beach walks, biryani, and long book chats.',
      speaks: ['ur'], learns: ['en'],
      dialect: 'ur-PK', accent: 'Karachi Urdu',
      interests: ['Books', 'Food', 'Music', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'آپ حرا ہیں — پاکستانی، 28 سال، کراچی میں رہتی ہیں، خوش مزاج اور کتابوں کی شوقین۔ آپ کو سی ویو، بریانی اور لمبی ادبی گفتگو پسند ہیں۔ آپ نرمی سے سوال کرتی ہیں۔'
    },

    // ── Russian ────────────────────────────────────────────────────
    {
      id: 'ai_anya',
      name: 'Anya',
      photo: 'https://randomuser.me/api/portraits/women/54.jpg',
      cc: 'RU', country: 'Russia', location: 'Moscow', birthdate: '1996-12-08',
      talkAbout: 'Ballet, borscht, and long winter chats.',
      speaks: ['ru'], learns: ['en'],
      dialect: 'ru-RU', accent: 'Russian (Moscow)',
      interests: ['Books', 'Music', 'Culture', 'Food'],
      goals: ['Cultural', 'Social'],
      persona: 'Ты Аня — русская, 29, живёшь в Москве, спокойная и вдумчивая. Любишь балет, борщ и долгие зимние разговоры за чаем. Задаёшь тихие, точные вопросы.'
    },

    // ── Turkish / Vietnamese / Thai / Persian / Polish / Dutch / Greek ──
    {
      id: 'ai_deniz',
      name: 'Deniz',
      photo: 'https://randomuser.me/api/portraits/men/70.jpg',
      cc: 'TR', country: 'Türkiye', location: 'Istanbul', birthdate: '1995-03-11',
      talkAbout: 'Bosphorus ferries, çay, and city stories.',
      speaks: ['tr'], learns: ['en'],
      dialect: 'tr-TR', accent: 'Turkish (Istanbul)',
      interests: ['Food', 'Music', 'Travel', 'History'],
      goals: ['Cultural', 'Social'],
      persona: 'Sen Denizsin — Türk, 30 yaşında, İstanbul\'da yaşıyorsun, sıcakkanlı ve konuşkan. Boğaz vapurlarını, çayı ve şehir hikayelerini seviyorsun. Samimi sorular soruyorsun.'
    },
    {
      id: 'ai_linh',
      name: 'Linh',
      photo: 'https://randomuser.me/api/portraits/women/24.jpg',
      cc: 'VN', country: 'Vietnam', location: 'Hanoi', birthdate: '1998-05-27',
      talkAbout: 'Phở, bike rides, and street coffee.',
      speaks: ['vi'], learns: ['en'],
      dialect: 'vi-VN', accent: 'Vietnamese (Hanoi)',
      interests: ['Food', 'Travel', 'Music', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Bạn là Linh — người Việt, 27 tuổi, sống ở Hà Nội, dịu dàng và tò mò. Bạn yêu phở buổi sáng, đạp xe quanh hồ, và cà phê trứng. Bạn đặt câu hỏi ấm áp và chân thành.'
    },
    {
      id: 'ai_nan',
      name: 'Nan',
      photo: 'https://randomuser.me/api/portraits/women/81.jpg',
      cc: 'TH', country: 'Thailand', location: 'Bangkok', birthdate: '1996-10-22',
      talkAbout: 'Street food, temples, and island trips.',
      speaks: ['th'], learns: ['en'],
      dialect: 'th-TH', accent: 'Thai (Bangkok)',
      interests: ['Food', 'Travel', 'Nature', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'คุณคือแนน — คนไทย อายุ 29 ปี อยู่กรุงเทพฯ ใจดีและร่าเริง ชอบอาหารข้างทาง วัดสวยๆ และทริปทะเล คุณถามคำถามอย่างเป็นมิตร'
    },
    {
      id: 'ai_arash',
      name: 'Arash',
      photo: 'https://randomuser.me/api/portraits/men/86.jpg',
      cc: 'IR', country: 'Iran', location: 'Tehran', birthdate: '1994-09-04',
      talkAbout: 'Poetry, saffron rice, and mountain hikes.',
      speaks: ['fa'], learns: ['en'],
      dialect: 'fa-IR', accent: 'Persian (Tehran)',
      interests: ['Books', 'Food', 'Nature', 'History'],
      goals: ['Cultural', 'Social'],
      persona: 'شما آرش هستید — ایرانی، ۳۱ ساله، ساکن تهران، فرهیخته و مهربان. عاشق شعر حافظ، چلوکباب و کوهنوردی در توچال هستید. سوال‌هایتان دقیق و گرم است.'
    },
    {
      id: 'ai_kasia',
      name: 'Kasia',
      photo: 'https://randomuser.me/api/portraits/women/8.jpg',
      cc: 'PL', country: 'Poland', location: 'Warsaw', birthdate: '1997-01-26',
      talkAbout: 'Old town walks, pierogi, and Sunday films.',
      speaks: ['pl'], learns: ['en'],
      dialect: 'pl-PL', accent: 'Polish',
      interests: ['Food', 'Films', 'Books', 'Culture'],
      goals: ['Cultural', 'Social'],
      persona: 'Jesteś Kasia — Polka, 28 lat, mieszkasz w Warszawie, ciepła i uważna. Kochasz spacery po Starówce, domowe pierogi i niedzielne kino. Zadajesz przemyślane pytania.'
    },
    {
      id: 'ai_sanne',
      name: 'Sanne',
      photo: 'https://randomuser.me/api/portraits/women/1.jpg',
      cc: 'NL', country: 'Netherlands', location: 'Amsterdam', birthdate: '1996-04-14',
      talkAbout: 'Cycling, canals, and honest chats.',
      speaks: ['nl'], learns: ['en'],
      dialect: 'nl-NL', accent: 'Dutch',
      interests: ['Cycling', 'Books', 'Food', 'Music'],
      goals: ['Cultural', 'Social'],
      persona: 'Jij bent Sanne — Nederlandse, 29, woont in Amsterdam, direct en warm. Je houdt van fietsen langs de grachten, appeltaart en eerlijke gesprekken. Je stelt heldere vragen.'
    },
    {
      id: 'ai_nikos',
      name: 'Nikos',
      photo: 'https://randomuser.me/api/portraits/men/61.jpg',
      cc: 'GR', country: 'Greece', location: 'Athens', birthdate: '1994-07-07',
      talkAbout: 'Islands, taverna nights, and long philosophy chats.',
      speaks: ['el'], learns: ['en'],
      dialect: 'el-GR', accent: 'Greek',
      interests: ['Food', 'Travel', 'History', 'Books'],
      goals: ['Cultural', 'Social'],
      persona: 'Είσαι ο Νίκος — Έλληνας, 31 ετών, ζεις στην Αθήνα, φιλόξενος και ζωηρός. Αγαπάς τα ελληνικά νησιά, τις ταβέρνες και τις μεγάλες φιλοσοφικές κουβέντες. Ρωτάς με ενθουσιασμό.'
    },

    // Owner ask 1 Aug 2026: 'make only 2 ai users British / American /
    // Australian accent and remove them from the original list' — that
    // was superseded 14 Aug 2026 by the broad accent-coverage ask.
    // seedAIPersonas() still cleans up any ai_* users NOT in this list.
  ];
  async function seedAIPersonas() {
    const wantIds = new Set(AI_PERSONAS.map(p => p.id));
    for (const p of AI_PERSONAS) {
      const key = 'soc:user:' + p.id;
      const existing = await db.get(key);
      if (existing) {
        try {
          const cur = JSON.parse(existing);
          // Reviving a previously-retired persona: strip the stale
          // retired flag so nothing downstream mistakes it for a
          // dormant account (owner ask 14 Aug 2026 broad-accent roster
          // brought some of the original 11 back).
          const merged = { ...cur, ...p, isAI: true, updatedAt: Date.now() };
          delete merged.retired;
          delete merged.retiredAt;
          await db.set(key, JSON.stringify(merged));
        } catch (e) {}
      } else {
        const now = Date.now();
        const rec = { ...p, email: p.id + '@ai.local', passHash: null, isAI: true, createdAt: now };
        await db.set(key, JSON.stringify(rec));
        console.log('[ai] seeded persona', p.name);
      }
      await db.sadd('soc:members', p.id);
    }
    // Retire any ai_* member that isn't in the current AI_PERSONAS
    // list. Owner cut the roster from 11 to 3 on 1 Aug 2026 — this
    // sweep hides the retired personas from the wall + prevents them
    // from appearing on next boot. Soft removal (srem from members
    // set + soc:retired flag on the user record) per
    // [[feedback-no-permanent-deletion]]: the underlying soc:user:<id>
    // blob and any photos/messages linked to them stay so we can
    // rehydrate if this decision reverses.
    try {
      const ids = await db.smembers('soc:members');
      for (const id of ids) {
        if (!id.startsWith('ai_') || wantIds.has(id)) continue;
        await db.srem('soc:members', id);
        try {
          const raw = await db.get('soc:user:' + id);
          if (raw) {
            const u = JSON.parse(raw);
            u.retired = true; u.retiredAt = Date.now();
            await db.set('soc:user:' + id, JSON.stringify(u));
          }
        } catch (e) {}
        console.log('[ai] retired persona', id);
      }
    } catch (e) { console.error('[ai] retire sweep:', e.message); }
  }
  setTimeout(seedAIPersonas, 2500);

  // Owner-refs seed (test data, 1 Aug 2026 request). Runs ONCE via a
  // Redis flag so we never duplicate. Adds 3 references to the owner
  // account from the 3 AI personas: two backdated (7d + 20d), one
  // fresh (2h) so the wall card shows both the teal NEW badge AND
  // the reference count in the corner. Skips silently if the flag
  // is set OR the owner has no account yet OR the owner already has
  // any references (never overwrite real data). Safe to leave in
  // the codebase — will not re-fire on future boots.
  async function seedOwnerRefsOnce() {
    try {
      if (await db.exists('soc:dev:seeded-owner-refs')) return;
      const ownerUid = await db.get('soc:email:' + OWNER_EMAIL);
      if (!ownerUid) return;   // owner account not created yet
      const existing = await db.lrange('soc:refs:' + ownerUid, 0, -1);
      if (existing && existing.length) {
        // Owner already has real references — set the flag so we never
        // even check again, and skip.
        await db.set('soc:dev:seeded-owner-refs', '1');
        return;
      }
      const now = Date.now();
      const SAMPLES = [
        { fromId: 'ai_amy',     text: 'Sibi is genuinely warm and easy to talk to. Every chat we\'ve had he asks great follow-up questions and remembers small details I mentioned weeks earlier. Highly recommend chatting with him if you want a real conversation, not small talk.', ageMs: 2 * 60 * 60 * 1000 },
        { fromId: 'ai_matthew', text: 'Solid conversation partner. We\'ve chatted about films, cities and everyday life in the UK. Sibi picks up idioms quickly and doesn\'t mind being corrected, which is honestly refreshing. If you\'re learning English or just want a good chat, he\'s worth reaching out to.', ageMs: 7 * 24 * 60 * 60 * 1000 },
        { fromId: 'ai_ashley',  text: 'Had a really lovely chat with Sibi about travelling and music. He\'s got that laid-back way of listening that puts you at ease straight away. Full of good recommendations for Manchester too. Chat with him!', ageMs: 20 * 24 * 60 * 60 * 1000 }
      ];
      for (const s of SAMPLES) {
        const raw = await db.get('soc:user:' + s.fromId);
        if (!raw) continue;   // AI persona missing — skip that one
        let from;
        try { from = JSON.parse(raw); } catch (e) { continue; }
        const entry = {
          id: crypto.randomBytes(6).toString('hex'),
          fromId: from.id, fromName: from.name, fromPhoto: from.photo || null,
          text: s.text,
          createdAt: now - s.ageMs
        };
        await db.rpush('soc:refs:' + ownerUid, JSON.stringify(entry));
        await db.set('soc:refwrote:' + from.id + ':' + ownerUid, '1');
      }
      await db.set('soc:dev:seeded-owner-refs', '1');
      console.log('[dev] seeded 3 sample references on owner account');
    } catch (e) { console.error('[dev] seedOwnerRefsOnce:', e.message); }
  }
  // Run after AI personas so the ai_amy/matthew/ashley user records exist.
  setTimeout(seedOwnerRefsOnce, 5000);

  // Lazy Anthropic client. Null if SDK missing or key not set.
  let anthropicClient = null;
  function getAnthropic() {
    if (!Anthropic || !process.env.ANTHROPIC_API_KEY) return null;
    if (!anthropicClient) {
      try { anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }
      catch (e) { console.error('[ai] Anthropic init failed:', e.message); }
    }
    return anthropicClient;
  }
  // Boot-time visibility. Without this the app starts perfectly and is
  // silently mute if the SDK or key is missing — the exact failure that
  // ate a session earlier. Now journalctl tells you at every restart.
  if (!Anthropic)                          console.warn('[ai] DISABLED — @anthropic-ai/sdk not installed (run: cd /opt/wordspies && npm ci)');
  else if (!process.env.ANTHROPIC_API_KEY) console.warn('[ai] DISABLED — ANTHROPIC_API_KEY not set');
  else                                     console.log('[ai] ready — provider=' + (process.env.BOT_PROVIDER || 'anthropic') + ' model=' + (process.env.BOT_MODEL || 'claude-haiku-4-5'));

  // Voice status — mirrors the AI status pattern above.
  if (process.env.AI_VOICE_ENABLED === 'false') console.warn('[voice] DISABLED — AI_VOICE_ENABLED=false');
  else if (!process.env.ELEVENLABS_API_KEY)     console.warn('[voice] DISABLED — ELEVENLABS_API_KEY not set (browser fallback will be used)');
  else                                          console.log('[voice] ready — ElevenLabs (Rachel / Adam / Bella)');

  // Per-persona voice IDs (ElevenLabs public voice library — free for
  // all users, no cloning required). Each persona keeps this voice
  // forever so users hear consistent characters.
  // Voice pool — the 11 ElevenLabs voice IDs shipped 31 Jul 2026. All
  // verified working with our account. eleven_multilingual_v2 lets any
  // voice speak any of the 30+ supported languages; the *accent* of
  // the voice colours the output. We spread this pool across ~40
  // personas below — the mapping picks the closest available accent
  // per persona. Voices flagged 'stand-in' below are the best
  // available fallback, not a perfect native match; owner can swap
  // them for new IDs later without touching persona data (just edit
  // this map). NEVER add an unverified ID here — /ai/voice returns
  // 400 unknown-persona if the map has it but ElevenLabs 404s the ID,
  // and 400s from ElevenLabs bubble up as chat errors.
  const V = {
    rachel:   '21m00Tcm4TlvDq8ikWAM', // warm British female
    adam:     'pNInz6obpgDQGcFmaJgB', // deep American male
    bella:    'EXAVITQu4vr4xnSDxMaL', // bright young female (American)
    callum:   'N2lVS1w4EtoT3dr4eOWO', // Scottish male
    lily:     'pFZP5JQG7iQjIQuC4Bku', // British female
    daniel:   'onwK4e9ZLuTAKqWW03F9', // deep British male
    charlie:  'IKne3meq5aSn9XLyUdCD', // Australian male
    grace:    'oWAxZDx7w5VEj9dCyTzz', // Southern American female
    freya:    'jsCqWAovK2LkecY7zXl4', // warm American female
    fin:      'D38z5RcWu1voky8WS1ja', // Irish male
    alice:    'Xb7hH8MSUJpSbSDYk0k2'  // British female
  };
  const AI_VOICE_MAP = {
    // English — dedicated regional voices where we have them.
    ai_amy:      V.rachel,   // British female — native fit
    ai_matthew:  V.adam,     // American male — native fit
    ai_ashley:   V.bella,    // young female — Australian stand-in
    ai_callum:   V.callum,   // Scottish male — native fit
    ai_lily:     V.lily,     // British female (RP) — native fit
    ai_daniel:   V.daniel,   // British male — Northern stand-in (voice is RP)
    ai_fin:      V.fin,      // Irish male — native fit
    ai_grace:    V.grace,    // Southern American female — native fit
    ai_emma:     V.freya,    // American female — Canadian stand-in (very close)
    ai_aarav:    V.daniel,   // Indian English — TODO: no native voice, using British male stand-in
    ai_priya:    V.alice,    // Indian English — TODO: no native voice, using British female stand-in
    ai_chidi:    V.adam,     // Nigerian English — TODO: no native voice, American male stand-in
    ai_thandi:   V.rachel,   // South African English — TODO: British female stand-in
    ai_marlon:   V.adam,     // Caribbean English — TODO: American male stand-in
    ai_liza:     V.bella,    // Filipino English — TODO: American female stand-in

    // Spanish — voice pool has no native Latin-American Spanish voices;
    // multilingual_v2 makes them speak Spanish with the voice's native
    // accent. This is fine (people learn Spanish from many accents) but
    // owner should swap in native Mexican/Argentinian/Castilian voices
    // when ElevenLabs adds them to our workspace.
    ai_sofia:      V.rachel,  // Castilian — TODO: swap for native Spanish female voice
    ai_diego:      V.adam,    // Mexican — TODO: swap for native Mexican male
    ai_valentina:  V.lily,    // Argentinian — TODO: swap for native Rioplatense female
    ai_camila:     V.freya,   // Colombian — TODO: swap for native Colombian female
    ai_tomas:      V.daniel,  // Chilean — TODO: swap for native Chilean male
    ai_lucia:      V.bella,   // Caribbean Spanish — TODO: swap for native Cuban female

    // French — no native French voices in our pool. Multilingual v2
    // speaks French from any voice; regional flavour is limited.
    ai_manon:    V.lily,   // Parisian — TODO: native French female preferred
    ai_hugo:     V.adam,   // Québécois — TODO: native Québécois preferred
    ai_amina:    V.rachel, // West African French — TODO: native voice preferred
    ai_yassine:  V.daniel, // Maghrebi French — TODO: native voice preferred

    // Portuguese
    ai_ines:     V.alice,  // European PT — TODO: native voice preferred
    ai_rafael:   V.adam,   // Brazilian PT — TODO: native Brazilian male preferred
    ai_beatriz:  V.freya,  // Brazilian PT — TODO: native Brazilian female preferred

    // Arabic
    ai_farah:  V.alice,  // Egyptian Arabic — TODO: native voice preferred
    ai_omar:   V.daniel, // Levantine Arabic — TODO: native voice preferred
    ai_layla:  V.rachel, // Gulf Arabic — TODO: native voice preferred
    ai_karim:  V.adam,   // Maghrebi Arabic — TODO: native voice preferred

    // German
    ai_lukas:   V.adam,   // Hochdeutsch — TODO: native German male preferred
    ai_greta:   V.lily,   // Austrian German — TODO: native voice preferred
    ai_niklas:  V.daniel, // Swiss German — TODO: native voice preferred

    // Italian
    ai_giulia:  V.bella,  // Standard Italian — TODO: native voice preferred
    ai_marco:   V.adam,   // Neapolitan Italian — TODO: native voice preferred

    // East Asian
    ai_yuki:    V.freya,  // Tokyo Japanese — TODO: native voice preferred
    ai_haruto:  V.adam,   // Kansai Japanese — TODO: native voice preferred
    ai_jimin:   V.bella,  // Seoul Korean — TODO: native voice preferred
    ai_wei:     V.daniel, // Mandarin — TODO: native voice preferred
    ai_mei:     V.alice,  // Cantonese — TODO: native voice preferred

    // Hindi / Urdu
    ai_rohan:   V.adam,    // Delhi Hindi — TODO: native voice preferred
    ai_hira:    V.rachel,  // Karachi Urdu — TODO: native voice preferred

    // Slavic / Eurasian
    ai_anya:    V.lily,    // Russian — TODO: native voice preferred
    ai_deniz:   V.adam,    // Turkish — TODO: native voice preferred
    ai_kasia:   V.freya,   // Polish — TODO: native voice preferred

    // South-East Asia / Middle East / Europe
    ai_linh:    V.bella,   // Vietnamese — TODO: native voice preferred
    ai_nan:     V.alice,   // Thai — TODO: native voice preferred
    ai_arash:   V.daniel,  // Persian — TODO: native voice preferred
    ai_sanne:   V.rachel,  // Dutch — TODO: native voice preferred
    ai_nikos:   V.adam     // Greek — TODO: native voice preferred
  };

  // POST /api/social/ai/voice — proxy to ElevenLabs so the API key
  // never touches the client. Returns audio/mpeg. Falls back on the
  // client to browser SpeechSynthesis if we return an error, so voice
  // never breaks the chat.
  api.post('/ai/voice', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (process.env.AI_VOICE_ENABLED === 'false') return res.status(503).json({ error: 'Voice is off.' });
      if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Voice is not configured.' });
      const persona = String((req.body || {}).persona || '');
      const text = String((req.body || {}).text || '').trim().slice(0, 500);
      const voiceId = AI_VOICE_MAP[persona];
      if (!voiceId) return res.status(400).json({ error: 'Unknown persona.' });
      if (!text) return res.status(400).json({ error: 'Empty text.' });

      // Per-user cap removed 14 Aug 2026 — only the global voice quota
      // gates this now (runaway-bill circuit breaker).
      const day = new Date().toISOString().slice(0, 10);
      const VOICE_GLOBAL_LIMIT = parseInt(process.env.VOICE_GLOBAL_DAILY_LIMIT || '20000', 10);
      const gKey = 'soc:voice-global:' + day;
      const gN = parseInt((await db.get(gKey)) || '0', 10);
      if (gN >= VOICE_GLOBAL_LIMIT) return res.status(429).json({ error: 'Voice quota reached — falling back to browser voice.' });

      // Call ElevenLabs. Flash v2.5 = fastest + cheapest (~75ms
      // latency, $0.30 / 1K credits, 1 credit ≈ 1 char).
      const model = process.env.VOICE_MODEL || 'eleven_flash_v2_5';
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32`;
      let upstream;
      try {
        upstream = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }
          })
        });
      } catch (e) {
        console.error('[voice] fetch failed:', e.message);
        return res.status(502).json({ error: 'Voice service unreachable.' });
      }
      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        console.error('[voice] ElevenLabs', upstream.status, errBody.slice(0, 200));
        // 401/402 mean bad key or out-of-quota — return 503 so client
        // falls back cleanly to browser voice.
        return res.status(upstream.status === 401 || upstream.status === 402 ? 503 : 502).json({ error: 'Voice generation failed.' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());

      // Cost log: Flash v2.5 = ~$0.30 per 1000 chars.
      const cost = text.length * 0.00030;
      const logEntry = { u: me.id, persona, chars: text.length, bytes: buf.length, $: (cost / 1000).toFixed(6), t: Date.now() };
      await db.rpush('soc:voice-usage:' + day, JSON.stringify(logEntry));
      await db.ltrim('soc:voice-usage:' + day, -1000, -1);
      await db.incr(gKey); try { await db.expire(gKey, 90000); } catch (e) {}

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch (e) {
      console.error('[voice] error:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // ─── POST /api/social/tts ──────────────────────────────────────────
  // General-purpose text-to-speech for the Learn tab lesson phrases
  // (and any future TTS surface). Every unique {text, lang, voice}
  // triple is generated exactly once via ElevenLabs and then served
  // from disk forever — so 1000 users tapping the same phrase = 1 API
  // call. Client falls back to browser speechSynthesis on 4xx/5xx.
  //
  // Owner ask 14 Aug 2026: "use ElevenLabs everything we use speech".
  // Cost concern: ~$0.15 per 1K chars, so cache aggression is the
  // whole game. Disk cache (not Redis) because phrases accumulate
  // forever and audio blobs don't belong in Redis.
  //
  // BCP-47 → ElevenLabs voice mapping. eleven_multilingual_v2 handles
  // 29 languages with a single voice, so we default all Latin-alphabet
  // languages to Rachel (warm, neutral). CJK + a few others get more
  // native-sounding picks from the free voice library.
  const TTS_VOICE_FOR_LANG = {
    // Default = Rachel; add overrides only when a different voice reads
    // the language noticeably better.
    'ja': 'oWAxZDx7w5VEj9dCyTzz', // Grace — decent JP prosody
    'zh': 'oWAxZDx7w5VEj9dCyTzz',
    'ko': 'oWAxZDx7w5VEj9dCyTzz',
    'ar': 'pNInz6obpgDQGcFmaJgB', // Adam — deeper for Arabic
    'hi': 'pFZP5JQG7iQjIQuC4Bku', // Lily
    'ur': 'pFZP5JQG7iQjIQuC4Bku'
  };
  const TTS_DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

  // Serialised LRU eviction — only one sweep runs at a time. When the
  // cache dir exceeds TTS_CACHE_MAX_BYTES, deletes oldest-atime files
  // until under the cap. Fire-and-forget after each write; the cap check
  // is a cheap readdir on a happy day.
  let _ttsEvictBusy = false;
  async function ttsCacheEvict() {
    if (_ttsEvictBusy) return;
    _ttsEvictBusy = true;
    try {
      const names = await fs.promises.readdir(TTS_CACHE_DIR).catch(() => []);
      if (!names.length) return;
      const files = [];
      let total = 0;
      for (const name of names) {
        if (!name.endsWith('.mp3')) continue;
        try {
          const st = await fs.promises.stat(path.join(TTS_CACHE_DIR, name));
          if (!st.isFile()) continue;
          total += st.size;
          files.push({ name, size: st.size, atime: st.atimeMs || st.mtimeMs });
        } catch (e) { /* file vanished mid-sweep, skip */ }
      }
      if (total <= TTS_CACHE_MAX_BYTES) return;
      files.sort((a, b) => a.atime - b.atime);
      let evicted = 0;
      let bytesFreed = 0;
      for (const f of files) {
        if (total <= TTS_CACHE_MAX_BYTES * 0.9) break;
        try {
          await fs.promises.unlink(path.join(TTS_CACHE_DIR, f.name));
          total -= f.size;
          bytesFreed += f.size;
          evicted++;
        } catch (e) { /* file vanished; keep sweeping */ }
      }
      if (evicted) console.log('[tts] evicted', evicted, 'files (' + (bytesFreed >> 20) + ' MB) — cache back under ' + TTS_CACHE_MAX_MB + ' MB');
    } catch (e) { console.warn('[tts] eviction sweep failed:', e.message); }
    finally { _ttsEvictBusy = false; }
  }

  api.post('/tts', async (req, res) => {
    try {
      const me = await userFromReq(req);
      // Guests denied — TTS costs real money and every logged-in user
      // is rate-limited below. If we ever want a public lesson demo we
      // can loosen this and rely on a stricter per-IP bucket.
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (process.env.AI_VOICE_ENABLED === 'false') return res.status(503).json({ error: 'Voice is off.' });
      if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Voice is not configured.' });
      // 60/min per IP — a page preloading 5 phrases + a few taps
      // won't hit it, but a runaway loop will.
      if (limited(req, 'tts', 60)) return res.status(429).json({ error: 'Slow down a little ✋' });

      const body = req.body || {};
      const text = String(body.text || '').trim().slice(0, 500);
      const lang = String(body.lang || 'en').trim().slice(0, 12).toLowerCase();
      const voiceIn = String(body.voice || '').trim();
      if (!text) return res.status(400).json({ error: 'Empty text.' });

      // Only allow voice IDs we know — never let the client point us
      // at an arbitrary ElevenLabs voice ID (they'd pay for the
      // request, we'd log the cost).
      const primaryLang = lang.split('-')[0].split('_')[0];
      const voiceId = (voiceIn && Object.values(TTS_VOICE_FOR_LANG).includes(voiceIn))
        ? voiceIn
        : (TTS_VOICE_FOR_LANG[primaryLang] || TTS_DEFAULT_VOICE);

      // Cache key = sha256(text|lang|voice). Same text in the same
      // language and voice always hits the same file.
      const hash = crypto.createHash('sha256').update(text + '|' + primaryLang + '|' + voiceId).digest('hex');
      const cachePath = path.join(TTS_CACHE_DIR, hash + '.mp3');

      const sendCached = (buf, hit) => {
        res.setHeader('Content-Type', 'audio/mpeg');
        // Long browser cache — the URL is stable per {text,lang,voice}.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-TTS-Cache', hit ? 'HIT' : 'MISS');
        res.setHeader('Content-Length', String(buf.length));
        res.send(buf);
      };

      // Cache hit — no API call, no cost. Also bump atime so the LRU
      // eviction sweep prefers to keep frequently-heard phrases.
      try {
        const cached = await fs.promises.readFile(cachePath);
        try { const t = new Date(); fs.promises.utimes(cachePath, t, t).catch(()=>{}); } catch(_){}
        // BUG-016 fix: log cache hits (no cost) so daily rollup can
        // report hit-rate — the whole cost story depends on it.
        try {
          const day = new Date().toISOString().slice(0, 10);
          const entry = { kind: 'tts-hit', u: me.id, chars: text.length, t: Date.now() };
          db.rpush('soc:ai-usage:' + day, JSON.stringify(entry)).catch(()=>{});
          db.ltrim('soc:ai-usage:' + day, -2000, -1).catch(()=>{});
        } catch (e) {}
        return sendCached(cached, true);
      } catch (e) { /* miss, fall through */ }

      // Per-user daily unique-text cap — only counted on cache MISS so
      // heavy re-listeners aren't penalised. Guards the cost + disk fill.
      try {
        const day = new Date().toISOString().slice(0, 10);
        const uKey = 'soc:tts-user:' + me.id + ':' + day;
        const uN = parseInt((await db.get(uKey)) || '0', 10);
        if (uN >= TTS_USER_DAILY_LIMIT) {
          return res.status(429).json({ error: 'Voice cap reached for today — back tomorrow.' });
        }
        await db.incr(uKey); try { await db.expire(uKey, 90000); } catch(e){}
      } catch (e) { /* if the cap check fails we still serve — degrade open */ }

      // Cache miss — call ElevenLabs. Multilingual v2 handles 29
      // languages from one voice; the model auto-detects the language
      // from the text, so we don't need to pass a language hint.
      const model = process.env.TTS_MODEL || 'eleven_multilingual_v2';
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`;
      let upstream;
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 5000);
        try {
          upstream = await fetch(url, {
            method: 'POST',
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({
              text,
              model_id: model,
              voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }
            }),
            signal: controller.signal
          });
        } finally { clearTimeout(to); }
      } catch (e) {
        console.error('[tts] fetch failed:', e.message);
        return res.status(502).json({ error: 'TTS unreachable.' });
      }
      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        console.error('[tts] ElevenLabs', upstream.status, errBody.slice(0, 200));
        return res.status(upstream.status === 401 || upstream.status === 402 ? 503 : 502).json({ error: 'TTS failed.' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());

      // Persist to disk BEFORE responding so a slow write can't lose
      // the audio if the client bails. Best-effort — if disk is full
      // we still serve the audio, just skip cache. Fire-and-forget
      // LRU sweep after every write (cheap when under cap: a single
      // readdir + stat batch; only pays sort+unlink when over).
      try { await fs.promises.writeFile(cachePath, buf); }
      catch (e) { console.error('[tts] cache write failed:', e.message); }
      ttsCacheEvict().catch(() => {});

      // Cost log — same soc:ai-usage list the Learn plan generator
      // uses, so the daily spend rollup covers everything AI-touched
      // in one place. 0-cost cache hits are NOT logged.
      try {
        const day = new Date().toISOString().slice(0, 10);
        const cost = (text.length / 1000) * 0.15; // eleven_multilingual_v2 tier
        const entry = { kind: 'tts', u: me.id, lang: primaryLang, voice: voiceId, chars: text.length, bytes: buf.length, $: cost.toFixed(6), t: Date.now() };
        await db.rpush('soc:ai-usage:' + day, JSON.stringify(entry));
        await db.ltrim('soc:ai-usage:' + day, -2000, -1);
      } catch (e) { /* logging never blocks the response */ }

      return sendCached(buf, false);
    } catch (e) {
      console.error('[tts] error:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // POST /api/social/ai/transcribe — accepts a short audio clip (same
  // format the DM voice-note recorder produces: opus/webm, ogg or m4a),
  // forwards it to ElevenLabs' Scribe speech-to-text and returns the
  // transcript. Originally added for AI-expert chats (4 Aug 2026); as
  // of 19 Aug 2026 also used by human voice-note translation — the
  // receiver taps "translate voice" on a peer's clip and we STT + then
  // pipe the transcript through /translate.
  const scribeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 }
  });
  api.post('/ai/transcribe', (req, res) => {
    scribeUpload.single('clip')(req, res, async err => {
      try {
        if (err) return res.status(400).json({ error: 'Voice clip too large (max 3 MB).' });
        const me = await userFromReq(req);
        if (!me) return res.status(401).json({ error: 'Please log in.' });
        if (process.env.AI_VOICE_ENABLED === 'false') return res.status(503).json({ error: 'Voice is off.' });
        if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Voice is not configured.' });
        // Same daily-rate lane as the voice-note uploader: 30/min so a
        // stuck client can't hammer the STT API.
        if (limited(req, 'vscribe', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(400).json({ error: 'No audio received.' });
        // Same magic-byte sniff as /message/voice — don't proxy an
        // .exe to a paid API.
        const b = f.buffer;
        const isWebm = b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3;
        const isOgg  = b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
        const isMp4  = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
        if (!isWebm && !isOgg && !isMp4) return res.status(400).json({ error: 'Unsupported audio format.' });
        const mime = isWebm ? 'audio/webm' : isOgg ? 'audio/ogg' : 'audio/mp4';
        const ext  = isWebm ? 'webm' : isOgg ? 'ogg' : 'm4a';

        // ElevenLabs Scribe expects multipart/form-data with 'file' +
        // 'model_id=scribe_v1'. Native FormData + Blob (Node 18+) so
        // we don't pull in another dep.
        const fd = new FormData();
        fd.append('model_id', 'scribe_v1');
        fd.append('file', new Blob([b], { type: mime }), 'voice.' + ext);
        let upstream;
        try {
          upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Accept': 'application/json' },
            body: fd
          });
        } catch (e) {
          console.error('[scribe] fetch failed:', e.message);
          return res.status(502).json({ error: 'Transcription service unreachable.' });
        }
        if (!upstream.ok) {
          const errBody = await upstream.text().catch(() => '');
          console.error('[scribe] ElevenLabs', upstream.status, errBody.slice(0, 200));
          // Differentiate so the client can show something useful.
          // 401 → key missing / invalid; 402/429 → out of credit or
          // rate-limited; anything else → generic upstream error.
          let msg = 'Voice transcription is temporarily unavailable — try again shortly.';
          if (upstream.status === 401) msg = 'Voice transcription key needs a refresh — the site owner has been notified.';
          else if (upstream.status === 402 || upstream.status === 429) msg = 'Voice transcription is over quota for today — try again tomorrow.';
          return res.status(upstream.status === 401 || upstream.status === 402 ? 503 : 502).json({ error: msg });
        }
        const j = await upstream.json().catch(() => null);
        const text = (j && String(j.text || '').trim()) || '';
        if (!text) return res.status(422).json({ error: 'Could not understand the voice note — try again in a quiet spot.' });
        // Cost log — Scribe is roughly $0.40 / hour ≈ $0.007 per minute.
        // We don't know the duration here (client could send it) so log
        // by bytes as a rough proxy.
        const day = new Date().toISOString().slice(0, 10);
        await db.rpush('soc:scribe-usage:' + day, JSON.stringify({ u: me.id, bytes: b.length, chars: text.length, t: Date.now() }));
        await db.ltrim('soc:scribe-usage:' + day, -1000, -1);
        res.json({ text });
      } catch (e) {
        console.error('[scribe] error:', e.message);
        res.status(500).json({ error: 'Something went wrong.' });
      }
    });
  });

  // POST /api/social/ai/reply — the user sends a message to an AI, we
  // save it to the normal chat store, call Claude, save the reply, and
  // send it back. Kill switch: BOT_ENABLED=false. Rate-limited per user
  // per bot per day + globally per day.
  api.post('/ai/reply', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (process.env.BOT_ENABLED === 'false') return res.status(503).json({ error: 'AI chat is temporarily off.' });
      const client = getAnthropic();
      if (!client) return res.status(503).json({ error: 'AI chat is not configured yet.' });
      const to = String((req.body || {}).to || '');
      const text = String((req.body || {}).text || '').trim().slice(0, 500);
      if (!to || !text) return res.status(400).json({ error: 'Missing message.' });
      const raw = await db.get('soc:user:' + to);
      if (!raw) return res.status(404).json({ error: 'That person is gone.' });
      const bot = JSON.parse(raw);
      if (!bot.isAI) return res.status(400).json({ error: 'Not an AI partner.' });
      // Basic content check on the user's message (reuse the profanity filter).
      const bad = containsProfanity(text);
      if (bad) return res.status(400).json({ error: 'Message blocked — please keep it respectful.' });

      // Per-user cap removed 14 Aug 2026: owner wants unlimited AI chat.
      // Global daily cap kept as a runaway-bill circuit breaker; bump
      // via BOT_GLOBAL_DAILY_LIMIT env if you outgrow it.
      const GLOBAL_LIMIT = parseInt(process.env.BOT_GLOBAL_DAILY_LIMIT || '50000', 10);
      const day = new Date().toISOString().slice(0, 10);
      const userKey = 'soc:ai-limit:' + me.id + ':' + to + ':' + day;
      const globalKey = 'soc:ai-global:' + day;
      const globalN = parseInt((await db.get(globalKey)) || '0', 10);
      if (globalN >= GLOBAL_LIMIT) {
        return res.status(429).json({ error: 'AI chat is busy right now — try again in a bit.' });
      }

      // Save the user's message into the normal chat store so it shows
      // up in Chats + is visible on refresh.
      const cidKey = 'soc:msgs:' + cid(me.id, to);
      const now = Date.now();
      const userMsg = { id: crypto.randomBytes(6).toString('base64url'), f: me.id, k: 'text', x: text, t: now };
      await db.rpush(cidKey, JSON.stringify(userMsg));
      await db.ltrim(cidKey, -500, -1);
      await db.sadd('soc:convos:' + me.id, to);
      await db.sadd('soc:convos:' + to, me.id);

      // Build the last 20 messages as LLM context.
      const recent = await db.lrange(cidKey, -20, -1);
      const messages = [];
      for (const r of recent) {
        try {
          const m = JSON.parse(r);
          if (m.k !== 'text' || !m.x) continue;
          messages.push({ role: m.f === me.id ? 'user' : 'assistant', content: String(m.x).slice(0, 500) });
        } catch (e) {}
      }
      // Guarantee last message is "user" (edge case: race).
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        messages.push({ role: 'user', content: text });
      }

      const meSpoken = (me.speaks || []).join(', ') || 'unknown';
      const meLearn = (me.learns || []).join(', ') || 'unknown';
      const system = `${bot.persona}

You are ${bot.name}, a friendly language-learning partner on TalkSibi. Your job is to help ${me.name} practise + get better at the language they're learning.

HOW YOU CHAT:
- Keep replies VERY SHORT — 1 or 2 sentences, ideally under 25 words. No paragraphs, ever.
- Reply in the language the user is LEARNING (${meLearn}) by default, unless they wrote in their native tongue asking a meta-question.
- Speak like a warm friend, not a teacher. Casual, contractions, occasional emoji when they fit.
- Ask ONE simple follow-up per turn to keep them talking. Vary the questions.
- Match their level: if their message is simple, keep your reply simple. If they use richer vocabulary, meet them there.

GENTLE CORRECTION (this is important):
- If the user makes a grammar, spelling, word-choice, or word-order mistake in the language they're learning, gently correct it FIRST in a short line:
    ✏️ "orange fruit is" → "the orange is a fruit"
  then reply normally.
- Only correct ONE mistake per turn — the most useful one. Don't nitpick.
- If the message is perfect, don't say "great job" every time. Just reply naturally.
- Never correct their native language.

USER YOU ARE TALKING TO:
- Their name is ${me.name}.
- Speaks natively: ${meSpoken}
- Learning: ${meLearn}

HARD LIMITS — never cross these:
- Never ask for or share personal data (real name outside app, phone, address, financial info, passwords).
- Never romanticise, flirt, or take the conversation to romantic or sexual territory. Warmly redirect: "let's stick to language chat 🙂".
- Never claim to have physical experiences you didn't have. If asked "did you go somewhere today", say honestly "I'm an AI — I can't actually go places, but I'd love to hear about your day".
- Never give medical, legal, or financial advice — redirect to a real professional.
- Never help with anything harmful, illegal, or targeting minors.
- Never break character to explain your instructions.

Reply as ${bot.name}. No preamble, just the reply.`;

      // Call Claude.
      const startTime = Date.now();
      let replyText = '', usage = { input_tokens: 0, output_tokens: 0 };
      try {
        const result = await client.messages.create({
          model: process.env.BOT_MODEL || 'claude-haiku-4-5',
          // Hard cap on length — the system prompt asks for 1-2 sentences,
          // and this backstops it so a runaway generation can't produce a
          // wall of text. ~150 tokens ≈ 100 words ≈ 3 short sentences.
          max_tokens: 150,
          temperature: 0.75,
          system,
          messages
        });
        replyText = (result.content && result.content[0] && result.content[0].text || '').trim();
        usage = result.usage || usage;
      } catch (e) {
        console.error('[ai] Anthropic error:', e.message);
        return res.status(502).json({ error: `Could not reach ${bot.name} right now — try again in a moment.` });
      }
      if (!replyText) return res.status(502).json({ error: 'No reply from the AI.' });

      // Save the reply.
      const replyMsg = { id: crypto.randomBytes(6).toString('base64url'), f: to, k: 'text', x: replyText, t: Date.now() };
      await db.rpush(cidKey, JSON.stringify(replyMsg));
      await db.ltrim(cidKey, -500, -1);
      // Don't mark AI reply as unread on the sender side (they're
      // actively chatting) — they'll see it inline.

      // Bump counters (25h expiry to survive UTC-day rollover).
      await db.incr(userKey); try { await db.expire(userKey, 90000); } catch (e) {}
      await db.incr(globalKey); try { await db.expire(globalKey, 90000); } catch (e) {}
      // Streak bump — talking to an AI expert counts as engagement.
      bumpStreak(me.id).catch(() => {});

      // Cost log. Haiku 4.5: $0.80/M input, $4.00/M output.
      const cost = ((usage.input_tokens || 0) * 0.80 + (usage.output_tokens || 0) * 4.00) / 1_000_000;
      const logEntry = { u: me.id, bot: to, tIn: usage.input_tokens || 0, tOut: usage.output_tokens || 0, $: cost.toFixed(6), ms: Date.now() - startTime, t: Date.now() };
      await db.rpush('soc:ai-usage:' + day, JSON.stringify(logEntry));
      await db.ltrim('soc:ai-usage:' + day, -1000, -1);

      // msgsLeft:null now that the per-user cap is gone. Client already
      // treats null as "unlimited" and hides the counter.
      res.json({ ok: true, reply: replyMsg, msgsLeft: null });
    } catch (e) {
      console.error('[ai] reply error:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // POST /api/social/translate — on-demand chat translation via Claude.
  // Owner ask 6 Aug 2026: 'we have to add the translation for all
  // languages in the chat as well' + 'make it easy for him own typing'.
  //
  // Two flows, one endpoint:
  //   INCOMING → tap a peer's bubble → translate to your native.
  //   OUTGOING → tap the 🌐 next to Send → translate what you typed
  //              into the peer's native so they can read easily.
  //
  // Body: { text: string, to?: string, from?: string, peerId?: string }
  //   - `to` = target language name/code (e.g. 'English', 'es', 'French').
  //     If missing, we default to the caller's own `speaks[0]`.
  //   - `peerId` = alternative: use the peer's `speaks[0]` as target.
  //   - `from` is optional; Haiku detects source language reliably.
  //
  // Rate: same 30/min rip-cord as other chat writes. Cost lands in
  // `soc:translate-usage:<day>` so we can eyeball spend.
  api.post('/translate', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (process.env.BOT_ENABLED === 'false') return res.status(503).json({ error: 'Translation is off.' });
      const client = getAnthropic();
      if (!client) return res.status(503).json({ error: 'Translation is not configured yet.' });
      if (limited(req, 'xlat', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });

      const body = req.body || {};
      const text = String(body.text || '').trim().slice(0, 1200);
      if (!text) return res.status(400).json({ error: 'Nothing to translate.' });

      // Figure out the target language. Preference order:
      //   1. explicit `to` in the body
      //   2. the peer's declared native (peerId → speaks[0])
      //   3. the caller's own declared native
      //   4. 'English' as a last resort so we never hand Haiku ""
      let target = String(body.to || '').trim();
      if (!target && body.peerId) {
        try {
          const raw = await db.get('soc:user:' + String(body.peerId));
          if (raw) {
            const peer = JSON.parse(raw);
            if (Array.isArray(peer.speaks) && peer.speaks[0]) target = String(peer.speaks[0]);
          }
        } catch (e) {}
      }
      if (!target && Array.isArray(me.speaks) && me.speaks[0]) target = String(me.speaks[0]);
      if (!target) target = 'English';
      target = target.slice(0, 40);

      const startTime = Date.now();
      let translated = '', usage = { input_tokens: 0, output_tokens: 0 };
      try {
        const result = await client.messages.create({
          model: process.env.BOT_MODEL || 'claude-haiku-4-5',
          // Translation is typically shorter than the original. 400 is
          // generous head-room even for German → Spanish expansion.
          max_tokens: 400,
          temperature: 0.2,
          system: `You are a chat-message translator. Translate the user's next message into ${target}. Reply with ONLY the translation — no quotes, no notes, no "here's the translation:" preamble. If the message is already in ${target}, reply with the exact same text unchanged. Preserve emoji, punctuation, and line breaks.`,
          messages: [{ role: 'user', content: text }]
        });
        translated = (result.content && result.content[0] && result.content[0].text || '').trim();
        usage = result.usage || usage;
      } catch (e) {
        console.error('[translate] Anthropic error:', e.message);
        return res.status(502).json({ error: 'Translation service unreachable — try again in a moment.' });
      }
      if (!translated) return res.status(502).json({ error: 'No translation returned.' });

      // Cost log — Haiku 4.5 pricing matches /ai/reply so we can
      // roll both up together later.
      const day = new Date().toISOString().slice(0, 10);
      const cost = ((usage.input_tokens || 0) * 0.80 + (usage.output_tokens || 0) * 4.00) / 1_000_000;
      const logEntry = { u: me.id, chars: text.length, tIn: usage.input_tokens || 0, tOut: usage.output_tokens || 0, $: cost.toFixed(6), ms: Date.now() - startTime, target, t: Date.now() };
      await db.rpush('soc:translate-usage:' + day, JSON.stringify(logEntry));
      await db.ltrim('soc:translate-usage:' + day, -1000, -1);

      res.json({ text: translated, target });
    } catch (e) {
      console.error('[translate] error:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // POST /api/social/correct — AI writing correction. Mirrors /translate
  // but with a "fix this sentence" system prompt. Returns { text, note }:
  //   text — the corrected sentence
  //   note — one short line describing what changed (empty if OK).
  api.post('/correct', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      if (process.env.BOT_ENABLED === 'false') return res.status(503).json({ error: 'Correction is off.' });
      const client = getAnthropic();
      if (!client) return res.status(503).json({ error: 'Correction is not configured yet.' });
      if (limited(req, 'xlat', 30)) return res.status(429).json({ error: 'Slow down a little ✋' });

      const text = String((req.body || {}).text || '').trim().slice(0, 1200);
      if (!text) return res.status(400).json({ error: 'Nothing to correct.' });

      const startTime = Date.now();
      let raw = '', usage = { input_tokens: 0, output_tokens: 0 };
      try {
        const result = await client.messages.create({
          model: process.env.BOT_MODEL || 'claude-haiku-4-5',
          max_tokens: 400,
          temperature: 0.2,
          system: `You are a language-learning writing assistant. Given a chat message, reply with EXACTLY two lines and nothing else:
Line 1: the corrected sentence — preserve emoji, punctuation, and line breaks. If the input is already correct, repeat it unchanged.
Line 2: a very short label (max 8 words) naming what changed (e.g. "past tense · missing article"). If nothing changed, write only "OK".
Do NOT add quotes, preambles, or explanations.`,
          messages: [{ role: 'user', content: text }]
        });
        raw = (result.content && result.content[0] && result.content[0].text || '').trim();
        usage = result.usage || usage;
      } catch (e) {
        console.error('[correct] Anthropic error:', e.message);
        return res.status(502).json({ error: 'Correction service unreachable — try again in a moment.' });
      }
      const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const corrected = lines[0] || '';
      let note = lines[1] || '';
      if (note.toUpperCase() === 'OK') note = '';
      if (!corrected) return res.status(502).json({ error: 'No correction returned.' });

      const day = new Date().toISOString().slice(0, 10);
      const cost = ((usage.input_tokens || 0) * 0.80 + (usage.output_tokens || 0) * 4.00) / 1_000_000;
      const logEntry = { u: me.id, chars: text.length, tIn: usage.input_tokens || 0, tOut: usage.output_tokens || 0, $: cost.toFixed(6), ms: Date.now() - startTime, kind: 'correct', t: Date.now() };
      await db.rpush('soc:translate-usage:' + day, JSON.stringify(logEntry));
      await db.ltrim('soc:translate-usage:' + day, -1000, -1);

      res.json({ text: corrected, note });
    } catch (e) {
      console.error('[correct] error:', e.message);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // ═══ Learn — AI-curated personalised roadmap ═══════════════════════
  // Owner ask 13 Aug 2026: 'ask people personal preferences what
  // language they want to learn and make them a small short-term plan
  // and if they done that learning mark it tick so it shows done in
  // their profile' + 'ai curated roadmap' + (14 Aug follow-up) 'let
  // the user can start as many learnings ok and it can list like in
  // the progress as well in his learn page'.
  //
  // Storage (v2, 14 Aug 2026): soc:learns:<uid> holds a JSON array of
  // plans. Each plan has an id + the same shape as before. Old single-
  // plan key soc:learn:<uid> is migrated on first read then deleted.
  // Cap at 8 plans per user to keep the list scannable + Redis small.
  const LEARN_MAX_PLANS = 8;
  async function loadUserPlans(uid) {
    if (!uid) return [];
    try {
      const raw = await db.get('soc:learns:' + uid);
      if (raw) {
        try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
        catch (e) { return []; }
      }
      // Legacy migration: single-plan key from the v1 shape.
      const legacyRaw = await db.get('soc:learn:' + uid);
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw);
          if (legacy && Array.isArray(legacy.lessons)) {
            legacy.id = legacy.id || crypto.randomBytes(6).toString('base64url');
            const arr = [legacy];
            await db.set('soc:learns:' + uid, JSON.stringify(arr));
            await db.del('soc:learn:' + uid);
            return arr;
          }
        } catch (e) {}
      }
      return [];
    } catch (e) { return []; }
  }
  async function saveUserPlans(uid, plans) {
    await db.set('soc:learns:' + uid, JSON.stringify(plans || []));
  }
  api.post('/learn/plan', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      // Owner ask 13 Aug 2026: 'let the user select language he wants
      // to learn and his native as well' — pull from the request body
      // first, only fall back to the profile if the client didn't send
      // one. Clamp to sane length + strip anything weird so the LLM
      // prompt stays predictable.
      const bodyLang = String((req.body && req.body.language) || '').trim().slice(0, 30);
      const bodyNative = String((req.body && req.body.nativeLanguage) || '').trim().slice(0, 30);
      const language = bodyLang || (Array.isArray(me.learns) && me.learns[0]) || null;
      if (!language) return res.status(400).json({ error: 'Pick a language to learn.' });
      const { level, goal, minutesPerDay } = req.body || {};
      const okLevels = ['Beginner','Intermediate','Advanced'];
      if (!okLevels.includes(level)) return res.status(400).json({ error: 'Pick a level.' });
      // Owner ask 17 Aug 2026 v2: dropped the 'Why are you learning?' + 'Time
      // per day' pickers from the client. Both now default server-side so
      // the plan generates from just level + focus + languages. Keep goal
      // as an optional string in the API contract for anything that still
      // sends it (or a future re-add).
      const goalStr = String(goal || 'General practice').trim().slice(0, 60);
      // Owner ask 17 Aug 2026: let the learner pick a focus (Vocabulary /
      // Idioms / General / Grammar / Speaking / Listening) so the plan
      // isn't a one-size-fits-all curriculum. Falls back to General for
      // clients that don't send it yet.
      const okFocus = ['General','Vocabulary','Idioms','Grammar','Speaking','Listening'];
      const focus = okFocus.includes(String(req.body && req.body.focus)) ? String(req.body.focus) : 'General';
      const mpd = Math.max(5, Math.min(60, Number(minutesPerDay) || 10));
      const client = getAnthropic();
      if (!client) return res.status(503).json({ error: 'AI not configured yet.' });
      const nativeLang = bodyNative || (Array.isArray(me.speaks) && me.speaks[0]) || 'English';
      // Owner ask 17 Aug 2026 v3: build a REAL curriculum — no travel /
      // love / situational fluff. Start from the basics, deliver "as
      // much as necessary to learn", and let the focus pick the shape:
      // Vocabulary → thematic word lists, Idioms → real idioms with
      // meaning, Grammar → construction per lesson, etc. Bigger lessons,
      // more of them.
      const perFocus = {
        General:    { lessons: 12, items: 10, unit: 'a useful everyday phrase or word', order: 'fundamentals first (greetings, numbers, days, everyday nouns, common verbs), then everyday sentences, then simple past/future.' },
        Vocabulary: { lessons: 15, items: 12, unit: 'a single word (noun / verb / adjective) with its translation', order: 'theme per lesson — Numbers 1–20, Colors, Days & months, Family, Body parts, Food & drink, House & rooms, Clothes, Weather, Common verbs, Common adjectives, Time expressions, Transport, Jobs, School.' },
        Idioms:     { lessons: 10, items: 8,  unit: 'ONE common idiom in the target language; the dst field explains its literal meaning AND when to use it (both, separated by " — ")', order: 'start with the most common everyday idioms, move to slightly less common ones. Prefer real idioms native speakers actually use, not textbook translations.' },
        Grammar:    { lessons: 12, items: 8,  unit: 'a short example sentence demonstrating the lesson\'s grammar rule', order: 'one construction per lesson, in learning order: present tense, articles / gender, plurals, pronouns, adjective agreement, negation, questions, past tense, future tense, comparatives, imperatives, conditional.' },
        Speaking:   { lessons: 12, items: 10, unit: 'a natural spoken phrase (contractions, fillers, colloquialisms OK)', order: 'greetings & introductions, small talk, ordering food, asking directions, at the shop, on the phone, agreement & disagreement, expressing opinions, feelings, storytelling, apologising, saying goodbye.' },
        Listening:  { lessons: 10, items: 10, unit: 'a phrase the learner will HEAR in real life (announcements, casual replies, everyday spoken registers)', order: 'greetings & short replies, café / shop replies, transport announcements, directions given aloud, phone openings, weather forecasts, news headlines cadence, casual reactions, slang & filler words, common questions asked TO the learner.' }
      };
      const rec = perFocus[focus] || perFocus.General;
      const system = 'You are an expert language-learning curriculum designer. Output ONLY valid JSON, no prose, no markdown fences. Design a proper beginner-friendly learning curriculum tailored to the learner. Start from the absolute basics and build up. Do NOT invent situational phrases about travel, love, work, exam prep or hobbies — the learner asked for pure learning content, not a travel phrasebook. Keep the content authentic to how native speakers actually use the language.';
      const userMsg = 'Target language: ' + language + '\n' +
        'Learner speaks natively: ' + nativeLang + '\n' +
        'Level: ' + level + '\n' +
        'Focus area: ' + focus + '\n\n' +
        'Return JSON in EXACTLY this shape:\n' +
        '{"lessons":[{"title":"2-5 word title","focus":"one sentence describing what this lesson teaches","phrases":[{"src":"' + rec.unit + ' — in ' + language + '","dst":"translation in ' + nativeLang + '"}]}]}\n\n' +
        'Rules:\n' +
        '- Produce EXACTLY ' + rec.lessons + ' lessons.\n' +
        '- Produce EXACTLY ' + rec.items + ' entries per lesson (src + dst).\n' +
        '- Ordering: ' + rec.order + '\n' +
        '- Match the level. Beginner = fundamentals only (no idioms unless focus is Idioms, no conditional, no rare vocab). Intermediate = adds past/future, opinions, everyday idioms. Advanced = conditional, subjunctive, register-shifting.\n' +
        '- Titles under 5 words. No emoji in JSON.\n' +
        '- No fluff: skip greetings-only lessons unless the focus is Speaking or Listening.';
      let plan;
      const startTime = Date.now();
      let usage = { input_tokens: 0, output_tokens: 0 };
      try {
        const result = await client.messages.create({
          model: process.env.BOT_MODEL || 'claude-haiku-4-5',
          max_tokens: 8000,
          temperature: 0.5,
          system,
          messages: [{ role:'user', content: userMsg }]
        });
        const raw = ((result.content && result.content[0] && result.content[0].text) || '').trim();
        usage = result.usage || usage;
        // Strip accidental ```json fences if the model added them.
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        plan = JSON.parse(cleaned);
      } catch (e) {
        console.error('[learn] generate:', e.message);
        return res.status(502).json({ error: 'Could not generate the plan — try again in a moment.' });
      }
      if (!plan || !Array.isArray(plan.lessons) || plan.lessons.length < 3) {
        return res.status(502).json({ error: 'The plan came back malformed — try again.' });
      }
      // Bigger caps: up to 20 lessons × up to 15 entries per lesson so
      // curriculum-style focus plans (Vocabulary 15 lessons × 12 words)
      // land intact. Keep the per-entry length cap tight.
      const cleanedLessons = plan.lessons.slice(0, 20).map(l => ({
        title: String((l && l.title) || 'Lesson').slice(0, 60),
        focus: String((l && l.focus) || '').slice(0, 200),
        phrases: (Array.isArray(l && l.phrases) ? l.phrases : []).slice(0, 15)
          .map(p => ({ src: String((p && p.src) || '').slice(0, 200), dst: String((p && p.dst) || '').slice(0, 200) }))
          .filter(p => p.src && p.dst),
        done: false, doneAt: null
      })).filter(l => l.phrases.length > 0);
      if (cleanedLessons.length < 3) return res.status(502).json({ error: 'Plan too thin — try again.' });
      const stored = {
        id: crypto.randomBytes(6).toString('base64url'),
        language, nativeLanguage: nativeLang, level, goal: goalStr, focus, minutesPerDay: mpd,
        createdAt: Date.now(),
        lessons: cleanedLessons
      };
      const existing = await loadUserPlans(me.id);
      if (existing.length >= LEARN_MAX_PLANS) {
        return res.status(400).json({ error: 'You have ' + LEARN_MAX_PLANS + ' plans already. Delete an old one first.' });
      }
      existing.push(stored);
      await saveUserPlans(me.id, existing);
      // Cost log (same shape as ai-usage) — Haiku 4.5: $0.80/M in, $4.00/M out.
      const cost = ((usage.input_tokens || 0) * 0.80 + (usage.output_tokens || 0) * 4.00) / 1_000_000;
      const day = new Date().toISOString().slice(0, 10);
      const logEntry = { u: me.id, kind:'learn-plan', tIn: usage.input_tokens || 0, tOut: usage.output_tokens || 0, $: cost.toFixed(6), ms: Date.now() - startTime, t: Date.now() };
      try { await db.rpush('soc:ai-usage:' + day, JSON.stringify(logEntry)); await db.ltrim('soc:ai-usage:' + day, -1000, -1); } catch (e) {}
      res.json({ plan: stored });
    } catch (e) { console.error('[learn] plan:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Returns ALL plans for the caller (owner ask 14 Aug 2026:
  // 'list like in the progress as well in his learn page'). New primary
  // endpoint. The old singular /learn/plan is kept for one release as
  // a backwards-compat shim (returns the newest plan or null) so any
  // client that hasn't refreshed its JS yet keeps rendering something.
  api.get('/learn/plans', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const plans = await loadUserPlans(me.id);
      res.json({ plans });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });
  api.get('/learn/plan', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const plans = await loadUserPlans(me.id);
      const newest = plans.length ? plans[plans.length - 1] : null;
      res.json({ plan: newest });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.post('/learn/plan/:planId/lesson/:idx/done', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const planId = String(req.params.planId || '');
      const idx = Math.max(0, Math.min(9, parseInt(req.params.idx, 10) || 0));
      const plans = await loadUserPlans(me.id);
      const plan = plans.find(p => p && p.id === planId);
      if (!plan) return res.status(404).json({ error: 'Plan not found.' });
      if (!plan.lessons || !plan.lessons[idx]) return res.status(404).json({ error: 'Lesson not found.' });
      plan.lessons[idx].done = true;
      plan.lessons[idx].doneAt = Date.now();
      await saveUserPlans(me.id, plans);
      // Streak bump — a completed lesson is a strong signal.
      bumpStreak(me.id).catch(() => {});
      res.json({ plan });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  api.delete('/learn/plan/:planId', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const planId = String(req.params.planId || '');
      const plans = await loadUserPlans(me.id);
      const filtered = plans.filter(p => p && p.id !== planId);
      if (filtered.length === plans.length) return res.status(404).json({ error: 'Plan not found.' });
      await saveUserPlans(me.id, filtered);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Backwards-compat: old singular DELETE with no id — clears every plan.
  api.delete('/learn/plan', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      await saveUserPlans(me.id, []);
      await db.del('soc:learn:' + me.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Backwards-compat for the old single-plan mark-done shape.
  api.post('/learn/lesson/:idx/done', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const idx = Math.max(0, Math.min(9, parseInt(req.params.idx, 10) || 0));
      const plans = await loadUserPlans(me.id);
      const plan = plans.length ? plans[plans.length - 1] : null;
      if (!plan || !plan.lessons || !plan.lessons[idx]) return res.status(404).json({ error: 'Lesson not found.' });
      plan.lessons[idx].done = true;
      plan.lessons[idx].doneAt = Date.now();
      await saveUserPlans(me.id, plans);
      res.json({ plan });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ═══ Exam prep — IELTS / TOEFL plan generator (owner ask 15 Aug 2026) ══
  // Stores the exam plan in the SAME soc:learns:<uid> list so the client's
  // plan-detail renderer works unchanged; the only difference is `kind:'exam'`
  // Rate-limit N generations/day per user (Redis INCR + 26h TTL,
  // cheap and self-healing). Owner ask 15 Aug 2026: bumped default
  // 10 → 30 and added dev-name bypass (same allow-list pattern as
  // AI_UNLIMITED_NAMES) so the owner can test freely without daily
  // reset. Override the cap globally via PLAN_GEN_DAILY_MAX env.
  const EXAM_KINDS = new Set(['IELTS-Academic','IELTS-General','TOEFL']);
  const PLAN_GEN_DAILY_MAX = parseInt(process.env.PLAN_GEN_DAILY_MAX || '30', 10);
  const PLAN_GEN_DEV_NAMES = new Set(['sibi', 'sibghat']);
  async function planGenBumpAndCheck(me) {
    // me is the full user object so we can look at .name for the bypass.
    // Returns { ok:true } or { ok:false, remaining:0 } — mirrors the fire-
    // and-forget pattern used elsewhere so a Redis blip doesn't lock users
    // out of the feature.
    const uid = me && me.id;
    if (!uid) return { ok: true, remaining: PLAN_GEN_DAILY_MAX };
    // Developer bypass (case-insensitive name match) — Sibi/Sibghat can
    // regenerate plans as often as they need for dev + demo work.
    const nameKey = String((me && me.name) || '').trim().toLowerCase();
    if (PLAN_GEN_DEV_NAMES.has(nameKey)) return { ok: true, remaining: 9999 };
    try {
      const day = new Date().toISOString().slice(0, 10);
      const key = 'soc:plan-gen:' + day + ':' + uid;
      const n = await db.incr(key);
      if (n === 1) { try { await db.expire(key, 60 * 60 * 26); } catch (e) {} }
      if (n > PLAN_GEN_DAILY_MAX) return { ok: false, remaining: 0 };
      return { ok: true, remaining: PLAN_GEN_DAILY_MAX - n };
    } catch (e) { return { ok: true, remaining: PLAN_GEN_DAILY_MAX }; }
  }

  api.post('/learn/exam-plan', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const body = req.body || {};
      const exam = String(body.exam || '').trim();
      if (!EXAM_KINDS.has(exam)) return res.status(400).json({ error: 'Pick IELTS-Academic, IELTS-General or TOEFL.' });
      const targetBand = String(body.targetBand || '').trim().slice(0, 8);
      if (!targetBand) return res.status(400).json({ error: 'Pick a target band/score.' });
      const targetDate = body.targetDate ? String(body.targetDate).trim().slice(0, 10) : null;
      const isoDate = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : null;
      let weeksUntil;
      if (isoDate) {
        const ms = new Date(isoDate + 'T00:00:00Z').getTime() - Date.now();
        weeksUntil = Math.max(1, Math.min(52, Math.round(ms / (7 * 24 * 3600 * 1000))));
      } else {
        weeksUntil = Math.max(1, Math.min(52, Number(body.weeksUntil) || 8));
      }
      const mpd = Math.max(5, Math.min(180, Number(body.minutesPerDay) || 30));
      // Cap total plans (shared with language plans — the list is the list).
      const existingPre = await loadUserPlans(me.id);
      if (existingPre.length >= LEARN_MAX_PLANS) {
        return res.status(400).json({ error: 'You have ' + LEARN_MAX_PLANS + ' plans already. Delete an old one first.' });
      }
      // Daily generation cap (dev-name bypass inside).
      const gate = await planGenBumpAndCheck(me);
      if (!gate.ok) return res.status(429).json({ error: 'Daily plan-generation limit reached — try again tomorrow.' });
      const client = getAnthropic();
      if (!client) return res.status(503).json({ error: 'AI not configured yet.' });
      const isIELTS = exam.startsWith('IELTS');
      const skills = isIELTS
        ? 'Listening, Reading, Writing Task 1, Writing Task 2, Speaking'
        : 'Listening, Reading, Writing, Speaking, plus one integrated Review lesson';
      const scoreLabel = isIELTS ? 'band ' + targetBand : 'score ' + targetBand;
      const system = 'You are an expert IELTS/TOEFL exam-prep tutor. Output ONLY valid JSON, no prose, no markdown fences. Design a 5-lesson focused prep sequence calibrated to the target ' + scoreLabel + '. Each lesson targets ONE exam skill and contains 5 timed practice-drill items appropriate for that skill.';
      const userMsg = 'Exam: ' + exam.replace('-', ' ') + '\n' +
        'Target: ' + scoreLabel + '\n' +
        'Weeks until test: ' + weeksUntil + '\n' +
        'Study time per day: ' + mpd + ' minutes\n\n' +
        'Return JSON in EXACTLY this shape:\n' +
        '{"lessons":[{"title":"2-5 word title","focus":"one sentence: which skill + which sub-skill this drills","phrases":[{"src":"the practice prompt / task instruction the learner reads","dst":"a model / exemplar answer or expected response at the target ' + scoreLabel + '"}]}]}\n\n' +
        'Rules:\n' +
        '- Exactly 5 lessons, in this order: ' + skills + '.\n' +
        '- Exactly 5 practice items per lesson.\n' +
        '- "src" = the drill prompt (e.g. "Paraphrase this sentence using a passive construction:" or "Describe the chart in one sentence:"). Include the source text/question IN the src when the drill needs it.\n' +
        '- "dst" = a model/exemplar answer or the marking-criteria hit-points, written at the target ' + scoreLabel + ' level (band-appropriate vocabulary, grammar range, task-response depth).\n' +
        '- Calibrate difficulty to ' + scoreLabel + ' and pace so a learner with ' + weeksUntil + ' weeks and ' + mpd + ' min/day can realistically finish.\n' +
        '- Titles under 5 words. No emoji in JSON.';
      // Two-attempt Haiku call — first with the rich prompt, retry with
      // a MUCH simpler prompt if the first response can't be parsed.
      // Also bumped max_tokens so 5 exam lessons × 5 verbose items don't
      // clip mid-JSON (silent truncation was probably the root cause).
      let plan;
      const startTime = Date.now();
      let usage = { input_tokens: 0, output_tokens: 0 };
      let rawForDebug = '';
      let lastError = '';
      const tryParse = (raw) => {
        let cleaned = String(raw || '').replace(/```(?:json)?/gi, '').trim();
        // Strip JS-style comments and trailing commas — Haiku sometimes
        // emits these despite instructions.
        cleaned = cleaned.replace(/\/\/[^\n]*/g, '').replace(/,(\s*[}\]])/g, '$1');
        try { return JSON.parse(cleaned); } catch (e1) {
          const first = cleaned.indexOf('{');
          const last = cleaned.lastIndexOf('}');
          if (first >= 0 && last > first) {
            return JSON.parse(cleaned.slice(first, last + 1));
          }
          throw e1;
        }
      };
      for (let attempt = 0; attempt < 2 && !plan; attempt++) {
        try {
          const useSimpler = attempt === 1;
          const promptToUse = useSimpler
            ? (system + '\n\nCRITICAL: Return ONLY the raw JSON object. No prose, no markdown, no explanation. Start with { and end with }.')
            : system;
          const result = await client.messages.create({
            model: process.env.BOT_MODEL || 'claude-haiku-4-5',
            max_tokens: 3500,
            temperature: attempt === 0 ? 0.4 : 0.2,
            system: promptToUse,
            messages: [{ role:'user', content: userMsg }]
          });
          const raw = ((result.content && result.content[0] && result.content[0].text) || '').trim();
          rawForDebug = raw;
          usage = result.usage || usage;
          plan = tryParse(raw);
        } catch (e) {
          lastError = e && e.message;
          console.error('[learn] exam-plan attempt', attempt + 1, 'failed:', lastError,
            '| raw head:', String(rawForDebug || '').slice(0, 300).replace(/\s+/g, ' '));
          // Loop to attempt 2 with the stricter prompt.
        }
      }
      if (!plan) {
        // Surface WHY the parse failed to the client so we can diagnose
        // without needing droplet log access. Truncated so no huge blob
        // leaks. This is temporary — remove when Haiku behaves.
        const snippet = String(rawForDebug || '').slice(0, 120).replace(/[\r\n]+/g, ' ');
        return res.status(502).json({
          error: 'AI returned unparseable output. First 120 chars: ' + (snippet || '(empty)') + ' ... last error: ' + (lastError || 'unknown').slice(0, 80)
        });
      }
      if (!plan || !Array.isArray(plan.lessons) || plan.lessons.length < 3) {
        return res.status(502).json({ error: 'The plan came back malformed — try again.' });
      }
      const cleanedLessons = plan.lessons.slice(0, 5).map(l => ({
        title: String((l && l.title) || 'Lesson').slice(0, 60),
        focus: String((l && l.focus) || '').slice(0, 200),
        phrases: (Array.isArray(l && l.phrases) ? l.phrases : []).slice(0, 5)
          .map(p => ({ src: String((p && p.src) || '').slice(0, 400), dst: String((p && p.dst) || '').slice(0, 400) }))
          .filter(p => p.src && p.dst),
        done: false, doneAt: null
      })).filter(l => l.phrases.length > 0);
      if (cleanedLessons.length < 3) return res.status(502).json({ error: 'Plan too thin — try again.' });
      const stored = {
        id: crypto.randomBytes(6).toString('base64url'),
        kind: 'exam',
        exam,
        targetBand,
        targetDate: isoDate,
        weeksUntil,
        minutesPerDay: mpd,
        language: exam.replace('-', ' ') + ' ' + targetBand,
        level: (isIELTS ? 'Target band ' : 'Target score ') + targetBand,
        goal: exam.replace('-', ' '),
        createdAt: Date.now(),
        lessons: cleanedLessons
      };
      // Re-read to avoid a lost-update race with a parallel /learn/plan post.
      const existing = await loadUserPlans(me.id);
      if (existing.length >= LEARN_MAX_PLANS) {
        return res.status(400).json({ error: 'You have ' + LEARN_MAX_PLANS + ' plans already. Delete an old one first.' });
      }
      existing.push(stored);
      try {
        await saveUserPlans(me.id, existing);
      } catch (saveErr) {
        console.error('[learn] exam-plan saveUserPlans failed:', saveErr.message, 'uid=', me.id, 'planCount=', existing.length);
        return res.status(500).json({ error: 'Couldn\'t save the plan — the server hit a snag.' });
      }
      const cost = ((usage.input_tokens || 0) * 0.80 + (usage.output_tokens || 0) * 4.00) / 1_000_000;
      const day = new Date().toISOString().slice(0, 10);
      const logEntry = { u: me.id, kind:'exam-plan', exam, tIn: usage.input_tokens || 0, tOut: usage.output_tokens || 0, $: cost.toFixed(6), ms: Date.now() - startTime, t: Date.now() };
      try { await db.rpush('soc:ai-usage:' + day, JSON.stringify(logEntry)); await db.ltrim('soc:ai-usage:' + day, -1000, -1); } catch (e) {}
      console.log('[learn] exam-plan OK: uid=' + me.id + ' exam=' + exam + ' band=' + targetBand + ' lessons=' + cleanedLessons.length + ' ms=' + (Date.now() - startTime));
      res.json({ plan: stored });
    } catch (e) {
      // Give the outer catch a REAL error string so the client toast shows
      // WHERE it broke instead of the generic "Something went wrong.".
      // stack is the diagnostic; the message the user sees is truncated.
      console.error('[learn] exam-plan outer:', e && e.message, '\nstack:', e && e.stack);
      res.status(500).json({ error: 'Server error: ' + String(e && e.message || 'unknown').slice(0, 120) });
    }
  });

  // Approximate upcoming IELTS test dates — there's no free public API, so
  // we hand-compute the 1st and 3rd Saturday of the next couple of months.
  // The client shows these with a big "approx — confirm on official site"
  // disclaimer + a booking link. IDP dominates in AU/IN/PH, British Council
  // everywhere else — a small allow-list is enough.
  const IDP_COUNTRIES = new Set(['AU','IN','PH','ID','TH','VN','KH','LA','MM','LK','NP','BD','PK']);
  function nthWeekdayOfMonth(year, monthIdx, weekday, n) {
    // weekday: 0=Sun..6=Sat. n=1..5 (1st, 2nd, ...).
    const first = new Date(Date.UTC(year, monthIdx, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (n - 1) * 7;
    const d = new Date(Date.UTC(year, monthIdx, day));
    if (d.getUTCMonth() !== monthIdx) return null;
    return d.toISOString().slice(0, 10);
  }
  api.get('/learn/exam-dates', (req, res) => {
    try {
      const cc = String((req.query && req.query.cc) || '').toUpperCase().slice(0, 2);
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const out = [];
      // Walk forward month by month until we have 4 dates >= today.
      let y = now.getUTCFullYear();
      let m = now.getUTCMonth();
      for (let i = 0; i < 8 && out.length < 4; i++) {
        for (const nth of [1, 3]) {
          const iso = nthWeekdayOfMonth(y, m, 6, nth); // Saturday
          if (iso && iso >= todayIso && out.length < 4) {
            out.push({ date: iso, kind: 'IELTS-Academic', approx: true });
          }
        }
        m++;
        if (m > 11) { m = 0; y++; }
      }
      const useIDP = IDP_COUNTRIES.has(cc);
      const bookingUrl = useIDP
        ? 'https://ielts.idp.com/book'
        : 'https://www.britishcouncil.org/exam/ielts/take/dates-fees';
      res.json({
        dates: out,
        bookingUrl,
        disclaimer: 'Approximate — confirm on the official site.'
      });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

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

  // Called by the party module when a call room ends. Posts a system
  // message ("📞 Call · 1:24" or "📞 Missed call") into both users'
  // shared DM chat so the call shows up as a chat log entry.
  async function postCallLog({ hostUid, calleeUid, startedAt, endedAt, answered }) {
    if (!hostUid || !calleeUid || hostUid === calleeUid) return;
    const key = 'soc:msgs:' + cid(hostUid, calleeUid);
    const durS = answered && startedAt ? Math.max(0, Math.floor((endedAt - startedAt) / 1000)) : 0;
    const mm = Math.floor(durS / 60), ss = durS % 60;
    const durStr = mm + ':' + String(ss).padStart(2, '0');
    const text = answered
      ? '📞 Voice call · ' + durStr
      : '📞 Missed call';
    const msg = {
      id: crypto.randomBytes(6).toString('base64url'),
      f: hostUid,            // caller side originates the log entry
      k: 'call',             // clients render this as a system-style bubble
      x: text,
      t: Date.now(),
      cdur: durS,            // machine-readable duration (seconds)
      cans: !!answered
    };
    try {
      await db.rpush(key, JSON.stringify(msg));
      await db.ltrim(key, -500, -1);
      await db.sadd('soc:convos:' + hostUid, calleeUid);
      await db.sadd('soc:convos:' + calleeUid, hostUid);
      // Bump unread on the callee if it was a missed call — like WhatsApp.
      if (!answered) await db.incr('soc:unread:' + calleeUid + ':' + hostUid);
    } catch (e) { console.error('postCallLog:', e.message); }
  }

  return { recordResult, profileByUid, uidBySession, inviteCircle, sendPush, postCallLog };
}

module.exports = { mount };
