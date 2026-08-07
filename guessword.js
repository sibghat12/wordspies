// Guess the Word — the describer-and-guessers vocabulary game.
//
// Each round one player is the describer. They get a secret word and type
// clues in the chat — the other players race to guess. First correct guess
// scores 2 points for the guesser and 1 for the describer. Rounds rotate
// the describer role. After every player has described twice (or the round
// cap is hit) the top score wins.
//
// Own module, own socket namespace, own room table — matches wordchain.js /
// spy.js. A crash here can never take the rest of the site down.

const path = require('path');
const crypto = require('crypto');

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const MAX_NAME = 18;
const MAX_HINT = 60;
const MAX_GUESS = 40;
const ROUND_MS = 90000;                       // 90s per round
const ROOM_TTL = 1000 * 60 * 90;
const OWNER_ROOM_TTL = 1000 * 60 * 60 * 24 * 7;
const DROP_GRACE = 120000;
const ROUND_CAP = 12;                         // hard cap so games don't drag

// Word bank — everyday concrete nouns learners can describe in English.
// Kept concrete on purpose: abstract nouns ("justice", "hope") are painful
// for guessers when the describer is themselves a learner.
const WORDS = [
  'apple','banana','orange','strawberry','watermelon','grape','pineapple','lemon',
  'bread','cheese','pizza','burger','pasta','rice','soup','salad','chocolate','cake',
  'coffee','tea','milk','juice','water','beer','wine',
  'dog','cat','horse','rabbit','elephant','lion','tiger','monkey','panda','bear',
  'chicken','duck','fish','shark','dolphin','snake','frog','spider','butterfly','bee',
  'car','bus','train','plane','boat','bicycle','motorcycle','helicopter','truck','scooter',
  'phone','laptop','camera','headphones','television','watch','book','magazine','newspaper','notebook',
  'pen','pencil','scissors','glue','ruler','keyboard','mouse','umbrella','wallet','key',
  'chair','table','sofa','bed','pillow','blanket','fridge','oven','microwave','sink',
  'shirt','trousers','dress','shoes','hat','scarf','jacket','socks','gloves','belt',
  'sun','moon','star','cloud','rain','snow','wind','rainbow','mountain','river',
  'beach','forest','desert','island','lake','waterfall','volcano','cave','field','garden',
  'house','apartment','hotel','school','hospital','library','museum','park','stadium','airport',
  'doctor','teacher','chef','farmer','police','firefighter','singer','dancer','painter','writer',
  'guitar','piano','drums','violin','trumpet','microphone','football','basketball','tennis','chess',
  'birthday','wedding','holiday','christmas','halloween','party','picnic','concert','movie','game',
  'love','friendship','happiness','dream','memory','secret','surprise','gift','hug','smile'
];

function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'G' + Date.now().toString(36).slice(-3).toUpperCase();
}

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const safeName = s => {
  const n = clean(s).slice(0, MAX_NAME);
  return n || 'Player';
};
const norm = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z]/g, '');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickWord(used) {
  // Try to avoid recent repeats. If we've used them all (long game), fall through.
  for (let tries = 0; tries < 40; tries++) {
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    if (!used.has(w)) return w;
  }
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function newRoom() {
  return {
    code: '', state: 'lobby',
    players: new Map(),         // socketId -> { id, name, photo, connected, score, described, _uid }
    order: [],                  // socketId rotation of who describes next
    turnIdx: 0,
    round: 0,                   // 0 in lobby, 1..N during play
    roundCap: ROUND_CAP,
    describerId: null,
    word: '',                   // active word (only sent to the describer)
    wordUsed: new Set(),
    hints: [],                  // [{ text, at }] hints given this round
    guesses: [],                // [{ playerId, name, guess, correct, at }] this round
    deadline: 0,
    timer: null,
    winnerId: null,             // set at ended: top score
    reveal: null,               // { winnerName, tally: [{name, score}], lastWord }
    hostId: null,
    watchers: null,
    touched: Date.now(),
    lastKnock: 0
  };
}

function playerList(room) {
  return [...room.players.values()];
}

// Only the describer gets the word. Everyone else sees state.word === null.
function publicState(room, socketId) {
  const me = room.players.get(socketId);
  const iAmDescriber = !!(me && room.describerId === me.id);
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    roundCap: room.roundCap,
    players: playerList(room).map(p => ({
      id: p.id, name: p.name, photo: p.photo || null,
      connected: p.connected, score: p.score || 0, described: p.described || 0
    })),
    describerId: room.describerId,
    iAmDescriber,
    myWord: iAmDescriber ? room.word : null,
    hints: room.hints.slice(-20),
    guesses: room.guesses.slice(-30),
    deadline: room.state === 'describe' ? room.deadline : 0,
    roundMs: ROUND_MS,
    winnerId: room.winnerId,
    reveal: room.reveal,
    hostId: room.hostId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
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
  if (_activeGame && _activeGame.registerVerifier) _activeGame.registerVerifier('guessword', code => rooms.has(code));
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

  app.get('/guessword', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'guessword.html'));
  });

  app.post('/api/guessword/new', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await _guardActive(req, res))) return;
    const code = newCode();
    const r = newRoom();
    r.code = code;
    rooms.set(code, r);
    await _markActive(req, 'guessword', code, '/guessword?room=' + code);
    res.json({ code });
  });

  app.get('/api/guessword/:code', (req, res) => {
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

  const nsp = io.of('/guessword');

  function dropRoom(code) {
    const r = rooms.get(code);
    if (r && r.timer) { clearTimeout(r.timer); r.timer = null; }
    rooms.delete(code);
  }

  function broadcast(room) {
    room.touched = Date.now();
    // Per-socket: the describer receives the secret word, everyone else doesn't.
    for (const [sid] of room.players) {
      nsp.to(sid).emit('state', publicState(room, sid));
    }
    if (room.watchers) {
      for (const wsid of room.watchers.keys()) {
        nsp.to(wsid).emit('state', publicState(room, wsid));
      }
    }
  }

  function armRoundTimer(room) {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    if (room.state !== 'describe') return;
    room.deadline = Date.now() + ROUND_MS;
    room.timer = setTimeout(() => onRoundExpire(room), ROUND_MS + 250);
    if (room.timer && room.timer.unref) room.timer.unref();
  }

  function onRoundExpire(room) {
    if (room.state !== 'describe') return;
    if (Date.now() < room.deadline) return;
    // Nobody guessed in time. No points. Reveal the word, then next round.
    finishRound(room, { timedOut: true, winnerId: null });
  }

  function finishRound(room, outcome) {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    const wordThisRound = room.word;
    // Log the reveal into the guesses feed so everyone sees it in the chat.
    room.guesses.push({
      playerId: null, name: null, system: true,
      text: outcome.timedOut
        ? ('⏱ Time — the word was "' + wordThisRound + '"')
        : ('✅ ' + (outcome.winnerName || 'Someone') + ' guessed it — "' + wordThisRound + '"'),
      at: Date.now()
    });
    // Advance describer for next round. If everyone has described their cap
    // or we're at the round cap, end the game.
    const describerP = room.players.get(room.describerId);
    if (describerP) describerP.described = (describerP.described || 0) + 1;

    if (room.round >= room.roundCap) return endGame(room);
    // Continue if there are still ≥ 2 connected players (need at least
    // describer + one guesser).
    const active = playerList(room).filter(p => p.connected);
    if (active.length < 2) return endGame(room);

    // Rotate to the next describer — advance turnIdx to the next player who
    // hasn't described in this cycle if possible.
    const n = room.order.length;
    for (let step = 1; step <= n; step++) {
      const idx = (room.turnIdx + step) % n;
      const p = room.players.get(room.order[idx]);
      if (p && p.connected) { room.turnIdx = idx; break; }
    }
    startRound(room);
  }

  function endGame(room) {
    room.state = 'ended';
    room.describerId = null;
    room.word = '';
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    const scored = playerList(room)
      .map(p => ({ id: p.id, name: p.name, photo: p.photo || null, score: p.score || 0 }))
      .sort((a, b) => b.score - a.score);
    room.winnerId = scored.length ? scored[0].id : null;
    room.reveal = {
      winnerName: scored.length && scored[0].score > 0 ? scored[0].name : null,
      tally: scored,
      rounds: room.round
    };
    broadcast(room);
  }

  function startRound(room) {
    room.round += 1;
    room.hints = [];
    room.guesses = [];
    room.state = 'describe';
    room.describerId = room.order[room.turnIdx] || null;
    room.word = pickWord(room.wordUsed);
    room.wordUsed.add(room.word);
    armRoundTimer(room);
    broadcast(room);
  }

  function beginGame(room) {
    const ids = shuffle([...room.players.keys()]);
    if (ids.length < MIN_PLAYERS) return;
    for (const id of ids) {
      const p = room.players.get(id);
      p.score = 0;
      p.described = 0;
    }
    room.order = ids;
    room.turnIdx = 0;
    room.round = 0;
    room.wordUsed = new Set();
    room.winnerId = null;
    room.reveal = null;
    // Length of the game: 2 rounds per player, capped at ROUND_CAP.
    room.roundCap = Math.min(ROUND_CAP, ids.length * 2);
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
      socket.emit('state', publicState(r, socket.id));
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
        score: 0,
        described: 0,
        _uid: (prof && prof.uid) || null,
        // Per-player session token — client stashes in 'gw_sess' for
        // refresh-safe rejoin.
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
      // Guests welcome (owner ask 3 Aug 2026).
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

    socket.on('closeMyRoom', (data) => {
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code); if (!r) return;
      const uid = socket.profile && socket.profile.uid;
      if (!uid || uid !== r.creatorUid) return;
      dropRoom(code);
      try { nsp.to(code).emit('roomClosed', { code }); } catch (e) {}
    });

    // Token-based rejoin — client stashes { code, token } in 'gw_sess'.
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
        if (typeof ack === 'function') ack({ error: 'expired' });
        return;
      }
      const [oldId, p] = entry;
      const oldSock = nsp.sockets.get(oldId);
      if (oldSock) { try { oldSock.emit('replaced'); oldSock.leave(r.code); } catch (e) {} }
      r.players.delete(oldId);
      if (r.hostId === oldId) r.hostId = socket.id;
      if (r.order.length) r.order = r.order.map(x => x === oldId ? socket.id : x);
      if (r.describerId === oldId) r.describerId = socket.id;
      // Re-key any guesses tagged with the old socket id so the guesser's
      // avatar still resolves after the swap.
      for (const g of r.guesses) { if (g.playerId === oldId) g.playerId = socket.id; }
      p.id = socket.id; p.connected = true;
      r.players.set(socket.id, p);
      room = r; me = p;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id, reconnected: true });
      socket.emit('session', { code: r.code, token: p.token, name: p.name });
      broadcast(r);
      if (typeof ack === 'function') ack({ code, reconnected: true });
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
      const prof = socket.profile;
      if (prof && prof.uid) {
        for (const [oldId, p] of r.players) {
          if (p._uid === prof.uid) {
            const oldSock = nsp.sockets.get(oldId);
            if (oldSock) { oldSock.emit('replaced'); oldSock.leave(r.code); }
            r.players.delete(oldId);
            if (r.hostId === oldId) r.hostId = socket.id;
            if (r.order.length) r.order = r.order.map(x => x === oldId ? socket.id : x);
            if (r.describerId === oldId) r.describerId = socket.id;
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

    // Describer types a clue (hint). Everyone sees it.
    socket.on('hint', (data) => {
      if (!room || !me) return;
      if (room.state !== 'describe') return;
      if (socket.id !== room.describerId) return fail('Only the describer sends clues this round.');
      const text = clean(data && data.text).slice(0, MAX_HINT);
      if (!text) return;
      // Guard: don't let them literally paste the word or any near variant.
      if (containsWord(text, room.word)) {
        return fail('Nice try — can\'t include the word or an obvious form of it.');
      }
      room.hints.push({ text, at: Date.now() });
      broadcast(room);
    });

    // Any non-describer guesses. Correct guess ends the round.
    socket.on('guess', (data) => {
      if (!room || !me) return;
      if (room.state !== 'describe') return;
      if (socket.id === room.describerId) return; // describer can't guess their own word
      const text = clean(data && data.text).slice(0, MAX_GUESS);
      if (!text) return;
      const correct = norm(text) === norm(room.word);
      room.guesses.push({ playerId: me.id, name: me.name, text, correct, at: Date.now() });
      if (correct) {
        me.score = (me.score || 0) + 2;
        const describer = room.players.get(room.describerId);
        if (describer) describer.score = (describer.score || 0) + 1;
        finishRound(room, { timedOut: false, winnerId: me.id, winnerName: me.name });
        return;
      }
      broadcast(room);
    });

    // Host can skip a stuck round (e.g. someone's blanking on the word).
    socket.on('skip', () => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return fail('Only the host can skip.');
      if (room.state !== 'describe') return;
      finishRound(room, { timedOut: true, winnerId: null });
    });

    socket.on('rematch', () => {
      if (!room) return;
      if (room.state !== 'ended') return;
      for (const p of room.players.values()) {
        p.score = 0;
        p.described = 0;
      }
      room.state = 'lobby';
      room.round = 0;
      room.describerId = null;
      room.word = '';
      room.hints = [];
      room.guesses = [];
      room.winnerId = null;
      room.reveal = null;
      room.order = []; room.turnIdx = 0;
      if (room.timer) { clearTimeout(room.timer); room.timer = null; }
      broadcast(room);
    });

    socket.on('leave', () => {
      if (!room || !me) return;
      const r = room;
      const wasDescriber = r.describerId === socket.id;
      r.players.delete(socket.id);
      if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
      if (r.order.length) r.order = r.order.filter(x => x !== socket.id);
      socket.leave(r.code);
      room = null; me = null;
      if (!r.players.size) return dropRoom(r.code);
      if (r.state === 'describe') {
        if (wasDescriber) {
          // Describer bailed → reveal the word and roll on.
          finishRound(r, { timedOut: true, winnerId: null });
          return;
        }
        // Still enough players to keep going?
        if (r.order.filter(id => r.players.get(id) && r.players.get(id).connected).length < 2) {
          endGame(r);
          return;
        }
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
          } else if (r.state === 'describe') {
            const wasDescriber = r.describerId === socket.id;
            r.players.delete(socket.id);
            r.order = r.order.filter(x => x !== socket.id);
            if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
            if (!r.players.size) return dropRoom(r.code);
            if (wasDescriber) {
              finishRound(r, { timedOut: true, winnerId: null });
              return;
            }
            if (r.order.filter(id => r.players.get(id) && r.players.get(id).connected).length < 2) {
              endGame(r);
              return;
            }
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

  function guesswordLive() {
    const out = [];
    for (const r of rooms.values()) {
      const ps = [...r.players.values()];
      if (!ps.length) continue;
      const alive = ps.some(p => p.connected) || ((r.touched || 0) > Date.now() - 120000);
      if (!alive) continue;
      out.push({
        game: 'guessword', icon: '❓', title: 'Guess the Word',
        code: r.code,
        href: '/guessword?room=' + r.code, watchHref: '/guessword?watch=' + r.code,
        state: r.state === 'describe' ? 'playing' : r.state,
        cap: MAX_PLAYERS,
        players: ps.map(p => ({ name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected })),
        seatsFree: r.state === 'lobby' ? Math.max(0, MAX_PLAYERS - ps.length) : 0,
        lead: r.state === 'lobby' ? (ps.length + ' waiting')
          : r.state === 'ended' ? (r.reveal && r.reveal.winnerName ? r.reveal.winnerName + ' won' : 'Game over')
          : ('Round ' + r.round + '/' + r.roundCap),
        turnName: r.state === 'describe' && r.describerId
          ? ((r.players.get(r.describerId) || { name: null }).name)
          : null,
        watchers: r.watchers ? r.watchers.size : 0,
        since: r.touched || Date.now()
      });
    }
    return out;
  }

  console.log('guessword module: mounted');
  return { rooms, live: guesswordLive };
}

// Word-obviousness check for hints. Cheap heuristic — catches the obvious
// leak paths (exact word, plurals, dashed-splits, close-prefix stems). Not
// meant to be perfect; the describer can still cheat if they try hard.
function containsWord(text, word) {
  const raw = String(text).toLowerCase();
  const spaced = ' ' + raw.replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const squished = raw.replace(/[^a-z]+/g, '');   // strip punctuation entirely so "ban-ana" → "banana"
  const w = String(word).toLowerCase();
  if (!w) return false;
  if (spaced.indexOf(' ' + w) !== -1) return true;          // exact word token
  if (spaced.indexOf(w) !== -1) return true;                // substring in the readable text (catches plurals)
  if (squished.indexOf(w) !== -1) return true;              // substring across punctuation (ban-ana)
  if (w.length >= 5) {
    const stem = w.slice(0, w.length - 1);
    if (spaced.indexOf(stem) !== -1 || squished.indexOf(stem) !== -1) return true;
  }
  return false;
}

module.exports = { mount, WORDS, _containsWord: containsWord };
