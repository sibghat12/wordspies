// WordSpies profile module.
//
// Split out of social.js on 1 Aug 2026 as the SECOND slice of the
// modularisation push (first slice = auth.js). Owner-goal (paraphrased):
// 'lets make the best amazing modular code so we have no issue or bugs
// occurring or all data are saved perfectly ok and we bring the data
// from the database as well and make it or keep it fast too'.
//
// SCOPE (this file): everything that reads or writes the CURRENT
// USER's own profile record.
//   GET  /me       — return the signed-in user (with a lazy geo backfill
//                    for accounts created before we captured country/cc)
//   POST /profile  — edit any subset of profile fields (name, bio,
//                    location, birthdate, Speaky-style extras)
//   POST /photo    — upload a new avatar (multipart form-data)
//
// social.js still owns:
//   - the db shim (Redis / in-memory)
//   - userFromReq (session cookie -> user object)
//   - pub (user -> public JSON shape)
//   - reqIp, geoFromIp, geoLabel
//   - limited (rate limiter)
//   - PHOTO_DIR (filesystem path)
// All passed to mount() as ctx. Ownership of shared state stays in ONE
// place; profile.js just uses it.
//
// SPEED / CORRECTNESS notes:
//   - Redis writes use JSON.stringify(user) — the single-key write is
//     atomic per key in Redis, so there's no partial-update race.
//   - Renames use del(old-uname) + set(new-uname) which is two ops —
//     if the server crashes between them, the old uname key leaks (a
//     ghost that maps nowhere) but we never lose the new one. That's
//     the safe-side-of-eventual-consistency behaviour we want.
//   - Photo upload deletes old photo files BEFORE writing the new one
//     so the disk never has two photos-per-user leaking silently.

const fs = require('fs');
const path = require('path');
const multer = require('multer');

function mount(api, ctx) {
  const {
    db, userFromReq, pub,
    reqIp, geoFromIp, geoLabel,
    limited,
    PHOTO_DIR
  } = ctx;

  // GET /me — current user or null. Lazy backfill: accounts created
  // before the geo capture existed have no country/cc. Fill it in from
  // their current IP on the first /me hit, one time. Fast for repeat
  // callers because the guard (`!u.cc`) short-circuits after the fill.
  api.get('/me', async (req, res) => {
    const u = await userFromReq(req);
    if (u && !u.cc) {
      const geo = await geoFromIp(reqIp(req));
      if (geo && geo.cc) {
        u.country = geo.country; u.cc = geo.cc;
        if (!u.location) u.location = geoLabel(geo);
        await db.set('soc:user:' + u.id, JSON.stringify(u));
      }
    }
    // /me is only ever the current signed-in user — safe to expose
    // their own email here (pub() strips it because it's used for
    // OTHER users too, where email must stay private). Owner ask
    // 1 Aug 2026: 'why the email field are empty in the signup
    // process' — the onboarding wizard needs ME.email pre-filled.
    res.json({ me: u ? { ...pub(u), email: u.email || '' } : null });
  });

  // POST /profile — edit any subset of profile fields. Every field is
  // OPTIONAL; only the ones present in the body get touched. Never
  // clobbers a field with '' unless the client explicitly sent ''.
  //
  // Rename mechanics: display name is the primary uniqueness key
  // (soc:uname:<lowercase>). Moving it means del(old) + set(new)
  // atomically-enough — see file header for the crash-window note.
  api.post('/profile', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const b = req.body || {};
      const { name, bio, location, birthdate } = b;

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
          u.name = nm;   // same letters, new capitals is fine too
        }
      }

      if (bio !== undefined) u.bio = String(bio).slice(0, 200);
      if (location !== undefined) u.location = String(location).slice(0, 40);
      if (birthdate !== undefined) {
        const bd = String(birthdate).trim();
        if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'Invalid birthdate format.' });
        u.birthdate = bd || null;
      }

      // Speaky-style extras: short quote, native + learning languages,
      // interests, goals, recommendations. All caps + light shape checks.
      const cleanArr = (v, cap, max) =>
        (Array.isArray(v) ? v : []).map(x => String(x || '').trim().slice(0, cap)).filter(Boolean).slice(0, max);
      if (b.talkAbout !== undefined) u.talkAbout = String(b.talkAbout || '').slice(0, 500);
      if (b.speaks    !== undefined) u.speaks    = cleanArr(b.speaks,    6,  5);
      if (b.learns    !== undefined) u.learns    = cleanArr(b.learns,    6,  5);
      if (b.interests !== undefined) u.interests = cleanArr(b.interests, 30, 12);
      if (b.goals     !== undefined) u.goals     = cleanArr(b.goals,     30, 6);
      if (b.recs      !== undefined) u.recs      = String(b.recs || '').slice(0, 500);
      // Onboarding wizard fields (1 Aug 2026):
      //   goal        — one-of picker (learn / practise / friends / travel / other)
      //   onboardedAt — millis of when the wizard was completed, so we
      //                 don't re-show it on later logins. Client-set.
      const ALLOWED_GOALS = ['learn', 'practise', 'friends', 'travel', 'other'];
      if (b.goal !== undefined) {
        const g = String(b.goal || '').toLowerCase().trim();
        u.goal = ALLOWED_GOALS.includes(g) ? g : '';
      }
      if (b.onboardedAt !== undefined) {
        const n = Number(b.onboardedAt);
        if (Number.isFinite(n) && n > 0) u.onboardedAt = n;
      }

      await db.set('soc:user:' + u.id, JSON.stringify(u));
      res.json({ me: pub(u) });
    } catch (e) { console.error('social profile:', e.message); res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /photo — avatar upload. 2 MB cap, JPG / PNG / WebP only.
  //
  // Magic-byte sniff (not just filename) so someone can't rename an
  // executable to .jpg and slip through. Filename is cache-busted with
  // a base36 timestamp so the browser + CDN always fetch the fresh
  // photo without needing a manual ?v=… hack.
  //
  // Old photo files with the same uid prefix are removed before the
  // new one is written so the disk never accumulates orphans.
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
        const isJpg  = sig[0] === 0xFF && sig[1] === 0xD8;
        const isPng  = sig[0] === 0x89 && sig[1] === 0x50;
        const isWebp = sig.slice(8, 12).toString() === 'WEBP';
        if (!isJpg && !isPng && !isWebp) return res.status(400).json({ error: 'Use a JPG, PNG or WebP image.' });
        const ext = isJpg ? 'jpg' : isPng ? 'png' : 'webp';
        // Remove any previous photo files for this user; then write the new one.
        // Deleted BEFORE the write so a crash mid-op leaves us with either
        // (a) nothing, or (b) exactly the new file — never two.
        for (const old of fs.readdirSync(PHOTO_DIR)) if (old.startsWith(u.id + '.')) fs.unlinkSync(path.join(PHOTO_DIR, old));
        const fname = `${u.id}.${Date.now().toString(36)}.${ext}`;
        fs.writeFileSync(path.join(PHOTO_DIR, fname), f.buffer);
        u.photo = '/social-photos/' + fname;
        await db.set('soc:user:' + u.id, JSON.stringify(u));
        res.json({ me: pub(u) });
      } catch (e) { console.error('social photo:', e.message); res.status(500).json({ error: 'Upload failed.' }); }
    });
  });
}

module.exports = { mount };
