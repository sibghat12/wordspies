// WordSpies auth module.
//
// Split out of social.js on 1 Aug 2026 as the FIRST slice of a broader
// modularisation push (owner: 'lets make the code bit more maintianable
// so it work so better and no fix again and again'). Goal: keep the same
// URL surface, cookies, and Redis keys — pure refactor, zero user-facing
// change — while getting signup/login into a smaller file that's easy
// to hold in your head.
//
// Design:
//   - This module exports one function `mount(api, ctx)` that accepts
//     the shared Express Router built by social.js and a context object
//     with every helper this file needs (db, bcrypt, session cookie
//     writer, rate limiter, geo, response shaper, age-gate helpers).
//   - social.js still constructs `db`, cookies, sessions, geo etc. —
//     auth.js just uses them. This keeps state ownership in one place
//     and lets us extract the next module (community.js, profile.js,
//     etc.) using the exact same pattern.
//
// PILOT SCOPE (this commit): /signup + /login only. Google + password
// reset stay in social.js for the next slice — they pull in Brevo,
// Resend, and Google's tokeninfo endpoint which need extra ctx wiring
// (BREVO_KEY, RESEND_KEY, GOOGLE_CLIENT_ID, fetch). Doing those in a
// second commit means each slice is small enough to verify by hand.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * @param {import('express').Router} api - the /api/social Express router
 * @param {object} ctx - shared helpers from social.js:
 *   - db: the redis / in-memory store abstraction
 *   - SESS_TTL: session lifetime in seconds
 *   - limited: (req, bucket, max) => boolean rate limiter
 *   - setSess: (res, token) => sets the soc_sess cookie
 *   - reqIp, geoFromIp, geoLabel: IP → geo helpers
 *   - pub: (user) => public user shape returned in JSON
 *   - MIN_AGE, ageFromISO, isPlausibleDob, markAgeFail, isRecentAgeFail
 *     — the 18+ age gate helpers used at signup
 */
function mount(api, ctx) {
  const {
    db, SESS_TTL, limited, setSess,
    reqIp, geoFromIp, geoLabel, pub,
    MIN_AGE, ageFromISO, isPlausibleDob, markAgeFail, isRecentAgeFail
  } = ctx;

  // POST /signup — create an email/password account.
  //
  // Full 18+ hard block (see social.js:243 for the helpers). We reject
  // BEFORE any write to Redis so an under-age attempt never leaves
  // partial state behind. Session cookie is set on success only.
  api.post('/signup', async (req, res) => {
    try {
      if (limited(req, 'su', 5)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      let { name, email, password, birthdate, acceptedTerms } = req.body || {};
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      birthdate = String(birthdate || '').trim();
      // Google Play requires terms acceptance before UGC creation.
      if (!acceptedTerms) return res.status(400).json({ error: 'Please accept the Terms and Privacy Policy to continue.' });
      if (!/^[a-zA-Z0-9_ ]{3,15}$/.test(name)) return res.status(400).json({ error: 'Name: 3–15 letters, numbers or spaces.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 100) return res.status(400).json({ error: 'That email doesn\'t look right.' });
      if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      // Age gate: required DOB, plausible date, ≥ MIN_AGE.
      if (!birthdate) return res.status(400).json({ error: 'Please enter your date of birth.' });
      if (!isPlausibleDob(birthdate)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
      if (await isRecentAgeFail(email)) return res.status(403).json({ error: 'This email cannot be used for sign-up right now.' });
      const age = ageFromISO(birthdate);
      if (age < MIN_AGE) {
        await markAgeFail(email);
        return res.status(403).json({ error: 'Sorry, WordSpies is for people aged ' + MIN_AGE + ' and over.' });
      }
      if (await db.get('soc:email:' + email)) return res.status(409).json({ error: 'That email is already registered — try logging in.' });
      if (await db.get('soc:uname:' + name.toLowerCase())) return res.status(409).json({ error: 'That name is taken.' });
      const id = crypto.randomBytes(9).toString('hex');
      const geo = await geoFromIp(reqIp(req));
      const user = {
        id, name, email, passHash: bcrypt.hashSync(password, 10),
        bio: '', location: geoLabel(geo),
        country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
        birthdate,
        ageVerifiedAt: Date.now(),
        games: 0, wins: 0, createdAt: Date.now(),
        termsAcceptedAt: Date.now()
      };
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

  // POST /login — email + password.
  //
  // The passHash === null branch catches Google-only accounts (they were
  // created via /google without a password) and points the user at the
  // right button. Everything else is standard bcrypt compare.
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
}

module.exports = { mount };
