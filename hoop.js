// 🏀 Hoop — arcade free-throw. Solo score-attack OR multiplayer (2+).
//
// Multiplayer model (owner ask 10 Aug 2026): everyone plays the SAME
// 60-second round simultaneously in their own iframe of the game.
// Server keeps the roster + broadcasts every score update so a small
// live leaderboard is visible while they play. When the timer hits
// zero the server broadcasts final results. Nothing about the physics
// changes — it's the current single-player game with a socket wrapper.
//
// Own module, own socket namespace, own room table.

const path = require('path');

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_PLAYERS = 1;                        // hoop is fine with 1 (solo in a room)
const MAX_PLAYERS = 8;
const MAX_NAME    = 18;
const ROUND_MS    = 60000;
const ROOM_TTL       = 1000 * 60 * 90;
const OWNER_ROOM_TTL = 1000 * 60 * 60 * 24 * 7;

function newCode() {
  for (let i = 0; i < 200; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'R' + Date.now().toString(36).slice(-3).toUpperCase();
}

const safeName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Player';

function newRoom(code) {
  return {
    code,
    state: 'lobby',                           // lobby | playing | ended
    players: new Map(),                       // socketId → { id, name, score, uid }
    seatOrder: [],                            // stable display order
    hostId: null,
    hostUid: null,
    roundEnd: 0,
    endTimer: null,
    touched: Date.now(),
  };
}

function roster(room) {
  return room.seatOrder
    .map(sid => room.players.get(sid))
    .filter(Boolean)
    .map(p => ({ id: p.id, name: p.name, score: p.score }));
}

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms.entries()) {
    const ttl = r.hostUid ? OWNER_ROOM_TTL : ROOM_TTL;
    if (now - r.touched > ttl) {
      if (r.endTimer) clearTimeout(r.endTimer);
      rooms.delete(code);
    }
  }
}
setInterval(sweep, 60_000).unref?.();

function mount(app, io, opts) {
  const options = opts || {};
  const identify = typeof options.identify === 'function' ? options.identify : null;
  const uidFromReq = typeof options.uidFromReq === 'function' ? options.uidFromReq : null;
  const activeGame = options.activeGame || null;
  if (activeGame && activeGame.registerVerifier) {
    activeGame.registerVerifier('hoop', code => rooms.has(code));
  }

  async function markActive(req, code) {
    if (!activeGame || !uidFromReq) return;
    const uid = await uidFromReq(req);
    if (uid) await activeGame.set(uid, { game: 'hoop', code, url: '/hoop?room=' + code });
  }
  async function guardActive(req, res) {
    if (!activeGame || !uidFromReq) return true;
    const uid = await uidFromReq(req);
    if (!uid) return true;
    const active = await activeGame.getVerified(uid);
    if (!active) return true;
    res.status(409).json({ error: 'active-game', activeGame: active });
    return false;
  }

  // Serve the game page.
  app.get('/hoop', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'hoop.html'));
  });

  // POST /api/hoop/new — mint a room + return the code.
  app.post('/api/hoop/new', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await guardActive(req, res))) return;
    const code = newCode();
    const room = newRoom(code);
    // Remember the owner so their room lives longer between sessions.
    if (uidFromReq) {
      const uid = await uidFromReq(req).catch(() => null);
      if (uid) room.hostUid = uid;
    }
    rooms.set(code, room);
    await markActive(req, code);
    res.json({ code });
  });

  // GET /api/hoop/:code — does this room still exist?
  app.get('/api/hoop/:code', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = String(req.params.code || '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) return res.json({ exists: false });
    res.json({ exists: true, state: r.state, players: roster(r) });
  });

  const nsp = io.of('/hoop');
  nsp.on('connection', socket => {
    let currentCode = null;

    // Client → join { code, name }
    socket.on('join', async payload => {
      const code = String((payload && payload.code) || '').trim().toUpperCase();
      const name = safeName(payload && payload.name);
      if (!code || !rooms.has(code)) {
        socket.emit('error', { error: 'Room not found.' });
        return;
      }
      const room = rooms.get(code);
      if (room.state === 'playing') {
        socket.emit('error', { error: 'Round in progress — wait for the next one.' });
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        socket.emit('error', { error: 'Room is full.' });
        return;
      }
      // Optional server-side identity (from Speaky-style social cookies).
      let uid = null, displayName = name;
      if (identify) {
        try {
          const who = await identify(socket.request);
          if (who && who.id) {
            uid = who.id;
            if (who.name) displayName = safeName(who.name);
          }
        } catch (e) {}
      }
      currentCode = code;
      socket.join(code);
      const player = { id: socket.id, name: displayName, score: 0, uid };
      room.players.set(socket.id, player);
      if (!room.seatOrder.includes(socket.id)) room.seatOrder.push(socket.id);
      if (!room.hostId) room.hostId = socket.id;
      room.touched = Date.now();
      socket.emit('joined', { code, you: socket.id, hostId: room.hostId, state: room.state, roundEndsAt: room.roundEnd, players: roster(room) });
      nsp.to(code).emit('roster', { hostId: room.hostId, players: roster(room), state: room.state });
    });

    // Client → start (host only) — kicks the 60s round.
    socket.on('start', () => {
      if (!currentCode) return;
      const room = rooms.get(currentCode);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.state === 'playing') return;
      // Reset scores + start.
      for (const p of room.players.values()) p.score = 0;
      room.state = 'playing';
      room.roundEnd = Date.now() + ROUND_MS;
      room.touched = Date.now();
      nsp.to(currentCode).emit('start', { roundEndsAt: room.roundEnd, players: roster(room) });
      if (room.endTimer) clearTimeout(room.endTimer);
      room.endTimer = setTimeout(() => finishRound(currentCode), ROUND_MS + 500);
    });

    // Client → score { n } — their current total (server clamps to sane bounds).
    socket.on('score', payload => {
      if (!currentCode) return;
      const room = rooms.get(currentCode);
      if (!room || room.state !== 'playing') return;
      const p = room.players.get(socket.id);
      if (!p) return;
      const n = Math.max(0, Math.min(999, Number((payload && payload.n) || 0) | 0));
      p.score = n;
      room.touched = Date.now();
      nsp.to(currentCode).emit('leaderboard', { players: roster(room) });
    });

    // Client → rematch (host only) — reset back to lobby.
    socket.on('rematch', () => {
      if (!currentCode) return;
      const room = rooms.get(currentCode);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      room.state = 'lobby';
      room.roundEnd = 0;
      for (const p of room.players.values()) p.score = 0;
      room.touched = Date.now();
      nsp.to(currentCode).emit('roster', { hostId: room.hostId, players: roster(room), state: room.state });
    });

    socket.on('disconnect', () => {
      if (!currentCode) return;
      const room = rooms.get(currentCode);
      if (!room) return;
      room.players.delete(socket.id);
      room.seatOrder = room.seatOrder.filter(id => id !== socket.id);
      // Promote a new host if the old one left.
      if (socket.id === room.hostId) {
        room.hostId = room.seatOrder[0] || null;
      }
      if (!room.players.size) {
        // Only drop the room immediately if there was no signed-in owner
        // holding a longer TTL.
        if (!room.hostUid) {
          if (room.endTimer) clearTimeout(room.endTimer);
          rooms.delete(currentCode);
          return;
        }
      }
      room.touched = Date.now();
      nsp.to(currentCode).emit('roster', { hostId: room.hostId, players: roster(room), state: room.state });
    });
  });

  function finishRound(code) {
    const room = rooms.get(code);
    if (!room) return;
    if (room.state !== 'playing') return;
    room.state = 'ended';
    room.endTimer = null;
    room.touched = Date.now();
    // Rank final scores for a clean UI.
    const results = roster(room).sort((a, b) => b.score - a.score);
    nsp.to(code).emit('end', { players: results });
  }

  console.log('hoop module: mounted');
  return { rooms };
}

module.exports = { mount };
