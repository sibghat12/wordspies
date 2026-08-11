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

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('base64url');
}
function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\r]/g, '').trim().slice(0, max);
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

  seedIfEmpty(db);

  async function fetchClub(id) {
    try {
      const raw = await db.get('soc:club:' + id);
      if (!raw) return null;
      const club = JSON.parse(raw);
      const memberCount = await db.scard('soc:club:' + id + ':members');
      return { ...club, memberCount };
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
      const pid = newId('p');
      const post = {
        id: pid, clubId: id,
        uid: me.id, name: me.name, photo: me.photo || null,
        text, createdAt: Date.now(),
        likes: [], comments: [],
      };
      await db.set('soc:club:' + id + ':post:' + pid, JSON.stringify(post));
      await db.rpush('soc:club:' + id + ':posts', pid);
      // Trim to last MAX_POSTS ids
      await db.ltrim('soc:club:' + id + ':posts', -MAX_POSTS, -1);
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
      const c = { id: newId('c'), uid: me.id, name: me.name, photo: me.photo || null, text, at: Date.now() };
      post.comments.push(c);
      if (post.comments.length > MAX_COMMENTS) post.comments.splice(0, post.comments.length - MAX_COMMENTS);
      await db.set(key, JSON.stringify(post));
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

  console.log('clubs module: mounted');
  return { fetchClub, fetchPosts };
}

module.exports = { mount };
