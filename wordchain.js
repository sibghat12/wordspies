// Word Chain — the language-learning warm-up game.
//
// Players take turns typing a single English word. Each word must start with
// the last letter of the previous word. Say "GARDEN" and the next player has
// to open with a G-word — "GRAPE", "GHOST", anything. No repeats. Bad word,
// timeout or duplicate → lose a life. Three lives each. Last player standing
// wins.
//
// Own module, own socket namespace, own room table — matches spy.js and
// meld.js so a crash in here can never take the rest of the site down.

const path = require('path');

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 — misread aloud
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_NAME = 18;
const MAX_WORD = 24;
const LIVES = 3;
const TURN_MS = 30000;                        // 30s per turn
const ROOM_TTL = 1000 * 60 * 90;
// Signed-in creators keep their rooms alive for a week — same convention as
// spy.js: rooms stay put until the owner deletes or the game ends.
const OWNER_ROOM_TTL = 1000 * 60 * 60 * 24 * 7;
const DROP_GRACE = 120000;
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const START_LETTERS = 'ABCDEFGHIKLMPRSTW';    // no Q/X/Z-openers, and skip J/U/V/Y so first prompts feel fair

function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'W' + Date.now().toString(36).slice(-3).toUpperCase();
}

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_WORD);
const safeName = s => {
  const n = clean(s).slice(0, MAX_NAME);
  return n || 'Player';
};
// Normalise for chain matching + dupe check: strip anything that isn't a
// Latin letter, uppercase. So "e-mail", "email", "Email" all collapse to EMAIL.
const norm = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z]/g, '');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickStartLetter() {
  return START_LETTERS[Math.floor(Math.random() * START_LETTERS.length)];
}

function newRoom() {
  return {
    code: '', state: 'lobby',
    players: new Map(),         // socketId -> { id, name, photo, connected, lives }
    order: [],                  // socketId turn order, set at game start
    turnIdx: 0,                 // which order[] index is currently playing
    round: 1,                   // increments each time chain wraps
    chain: [],                  // [{ playerId, name, word, at }]
    used: new Set(),            // normalised words already played
    nextLetter: '',             // letter the current turn must start with
    turnDeadline: 0,            // Date.now() ms by which current player must act
    turnTimer: null,            // Node timeout handle
    winner: null,               // socketId of winner
    reveal: null,               // { winnerName, longest }
    hostId: null,
    watchers: null,             // Map<socketId, { uid, name, photo } | null>
    touched: Date.now(),
    lastKnock: 0
  };
}

function alivePlayers(r) {
  return [...r.players.values()].filter(p => p.lives > 0);
}
function aliveCount(r) {
  return alivePlayers(r).length;
}

// Public snapshot — same shape for players and watchers. No private data:
// the chain and used set are visible to everyone anyway (that's the game).
function publicState(room) {
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, photo: p.photo || null,
      connected: p.connected, lives: p.lives
    })),
    order: room.order,
    turnId: room.state === 'playing' ? (room.order[room.turnIdx] || null) : null,
    turnEndsAt: room.state === 'playing' ? room.turnDeadline : 0,
    turnMs: TURN_MS,
    nextLetter: room.nextLetter,
    chain: room.chain.slice(-40),   // last 40 words — the log
    chainLen: room.chain.length,
    winner: room.winner,
    reveal: room.reveal,
    hostId: room.hostId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lives: LIVES,
    watchers: room.watchers ? room.watchers.size : 0,
    crowd: room.watchers
      ? [...room.watchers.values()].map(w => (w && w.uid ? { uid: w.uid, name: w.name, photo: w.photo } : null))
      : []
  };
}

function mount(app, io, opts) {
  const options = opts || {};
  const identify = typeof options.identify === 'function' ? options.identify : null;
  const _uidFromReq = typeof options.uidFromReq === 'function' ? options.uidFromReq : null;
  const _activeGame = options.activeGame || null;
  if (_activeGame && _activeGame.registerVerifier) _activeGame.registerVerifier('wordchain', code => rooms.has(code));
  async function _guardActive(req, res) {
    if (!_activeGame || !_uidFromReq) return true;
    const uid = await _uidFromReq(req);
    if (!uid) return true;
    const active = await _activeGame.getVerified(uid);
    if (!active) return true;
    res.status(409).json({ error: 'active-game', activeGame: active });
    return false;
  }
  async function _markActive(req, game, code, url) {
    if (!_activeGame || !_uidFromReq) return;
    const uid = await _uidFromReq(req);
    if (uid) await _activeGame.set(uid, { game, code, url });
  }

  app.get('/wordchain', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'wordchain.html'));
  });

  // Empty-room bootstrap — mirrors /api/spy/new so the chat game-picker
  // can hand a code to friends before anyone opens the tab.
  app.post('/api/wordchain/new', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await _guardActive(req, res))) return;
    const code = newCode();
    const r = newRoom();
    r.code = code;
    rooms.set(code, r);
    await _markActive(req, 'wordchain', code, '/wordchain?room=' + code);
    res.json({ code });
  });

  app.get('/api/wordchain/:code', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = rooms.get(String(req.params.code || '').trim().toUpperCase());
    if (!r) return res.json({ exists: false });
    res.json({
      exists: true,
      full: r.players.size >= MAX_PLAYERS,
      state: r.state,
      players: r.players.size,
      host: r.hostId ? (r.players.get(r.hostId) || { name: null }).name : null
    });
  });

  const nsp = io.of('/wordchain');

  function dropRoom(code) {
    const r = rooms.get(code);
    if (r && r.turnTimer) { clearTimeout(r.turnTimer); r.turnTimer = null; }
    rooms.delete(code);
  }

  function broadcast(room) {
    room.touched = Date.now();
    const snap = publicState(room);
    nsp.to(room.code).emit('state', snap);
  }

  function armTurnTimer(room) {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    if (room.state !== 'playing') return;
    room.turnDeadline = Date.now() + TURN_MS;
    room.turnTimer = setTimeout(() => onTimeout(room), TURN_MS + 250).unref
      ? setTimeout(() => onTimeout(room), TURN_MS + 250)
      : setTimeout(() => onTimeout(room), TURN_MS + 250);
  }

  function onTimeout(room) {
    if (room.state !== 'playing') return;
    if (Date.now() < room.turnDeadline) return;   // clock skew guard
    const id = room.order[room.turnIdx];
    const p = id && room.players.get(id);
    if (!p || p.lives <= 0) { advanceTurn(room, null); return; }
    p.lives -= 1;
    nsp.to(room.code).emit('miss', { id: p.id, name: p.name, reason: 'timeout', word: null });
    if (checkEndConditions(room)) { broadcast(room); return; }
    advanceTurn(room, null);
    broadcast(room);
  }

  // Move to the next player who still has lives. If the pointer wraps past
  // the initial index, that's a completed round.
  function advanceTurn(room, lastPlayerId) {
    const n = room.order.length;
    if (!n) return;
    // Trim eliminated players out of the order so the turn ring shrinks.
    room.order = room.order.filter(id => {
      const p = room.players.get(id);
      return p && p.lives > 0;
    });
    if (!room.order.length) return;
    // Where to start looking next: if the last player is still in the order,
    // step past them; otherwise use the current turnIdx as-is (they were the
    // one just eliminated, so their old slot is where "next" begins).
    let start = 0;
    if (lastPlayerId) {
      const idx = room.order.indexOf(lastPlayerId);
      start = idx >= 0 ? (idx + 1) % room.order.length : 0;
    } else {
      // Timeout / disconnect case — turnIdx already points at the vacated
      // seat, so the next alive player is right there.
      start = Math.min(room.turnIdx, room.order.length - 1);
    }
    room.turnIdx = start;
    // Round tracking: whenever we come back around to seat 0, bump round.
    // (Approximate but visible — the exact ring-wrap is fine.)
    if (start === 0 && room.chain.length > 0) room.round += 1;
    armTurnTimer(room);
  }

  function checkEndConditions(room) {
    const alive = alivePlayers(room);
    if (alive.length <= 1) {
      room.state = 'ended';
      room.winner = alive.length === 1 ? alive[0].id : null;
      // Longest chain sequence so far — a nice stat to show on the end card.
      room.reveal = {
        winnerName: alive.length === 1 ? alive[0].name : null,
        chainLen: room.chain.length,
        longestWord: room.chain.reduce((best, c) => (c.word.length > (best ? best.length : 0) ? c.word : best), null)
      };
      if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
      return true;
    }
    return false;
  }

  function beginGame(room) {
    const ids = shuffle([...room.players.keys()]);
    if (ids.length < MIN_PLAYERS) return;
    for (const id of ids) {
      const p = room.players.get(id);
      p.lives = LIVES;
    }
    room.order = ids;
    room.turnIdx = 0;
    room.round = 1;
    room.chain = [];
    room.used = new Set();
    room.nextLetter = pickStartLetter();
    room.winner = null;
    room.reveal = null;
    room.state = 'playing';
    armTurnTimer(room);
    broadcast(room);
  }

  nsp.on('connection', (socket) => {
    let room = null;
    let me = null;
    let watch = null;

    socket.profile = null;
    socket.ready = identify
      ? identify(socket).then(p => { socket.profile = p || null; }).catch(() => { socket.profile = null; })
      : Promise.resolve();

    const fail = msg => socket.emit('err', { msg });

    socket.on('watch', async (data) => {
      if (room || watch) return;
      const r = rooms.get(String((data && data.code) || '').trim().toUpperCase());
      if (!r) { fail('That game has already finished.'); return; }
      await socket.ready;
      if (room || watch) return;
      const p = socket.profile;
      (r.watchers || (r.watchers = new Map()))
        .set(socket.id, p && p.uid ? { uid: p.uid, name: p.name, photo: p.photo } : null);
      watch = r;
      socket.join(r.code);
      socket.emit('watching', { code: r.code });
      socket.emit('state', publicState(r));
      broadcast(r);
    });

    socket.on('knock', () => {
      if (!watch) return;
      const now = Date.now();
      if (now - (watch.lastKnock || 0) < 8000) return;
      watch.lastKnock = now;
      const prof = socket.profile;
      socket.to(watch.code).emit('knock', {
        name: safeName((prof && prof.name) || 'Someone'),
        photo: (prof && prof.photo) || null
      });
    });

    const seat = (r, name) => {
      const prof = socket.profile;
      const p = {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        connected: true,
        lives: LIVES,
        _uid: (prof && prof.uid) || null
      };
      r.players.set(socket.id, p);
      if (!r.hostId) r.hostId = socket.id;
      room = r; me = p;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id });
      broadcast(r);
    };

    socket.on('create', async (data, ack) => {
      await socket.ready;
      if (room) return;
      // Guests welcome (owner ask 3 Aug 2026 — 'let people play games
      // without login as guest'). Logged-in players still get uid-dedup
      // across tabs; guests get a fresh seat under whatever they typed.
      const code = newCode();
      const r = newRoom(); r.code = code;
      const prof = socket.profile;
      r.creatorUid  = (prof && prof.uid)   || null;
      r.creatorName = (prof && prof.name)  || (data && data.name) || null;
      r.creatorPhoto= (prof && prof.photo) || null;
      r.creatorSince= Date.now();
      rooms.set(code, r);
      seat(r, data && data.name);
      if (typeof ack === 'function') ack({ code });
    });

    // Explicit close by the creator — from the "My open games" strip.
    socket.on('closeMyRoom', (data) => {
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code); if (!r) return;
      const uid = socket.profile && socket.profile.uid;
      if (!uid || uid !== r.creatorUid) return;
      dropRoom(code);
      try { nsp.to(code).emit('roomClosed', { code }); } catch (e) {}
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) {
        fail('No game with that code. It may have finished.');
        if (typeof ack === 'function') ack({ error: 'gone' });
        return;
      }
      // Same account already seated (a second tab, a refresh, or a fresh page
      // from the invite link): swap the seat onto this socket and boot the
      // old one — exactly the spy.js pattern.
      const prof = socket.profile;
      if (prof && prof.uid) {
        for (const [oldId, p] of r.players) {
          if (p._uid === prof.uid) {
            const oldSock = nsp.sockets.get(oldId);
            if (oldSock) { oldSock.emit('replaced'); oldSock.leave(r.code); }
            r.players.delete(oldId);
            if (r.hostId === oldId) r.hostId = socket.id;
            if (r.order.length) r.order = r.order.map(x => x === oldId ? socket.id : x);
            const seated = Object.assign({}, p, { id: socket.id, connected: true });
            r.players.set(socket.id, seated);
            room = r; me = seated;
            socket.join(r.code);
            socket.emit('seated', { code: r.code, you: socket.id, reconnected: true });
            broadcast(r);
            if (typeof ack === 'function') ack({ code, reconnected: true });
            return;
          }
        }
      }
      if (r.state !== 'lobby') {
        fail('That game has already started.');
        if (typeof ack === 'function') ack({ error: 'started' });
        return;
      }
      if (r.players.size >= MAX_PLAYERS) {
        fail('That room is full.');
        if (typeof ack === 'function') ack({ error: 'full' });
        return;
      }
      seat(r, data && data.name);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('start', () => {
      if (!room || !me) return;
      if (room.state !== 'lobby') return fail('Already going.');
      if (socket.id !== room.hostId) return fail('Only the host can start.');
      if (room.players.size < MIN_PLAYERS) return fail('Need at least ' + MIN_PLAYERS + ' players.');
      beginGame(room);
    });

    socket.on('word', (data) => {
      if (!room || !me) return;
      if (room.state !== 'playing') return;
      const turnId = room.order[room.turnIdx];
      if (turnId !== socket.id) return fail('Not your turn yet.');
      if (me.lives <= 0) return;
      const raw = clean(data && data.word);
      const n = norm(raw);
      if (n.length < 2) return fail('Type a real word (2+ letters).');
      // Must start with the required letter.
      if (n[0] !== room.nextLetter) {
        me.lives -= 1;
        nsp.to(room.code).emit('miss', { id: me.id, name: me.name, reason: 'wrong-letter', word: raw, needed: room.nextLetter });
        if (checkEndConditions(room)) { broadcast(room); return; }
        advanceTurn(room, me.id);
        broadcast(room);
        return;
      }
      // No repeats.
      if (room.used.has(n)) {
        me.lives -= 1;
        nsp.to(room.code).emit('miss', { id: me.id, name: me.name, reason: 'repeat', word: raw });
        if (checkEndConditions(room)) { broadcast(room); return; }
        advanceTurn(room, me.id);
        broadcast(room);
        return;
      }
      // Accepted — extend chain, hand off.
      room.used.add(n);
      room.chain.push({ playerId: me.id, name: me.name, word: raw, at: Date.now() });
      room.nextLetter = n[n.length - 1];
      // If the next required letter is impossible (Q/X/Z opener), reshuffle.
      // Not strictly needed since we let players fail on their own, but
      // 'now type a Q-word' back-to-back feels punitive on tiny chains.
      if (room.chain.length < 3 && (room.nextLetter === 'Q' || room.nextLetter === 'X' || room.nextLetter === 'Z')) {
        room.nextLetter = pickStartLetter();
      }
      advanceTurn(room, me.id);
      broadcast(room);
    });

    socket.on('rematch', () => {
      if (!room) return;
      if (room.state !== 'ended') return;
      for (const p of room.players.values()) {
        p.lives = LIVES;
      }
      room.state = 'lobby';
      room.round = 1;
      room.chain = [];
      room.used = new Set();
      room.nextLetter = '';
      room.winner = null;
      room.reveal = null;
      room.order = []; room.turnIdx = 0;
      if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
      broadcast(room);
    });

    socket.on('leave', () => {
      if (!room || !me) return;
      const r = room;
      const wasTurn = r.state === 'playing' && r.order[r.turnIdx] === socket.id;
      r.players.delete(socket.id);
      if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
      if (r.order.length) r.order = r.order.filter(x => x !== socket.id);
      socket.leave(r.code);
      room = null; me = null;
      if (!r.players.size) return dropRoom(r.code);
      if (r.state === 'playing') {
        if (checkEndConditions(r)) { broadcast(r); return; }
        if (wasTurn) advanceTurn(r, null);
      }
      broadcast(r);
    });

    socket.on('endRoom', () => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return fail('Only the host can end the game.');
      const r = room;
      try { nsp.to(r.code).emit('roomClosed', { by: me.name }); } catch (e) {}
      for (const [pid] of r.players) {
        const s = nsp.sockets.get(pid);
        if (s) s.leave(r.code);
      }
      dropRoom(r.code);
      room = null; me = null;
    });

    socket.on('kick', (data) => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return fail('Only the host can kick.');
      if (room.state !== 'lobby') return fail('Cannot kick mid-game.');
      const target = String((data && data.id) || '');
      if (target === socket.id) return;
      const gone = room.players.delete(target);
      if (gone) {
        for (const s of nsp.sockets.values()) {
          if (s.id === target) { s.emit('kicked'); s.leave(room.code); break; }
        }
        broadcast(room);
      }
    });

    socket.on('disconnect', () => {
      if (watch) {
        const r = watch; watch = null;
        if (r.watchers) { r.watchers.delete(socket.id); broadcast(r); }
      }
      if (!room || !me) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      broadcast(r);
      setTimeout(() => {
        const cur = r.players.get(socket.id);
        if (cur && !cur.connected) {
          if (r.state === 'lobby') {
            r.players.delete(socket.id);
            if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
            if (!r.players.size) return dropRoom(r.code);
          } else {
            // Mid-game: yank them out of the ring and forfeit their lives.
            // Otherwise a ghosted player would freeze the game every turn.
            const wasTurn = r.state === 'playing' && r.order[r.turnIdx] === socket.id;
            cur.lives = 0;
            r.order = r.order.filter(x => x !== socket.id);
            if (checkEndConditions(r)) { broadcast(r); return; }
            if (wasTurn) advanceTurn(r, null);
          }
          broadcast(r);
        }
      }, DROP_GRACE);
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const ttl = r.creatorUid ? OWNER_ROOM_TTL : ROOM_TTL;
      if (now - (r.touched || 0) > ttl) dropRoom(code);
    }
  }, 1000 * 60 * 10).unref?.();

  function chainLive() {
    const out = [];
    for (const r of rooms.values()) {
      const ps = [...r.players.values()];
      if (!ps.length) continue;
      const alive = ps.some(p => p.connected) || ((r.touched || 0) > Date.now() - 120000);
      if (!alive) continue;
      const cur = r.state === 'playing' ? (r.players.get(r.order[r.turnIdx]) || { name: null }) : { name: null };
      out.push({
        game: 'wordchain', icon: '🔗', title: 'Word Chain',
        code: r.code,
        href: '/wordchain?room=' + r.code, watchHref: '/wordchain?watch=' + r.code,
        state: r.state, cap: MAX_PLAYERS,
        players: ps.map(p => ({ name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected })),
        seatsFree: r.state === 'lobby' ? Math.max(0, MAX_PLAYERS - ps.length) : 0,
        lead: r.state === 'lobby' ? (ps.length + ' waiting')
          : r.state === 'ended' ? (r.reveal && r.reveal.winnerName ? r.reveal.winnerName + ' won' : 'Game over')
          : ('Round ' + r.round + ' — chain of ' + r.chain.length),
        turnName: r.state === 'playing' ? cur.name : null,
        watchers: r.watchers ? r.watchers.size : 0,
        since: r.touched || Date.now()
      });
    }
    return out;
  }

  console.log('wordchain module: mounted');
  return { rooms, live: chainLive };
}

module.exports = { mount };
