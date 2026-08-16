// TalkSibi auth module.
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
// SCOPE (this file): all account-lifecycle endpoints.
//   POST /signup   — email + password + 18+ DOB gate
//   POST /login    — email + password
//   POST /google   — Google Sign-In (with DOB round-trip for new users)
//   POST /forgot   — request a password-reset code by email
//   POST /reset    — redeem the code + set a new password
//   POST /logout   — clear the session cookie
//
// social.js still owns:
//   - the db shim (Redis / in-memory)
//   - session cookie writer (setSess) + reader (cookies) + clearer (clearSess)
//   - rate limiter, geo, pub(), age-gate helpers
//   - email dispatch (sendMail + mailHtml) — those are shared with
//     several NON-auth endpoints (invite emails, follower alerts) so
//     they stay in social.js and get passed as ctx.
// Ownership of shared state lives in ONE place; auth.js just uses it.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

/**
 * @param {import('express').Router} api - the /api/social Express router
 * @param {object} ctx - shared helpers from social.js. Full list below;
 *   the constructor destructure serves as the up-to-date spec.
 */
function mount(api, ctx) {
  const {
    db, SESS_TTL,
    limited, setSess, cookies, clearSess,
    reqIp, geoFromIp, geoLabel, pub,
    MIN_AGE, ageFromISO, isPlausibleDob, markAgeFail, isRecentAgeFail,
    GOOGLE_CLIENT_ID,
    PHOTO_DIR,
    BREVO_KEY, RESEND_KEY,
    sendMail, mailHtml
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
        return res.status(403).json({ error: 'Sorry, TalkSibi is for people aged ' + MIN_AGE + ' and over.' });
      }
      if (await db.get('soc:email:' + email)) return res.status(409).json({ error: 'That email is already registered — try logging in.' });
      if (await db.get('soc:uname:' + name.toLowerCase())) return res.status(409).json({ error: 'That name is taken.' });
      const id = crypto.randomBytes(9).toString('hex');
      const ip = reqIp(req);
      const geo = await geoFromIp(ip);
      const user = {
        id, name, email, passHash: bcrypt.hashSync(password, 10),
        bio: '', location: geoLabel(geo),
        country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
        birthdate,
        ageVerifiedAt: Date.now(),
        games: 0, wins: 0, createdAt: Date.now(),
        termsAcceptedAt: Date.now(),
        // Stored for referral anti-fraud (same-IP-as-referrer signups
        // don't credit — see /refer/credit in social.js). Never surfaced
        // via pub() so it stays private.
        signupIp: ip || ''
      };
      await db.set('soc:user:' + id, JSON.stringify(user));
      await db.set('soc:email:' + email, id);
      await db.set('soc:uname:' + name.toLowerCase(), id);
      await db.sadd('soc:members', id);
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, id, SESS_TTL);
      setSess(res, token);
      // pub() strips email (it's used to serialise OTHER users on
      // the wall where email must stay private). Auth responses go
      // ONLY to the account that just authenticated — safe to
      // include their own email so the onboarding wizard pre-fills it.
      res.json({ me: { ...pub(user), email: user.email || '' } });
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
      // pub() strips email (it's used to serialise OTHER users on
      // the wall where email must stay private). Auth responses go
      // ONLY to the account that just authenticated — safe to
      // include their own email so the onboarding wizard pre-fills it.
      res.json({ me: { ...pub(user), email: user.email || '' } });
    } catch (e) { console.error('social login:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /google — Google Sign-In. On FIRST-visit for a Google account
  // we require DOB in the request body (Google's ID token doesn't
  // include it). Same 18+ hard block as /signup. Existing users log in
  // straight through. If they had no photo we import their Google
  // avatar as a one-off best-effort.
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
        // Owner ask 2 Aug 2026: 'remove the DOB popup, make her go
        // directly to the next form (wizard) and enter DOB there
        // along with name and email'. So we no longer refuse the
        // /google call for missing DOB. Two shapes accepted:
        //
        //   1. birthdate = 'pending'  → new client (post-2 Aug).
        //      Create the account with birthdate:null +
        //      ageGatePending:true; the wizard collects the real
        //      DOB via /profile with the 18+ hard block still
        //      enforced on that write.
        //   2. birthdate = 'YYYY-MM-DD' → legacy client (pre-2 Aug)
        //      or a client that already has DOB → age-gate here,
        //      same behaviour as before.
        //   3. birthdate missing entirely → still return needsDob
        //      for backward-compat, but no current client uses this.
        const birthdate = String((req.body || {}).birthdate || '').trim();
        if (!birthdate) return res.status(400).json({ error: 'DOB required.', needsDob: true });
        const isPending = birthdate === 'pending';
        if (!isPending) {
          if (!isPlausibleDob(birthdate)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
          if (await isRecentAgeFail(email)) return res.status(403).json({ error: 'This email cannot be used for sign-up right now.' });
          const age = ageFromISO(birthdate);
          if (age < MIN_AGE) {
            await markAgeFail(email);
            return res.status(403).json({ error: 'Sorry, TalkSibi is for people aged ' + MIN_AGE + ' and over.' });
          }
        }
        let base = String(g.given_name || g.name || email.split('@')[0])
          .replace(/[^a-zA-Z0-9_ ]/g, '').trim().slice(0, 15) || 'Spy';
        if (base.length < 3) base = 'Spy ' + base;
        let name = base, n = 1;
        while (await db.get('soc:uname:' + name.toLowerCase())) { n++; name = (base.slice(0, 12) + ' ' + n).trim(); }
        const id = crypto.randomBytes(9).toString('hex');
        const ip = reqIp(req);
        const geo = await geoFromIp(ip);
        user = {
          id, name, email, passHash: null, googleId: g.sub,
          bio: '', location: geoLabel(geo),
          country: geo ? geo.country : '', cc: geo ? geo.cc : '', photo: null,
          birthdate: isPending ? null : birthdate,
          ageVerifiedAt: isPending ? null : Date.now(),
          ageGatePending: isPending ? true : false,
          termsAcceptedAt: Date.now(),
          games: 0, wins: 0, createdAt: Date.now(), fresh: true,
          // Stored for referral anti-fraud (see /refer/credit).
          signupIp: ip || ''
        };
        await db.set('soc:user:' + id, JSON.stringify(user));
        await db.set('soc:email:' + email, id);
        await db.set('soc:uname:' + name.toLowerCase(), id);
        await db.sadd('soc:members', id);
      } else if (!user.googleId) {
        user.googleId = g.sub;   // link Google to the existing email account
        await db.set('soc:user:' + user.id, JSON.stringify(user));
      }
      // Owner ask 2 Aug 2026: 'don't display his photo from the Gmail,
      // ask him to upload a new photo via camera or gallery'. The
      // Google-avatar auto-import was retired here so every new
      // Google account lands in the wizard with photo === null, which
      // forces them through the step-2 upload gate (camera or gallery
      // on mobile; file picker on desktop) before they can continue.
      // Existing accounts (`if (user.googleId)` branch above) already
      // have their photo — we never touched those.
      const token = crypto.randomBytes(24).toString('hex');
      await db.set('soc:sess:' + token, user.id, SESS_TTL);
      setSess(res, token);
      // pub() strips email (it's used to serialise OTHER users on
      // the wall where email must stay private). Auth responses go
      // ONLY to the account that just authenticated — safe to
      // include their own email so the onboarding wizard pre-fills it.
      res.json({ me: { ...pub(user), email: user.email || '' } });
    } catch (e) { console.error('social google:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /forgot — request a 6-digit password-reset code by email.
  // Silent about whether the email exists (returns { ok: true } either
  // way) so the endpoint can't be used to enumerate accounts.
  api.post('/forgot', async (req, res) => {
    try {
      if (limited(req, 'fp', 4)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
      const email = String((req.body || {}).email || '').trim().toLowerCase();
      const uid = await db.get('soc:email:' + email);
      if (!uid) return res.json({ ok: true });
      if (!BREVO_KEY && !RESEND_KEY) return res.status(503).json({ error: 'Password reset email isn\'t set up yet — if you signed up with this email on Google, use "Sign in with Google", or contact contact@talksibi.com.' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.set('soc:reset:' + email, bcrypt.hashSync(code, 8), 900);   // 15 min
      const ok = await sendMail(email, code + ' is your TalkSibi code',
        `Your TalkSibi password reset code is ${code}.\n\nIt expires in 15 minutes. If you didn't ask for this, just ignore this email.\n\n— TalkSibi`,
        mailHtml({
          peek: 'Expires in 15 minutes.',
          heading: 'Your reset code',
          line: 'Type this into TalkSibi to set a new password.',
          code,
          note: 'Expires in 15 minutes. If you didn\'t ask for this, ignore this email — nothing has changed.'
        }));
      if (!ok) return res.status(502).json({ error: 'Could not send the email — try again shortly.' });
      res.json({ ok: true });
    } catch (e) { console.error('social forgot:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /reset — redeem the 6-digit code + set a new password. On
  // success we ALSO log the user straight in (session cookie set) so
  // they don't have to go back to the login screen just to type the
  // password they literally just set.
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
      // pub() strips email (it's used to serialise OTHER users on
      // the wall where email must stay private). Auth responses go
      // ONLY to the account that just authenticated — safe to
      // include their own email so the onboarding wizard pre-fills it.
      res.json({ me: { ...pub(user), email: user.email || '' } });
    } catch (e) { console.error('social reset:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /logout — clear the session cookie AND the Redis session
  // token. Never returns an error — even if there was no session,
  // the client just moves on.
  api.post('/logout', async (req, res) => {
    const t = cookies(req).soc_sess;
    if (t) await db.del('soc:sess:' + t);
    clearSess(res);
    res.json({ ok: true });
  });
}

module.exports = { mount };
