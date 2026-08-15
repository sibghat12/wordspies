// Language Clubs — Tandem-style topic communities where members post,
// comment, like and get AI corrections on each other's language practice.
// Owner ask 10 Aug 2026 (screenshots).
//
// Storage: Redis-backed via db passed in from social.js. Falls back to
// in-memory Map on the local dev instance without Redis (mirrors the
// party.js pattern).
//
// Keys:
//   soc:club:<id>              — JSON: { id, name, desc, lang, cover, createdBy, createdAt }
//   soc:clubs                  — SET  of club ids (for listing)
//   soc:club:<id>:members      — SET  of user ids who joined
//   soc:club:<id>:posts        — LIST of post ids, newest last (LRANGE 0 -1 reversed for feed)
//   soc:club:<id>:post:<pid>   — JSON: { id, clubId, uid, name, photo, text, createdAt, likes:[uid], comments:[{id,uid,name,text,at}] }
//
// Every write bumps 'soc:club:<id>' touched timestamp for future
// sort-by-activity. Post + comment payload trimmed at insertion.

const crypto = require('crypto');

const MAX_POST_CHARS    = 1200;
const MAX_COMMENT_CHARS = 400;
const MAX_CLUB_NAME     = 60;
const MAX_CLUB_DESC     = 500;
const MAX_POSTS         = 200;   // cap per club to protect Redis
const MAX_COMMENTS      = 100;   // cap per post
const MAX_MENTIONS      = 10;    // per post or comment — hard cap so a bad
                                 // actor can't fan out to 1000 users at once.
const MAX_MENTION_NOTIFS_PER_DAY = 30; // per author — additional throttle
                                       // on the sendPush side of mentions,
                                       // so 30 posts × 10 mentions is not the
                                       // ceiling — 30 individual notifs is.

// Canonical site origin used inside the SSR club pages (og:url, JSON-LD,
// sitemap). Kept as a constant so a future domain change is one edit.
const SITE = 'https://wordspies.co.uk';

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('base64url');
}
function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\r]/g, '').trim().slice(0, max);
}
// Kebab-case slug from a club name. Strips diacritics + emoji + all
// non-ASCII so titles like "Русский Разговорный" fall back cleanly to
// the club id (which is already an ASCII slug). Bounded length keeps
// URLs sane.
function slugify(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')  // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
// Minimal HTML entity encoding for safe interpolation into meta content
// attributes + JSON-LD. Never trust user-supplied names/descs here.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Public slug for a club — prefers an explicit slug field, otherwise
// slugifies the name, and falls back to the raw id if the name yielded
// nothing usable (e.g. all non-ASCII).
function slugForClub(c) {
  if (!c) return '';
  if (c.slug) return String(c.slug);
  const s = slugify(c.name || '');
  return s || String(c.id || '');
}

// Default clubs seeded on first boot if the /clubs set is empty.
// Titles + descriptions kept short + friendly so a new user can
// immediately see the vibe.
// Default rooms — always seeded on first boot. Marked `system:true` so
// they can never be deleted or renamed by admins. Owner ask 10 Aug
// 2026: 'good rooms for English + Spanish + Russian + Italian + French
// + other languages, default rooms that are always ours'.
const SEED_CLUBS = [
  // ── English cluster (owner ask 11 Aug 2026 — put English rooms
  // at the start + more of them). Everyone learning English gets
  // an obvious home to land in. ──────────────────────────────────
  {
    id: 'club_english_pronunciation',
    name: 'English Pronunciation Practice',
    desc: 'English pronunciation can be tricky — but it doesn\'t have to be. Share tongue-twisters, minimal pairs, audio clips of your accent, and get feedback from the community.',
    lang: 'English', cover: 'linear-gradient(135deg,#ff6b6b 0%,#ee5a24 100%)', emoji: '🇬🇧',
  },
  {
    id: 'club_english_beginners',
    name: 'English for Beginners',
    desc: 'Just starting English? This is your safe space. Ask any question, no matter how basic. Kind, patient, no judgement. Post daily sentences and get gentle corrections.',
    lang: 'English', cover: 'linear-gradient(135deg,#48dbfb 0%,#0abde3 100%)', emoji: '🇬🇧',
  },
  {
    id: 'club_english_conversation',
    name: 'English Conversation Club',
    desc: 'Practise real everyday English — greetings, small talk, opinions, arguments. Post a topic, jump into someone else\'s. All levels welcome.',
    lang: 'English', cover: 'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)', emoji: '🇬🇧',
  },
  {
    id: 'club_english_business',
    name: 'Business English',
    desc: 'Emails, meetings, presentations, negotiations. Share the exact sentences you struggle with at work — real answers from natives + professionals.',
    lang: 'English', cover: 'linear-gradient(135deg,#232526 0%,#414345 100%)', emoji: '💼',
  },
  {
    id: 'club_english_idioms',
    name: 'English Idioms & Slang',
    desc: 'It\'s raining cats and dogs. Break a leg. Piece of cake. What do these actually mean, and when do you use them? Post an idiom you heard — get the story behind it.',
    lang: 'English', cover: 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)', emoji: '🇬🇧',
  },
  {
    id: 'club_english_movies',
    name: 'Learn English Through Movies',
    desc: 'Watched something in English? Post lines you loved, words you didn\'t understand, or scenes worth studying. Netflix, YouTube, TikTok — all counts.',
    lang: 'English', cover: 'linear-gradient(135deg,#134e5e 0%,#71b280 100%)', emoji: '🎬',
  },
  {
    id: 'club_english_ielts',
    name: 'IELTS & TOEFL Prep',
    desc: 'Preparing for IELTS, TOEFL, or Cambridge exams? Share writing samples, ask about speaking topics, get corrected by people who\'ve passed.',
    lang: 'English', cover: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', emoji: '📝',
  },
  {
    id: 'club_spanish_conversation',
    name: 'Spanish Conversation Club',
    desc: 'From beginner "hola" to native-speed Argentine slang — a friendly place to try out Spanish, ask questions, and correct each other kindly.',
    lang: 'Spanish', cover: 'linear-gradient(135deg,#feca57 0%,#ee5a24 100%)', emoji: '🇪🇸',
  },
  {
    id: 'club_spanish_beginners',
    name: 'Spanish for Beginners',
    desc: 'Learning Spanish from scratch? Post your first sentences, ask what a word means, share how you\'re practising. Native speakers stop by to help.',
    lang: 'Spanish', cover: 'linear-gradient(135deg,#ffa502 0%,#ff6348 100%)', emoji: '🇪🇸',
  },
  {
    id: 'club_french_daily',
    name: 'Le Français Quotidien',
    desc: 'French for daily life. Post the sentence you struggled to say today, share links to French podcasts, ask about idioms. Beginners very welcome.',
    lang: 'French', cover: 'linear-gradient(135deg,#3d7bff 0%,#0f7500 100%)', emoji: '🇫🇷',
  },
  {
    id: 'club_french_beginners',
    name: 'French for Beginners',
    desc: 'Bonjour ! First-time French learners meet here. Share your struggles with genders, silent letters, and pronunciation — someone always has an answer.',
    lang: 'French', cover: 'linear-gradient(135deg,#5352ed 0%,#3742fa 100%)', emoji: '🇫🇷',
  },
  {
    id: 'club_italian_conversation',
    name: 'Italiano per Tutti',
    desc: 'Italian for everyone — from ordering pasta to reading Calvino. Share your favourite Italian phrases, ask about regional dialects, practise together.',
    lang: 'Italian', cover: 'linear-gradient(135deg,#26de81 0%,#20bf6b 100%)', emoji: '🇮🇹',
  },
  {
    id: 'club_russian_conversation',
    name: 'Русский Разговорный',
    desc: 'Russian conversation for all levels. Cyrillic, cases, aspects — none of it is scary when you have friends to ask. Native speakers + learners together.',
    lang: 'Russian', cover: 'linear-gradient(135deg,#eb3b5a 0%,#8e44ad 100%)', emoji: '🇷🇺',
  },
  {
    id: 'club_german_grammar',
    name: 'German Grammar Help',
    desc: 'Der, die, das got you down? Post the sentence you can\'t make work, get grammar explanations from natives + advanced learners.',
    lang: 'German', cover: 'linear-gradient(135deg,#54a0ff 0%,#2e86de 100%)', emoji: '🇩🇪',
  },
  {
    id: 'club_portuguese_brazil',
    name: 'Português Brasileiro',
    desc: 'Brazilian Portuguese for learners at every level. Post about samba, football, novelas, or just say oi. Corrections encouraged.',
    lang: 'Portuguese', cover: 'linear-gradient(135deg,#f7b731 0%,#26de81 100%)', emoji: '🇧🇷',
  },
  {
    id: 'club_japanese_beginners',
    name: 'Japanese for Beginners',
    desc: 'A patient corner for anyone taking their first steps into 日本語. Share your kana practice, ask "what does this mean?", meet others at your level.',
    lang: 'Japanese', cover: 'linear-gradient(135deg,#ff9ff3 0%,#f368e0 100%)', emoji: '🇯🇵',
  },
  {
    id: 'club_korean_conversation',
    name: 'Korean 한국어',
    desc: 'From annyeonghaseyo to K-drama fluency. Share your Hangul practice, favourite Korean songs, questions about grammar. All welcome.',
    lang: 'Korean', cover: 'linear-gradient(135deg,#ff6b81 0%,#ee5253 100%)', emoji: '🇰🇷',
  },
  {
    id: 'club_mandarin_beginners',
    name: 'Mandarin 中文 Beginners',
    desc: 'First steps into Mandarin — tones, characters, pinyin. A friendly beginner room where every question is a good question.',
    lang: 'Mandarin', cover: 'linear-gradient(135deg,#ee5a24 0%,#c0392b 100%)', emoji: '🇨🇳',
  },
  {
    id: 'club_arabic_msa',
    name: 'العربية Arabic Practice',
    desc: 'Modern Standard Arabic + everyday dialects. Share vocabulary, ask about pronunciation, practise writing in Arabic script.',
    lang: 'Arabic', cover: 'linear-gradient(135deg,#009432 0%,#006266 100%)', emoji: '🇸🇦',
  },
  {
    id: 'club_language_exchange',
    name: 'Language Exchange Finder',
    desc: 'Introduce yourself, say what you speak and what you\'re learning, and find your next language partner. All languages welcome.',
    lang: 'Any', cover: 'linear-gradient(135deg,#0f7500 0%,#22c07a 100%)', emoji: '🌍',
  },
  {
    id: 'club_travel_phrases',
    name: 'Travel Phrases',
    desc: 'Off to a new country? Ask for the phrases you\'ll actually need. Locals + travellers help you sound less like a tourist.',
    lang: 'Any', cover: 'linear-gradient(135deg,#00cec9 0%,#0984e3 100%)', emoji: '✈️',
  },
];

// Seed on first boot AND top-up on every boot for any SEED_CLUBS ids
// we don't already have (owner ask 11 Aug 2026 — added more English
// rooms mid-life; existing prod Redis needs them too, not just fresh
// installs). Never overwrites — an existing id is left untouched.
async function seedIfEmpty(db) {
  try {
    let added = 0;
    for (const c of SEED_CLUBS) {
      const already = await db.sismember('soc:clubs', c.id);
      if (already) continue;
      const club = {
        ...c,
        createdBy: 'system',
        system: true,           // permanent — can never be deleted
        createdAt: Date.now(),
      };
      await db.set('soc:club:' + c.id, JSON.stringify(club));
      await db.sadd('soc:clubs', c.id);
      added++;
    }
    if (added) console.log('[clubs] seeded ' + added + ' new default club(s), total defaults: ' + SEED_CLUBS.length);
  } catch (e) { console.error('[clubs] seed:', e.message); }
}

function mount(app, api, db, opts) {
  const options = opts || {};
  const userFromReq = options.userFromReq || (() => null);
  // Optional helpers injected by social.js at mount time. If any are
  // missing (e.g. clubs.js used standalone in a test), mentions still
  // land + get stored, they just don't deliver notifications.
  const pushNotif = typeof options.pushNotif === 'function' ? options.pushNotif : null;
  const sendPush  = typeof options.sendPush  === 'function' ? options.sendPush  : null;
  const isBlocked = typeof options.isBlocked === 'function' ? options.isBlocked : (async () => false);

  seedIfEmpty(db);

  // ── @mentions helpers ────────────────────────────────────────────────
  // Accept a raw client-supplied mention list and produce a clean list of
  // {id, name} — validated against real users, block-aware in both
  // directions, deduped, and capped at MAX_MENTIONS. Silently drops any
  // entry that fails a check; never throws, so a bad payload never
  // blocks a legitimate post.
  async function resolveMentions(rawList, authorUid) {
    if (!Array.isArray(rawList) || !rawList.length) return [];
    const seen = new Set();
    const out = [];
    for (const m of rawList) {
      if (!m || typeof m !== 'object') continue;
      const id = String(m.id || '').trim();
      if (!id || id === authorUid || seen.has(id)) continue;
      seen.add(id);
      // Real user? Users live at soc:user:<id> — a get is cheap.
      const raw = await db.get('soc:user:' + id);
      if (!raw) continue;
      // Block-aware both directions: if either side has blocked the
      // other, the mention silently disappears so notifs never leak.
      if (await isBlocked(authorUid, id)) continue;
      let name = '';
      try { name = String((m.name || JSON.parse(raw).name || '')).slice(0, 60); } catch (e) {}
      if (!name) continue;
      out.push({ id, name });
      if (out.length >= MAX_MENTIONS) break;
    }
    return out;
  }

  // Deliver a mention notification to each resolved recipient — in-app via
  // pushNotif (bell dropdown) + web push via sendPush. Rate-limited per
  // author with a rolling 24h counter so a spammer with 100 mentions/hour
  // can't drown recipients: after MAX_MENTION_NOTIFS_PER_DAY sends we
  // stop knocking (the mention is still stored + rendered in the post).
  async function notifyMentions(mentions, author, club, deepUrl) {
    if (!Array.isArray(mentions) || !mentions.length) return;
    const dayKey = 'soc:mention-quota:' + author.id + ':' + new Date().toISOString().slice(0, 10);
    let sent = 0;
    try { sent = parseInt(await db.get(dayKey)) || 0; } catch (e) {}
    for (const m of mentions) {
      if (sent >= MAX_MENTION_NOTIFS_PER_DAY) break;
      const text = author.name + ' mentioned you in ' + (club.name || 'a club');
      if (pushNotif) {
        try { await pushNotif(m.id, { kind: 'club-mention', text, url: deepUrl, meta: { clubId: club.id, from: author.id } }); } catch (e) {}
      }
      if (sendPush) {
        try { await sendPush(m.id, 'club-mention', '💬 You were mentioned', text, deepUrl); } catch (e) {}
      }
      sent++;
      try {
        await db.set(dayKey, String(sent), 60 * 60 * 26);
        // set() with ttl already stamps expiry on Redis; the extra
        // 2h buffer beyond 24h means late-night quota resets cleanly.
      } catch (e) {}
    }
  }

  // In-memory slug -> id index for the public /clubs/:slug SSR route.
  // Built lazily on first hit and refreshed if a slug lookup misses
  // (covers newly added clubs since boot). Redis is source of truth;
  // this map is just a fast lookup so we don't scan every request.
  let slugIndex = null;             // Map<slug, id>
  let slugIndexBuiltAt = 0;
  let slugIndexRebuildLockedUntil = 0; // BUG-009: throttle miss-triggered rebuilds
  const SLUG_REBUILD_MIN_MS = 60 * 1000; // one rebuild per minute max
  let _slugBuilding = null;              // in-flight promise so concurrent misses coalesce
  async function buildSlugIndex() {
    // Coalesce concurrent rebuilds (100 misses in the same tick shouldn't
    // fire 100 SMEMBERS scans).
    if (_slugBuilding) return _slugBuilding;
    _slugBuilding = (async () => {
      const map = new Map();
      try {
        const ids = await db.smembers('soc:clubs');
        for (const id of ids) {
          const raw = await db.get('soc:club:' + id);
          if (!raw) continue;
          let c = null; try { c = JSON.parse(raw); } catch (e) { continue; }
          if (!c) continue;
          const slug = slugForClub(c);
          if (slug && !map.has(slug)) map.set(slug, c.id);
          // Always allow the raw id as a lookup key too, so old links
          // like /clubs/club_english_pronunciation keep resolving.
          if (c.id && !map.has(c.id)) map.set(c.id, c.id);
        }
      } catch (e) { /* return empty map on failure */ }
      slugIndex = map;
      slugIndexBuiltAt = Date.now();
      slugIndexRebuildLockedUntil = Date.now() + SLUG_REBUILD_MIN_MS;
      return map;
    })();
    try { return await _slugBuilding; }
    finally { _slugBuilding = null; }
  }
  async function resolveSlug(slugOrId) {
    if (!slugOrId) return null;
    if (!slugIndex) await buildSlugIndex();
    let id = slugIndex.get(slugOrId);
    // BUG-009 fix: rebuild throttle. Old behaviour rebuilt after every
    // miss where the index was >5s old — /clubs/<random> in a loop hit
    // Redis with a full SMEMBERS + N GETs per request. Now we rebuild
    // at most once per SLUG_REBUILD_MIN_MS (60s) regardless of miss
    // frequency. Real new clubs still surface within a minute.
    if (!id && Date.now() > slugIndexRebuildLockedUntil) {
      await buildSlugIndex();
      id = slugIndex.get(slugOrId);
    }
    return id || null;
  }

  async function fetchClub(id) {
    try {
      const raw = await db.get('soc:club:' + id);
      if (!raw) return null;
      const club = JSON.parse(raw);
      const memberCount = await db.scard('soc:club:' + id + ':members');
      // Always attach a slug so the SPA can build shareable URLs
      // without having to know the slug rules itself.
      return { ...club, memberCount, slug: slugForClub(club) };
    } catch (e) { return null; }
  }

  async function fetchPosts(clubId, limit = 40) {
    try {
      const ids = await db.lrange('soc:club:' + clubId + ':posts', -limit, -1);
      const posts = [];
      for (const pid of ids.reverse()) {
        const raw = await db.get('soc:club:' + clubId + ':post:' + pid);
        if (!raw) continue;
        try { posts.push(JSON.parse(raw)); } catch (e) {}
      }
      return posts;
    } catch (e) { return []; }
  }

  // GET /clubs — list all clubs, optional ?lang filter.
  api.get('/clubs', async (req, res) => {
    try {
      const lang = String(req.query.lang || '').trim();
      const ids = await db.smembers('soc:clubs');
      const clubs = [];
      for (const id of ids) {
        const c = await fetchClub(id);
        if (!c) continue;
        if (lang && lang !== 'All' && c.lang !== lang) continue;
        clubs.push(c);
      }
      clubs.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
      // Language filter chips (unique langs across all clubs) so the
      // client can render the horizontal chip row deterministically.
      const langs = Array.from(new Set(clubs.map(c => c.lang)));
      res.json({ clubs, langs });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // GET /clubs/:id — club detail + latest posts.
  api.get('/clubs/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const club = await fetchClub(id);
      if (!club) return res.status(404).json({ error: 'Club not found.' });
      const me = await userFromReq(req).catch(() => null);
      const isMember = me ? !!(await db.sismember('soc:club:' + id + ':members', me.id)) : false;
      const posts = await fetchPosts(id);
      res.json({ club, isMember, posts });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /clubs/:id/join — toggle membership.
  api.post('/clubs/:id/join', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const id = String(req.params.id || '');
      const club = await fetchClub(id);
      if (!club) return res.status(404).json({ error: 'Club not found.' });
      const key = 'soc:club:' + id + ':members';
      const wasMember = await db.sismember(key, me.id);
      if (wasMember) await db.srem(key, me.id);
      else await db.sadd(key, me.id);
      res.json({ joined: !wasMember, memberCount: await db.scard(key) });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /clubs/:id/posts — create a post in a club.
  api.post('/clubs/:id/posts', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const id = String(req.params.id || '');
      const club = await fetchClub(id);
      if (!club) return res.status(404).json({ error: 'Club not found.' });
      const text = clean((req.body || {}).text, MAX_POST_CHARS);
      if (!text) return res.status(400).json({ error: 'Write something first.' });
      // @mentions — client sends a resolved list alongside the text so we
      // don't have to fuzzy-match names on the server (users can have the
      // same display name). Validated + block-filtered in resolveMentions.
      const mentions = await resolveMentions((req.body || {}).mentions, me.id);
      const pid = newId('p');
      const post = {
        id: pid, clubId: id,
        uid: me.id, name: me.name, photo: me.photo || null,
        text, createdAt: Date.now(),
        likes: [], comments: [],
        mentions,
      };
      await db.set('soc:club:' + id + ':post:' + pid, JSON.stringify(post));
      await db.rpush('soc:club:' + id + ':posts', pid);
      // Trim to last MAX_POSTS ids
      await db.ltrim('soc:club:' + id + ':posts', -MAX_POSTS, -1);
      // Fire-and-forget notifications so the write never blocks on
      // push delivery latency.
      const slug = slugForClub(club);
      const deepUrl = '/social?club=' + encodeURIComponent(slug || id) + '#post=' + pid;
      notifyMentions(mentions, me, club, deepUrl).catch(e => console.error('club mention notify:', e.message));
      res.json({ post });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /clubs/:id/posts/:pid/like — toggle a like.
  api.post('/clubs/:id/posts/:pid/like', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const { id, pid } = req.params;
      const key = 'soc:club:' + id + ':post:' + pid;
      const raw = await db.get(key);
      if (!raw) return res.status(404).json({ error: 'Post not found.' });
      const post = JSON.parse(raw);
      post.likes = post.likes || [];
      const idx = post.likes.indexOf(me.id);
      if (idx >= 0) post.likes.splice(idx, 1);
      else post.likes.push(me.id);
      await db.set(key, JSON.stringify(post));
      res.json({ liked: idx < 0, likeCount: post.likes.length });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /clubs/:id/posts/:pid/comments — add a comment.
  api.post('/clubs/:id/posts/:pid/comments', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const { id, pid } = req.params;
      const text = clean((req.body || {}).text, MAX_COMMENT_CHARS);
      if (!text) return res.status(400).json({ error: 'Write something first.' });
      const key = 'soc:club:' + id + ':post:' + pid;
      const raw = await db.get(key);
      if (!raw) return res.status(404).json({ error: 'Post not found.' });
      const post = JSON.parse(raw);
      post.comments = post.comments || [];
      const mentions = await resolveMentions((req.body || {}).mentions, me.id);
      const c = { id: newId('c'), uid: me.id, name: me.name, photo: me.photo || null, text, at: Date.now(), mentions };
      post.comments.push(c);
      if (post.comments.length > MAX_COMMENTS) post.comments.splice(0, post.comments.length - MAX_COMMENTS);
      await db.set(key, JSON.stringify(post));
      // Notify mentioned users (fire-and-forget). Deep-link points at
      // the parent post so tapping the notification lands them on the
      // comment thread rather than the club root.
      const club = await fetchClub(id);
      if (club) {
        const slug = slugForClub(club);
        const deepUrl = '/social?club=' + encodeURIComponent(slug || id) + '#post=' + pid;
        notifyMentions(mentions, me, club, deepUrl).catch(e => console.error('club comment mention notify:', e.message));
      }
      res.json({ comment: c, commentCount: post.comments.length });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // POST /clubs/:id/posts/:pid/delete — post author or admin can delete.
  api.post('/clubs/:id/posts/:pid/delete', async (req, res) => {
    try {
      const me = await userFromReq(req);
      if (!me) return res.status(401).json({ error: 'Please log in.' });
      const { id, pid } = req.params;
      const key = 'soc:club:' + id + ':post:' + pid;
      const raw = await db.get(key);
      if (!raw) return res.status(404).json({ error: 'Post not found.' });
      const post = JSON.parse(raw);
      if (post.uid !== me.id) return res.status(403).json({ error: 'Only the author can delete.' });
      await db.del(key);
      await db.lrem('soc:club:' + id + ':posts', 0, pid);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // ── Public SSR route: /clubs/:slug ─────────────────────────────────
  // Each club gets its own crawlable URL with unique <title>, meta
  // description, Open Graph / Twitter card tags and JSON-LD, so shared
  // links in WhatsApp, Discord, Twitter and Google Search render a real
  // preview instead of the generic app landing. The body ships a tiny
  // JS bootstrap that hands the user off to /social?club=<slug>, which
  // is where the interactive SPA opens the club UI. Bots that don't
  // execute JS still get all the SEO/preview content.
  //
  // Registered on `app` (not `api`) so the path is /clubs/:slug — the
  // /api/clubs collection JSON route on `api` lives under /api/clubs
  // and is unaffected.
  function coverUrlFor(c) {
    // Mirror the client's clubPhotoUrl() so the OG image matches what
    // the user sees inside the app. Deterministic per club id.
    const seed = encodeURIComponent((c && c.id) || 'club');
    return 'https://picsum.photos/seed/' + seed + '/1200/630';
  }
  function clubPage(club, posts) {
    const slug = slugForClub(club);
    const url = SITE + '/clubs/' + encodeURIComponent(slug);
    const name = club.name || 'Language Club';
    const emoji = club.emoji || '🌐';
    const lang = club.lang || '';
    const mc = Number(club.memberCount) || 0;
    const pc = (posts && posts.length) || 0;
    const title = name + (lang && lang !== 'Any' ? ' — ' + lang + ' language club' : '') + ' | WordSpies';
    const bareDesc = (club.desc || 'A friendly WordSpies language club.').trim();
    const desc = (bareDesc + ' Join ' + mc.toLocaleString() + ' ' + (mc === 1 ? 'member' : 'members') + ' practising together on WordSpies.').slice(0, 300);
    const cover = coverUrlFor(club);
    // JSON-LD: DiscussionForumPosting is the closest schema.org fit for
    // a topic-based community feed (each club is a forum, each post a
    // reply). CollectionPage wrap-around gives it a stable identity.
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      '@id': url,
      url: url,
      headline: name,
      name: name,
      description: bareDesc.slice(0, 300),
      inLanguage: lang || 'en',
      image: cover,
      author: { '@type': 'Organization', name: 'WordSpies' },
      publisher: {
        '@type': 'Organization',
        name: 'WordSpies',
        logo: { '@type': 'ImageObject', url: SITE + '/icon-192.png' }
      },
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/JoinAction',    userInteractionCount: mc },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: pc }
      ],
      dateCreated: new Date(Number(club.createdAt) || Date.now()).toISOString()
    };
    const spaHref = '/social?club=' + encodeURIComponent(slug);
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f7500">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/icon-192.png">
<meta property="og:site_name" content="WordSpies">
<meta property="og:locale" content="en_GB">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(name + ' ' + emoji)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(cover)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(cover)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',system-ui,sans-serif;background:#fafafa;color:#1c1e21;line-height:1.55}
.wrap{max-width:720px;margin:0 auto;padding:32px 22px 60px}
.logo{font-family:'Fredoka',sans-serif;font-weight:600;font-size:22px;text-decoration:none;display:inline-block;margin-bottom:18px}
.logo .r{color:#ff4d6b}.logo .b{color:#3d7bff}
.cover{border-radius:20px;overflow:hidden;height:220px;background:#3d7bff center/cover no-repeat;background-image:url('${esc(cover)}');margin-bottom:20px;position:relative}
.cover::after{content:'';position:absolute;inset:auto 0 0 0;height:65%;background:linear-gradient(to top,rgba(0,0,0,.55),transparent)}
h1{font-family:'Fredoka','Inter',sans-serif;font-weight:700;font-size:28px;letter-spacing:-.4px;margin:0 0 8px;color:#111318}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;color:#5f6675;font-size:13.5px;font-weight:500;margin-bottom:16px}
.meta .chip{background:#f4f5f7;border-radius:99px;padding:5px 12px}
.desc{font-size:16px;color:#242628;margin:0 0 26px}
.cta{background:linear-gradient(135deg,#0f7500,#22c07a);color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;box-shadow:0 8px 22px rgba(15,117,0,.28)}
.cta:hover{filter:brightness(1.06)}
.note{color:#7b8090;font-size:12.5px;margin-top:22px}
.posts{margin-top:32px;border-top:1px solid #e6e8ec;padding-top:22px}
.posts h2{font-size:17px;font-weight:700;color:#374151;margin:0 0 12px}
.post{background:#fff;border:1px solid #eef0f4;border-radius:14px;padding:14px 16px;margin-bottom:10px}
.post .who{font-weight:700;font-size:13.5px;color:#111318;margin-bottom:4px}
.post .body{font-size:14px;color:#242628;white-space:pre-wrap;word-wrap:break-word}
</style>
</head>
<body>
<div class="wrap">
  <a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a>
  <div class="cover" role="img" aria-label="${esc(name)} cover"></div>
  <h1>${esc(name)} ${esc(emoji)}</h1>
  <div class="meta">
    ${lang ? `<span class="chip">${esc(lang)}</span>` : ''}
    <span class="chip">${mc.toLocaleString()} ${mc === 1 ? 'member' : 'members'}</span>
    ${pc ? `<span class="chip">${pc} recent ${pc === 1 ? 'post' : 'posts'}</span>` : ''}
  </div>
  <p class="desc">${esc(bareDesc)}</p>
  <a class="cta" href="${esc(spaHref)}">Open club →</a>
  <p class="note">You're on the preview page. Tap the button above to open the live club feed inside WordSpies.</p>
  ${posts && posts.length ? `<div class="posts"><h2>Recent posts</h2>${
    posts.slice(0, 5).map(p => `<div class="post"><div class="who">${esc(p.name || 'Member')}</div><div class="body">${esc((p.text || '').slice(0, 500))}</div></div>`).join('')
  }</div>` : ''}
</div>
<script>
// Hand the user off to the SPA. Runs after DOM parse so bots that
// don't execute JS still index the rendered content above. Delay is
// deliberate — gives crawlers a beat to see the page before we swap
// them into the app, and stops back-button loops (we replaceState so
// they can back out of the SPA to wherever they came from).
(function(){
  try {
    var isBot = /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|twitterbot|linkedinbot|discordbot|slackbot|telegrambot|preview|embedly/i.test(navigator.userAgent || '');
    if (isBot) return;
    setTimeout(function(){
      try { window.location.replace(${JSON.stringify(spaHref)}); } catch (e) {}
    }, 60);
  } catch (e) {}
})();
</script>
</body></html>`;
  }
  function notFoundPage(slug) {
    const url = SITE + '/clubs/' + encodeURIComponent(slug || '');
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Club not found — WordSpies</title>
<meta name="description" content="This WordSpies language club could not be found. Browse all clubs to find one that fits your language.">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/icon-192.png">
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#1c1e21;padding:60px 22px;text-align:center}
h1{font-size:26px;margin:0 0 12px}
p{color:#5f6675;font-size:15px;margin:0 0 22px}
a{background:#0f7500;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none;font-weight:600}
</style></head>
<body>
<h1>Club not found</h1>
<p>The club you're looking for doesn't exist or has been removed.</p>
<a href="/social">Browse all clubs</a>
</body></html>`;
  }
  // Per-IP rate limit on the SSR route (BUG-009): defence-in-depth
  // alongside the rebuild-throttle in resolveSlug. 30 hits/IP/min is
  // generous for humans but stops a random-slug flood attack.
  const _clubsRLBuckets = new Map();
  function clubsSSRLimited(req) {
    try {
      const ip = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]).trim() || 'unknown';
      const now = Date.now();
      const key = ip;
      const b = _clubsRLBuckets.get(key) || { hits: 0, until: now + 60000 };
      if (now > b.until) { b.hits = 0; b.until = now + 60000; }
      b.hits++;
      _clubsRLBuckets.set(key, b);
      // Trim occasionally to keep the map bounded.
      if (_clubsRLBuckets.size > 5000) {
        for (const [k, v] of _clubsRLBuckets) { if (now > v.until) _clubsRLBuckets.delete(k); if (_clubsRLBuckets.size < 3000) break; }
      }
      return b.hits > 30;
    } catch (e) { return false; }
  }
  app.get('/clubs/:slug', async (req, res) => {
    if (clubsSSRLimited(req)) { res.status(429).type('text/plain').send('Slow down'); return; }
    const slug = String(req.params.slug || '').toLowerCase().slice(0, 120);
    try {
      const id = await resolveSlug(slug);
      if (!id) {
        res.status(404).type('html').send(notFoundPage(slug));
        return;
      }
      const club = await fetchClub(id);
      if (!club) {
        res.status(404).type('html').send(notFoundPage(slug));
        return;
      }
      // If the request came in via the raw id (legacy) but the club
      // has a nicer slug, 301 to the canonical URL so link equity
      // consolidates on one path.
      const canonicalSlug = slugForClub(club);
      if (canonicalSlug && slug !== canonicalSlug) {
        return res.redirect(301, '/clubs/' + encodeURIComponent(canonicalSlug));
      }
      const posts = await fetchPosts(id, 10).catch(() => []);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.type('html').send(clubPage(club, posts));
    } catch (e) {
      // Never 500 an SEO landing route — degrade to a soft 404.
      res.status(404).type('html').send(notFoundPage(slug));
    }
  });

  // Clubs sitemap — separate file so it can be regenerated on the fly
  // without touching the static /public/sitemap.xml. robots.txt lists
  // both. Includes every club, ordered by member count (proxy for
  // "how alive is this page") so the strongest URLs come first.
  app.get('/sitemap-clubs.xml', async (req, res) => {
    try {
      const ids = await db.smembers('soc:clubs');
      const rows = [];
      for (const id of ids) {
        const c = await fetchClub(id);
        if (!c) continue;
        rows.push(c);
      }
      rows.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
      const urls = rows.map(c => {
        const slug = slugForClub(c);
        const lastmod = new Date(Number(c.createdAt) || Date.now()).toISOString().slice(0, 10);
        return `  <url><loc>${SITE}/clubs/${encodeURIComponent(slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
      }).join('\n');
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
      );
    } catch (e) {
      res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
    }
  });

  console.log('clubs module: mounted');
  return { fetchClub, fetchPosts, slugForClub, resolveSlug };
}

module.exports = { mount };
