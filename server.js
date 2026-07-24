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
app.get('/', (req, res) => {
  if (req.query.room) return res.redirect('/play?room=' + encodeURIComponent(String(req.query.room).slice(0, 8)));
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
try { require('./social').mount(app, redis); } catch (e) { console.error('social module failed to load (game unaffected):', e.message); }

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
      winReason: room.winReason, log: room.log, score: room.score,
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
  const colors = shuffle([
    ...Array(9).fill(startingTeam),
    ...Array(8).fill(otherTeam),
    ...Array(7).fill('neutral'),
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
    hostId: room.hostId,
    settings: room.settings,
    catalog: CATALOG,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, role: p.role, connected: p.connected, avatar: p.avatar, avatarSeed: p.avatarSeed, watcher: !!p.watcher
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
}

function startGame(room) {
  room.board = createBoard(room.settings.categories);
  room.state = 'playing';
  room.winner = null;
  room.winReason = null;
  room.clue = null;
  room.turn = { team: room.board.startingTeam, phase: 'clue' };
  room.log = [];
  addLog(room, { type: 'start', team: room.board.startingTeam });
  armTimer(room);
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  let room = null;
  let player = null;

  const guard = (fn) => (...args) => {
    try { fn(...args); } catch (err) { console.error(err); }
  };

  socket.on('create', guard(({ name }) => {
    if (room) return;
    name = String(name || '').trim().slice(0, 20) || 'Player';
    room = createRoom(name);
    player = { id: socket.id, name, team: null, role: 'operative', connected: true, avatar: pickAvatar(room), token: crypto.randomUUID() };
    room.hostId = socket.id;
    room.players.set(socket.id, player);
    socket.join(room.code);
    socket.emit('session', { code: room.code, token: player.token, name: player.name });
    addLog(room, { type: 'join', name });
    broadcast(room);
  }));

  socket.on('join', guard(({ code, name }) => {
    if (room) return;
    code = String(code || '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) { socket.emit('errorMsg', 'Room not found. Check the code and try again.'); return; }
    name = String(name || '').trim().slice(0, 20) || 'Player';
    // avoid duplicate names
    const names = new Set([...r.players.values()].map(p => p.name));
    let finalName = name; let n = 2;
    while (names.has(finalName)) finalName = `${name} ${n++}`;
    room = r;
    player = { id: socket.id, name: finalName, team: null, role: 'operative', connected: true, avatar: pickAvatar(room), token: crypto.randomUUID() };
    room.players.set(socket.id, player);
    socket.join(room.code);
    socket.emit('session', { code: room.code, token: player.token, name: player.name });
    addLog(room, { type: 'join', name: finalName });
    broadcast(room);
  }));

  // Watch-only entry: a secret link (?watch=Wxxxxxxxx) that shows the match
  // live — board, clues, players — but can never join a team or act.
  socket.on('watch', guard(({ watchCode }) => {
    if (room) return;
    watchCode = String(watchCode || '').trim().toUpperCase();
    const r = [...rooms.values()].find(x => x.watchCode === watchCode);
    if (!r) { socket.emit('errorMsg', 'This watch link is no longer valid.'); return; }
    let n = [...r.players.values()].filter(p => p.watcher).length + 1;
    room = r;
    player = { id: socket.id, name: 'Viewer ' + n, team: null, role: 'operative', watcher: true, connected: true, avatar: pickAvatar(room), token: crypto.randomUUID() };
    room.players.set(socket.id, player);
    socket.join(room.code);
    broadcast(room);
  }));

  socket.on('rejoin', guard(({ code, token }) => {
    if (room) return;
    code = String(code || '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) { socket.emit('sessionExpired'); return; }
    const entry = [...r.players.entries()].find(([, p]) => p.token === token);
    if (!entry) { socket.emit('sessionExpired'); return; }
    const [oldId, p] = entry;
    r.players.delete(oldId);
    p.id = socket.id;
    p.connected = true;
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
