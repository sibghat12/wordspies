// Word Race — the language-learning speed game.
//
// You get 60 seconds. A category shows up. Type as many words as you can
// that fit the category — pressing Enter after each. Most words at the
// buzzer wins the round. First to two rounds wins the match.
//
// Categories are language-agnostic prompts (Animals, Foods, Countries …).
// Players type in whatever language they're learning — the server just
// counts *valid, non-duplicate* words per player. It doesn't try to be
// a dictionary; that's what a future dataset-backed judge phase is for.
//
// Own module, own socket namespace, own room table — matches wordchain.js
// so a bug in here can never take the rest of the site down.

const path = require('path');
const crypto = require('crypto');

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_NAME    = 18;
const MAX_WORD    = 24;
const ROUND_MS    = 60000;
const WIN_ROUNDS  = 2;           // first to 2 round-wins takes the match
const MAX_ROUNDS  = 3;           // hard cap so a tie can't run forever
const ROOM_TTL          = 1000 * 60 * 90;
const OWNER_ROOM_TTL    = 1000 * 60 * 60 * 24 * 7;   // creator rooms held 7d
const DROP_GRACE        = 120000;

// Prompt pool. Kept intentionally category-only (no per-language wordlist)
// so the game works in every language the user might be learning —
// they type in whatever language they want.
const CATEGORIES = [
  'Animals', 'Foods', 'Countries', 'Cities', 'Fruits', 'Vegetables',
  'Sports', 'Musical instruments', 'Vehicles', 'Clothing',
  'Body parts', 'Colours', 'Jobs / professions',
  'Verbs of movement', 'Feelings / emotions', 'Weather words',
  'Things in a kitchen', 'Things in a classroom', 'Things in a garden',
  'Words that start with S', 'Words that start with M',
  'Words that start with B', 'Words that start with T',
  'Adjectives that describe people'
];

function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'R' + Date.now().toString(36).slice(-3).toUpperCase();
}

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_WORD);
const safeName = s => clean(s).slice(0, MAX_NAME) || 'Player';

// Normalise for dedupe: lowercase + strip non-letter chars (unicode aware
// so 'niño' and 'NIÑO' collapse, but the original casing is what we show
// back to players).
const norm = s => String(s == null ? '' : s).toLocaleLowerCase().replace(/[^\p{Letter}]/gu, '');

function pickCategory(room) {
  // Avoid repeating the same category twice in a match.
  const seen = new Set(room.rounds.map(r => r.category));
  const pool = CATEGORIES.filter(c => !seen.has(c));
  const src = pool.length ? pool : CATEGORIES;
  return src[Math.floor(Math.random() * src.length)];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newRoom() {
  return {
    code: '', state: 'lobby',
    players: new Map(),         // socketId -> { id, name, photo, connected, score, _uid }
    order: [],                  // stable turn/reveal order — set at match start
    rounds: [],                 // [{ category, endsAt, words: Map<pid, string[]> }]
    curRoundIdx: -1,
    roundTimer: null,
    winner: null,               // socketId once someone hits WIN_ROUNDS
    reveal: null,               // final-screen payload
    hostId: null,
    watchers: null,             // Map<socketId, { uid, name, photo } | null>
    touched: Date.now(),
    lastKnock: 0,
    creatorUid: null,
    creatorName: null,
    creatorPhoto: null,
    creatorSince: 0
  };
}

// Compute per-player score = sum of words submitted across finished rounds.
function tallyScores(room) {
  const scores = new Map();
  for (const [pid] of room.players) scores.set(pid, 0);
  for (const r of room.rounds) {
    if (r.state !== 'done') continue;
    for (const [pid, list] of r.words) {
      scores.set(pid, (scores.get(pid) || 0) + list.length);
    }
  }
  return scores;
}
// Per-player round-wins — a "round win" is having the top count in that
// round; ties give a round-win to everyone tied for the top.
function tallyRoundWins(room) {
  const wins = new Map();
  for (const [pid] of room.players) wins.set(pid, 0);
  for (const r of room.rounds) {
    if (r.state !== 'done') continue;
    let top = 0;
    for (const list of r.words.values()) if (list.length > top) top = list.length;
    if (top === 0) continue;
    for (const [pid, list] of r.words) {
      if (list.length === top) wins.set(pid, (wins.get(pid) || 0) + 1);
    }
  }
  return wins;
}

// Public snapshot. During a live round, we hide OTHER players' words (we
// only tell you the count) so nobody can copy off their neighbour. Your
// own words come back to you always. After the round ends everyone sees
// everyone's list — that's the fun part.
function publicState(room, viewerId) {
  const scores    = tallyScores(room);
  const roundWins = tallyRoundWins(room);
  const cur = room.curRoundIdx >= 0 ? room.rounds[room.curRoundIdx] : null;
  const curRoundView = cur ? {
    idx: room.curRoundIdx,
    category: cur.category,
    endsAt: cur.endsAt,
    state: cur.state,
    counts: [...cur.words.entries()].map(([pid, list]) => ({ pid, count: list.length })),
    myWords: viewerId && cur.words.has(viewerId) ? cur.words.get(viewerId) : []
  } : null;
  return {
    code: room.code,
    state: room.state,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    roundMs: ROUND_MS,
    winRounds: WIN_ROUNDS,
    maxRounds: MAX_ROUNDS,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, photo: p.photo || null,
      connected: p.connected,
      score: scores.get(p.id) || 0,
      roundWins: roundWins.get(p.id) || 0
    })),
    order: room.order,
    hostId: room.hostId,
    curRound: curRoundView,
    rounds: room.rounds.map(r => ({
      category: r.category,
      state: r.state,
      // Once the round is done, publish everyone's word list for the
      // recap card. Live rounds only publish counts (via curRound above).
      reveal: r.state === 'done'
        ? [...r.words.entries()].map(([pid, list]) => ({ pid, words: list }))
        : null
    })),
    winner: room.winner,
    reveal: room.reveal,
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
  if (_activeGame && _activeGame.registerVerifier) {
    _activeGame.registerVerifier('wordrace', code => rooms.has(code));
  }
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

  app.get('/wordrace', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'wordrace.html'));
  });

  // Chat-picker bootstrap: hand back a code before anyone's opened the tab.
  app.post('/api/wordrace/new', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await _guardActive(req, res))) return;
    const code = newCode();
    const r = newRoom(); r.code = code;
    rooms.set(code, r);
    await _markActive(req, 'wordrace', code, '/wordrace?room=' + code);
    res.json({ code });
  });

  app.get('/api/wordrace/:code', (req, res) => {
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

  const nsp = io.of('/wordrace');

  function dropRoom(code) {
    const r = rooms.get(code);
    if (r && r.roundTimer) { clearTimeout(r.roundTimer); r.roundTimer = null; }
    rooms.delete(code);
  }

  function broadcast(room) {
    room.touched = Date.now();
    // Each player gets their private view (their own words visible).
    for (const [sid] of room.players) nsp.to(sid).emit('state', publicState(room, sid));
    if (room.watchers) {
      for (const [sid] of room.watchers) nsp.to(sid).emit('state', publicState(room, null));
    }
  }

  function startRound(room) {
    const r = { category: pickCategory(room), endsAt: Date.now() + ROUND_MS, state: 'live', words: new Map() };
    for (const [pid] of room.players) r.words.set(pid, []);
    room.rounds.push(r);
    room.curRoundIdx = room.rounds.length - 1;
    if (room.roundTimer) clearTimeout(room.roundTimer);
    room.roundTimer = setTimeout(() => endRound(room, room.curRoundIdx), ROUND_MS + 250);
    room.state = 'playing';
    broadcast(room);
  }

  function endRound(room, idx) {
    const r = room.rounds[idx];
    if (!r || r.state !== 'live') return;
    r.state = 'done';
    if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
    // Match-over check: has anyone hit WIN_ROUNDS? Or have we played MAX_ROUNDS?
    const wins = tallyRoundWins(room);
    let leader = null, top = 0;
    for (const [pid, n] of wins) { if (n > top) { top = n; leader = pid; } }
    const played = room.rounds.filter(x => x.state === 'done').length;
    if (top >= WIN_ROUNDS || played >= MAX_ROUNDS) {
      room.state = 'ended';
      // If multiple players share the top round-win count, resolve on total
      // word count — that's the more natural tiebreak than a coin flip.
      const scores = tallyScores(room);
      let winnerId = null, winnerScore = -1;
      for (const [pid, w] of wins) {
        if (w !== top) continue;
        const s = scores.get(pid) || 0;
        if (s > winnerScore) { winnerScore = s; winnerId = pid; }
      }
      const winner = winnerId ? room.players.get(winnerId) : null;
      room.winner = winnerId;
      room.reveal = {
        winnerName: winner ? winner.name : null,
        winnerPhoto: winner ? (winner.photo || null) : null,
        totals: [...room.players.values()].map(p => ({
          id: p.id, name: p.name, photo: p.photo || null,
          score: scores.get(p.id) || 0, roundWins: wins.get(p.id) || 0
        })).sort((a, b) => b.roundWins - a.roundWins || b.score - a.score)
      };
      broadcast(room);
      return;
    }
    // Between-round pause of 6s so people can read the reveal, then next.
    broadcast(room);
    setTimeout(() => {
      if (room.state !== 'playing') return;
      startRound(room);
    }, 6000);
  }

  function beginMatch(room) {
    if (room.players.size < MIN_PLAYERS) return;
    room.order  = shuffle([...room.players.keys()]);
    room.rounds = [];
    room.curRoundIdx = -1;
    room.winner = null;
    room.reveal = null;
    startRound(room);
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
      socket.emit('state', publicState(r, null));
      broadcast(r);
    });

    const seat = (r, name) => {
      const prof = socket.profile;
      const p = {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        connected: true,
        _uid: (prof && prof.uid) || null,
        // Per-player session token — the client saves this in
        // localStorage as 'wr_sess' so a browser refresh can rejoin
        // the same seat instead of stacking a second one. Owner ask
        // 7 Aug 2026: 'refresh and it should stay 1, not become 2'.
        token: crypto.randomUUID()
      };
      r.players.set(socket.id, p);
      if (!r.hostId) r.hostId = socket.id;
      room = r; me = p;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id });
      socket.emit('session', { code: r.code, token: p.token, name: p.name });
      broadcast(r);
    };

    socket.on('create', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = newCode();
      const r = newRoom(); r.code = code;
      const prof = socket.profile;
      r.creatorUid   = (prof && prof.uid)   || null;
      r.creatorName  = (prof && prof.name)  || (data && data.name) || null;
      r.creatorPhoto = (prof && prof.photo) || null;
      r.creatorSince = Date.now();
      rooms.set(code, r);
      seat(r, data && data.name);
      if (typeof ack === 'function') ack({ code });
    });

    // Token-based rejoin. The client stores { code, token } in
    // localStorage from the 'session' event above. On refresh it
    // fires this event; we find the matching seat by token and swap
    // sockets in place — no duplicate seat, no name re-prompt, no
    // need to have been signed in. Same UX the main WordSpies game
    // has had since day one; retrofitted here 7 Aug 2026.
    socket.on('rejoin', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const token = String((data && data.token) || '');
      const r = rooms.get(code);
      if (!r) {
        fail('That game is no longer running.');
        if (typeof ack === 'function') ack({ error: 'gone' });
        return;
      }
      const entry = [...r.players.entries()].find(([, p]) => p.token && p.token === token);
      if (!entry) {
        // Token expired / player was removed while offline. Fall
        // back to a fresh join if the client wants — but we don't
        // implicitly seat them here, that's the client's call.
        if (typeof ack === 'function') ack({ error: 'expired' });
        return;
      }
      const [oldId, p] = entry;
      // Boot the ghost socket if it's still hanging around.
      const oldSock = nsp.sockets.get(oldId);
      if (oldSock) { try { oldSock.emit('replaced'); oldSock.leave(r.code); } catch (e) {} }
      r.players.delete(oldId);
      if (r.hostId === oldId) r.hostId = socket.id;
      if (r.order.length) r.order = r.order.map(x => x === oldId ? socket.id : x);
      // Move per-round words map onto the new socket id so counts
      // don't stale-out on a mid-round refresh.
      for (const rd of r.rounds) {
        if (rd.words.has(oldId)) { rd.words.set(socket.id, rd.words.get(oldId)); rd.words.delete(oldId); }
      }
      p.id = socket.id; p.connected = true;
      r.players.set(socket.id, p);
      room = r; me = p;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id, reconnected: true });
      socket.emit('session', { code: r.code, token: p.token, name: p.name });
      broadcast(r);
      if (typeof ack === 'function') ack({ code, reconnected: true });
    });

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
      // Same account already seated (reconnect / second tab): swap seat.
      const prof = socket.profile;
      if (prof && prof.uid) {
        for (const [oldId, p] of r.players) {
          if (p._uid === prof.uid) {
            const oldSock = nsp.sockets.get(oldId);
            if (oldSock) { oldSock.emit('replaced'); oldSock.leave(r.code); }
            r.players.delete(oldId);
            if (r.hostId === oldId) r.hostId = socket.id;
            if (r.order.length) r.order = r.order.map(x => x === oldId ? socket.id : x);
            // Re-key every live round's words map onto the new socket id.
            for (const rd of r.rounds) {
              if (rd.words.has(oldId)) { rd.words.set(socket.id, rd.words.get(oldId)); rd.words.delete(oldId); }
            }
            const seated = Object.assign({}, p, { id: socket.id, connected: true });
            r.players.set(socket.id, seated);
            room = r; me = seated;
            socket.join(r.code);
            socket.emit('seated', { code: r.code, you: socket.id, reconnected: true });
            socket.emit('session', { code: r.code, token: seated.token, name: seated.name });
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
        fail('Room is full.');
        if (typeof ack === 'function') ack({ error: 'full' });
        return;
      }
      seat(r, data && data.name);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('start', () => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return;
      if (room.state !== 'lobby') return;
      if (room.players.size < MIN_PLAYERS) return fail(`Need at least ${MIN_PLAYERS} players.`);
      beginMatch(room);
    });

    socket.on('word', (data) => {
      if (!room || !me) return;
      if (room.state !== 'playing') return;
      const cur = room.rounds[room.curRoundIdx];
      if (!cur || cur.state !== 'live') return;
      if (Date.now() >= cur.endsAt) return;   // buzzer already went
      const raw = clean(data && data.word);
      if (raw.length < 2) return;
      const n = norm(raw);
      if (n.length < 2) return;
      const mine = cur.words.get(socket.id) || [];
      // Per-player dedupe on the normalised form; keep the pretty original.
      const seen = new Set(mine.map(w => norm(w)));
      if (seen.has(n)) return;
      mine.push(raw);
      cur.words.set(socket.id, mine);
      // Send a targeted 'accepted' back so the client can clear the input
      // and add the pill immediately (optimistic UI is bad here — we don't
      // want to show a word that server just rejected).
      socket.emit('accepted', { word: raw, count: mine.length });
      broadcast(room);
    });

    socket.on('again', () => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return;
      if (room.state !== 'ended') return;
      // Reset stats but keep the seated players so the host doesn't have to
      // re-invite. Mirrors wordchain.js's rematch flow.
      for (const p of room.players.values()) p.connected = true;
      room.state = 'lobby';
      room.rounds = [];
      room.curRoundIdx = -1;
      room.winner = null;
      room.reveal = null;
      if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
      broadcast(room);
    });

    socket.on('disconnect', () => {
      if (watch) {
        const r = watch;
        if (r.watchers) r.watchers.delete(socket.id);
        if (r.watchers && !r.watchers.size) r.watchers = null;
        try { broadcast(r); } catch (e) {}
        return;
      }
      if (!room || !me) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      // Grace period — if they don't come back, drop them from the seat
      // list so the lobby count is honest.
      setTimeout(() => {
        const still = r.players.get(socket.id);
        if (!still || still.connected) return;
        r.players.delete(socket.id);
        if (r.hostId === socket.id) {
          // Promote the earliest remaining player, or kill the room.
          const next = [...r.players.keys()][0] || null;
          r.hostId = next;
        }
        // If the room is now empty and no owner-uid held it, sweep it.
        if (!r.players.size) {
          const ttl = r.creatorUid ? OWNER_ROOM_TTL : ROOM_TTL;
          if (Date.now() - r.touched > ttl) dropRoom(r.code);
          else setTimeout(() => { if (!r.players.size) dropRoom(r.code); }, ttl);
        }
        try { broadcast(r); } catch (e) {}
      }, DROP_GRACE);
    });
  });

  // Live-games aggregator hook — matches the shape used by every other
  // module so /api/live can surface a running Word Race the same way.
  // `players` is a full array (not a count) so /api/live's downstream
  // `g.players.filter(p => !p.bot)` doesn't fall over.
  function live() {
    const out = [];
    for (const r of rooms.values()) {
      if (r.state === 'ended') continue;
      const seated = [...r.players.values()];
      if (!seated.length) continue;
      const anyConnected = seated.some(p => p.connected);
      if (!anyConnected && Date.now() - r.touched > 120000) continue;
      out.push({
        game: 'wordrace', icon: '🏁', title: 'Word Race',
        code: r.code, href: '/wordrace?room=' + r.code, watchHref: '/wordrace?watch=' + r.code,
        state: r.state, cap: MAX_PLAYERS,
        players: seated.map(p => ({
          name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected
        })),
        seatsFree: Math.max(0, MAX_PLAYERS - seated.length),
        lead: r.state === 'ended'
          ? (r.reveal && r.reveal.winnerName ? r.reveal.winnerName + ' won' : 'Ended')
          : (r.state === 'playing'
              ? (r.rounds[r.curRoundIdx] ? 'Round ' + (r.curRoundIdx + 1) + ' · ' + r.rounds[r.curRoundIdx].category : 'Playing')
              : 'Waiting for players'),
        watchers: r.watchers ? r.watchers.size : 0,
        since: r.creatorSince || r.touched
      });
    }
    return out;
  }

  console.log('wordrace module: mounted');
  return { rooms, live, _norm: norm, _pickCategory: pickCategory };
}

module.exports = { mount, CATEGORIES, _norm: norm };
