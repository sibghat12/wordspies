// WordSpies — a Codenames-style online party game.
// Node.js + Express + Socket.IO. All game state lives in memory (no database).

const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { Server } = require('socket.io');
const { PACKS, CATALOG } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(compression());
// Canonical domain: send onrender + www traffic to https://wordspies.co.uk
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if ((host === 'wordspies.onrender.com' || host === 'www.wordspies.co.uk') &&
      req.path !== '/healthz' && !req.path.startsWith('/socket.io')) {
    return res.redirect(301, 'https://wordspies.co.uk' + req.originalUrl);
  }
  next();
});
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});
const landing = require('./landing');
// The community IS the site now: the social app answers the front door —
// games, community, chats and live games all one tap away. The old marketing
// landing still exists at /home for anyone who wants the tour. Old share
// links (wordspies.co.uk/?room=XXXX) still land at their game table.
app.get('/', (req, res) => {
  if (req.query.room) return res.redirect('/play?room=' + encodeURIComponent(String(req.query.room).slice(0, 8)));
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'social.html'));
});
app.get('/home', (req, res) => {
  res.type('html').send(landing.page());
});
app.get('/play', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.get('/healthz', (req, res) => res.send('ok'));

// Which build is this? The value is just the moment the process started —
// every deploy restarts the server, so a change here means "there is a newer
// site than the one you loaded". /a2hs.js polls it and refreshes stale pages,
// which is what stops installed apps living on last week's version.
const BOOT_VERSION = String(Date.now());
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ v: BOOT_VERSION });
});

// Is this invite link still good? Lets the page tell "expired" from "live"
// before it tries to seat anyone. The code is already in the visitor's URL,
// so this leaks nothing — and it deliberately never exposes the watch code.
app.get('/api/room/:code', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.params.code || '').trim().toUpperCase();
  const r = rooms.get(code);
  if (!r) return res.json({ exists: false });
  res.json({
    exists: true,
    state: r.state,
    players: r.players.size,
    started: r.state !== 'lobby'
  });
});

const blog = require('./blog');
app.get('/blog', (req, res) => res.type('html').send(blog.indexPage()));
app.get('/blog/:slug', (req, res) => {
  const page = blog.articlePage(req.params.slug);
  if (!page) return res.redirect('/blog');
  res.type('html').send(page);
});

const pages = require('./pages');
app.get('/about', (req, res) => res.type('html').send(pages.aboutPage()));
app.get('/privacy', (req, res) => res.type('html').send(pages.privacyPage()));
app.get('/terms', (req, res) => res.type('html').send(pages.termsPage()));

process.on('uncaughtException', err => console.error('uncaught:', err));
process.on('unhandledRejection', err => console.error('unhandled:', err));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// In-memory rooms
// ---------------------------------------------------------------------------
const rooms = new Map(); // code -> room

// ---------------------------------------------------------------------------
// Optional persistence (Redis / Render Key Value): rooms survive restarts and
// deploys. Enabled when REDIS_URL is set. After a restart, players walk right
// back into their game — their saved session token rejoins them automatically.
// ---------------------------------------------------------------------------
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    redis.on('error', e => console.error('redis:', e.message));
    console.log('redis persistence: on');
  } catch (e) { console.error('redis init failed:', e.message); redis = null; }
}

// WordSpies Social (community pages) — fully isolated module; if it ever
// fails to load, the game itself keeps running untouched.
let social = null;
try { social = require('./social').mount(app, redis) || null; } catch (e) { console.error('social module failed to load (game unaffected):', e.message); }

// 🧠 Mind Meld — the two-player side game at /meld. Same deal as social: its
// own module, its own socket namespace, its own rooms. If it fails to load the
// main game does not notice. It borrows nothing but the identity lookup, so a
// signed-in player is seated under their own name and photo.
let meldMod = null;
try { meldMod = require('./meld').mount(app, io, { identify: resolveSocialIdentity }) || null; }
catch (e) { console.error('meld module failed to load (game unaffected):', e.message); }

// 🎲 The arcade — Ludo, Connect 4 and 8-ball pool, at /games. Same isolation
// rules again: own namespaces, own rooms, borrows only the identity lookup.
let arcadeMod = null;
try { arcadeMod = require('./arcade').mount(app, io, { identify: resolveSocialIdentity }) || null; }
catch (e) { console.error('arcade module failed to load (game unaffected):', e.message); }

// ── Live ──────────────────────────────────────────────────────────────────
// Every game actually being played right now, in one list. The point is that
// an empty-looking site and a busy one should not look the same: if four
// people are mid-game you should be able to see it, look in, and either ask
// for a seat or just watch. Nothing in here is private — names and photos are
// what players already show at the table, and no board position, hand or
// spymaster key is included. Rooms with nobody but bots in them are skipped,
// because "6 games live" is a lie if five of them are a computer alone.
const teamName = t => t === 'red' ? 'Red' : t === 'blue' ? 'Blue' : null;
function wordspiesLive() {
  const out = [];
  for (const r of rooms.values()) {
    const seated = [...r.players.values()].filter(p => !p.watcher && p.connected);
    if (!seated.length) continue;
    const rem = r.board ? { red: remaining(r, 'red'), blue: remaining(r, 'blue') } : null;
    out.push({
      game: 'wordspies', icon: '🕵️', title: 'WordSpies',
      code: r.code, href: '/play?room=' + r.code, watchHref: '/play?watch=' + r.code,
      state: r.state, cap: null,
      players: seated.map(p => ({
        name: p.name, photo: p.photo || null, bot: false, connected: true, team: p.team || null
      })),
      seatsFree: null,
      lead: r.state === 'over'
        ? ((teamName(r.winner) || 'Nobody') + ' won it')
        : (rem ? 'Red ' + rem.red + ' — Blue ' + rem.blue + ' left' : 'Picking teams'),
      turnName: r.state === 'playing' && r.turn
        ? teamName(r.turn.team) + (r.turn.phase === 'clue' ? ' — writing a clue' : ' — guessing')
        : null,
      watchers: [...r.players.values()].filter(p => p.watcher && p.connected).length,
      since: r.lastActivity || Date.now()
    });
  }
  return out;
}

app.get('/api/live', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let games = [];
  const add = (fn) => { try { if (fn) games = games.concat(fn() || []); } catch (e) { /* one game's bad day is not the tab's */ } };
  add(wordspiesLive);
  add(arcadeMod && arcadeMod.live);
  add(meldMod && meldMod.live);
  // Games actually being played first, then the ones still filling up, and
  // within each the ones that moved most recently — a game someone touched a
  // minute ago is far more worth looking at than one idling since lunchtime.
  const rank = g => (g.state === 'playing' ? 0 : g.state === 'lobby' ? 1 : 2);
  games.sort((a, b) => rank(a) - rank(b) || (b.since || 0) - (a.since || 0));
  res.json({
    games,
    playing: games.filter(g => g.state === 'playing').length,
    total: games.length,
    people: games.reduce((n, g) => n + g.players.filter(p => !p.bot).length, 0),
    watching: games.reduce((n, g) => n + (g.watchers || 0), 0)
  });
});

// 🧪 Unlocks the test hatch: /play?test=<this>. Lives here rather than in the
// client bundle so it isn't discoverable by reading the page source. Set
// TEST_KEY in the environment to rotate it, or to '' to disable the hatch.
const TEST_KEY = process.env.TEST_KEY !== undefined ? process.env.TEST_KEY : 'sq7-bench';

const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // clean up rooms idle for 6 hours
const saveTimers = new Map();
function saveRoom(room) {
  if (!redis || saveTimers.has(room.code)) return;
  saveTimers.set(room.code, setTimeout(() => {
    saveTimers.delete(room.code);
    if (!rooms.has(room.code)) return;
    const data = {
      code: room.code, watchCode: room.watchCode, hostId: room.hostId, state: room.state, settings: room.settings,
      board: room.board, turn: room.turn, clue: room.clue, winner: room.winner,
      winReason: room.winReason, log: room.log, score: room.score, spySwapped: room.spySwapped || {},
      lastActivity: room.lastActivity,
      players: [...room.players.entries()].map(([id, p]) => [id, { ...p }])
    };
    redis.set('ws:room:' + room.code, JSON.stringify(data), 'EX', Math.floor(ROOM_TTL_MS / 1000))
      .catch(e => console.error('redis save:', e.message));
  }, 400));
}

function dropRoom(code) {
  rooms.delete(code);
  if (redis) redis.del('ws:room:' + code).catch(() => {});
}

async function restoreRooms() {
  if (!redis) return;
  try {
    const keys = await redis.keys('ws:room:*');
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const d = JSON.parse(raw);
      const room = {
        code: d.code, watchCode: d.watchCode || ('W' + crypto.randomBytes(4).toString('hex').toUpperCase()),
        hostId: d.hostId, players: new Map(),
        state: d.state, settings: d.settings || { categories: [], timer: 0 },
        board: d.board, turn: d.turn, clue: d.clue, winner: d.winner,
        winReason: d.winReason, log: d.log || [], score: d.score || { red: 0, blue: 0 },
        spySwapped: d.spySwapped || {},
        timerEnd: null, timerHandle: null, lastActivity: Date.now()
      };
      for (const [id, p] of d.players || []) room.players.set(id, { ...p, connected: false });
      rooms.set(room.code, room);
      if (room.state === 'playing' && room.settings.timer) armTimer(room);
    }
    if (keys.length) console.log(`restored ${keys.length} room(s) from redis`);
  } catch (e) { console.error('redis restore:', e.message); }
}
restoreRooms();

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) dropRoom(code);
  }
}, 1000 * 60 * 10);

const AVATARS = ['🦊','🐼','🐸','🐙','🦁','🐯','🐨','🐰','🐵','🐧','🦄','🐢','🐝','🦋','🐳','🦉','🐹','🐮','🐷','🦒'];
function pickAvatar(room) {
  const used = new Set([...room.players.values()].map(p => p.avatar));
  return AVATARS.find(a => !used.has(a)) || AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_CATS = Object.keys(PACKS);
function createBoard(categories) {
  // 25 random words drawn from the selected categories (deduped).
  // best-quality boards: single words only, max 11 letters (fits tiles perfectly)
  let keys = Array.isArray(categories) ? categories.filter(k => PACKS[k]) : [];
  if (!keys.length) keys = ALL_CATS; // fallback to everything
  let pool = [...new Set(keys.flatMap(k => PACKS[k].words))]
    .filter(w => !w.includes(' ') && !w.includes('-') && w.length <= 11);
  // safety: if a tiny selection can't fill 25 unique tiles, top up from all packs
  if (pool.length < 25) {
    pool = [...new Set([...pool, ...Object.values(PACKS).flatMap(p => p.words)])]
      .filter(w => !w.includes(' ') && !w.includes('-') && w.length <= 11);
  }
  const words = shuffle(pool).slice(0, 25);
  const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
  const otherTeam = startingTeam === 'red' ? 'blue' : 'red';
  // Both teams get the same number of cards — 8 each. (Classic Codenames gives
  // the first team 9 as a handicap for going first; an even board is simply
  // easier to read and feels fairer at the table.) The freed card becomes a
  // neutral, so the 25 still add up: 8 + 8 + 8 + 1 assassin.
  const colors = shuffle([
    ...Array(8).fill(startingTeam),
    ...Array(8).fill(otherTeam),
    ...Array(8).fill('neutral'),
    'assassin'
  ]);
  return {
    startingTeam,
    cards: words.map((word, i) => ({ word, color: colors[i], revealed: false }))
  };
}

function createRoom(hostName) {
  const code = makeCode();
  const room = {
    code,
    // secret view-only code — sharing this link lets people WATCH the match
    // without ever learning the join code
    watchCode: 'W' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    hostId: null,
    players: new Map(), // socketId -> {id, name, team, role, connected}
    state: 'lobby', // lobby | playing | over
    settings: { categories: [], timer: 0 }, // [] = mix all categories; timer secs (0=off)
    board: null,
    turn: null, // {team, phase: 'clue'|'guess'}
    clue: null, // {word, count, guessesLeft}
    winner: null,
    winReason: null,
    log: [],
    score: { red: 0, blue: 0 },
    timerEnd: null,
    timerHandle: null,
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function addLog(room, entry) {
  room.log.push({ ...entry, t: Date.now() });
  if (room.log.length > 200) room.log.shift();
}

function remaining(room, team) {
  return room.board.cards.filter(c => c.color === team && !c.revealed).length;
}

// 👑 The people this whole thing was built for. They wear a crown instead of the
// blue tick — a tick that nearly everyone has stopped meaning anything. Kept in
// step with the same list in social.js. The crown needs a real signed-in account
// behind it, so nobody can put on a name in the join box and borrow one.
const KINGS = new Set(['ayoub', 'xman', 'ali', 'pray', 'dem', 'sibi', 'rami', 'earlin', 'ana', 'karina']);
const isKingName = p => !!p.socUid && KINGS.has(String(p.name || '').trim().toLowerCase());

// Public view of the room. Spymasters (and everyone when the game is over)
// also receive card colors.
function publicState(room, forPlayer) {
  const isSpymaster = forPlayer && forPlayer.role === 'spymaster';
  const revealAll = room.state === 'over';
  const isWatcher = forPlayer && forPlayer.watcher;
  return {
    // watchers never see the join code or the watch code — their link is all they get
    code: isWatcher ? null : room.code,
    watchCode: isWatcher ? null : room.watchCode,
    state: room.state,
    spySwapped: room.spySwapped || {},
    hostId: room.hostId,
    settings: room.settings,
    catalog: CATALOG,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, role: p.role, connected: p.connected, avatar: p.avatar, avatarSeed: p.avatarSeed, watcher: !!p.watcher,
      photo: p.photo || null, verified: !!p.socUid && !isKingName(p), king: isKingName(p)
    })),
    board: room.board ? {
      startingTeam: room.board.startingTeam,
      cards: room.board.cards.map(c => ({
        word: c.word,
        revealed: c.revealed,
        by: c.revealed ? (c.by || null) : null,
        color: (c.revealed || isSpymaster || revealAll) ? c.color : null
      }))
    } : null,
    remaining: room.board ? { red: remaining(room, 'red'), blue: remaining(room, 'blue') } : null,
    turn: room.turn,
    clue: room.clue,
    winner: room.winner,
    winReason: room.winReason,
    log: room.log,
    score: room.score,
    timerEnd: room.timerEnd
  };
}

function broadcast(room) {
  room.lastActivity = Date.now();
  for (const [sockId, player] of room.players) {
    const sock = io.sockets.sockets.get(sockId);
    if (sock) sock.emit('state', publicState(room, player));
  }
  saveRoom(room);
}

function clearTimer(room) {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = null;
  room.timerEnd = null;
}

function armTimer(room) {
  clearTimer(room);
  if (!room.settings.timer || room.state !== 'playing') return;
  room.timerEnd = Date.now() + room.settings.timer * 1000;
  room.timerHandle = setTimeout(() => {
    if (room.state !== 'playing') return;
    const team = room.turn.team;
    addLog(room, { type: 'timeout', team });
    endTurn(room);
    armTimer(room);
    broadcast(room);
  }, room.settings.timer * 1000);
}

function endTurn(room) {
  room.turn = { team: room.turn.team === 'red' ? 'blue' : 'red', phase: 'clue' };
  room.clue = null;
}

function endGame(room, winner, reason) {
  room.state = 'over';
  room.winner = winner;
  room.winReason = reason;
  room.score[winner]++;
  clearTimer(room);
  addLog(room, { type: 'gameover', team: winner, reason });
  // Credit the match to any players who are logged into WordSpies Social:
  // everyone seated gets +1 game, the winning team also gets +1 win.
  if (social && social.recordResult) {
    const seated = [...room.players.values()].filter(p => p.socUid && p.team && !p.watcher);
    const winners = [...new Set(seated.filter(p => p.team === winner).map(p => p.socUid))];
    const losers = [...new Set(seated.filter(p => p.team !== winner).map(p => p.socUid))].filter(u => !winners.includes(u));
    if (winners.length || losers.length) social.recordResult(winners, losers).catch(e => console.error('recordResult:', e.message));
  }
}

function startGame(room) {
  room.board = createBoard(room.settings.categories);
  room.state = 'playing';
  room.winner = null;
  room.winReason = null;
  room.clue = null;
  room.turn = { team: room.board.startingTeam, phase: 'clue' };
  room.spySwapped = {}; // each team gets one emergency spymaster swap per game
  // The board arriving shouldn't cut the room off mid-sentence. Wiping the log
  // clears out the moves of the last game, which is right, but the chat people
  // were having while they waited carries on into this one — so the last few
  // lines of it come with us.
  room.log = room.log.filter(e => e.type === 'chat').slice(-6);
  addLog(room, { type: 'start', team: room.board.startingTeam });
  armTimer(room);
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
// If the visitor is logged into WordSpies Social, their session cookie rides
// along on the socket handshake — resolve it to a profile id so wins can be
// credited to their profile. Server-side lookup, so it can't be spoofed.
async function resolveSocialUid(socket) {
  try {
    const m = String(socket.handshake.headers.cookie || '').match(/(?:^|;\s*)soc_sess=([a-f0-9]{48})/);
    if (!m) return null;
    // Ask the social module — it owns the session store and knows whether that's
    // redis or its in-memory fallback. Reading redis directly here would return
    // null on any redis-less deploy even though the person is properly logged in.
    if (social && social.uidBySession) return await social.uidBySession(m[1]);
    if (!redis) return null;
    return await redis.get('soc:sess:' + m[1]);
  } catch (e) { return null; }
}

// Cookie → { uid, name, photo }. Everything a logged-in player needs to be
// seated without typing anything. Resolves to null for guests, and guests
// must keep working — playing without an account is the whole pitch.
async function resolveSocialIdentity(socket) {
  const uid = await resolveSocialUid(socket);
  if (!uid) return null;
  let profile = null;
  if (social && social.profileByUid) {
    try { profile = await social.profileByUid(uid); } catch (e) { console.error('identity:', e.message); }
  }
  return { uid, name: (profile && profile.name) || null, photo: (profile && profile.photo) || null };
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  socket.socUid = null;
  socket.socProfile = null;
  // Hold the promise, not just the result. Auto-join fires the instant the
  // socket connects, so a handler that read socket.socUid directly would race
  // this lookup and silently seat a logged-in player as an anonymous guest —
  // their win would then never be credited. Handlers await this instead.
  socket.socReady = resolveSocialIdentity(socket)
    .then(idn => {
      socket.socUid = idn ? idn.uid : null;
      socket.socProfile = idn;
      return idn;
    })
    .catch(() => null);

  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (err) { console.error(err); }
  };

  // `room` is only assigned after an await, so two rapid create/join events
  // could both pass the `if (room)` check. This closes that window.
  let entering = false;

  socket.on('create', guard(async ({ name }) => {
    if (room || entering) return;
    entering = true;
    try {
      const idn = await socket.socReady;
      // No name typed (auto-join from a link) → use the profile name.
      name = String(name || '').trim().slice(0, 20) || (idn && idn.name) || 'Player';
      room = createRoom(name);
      player = {
        id: socket.id, name, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(),
        socUid: idn ? idn.uid : null, photo: idn ? idn.photo : null
      };
      room.hostId = socket.id;
      room.players.set(socket.id, player);
      socket.join(room.code);
      socket.emit('session', { code: room.code, token: player.token, name: player.name });
      addLog(room, { type: 'join', name });
      broadcast(room);
    } finally { entering = false; }
  }));

  socket.on('join', guard(async ({ code, name }) => {
    if (room || entering) return;
    entering = true;
    try {
      code = String(code || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) { socket.emit('errorMsg', 'Room not found. Check the code and try again.'); return; }
      const idn = await socket.socReady;
      if (!rooms.has(code)) { socket.emit('errorMsg', 'Room not found. Check the code and try again.'); return; }
      name = String(name || '').trim().slice(0, 20) || (idn && idn.name) || 'Player';
      // avoid duplicate names
      const names = new Set([...r.players.values()].map(p => p.name));
      let finalName = name; let n = 2;
      while (names.has(finalName)) finalName = `${name} ${n++}`;
      room = r;
      player = {
        id: socket.id, name: finalName, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(),
        socUid: idn ? idn.uid : null, photo: idn ? idn.photo : null
      };
      room.players.set(socket.id, player);
      socket.join(room.code);
      socket.emit('session', { code: room.code, token: player.token, name: player.name });
      addLog(room, { type: 'join', name: finalName });
      broadcast(room);
    } finally { entering = false; }
  }));

  // Watch-only entry: a secret link (?watch=Wxxxxxxxx) that shows the match
  // live — board, clues, players — but can never join a team or act.
  // Since the Live tab, a plain room code works here too ({ code }). That is
  // not a hole: the room code is the *join* code, so anyone holding it could
  // already walk in and take a seat — arriving as a silent viewer instead is
  // strictly the more polite door. The secret watchCode still exists for the
  // case it was built for, handing someone a link that can only ever watch.
  socket.on('watch', guard(({ watchCode, code }) => {
    if (room) return;
    watchCode = String(watchCode || '').trim().toUpperCase();
    const plain = String(code || '').trim().toUpperCase();
    const key = watchCode || plain;
    const r = [...rooms.values()].find(x => x.watchCode === key) || (key ? rooms.get(key) : null);
    if (!r) { socket.emit('errorMsg', 'This game is no longer running.'); return; }
    let n = [...r.players.values()].filter(p => p.watcher).length + 1;
    room = r;
    player = { id: socket.id, name: 'Viewer ' + n, team: null, role: 'operative', watcher: true, connected: true, avatar: pickAvatar(room), token: crypto.randomUUID() };
    room.players.set(socket.id, player);
    socket.join(room.code);
    broadcast(room);
  }));

  socket.on('rejoin', guard(async ({ code, token }) => {
    if (room || entering) return;
    code = String(code || '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) { socket.emit('sessionExpired'); return; }
    const entry = [...r.players.entries()].find(([, p]) => p.token === token);
    if (!entry) { socket.emit('sessionExpired'); return; }
    const idn = await socket.socReady;
    if (room) return;                       // a join landed while we were waiting
    const [oldId, p] = entry;
    r.players.delete(oldId);
    p.id = socket.id;
    p.connected = true;
    // Someone who logged in mid-session gets credited from here on.
    if (idn) {
      if (!p.socUid) p.socUid = idn.uid;
      if (!p.photo && idn.photo) p.photo = idn.photo;
    }
    r.players.set(socket.id, p);
    if (r.hostId === oldId) r.hostId = socket.id;
    room = r; player = p;
    socket.join(r.code);
    socket.emit('session', { code: r.code, token: p.token, name: p.name });
    broadcast(r);
  }));

  socket.on('setTeamRole', guard(({ team, role }) => {
    if (!room || !player) return;
    if (!['red', 'blue'].includes(team)) return;
    if (!['operative', 'spymaster'].includes(role)) return;
    // Only one spymaster per team
    if (role === 'spymaster') {
      const taken = [...room.players.values()].some(p => p !== player && p.team === team && p.role === 'spymaster');
      if (taken) { socket.emit('errorMsg', 'That team already has a spymaster.'); return; }
    }
    // 👁 Watch-only visitors can never take a seat
    if (player.watcher) {
      socket.emit('errorMsg', '👁 This is a watch-only link — you can see the game but not play.');
      return;
    }
    // Can't switch teams during a game
    if (room.state === 'playing' && player.team && player.team !== team) {
      socket.emit('errorMsg', 'You can\'t switch teams during a game.');
      return;
    }
    // No new spymasters mid-game: the original spymaster saw the colors and can
    // rejoin their seat at any time — replacing them would compromise the round.
    if (room.state === 'playing' && role === 'spymaster' && player.role !== 'spymaster') {
      socket.emit('errorMsg', 'Spymasters can\'t be changed mid-game. Finish this round or start a new game.');
      return;
    }
    player.team = team;
    player.role = role;
    broadcast(room);
  }));

  // ---- 🧪 test hatch ----------------------------------------------------
  // Fills a room with dummy players and can force a result, so the wheel and
  // the win→profile loop can be exercised on the live site without rounding up
  // three friends. Gated on a key that only appears server-side: without it,
  // anyone could inflate their own win count.
  socket.on('testFill', guard(({ key }) => {
    if (!TEST_KEY || key !== TEST_KEY || !room || socket.id !== room.hostId) return;
    if (room.state !== 'lobby') return;
    room.test = true;
    for (const nm of ['Robo', 'Pixel', 'Widget']) {
      if ([...room.players.values()].some(p => p.name === nm)) continue;
      const id = 'bot_' + crypto.randomUUID().slice(0, 8);
      room.players.set(id, {
        id, name: nm, team: null, role: 'operative', connected: true,
        avatar: pickAvatar(room), token: crypto.randomUUID(), bot: true,
        socUid: null, photo: null
      });
      addLog(room, { type: 'join', name: nm });
    }
    broadcast(room);
  }));

  socket.on('testWin', guard(({ key, team }) => {
    if (!TEST_KEY || key !== TEST_KEY || !room || !room.test || socket.id !== room.hostId) return;
    if (!['red', 'blue'].includes(team) || room.state !== 'playing') return;
    // Goes through the normal ending, so profiles are credited exactly as they
    // would be in a real game — that's the whole point of testing it here.
    endGame(room, team, 'allfound');
    broadcast(room);
  }));

  // 🎡 Spin the wheel: the host shuffles everyone into teams at random, so
  // nobody has to negotiate who plays with whom. Lobby only — re-dealing seats
  // mid-game would hand the board's colors to the wrong people.
  socket.on('spinTeams', guard(() => {
    if (!room || socket.id !== room.hostId) return;
    if (room.state !== 'lobby') { socket.emit('errorMsg', 'You can only spin for teams before the game starts.'); return; }
    // 👁 Watchers are never dealt in — they asked to watch.
    const pool = shuffle([...room.players.values()].filter(p => !p.watcher));
    if (pool.length < 2) { socket.emit('errorMsg', 'You need at least 2 players to spin for teams.'); return; }

    // Deal alternately rather than splitting the list in half: that's what
    // guarantees the two teams can never differ by more than one player.
    pool.forEach((p, i) => {
      p.team = i % 2 === 0 ? 'red' : 'blue';
      // First one dealt to each side takes the spymaster seat.
      p.role = i < 2 ? 'spymaster' : 'operative';
    });

    addLog(room, { type: 'spin' });
    // The client animates a wheel over this order, then reveals the new lobby.
    io.to(room.code).emit('teamsSpun', {
      order: pool.map(p => ({ id: p.id, name: p.name, team: p.team, role: p.role }))
    });
    broadcast(room);
  }));

  // Host moderation: only the party creator can remove someone from their
  // seat — spymaster or team — sending them back to the spectator bench.
  socket.on('kick', guard(({ playerId }) => {
    if (!room || socket.id !== room.hostId) return;
    const target = room.players.get(String(playerId || ''));
    if (!target || target.id === room.hostId || !target.team) return;
    target.team = null;
    target.role = 'operative';
    addLog(room, { type: 'kick', name: target.name });
    broadcast(room);
  }));

  // 🆘 Emergency rescue: if a spymaster loses connection (or leaves) mid-game,
  // the host can promote a teammate to spymaster so the game isn't stuck.
  // Allowed ONCE per team per game, and only while that team's spymaster is
  // actually gone — the replaced spymaster is benched to spectators, since
  // they've already seen the colors.
  socket.on('promoteSpymaster', guard(({ playerId }) => {
    if (!room || socket.id !== room.hostId || room.state !== 'playing') return;
    const target = room.players.get(String(playerId || ''));
    if (!target || target.watcher || !target.team || target.role === 'spymaster') return;
    const team = target.team;
    const currentSpy = [...room.players.values()].find(p => p.team === team && p.role === 'spymaster');
    if (currentSpy && currentSpy.connected) {
      socket.emit('errorMsg', 'That team\'s spymaster is still connected — you can only replace one who lost connection or left.');
      return;
    }
    room.spySwapped = room.spySwapped || {};
    if (room.spySwapped[team]) {
      socket.emit('errorMsg', 'That team already used its one emergency spymaster swap this game.');
      return;
    }
    room.spySwapped[team] = true;
    if (currentSpy) { currentSpy.team = null; currentSpy.role = 'operative'; } // bench the old spymaster
    target.role = 'spymaster';
    addLog(room, { type: 'spyswap', team, name: target.name });
    broadcast(room);
  }));

  socket.on('setSettings', guard(({ timer, categories }) => {
    if (!room || socket.id !== room.hostId || room.state === 'playing') return;
    if (typeof timer === 'number' && [0, 60, 90, 120, 180].includes(timer)) room.settings.timer = timer;
    if (Array.isArray(categories)) {
      room.settings.categories = categories.filter(k => PACKS[k]); // [] allowed = mix all
    }
    broadcast(room);
  }));

  socket.on('shuffleAvatar', guard(() => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.avatarSeed = crypto.randomUUID().slice(0, 8);
    broadcast(room);
  }));

  socket.on('start', guard(() => {
    if (!room || socket.id !== room.hostId) return;
    if (room.state === 'playing') return;
    const ps = [...room.players.values()];
    const redSpy = ps.some(p => p.team === 'red' && p.role === 'spymaster');
    const blueSpy = ps.some(p => p.team === 'blue' && p.role === 'spymaster');
    const redOp = ps.some(p => p.team === 'red' && p.role === 'operative');
    const blueOp = ps.some(p => p.team === 'blue' && p.role === 'operative');
    if (!redSpy || !blueSpy || !redOp || !blueOp) {
      socket.emit('errorMsg', 'Each team needs at least 1 spymaster and 1 operative to start.');
      return;
    }
    startGame(room);
    broadcast(room);
  }));

  socket.on('clue', guard(({ word, count }) => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'clue') return;
    if (player.role !== 'spymaster' || player.team !== room.turn.team) return;
    word = String(word || '').trim().slice(0, 30);
    count = parseInt(count, 10);
    if (!word || isNaN(count) || count < 0 || count > 9) return;
    // Clue can't be a visible word on the board
    const visible = room.board.cards.filter(c => !c.revealed).map(c => c.word.toLowerCase());
    if (visible.includes(word.toLowerCase())) {
      socket.emit('errorMsg', 'Your clue can\'t be a word that\'s on the board.');
      return;
    }
    room.clue = { word, count, guessesLeft: count === 0 ? Infinity : count + 1 };
    room.turn.phase = 'guess';
    addLog(room, { type: 'clue', team: player.team, name: player.name, word, count });
    armTimer(room);
    broadcast(room);
  }));

  socket.on('guess', guard(({ index }) => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'guess') return;
    if (player.role !== 'operative' || player.team !== room.turn.team) return;
    index = parseInt(index, 10);
    const card = room.board.cards[index];
    if (!card || card.revealed) return;

    card.revealed = true;
    card.by = player.name;
    const team = player.team;
    addLog(room, { type: 'guess', team, name: player.name, word: card.word, color: card.color });

    if (card.color === 'assassin') {
      endGame(room, team === 'red' ? 'blue' : 'red', 'assassin');
      broadcast(room);
      return;
    }

    // Win checks (revealing the other team's last card also ends the game)
    for (const t of ['red', 'blue']) {
      if (remaining(room, t) === 0) {
        endGame(room, t, 'allfound');
        broadcast(room);
        return;
      }
    }

    if (card.color === team) {
      if (room.clue.guessesLeft !== Infinity) room.clue.guessesLeft--;
      if (room.clue.guessesLeft <= 0) {
        addLog(room, { type: 'turnend', team, reason: 'noguesses' });
        endTurn(room);
        armTimer(room);
      }
    } else {
      addLog(room, { type: 'turnend', team, reason: 'wrong' });
      endTurn(room);
      armTimer(room);
    }
    broadcast(room);
  }));

  socket.on('pass', guard(() => {
    if (!room || !player || room.state !== 'playing') return;
    if (room.turn.phase !== 'guess') return;
    if (player.role !== 'operative' || player.team !== room.turn.team) return;
    addLog(room, { type: 'turnend', team: player.team, reason: 'pass' });
    endTurn(room);
    armTimer(room);
    broadcast(room);
  }));

  socket.on('rematch', guard(() => {
    if (!room || socket.id !== room.hostId || room.state !== 'over') return;
    room.state = 'lobby';
    room.board = null;
    room.turn = null;
    room.clue = null;
    room.winner = null;
    broadcast(room);
  }));

  socket.on('chat', guard(({ text }) => {
    if (!room || !player || player.watcher) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    addLog(room, { type: 'chat', name: player.name, team: player.team, text });
    broadcast(room);
  }));

  socket.on('leaveRoom', guard(() => {
    if (!room || !player) return;
    const r = room, p = player, sockId = socket.id;
    r.players.delete(sockId);
    addLog(r, { type: 'leave', name: p.name });
    room = null; player = null;
    socket.leave(r.code);
    if (r.hostId === sockId) {
      const next = [...r.players.keys()][0];
      r.hostId = next || null;
      if (!next) { clearTimer(r); dropRoom(r.code); return; }
    }
    broadcast(r);
  }));

  socket.on('disconnect', guard(() => {
    if (!room || !player) return;
    player.connected = false;
    // Give the player 3 minutes to come back (refresh, or leaving the app and
    // returning to the same URL) before removing them from the room.
    const r = room, p = player, sockId = socket.id;
    setTimeout(() => {
      const current = r.players.get(sockId);
      if (current && !current.connected) {
        r.players.delete(sockId);
        addLog(r, { type: 'leave', name: p.name });
        if (r.hostId === sockId) {
          const next = [...r.players.keys()][0];
          r.hostId = next || null;
          if (!next) { clearTimer(r); dropRoom(r.code); return; }
        }
        broadcast(r);
      }
    }, 180000);
    broadcast(room);
  }));
});

server.listen(PORT, () => {
  console.log(`WordSpies running → http://localhost:${PORT}`);
});
