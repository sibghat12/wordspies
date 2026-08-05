// Who is the Spy? — the party word-guessing game.
//
// Everyone in the room gets a secret word. The civilians all get the same word;
// one player (the spy) gets a different-but-related word — coffee vs tea, beach
// vs pool, football vs rugby. Nobody knows who anyone else is. Round by round
// each person says ONE word describing their word without giving it away, then
// everyone votes on who they think is the outsider. The most-voted player is
// revealed and eliminated. Civilians win when the spy is out; the spy wins when
// only two players are left. Best with 4–10 friends, ~5 minutes a game.
//
// Its own module with its own socket namespace and its own room table, matching
// meld.js — a bug in this game can never take WordSpies or the arcade down.

const path = require('path');

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 — misread aloud
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;
const MAX_NAME = 18;
const MAX_CLUE = 24;
const ROOM_TTL = 1000 * 60 * 90;
// Signed-in creators keep their rooms alive for a week. Owner ask
// 2 Aug 2026 v8: 'stay here until user delete or end that game'.
// Explicit `closeMyRoom` still tears it down immediately.
const OWNER_ROOM_TTL = 1000 * 60 * 60 * 24 * 7;
const DROP_GRACE = 120000;

// Pairs of related-but-different words. The whole game turns on how close but
// distinct the two words are — coffee/tea is a great pair (both hot drinks, in
// mugs, from beans/leaves), coffee/pizza is a bad pair (any clue instantly
// gives it away). Keep pairs in the same category, same register, so a spy has
// to think and a civilian has to be cagey.
const WORD_PAIRS = [
  // drinks
  ['Coffee', 'Tea'], ['Beer', 'Wine'], ['Coca-Cola', 'Pepsi'], ['Milk', 'Yoghurt'],
  ['Whisky', 'Rum'], ['Vodka', 'Gin'], ['Orange juice', 'Apple juice'],
  // food
  ['Pizza', 'Pasta'], ['Burger', 'Sandwich'], ['Sushi', 'Ramen'], ['Cake', 'Pie'],
  ['Ice cream', 'Frozen yoghurt'], ['Chocolate', 'Candy'], ['Rice', 'Noodles'],
  ['Bread', 'Bagel'], ['Cheese', 'Butter'], ['Salad', 'Soup'],
  // fruit
  ['Apple', 'Pear'], ['Orange', 'Mandarin'], ['Strawberry', 'Raspberry'],
  ['Banana', 'Plantain'], ['Watermelon', 'Melon'], ['Grape', 'Blueberry'],
  // animals
  ['Dog', 'Cat'], ['Lion', 'Tiger'], ['Cow', 'Buffalo'], ['Horse', 'Donkey'],
  ['Rabbit', 'Hare'], ['Frog', 'Toad'], ['Crocodile', 'Alligator'],
  ['Dolphin', 'Whale'], ['Wolf', 'Fox'], ['Chicken', 'Turkey'],
  // sports
  ['Football', 'Rugby'], ['Basketball', 'Netball'], ['Tennis', 'Badminton'],
  ['Cricket', 'Baseball'], ['Boxing', 'Wrestling'], ['Skiing', 'Snowboarding'],
  ['Chess', 'Checkers'],
  // places
  ['Beach', 'Pool'], ['Mountain', 'Hill'], ['Forest', 'Jungle'],
  ['River', 'Lake'], ['Desert', 'Savannah'], ['Cinema', 'Theatre'],
  ['Hotel', 'Hostel'], ['School', 'University'], ['Hospital', 'Clinic'],
  // objects
  ['Phone', 'Tablet'], ['Laptop', 'Desktop'], ['Book', 'Magazine'],
  ['Pen', 'Pencil'], ['Chair', 'Stool'], ['Sofa', 'Bed'],
  ['Fridge', 'Freezer'], ['Guitar', 'Ukulele'], ['Piano', 'Keyboard'],
  ['Camera', 'Camcorder'], ['Umbrella', 'Raincoat'], ['Sunglasses', 'Glasses'],
  // transport
  ['Car', 'Van'], ['Bus', 'Coach'], ['Bike', 'Scooter'],
  ['Plane', 'Helicopter'], ['Ship', 'Boat'], ['Train', 'Tram'],
  // people / roles
  ['Doctor', 'Nurse'], ['Teacher', 'Lecturer'], ['Chef', 'Baker'],
  ['Police', 'Security'], ['Actor', 'Singer'], ['Painter', 'Photographer'],
  // clothing
  ['Shirt', 'T-shirt'], ['Jeans', 'Trousers'], ['Shoes', 'Boots'],
  ['Hat', 'Cap'], ['Scarf', 'Tie'], ['Jumper', 'Cardigan'],
  // household
  ['Broom', 'Mop'], ['Bowl', 'Plate'], ['Cup', 'Mug'],
  ['Knife', 'Scissors'], ['Towel', 'Napkin'],
  // nature / weather
  ['Sun', 'Moon'], ['Rain', 'Snow'], ['Cloud', 'Fog'], ['Star', 'Planet'],
  // toys / games
  ['Chess', 'Draughts'], ['Cards', 'Dominoes'], ['Lego', 'Meccano'],
  // random modern
  ['WhatsApp', 'Telegram'], ['YouTube', 'TikTok'], ['Netflix', 'Disney+'],
  ['Instagram', 'Snapchat'], ['Google', 'Bing']
];

function pickPair() {
  const p = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
  // Randomise which side is the spy word so the civilian word isn't predictable.
  return Math.random() < 0.5 ? [p[0], p[1]] : [p[1], p[0]];
}

function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'S' + Date.now().toString(36).slice(-3).toUpperCase();
}

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_CLUE);
const safeName = s => {
  const n = clean(s).slice(0, MAX_NAME);
  return n || 'Player';
};
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

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
    players: new Map(),         // socketId -> { id, name, photo, connected, alive, isSpy, word }
    order: [],                  // socketId turn order, set at game start
    turnIdx: 0,                 // which order[] index is currently playing
    round: 1,
    clues: [],                  // [{ round, playerId, name, word }]
    votes: {},                  // socketId -> targetId (this vote round)
    winner: null,               // 'civilians' | 'spy' | null
    reveal: null,               // { spyName, civWord, spyWord, eliminatedName?, eliminatedRole? }
    civWord: '', spyWord: '',
    hostId: null,
    watchers: null,             // Map<socketId, { uid, name, photo } | null>
    touched: Date.now(),
    lastKnock: 0
  };
}

function alivePlayers(r) {
  return [...r.players.values()].filter(p => p.alive);
}
function aliveSpy(r) {
  return alivePlayers(r).find(p => p.isSpy) || null;
}
function aliveCount(r) {
  return alivePlayers(r).length;
}

// Every player sees the same public state EXCEPT their own secret word, which
// is stitched in on the way out. Nobody else's word is ever sent to a client.
function publicState(room, socketId) {
  const me = room.players.get(socketId) || null;
  const cluesThisRound = room.clues.filter(c => c.round === room.round);
  const currentTurnId = room.state === 'clues' && room.order[room.turnIdx] || null;
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, photo: p.photo || null,
      connected: p.connected, alive: p.alive,
      // Roles are only revealed once the game ends. Before then, even a dead
      // player is just "eliminated" — showing their role would leak whether
      // the spy has been caught yet.
      role: room.state === 'ended' ? (p.isSpy ? 'spy' : 'civilian') : null
    })),
    order: room.order,
    turnId: currentTurnId,
    cluesRound: cluesThisRound,
    cluesAll: room.clues,
    votes: room.state === 'reveal' || room.state === 'ended'
      ? Object.fromEntries(Object.entries(room.votes))
      : {},
    myWord: me && me.word ? me.word : null,
    iAmSpy: me ? !!me.isSpy : false,
    iVoted: room.votes[socketId] || null,
    winner: room.winner,
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
  const _opts = opts || {};
  const _uidFromReq = typeof _opts.uidFromReq === 'function' ? _opts.uidFromReq : null;
  const _activeGame = _opts.activeGame || null;
  // Register the "does this room still exist?" callback so getVerified()
  // can drop a stale key transparently. Without this, ending a spy game
  // would leave the user 'locked in' for the full 4h TTL.
  if (_activeGame && _activeGame.registerVerifier) _activeGame.registerVerifier('spy', code => rooms.has(code));
  // Shared "already in a game" guard — see activegame.js. Returns true if
  // the create should proceed, false if the request has already been
  // answered with 409. Idempotent + safe when uid is null (guest).
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
  const options = opts || {};
  const identify = typeof options.identify === 'function' ? options.identify : null;

  app.get('/spy', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'spy.html'));
  });

  // Empty-room bootstrap, same shape as /api/meld/new — chat's game picker
  // needs a code before anyone has opened a tab.
  app.post('/api/spy/new', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await _guardActive(req, res))) return;
    const code = newCode();
    const r = newRoom();
    r.code = code;
    rooms.set(code, r);
    await _markActive(req, 'spy', code, '/spy?room=' + code);
    res.json({ code });
  });

  app.get('/api/spy/:code', (req, res) => {
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

  const nsp = io.of('/spy');

  function dropRoom(code) { rooms.delete(code); }

  function broadcast(room) {
    room.touched = Date.now();
    // Each player gets a state stamped with their own private word.
    for (const [sid] of room.players) {
      nsp.to(sid).emit('state', publicState(room, sid));
    }
    // Watchers see everything the public state carries except any myWord.
    if (room.watchers) {
      for (const wsid of room.watchers.keys()) {
        nsp.to(wsid).emit('state', publicState(room, wsid));
      }
    }
  }

  function beginGame(room) {
    const ids = shuffle([...room.players.keys()]);
    if (ids.length < MIN_PLAYERS) return;
    const [civWord, spyWord] = pickPair();
    room.civWord = civWord;
    room.spyWord = spyWord;
    // One spy for 4–6 players, two for 7+. Keeps larger rooms tense.
    const spyCount = ids.length >= 7 ? 2 : 1;
    const spies = new Set(shuffle([...ids]).slice(0, spyCount));
    for (const id of ids) {
      const p = room.players.get(id);
      p.alive = true;
      p.isSpy = spies.has(id);
      p.word = p.isSpy ? spyWord : civWord;
    }
    room.order = ids;
    room.turnIdx = 0;
    room.round = 1;
    room.clues = [];
    room.votes = {};
    room.winner = null;
    room.reveal = null;
    room.state = 'clues';
    broadcast(room);
  }

  // Advance to the next alive player in turn order. When we wrap back around,
  // everyone alive has given a clue this round → move to voting.
  function advanceTurn(room) {
    const n = room.order.length;
    for (let step = 1; step <= n; step++) {
      const nextIdx = (room.turnIdx + step) % n;
      const p = room.players.get(room.order[nextIdx]);
      if (p && p.alive) {
        // A full loop past the starting index means we're back to whoever
        // opened this round → clues are done.
        if (nextIdx === room.startedIdxThisRound) break;
        room.turnIdx = nextIdx;
        return;
      }
    }
    room.state = 'voting';
    room.votes = {};
  }

  function resolveVotes(room) {
    const alive = alivePlayers(room);
    // Everyone alive must have voted. If not, wait.
    if (alive.some(p => !room.votes[p.id])) return;

    const tally = {};
    for (const voterId of Object.keys(room.votes)) {
      const target = room.votes[voterId];
      tally[target] = (tally[target] || 0) + 1;
    }
    let topId = null, topCount = 0, tie = false;
    for (const [id, count] of Object.entries(tally)) {
      if (count > topCount) { topId = id; topCount = count; tie = false; }
      else if (count === topCount) { tie = true; }
    }

    room.state = 'reveal';
    if (tie || !topId) {
      // Hung jury → nobody dies, next round begins after the reveal screen
      room.reveal = { tied: true, tally, spyCaught: false };
    } else {
      const victim = room.players.get(topId);
      if (victim) {
        victim.alive = false;
        room.reveal = {
          tied: false,
          tally,
          eliminatedId: victim.id,
          eliminatedName: victim.name,
          eliminatedRole: victim.isSpy ? 'spy' : 'civilian',
          spyCaught: victim.isSpy
        };
      }
    }
    checkEndConditions(room);
    broadcast(room);
  }

  function checkEndConditions(room) {
    const spies = alivePlayers(room).filter(p => p.isSpy);
    const civs = alivePlayers(room).filter(p => !p.isSpy);
    if (!spies.length) {
      room.state = 'ended';
      room.winner = 'civilians';
      room.reveal = Object.assign({}, room.reveal, {
        spyName: [...room.players.values()].filter(p => p.isSpy).map(p => p.name).join(' & '),
        civWord: room.civWord, spyWord: room.spyWord
      });
      return;
    }
    // Spy wins if their number equals or exceeds civilians'.
    if (spies.length >= civs.length) {
      room.state = 'ended';
      room.winner = 'spy';
      room.reveal = Object.assign({}, room.reveal, {
        spyName: [...room.players.values()].filter(p => p.isSpy).map(p => p.name).join(' & '),
        civWord: room.civWord, spyWord: room.spyWord
      });
    }
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
        alive: true,
        isSpy: false,
        word: null
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
      // Owner ask 3 Aug 2026: 'let people play games without login as
      // guest as well — if he has account use her name, else guest'.
      // Reverses the 2 Aug v8 login-only guard. Signed-in players are
      // still dedup'd by uid; guests get a fresh seat under whatever
      // name they typed.
      const code = newCode();
      const r = newRoom(); r.code = code;
      const prof = socket.profile;
      r.creatorUid  = (prof && prof.uid)   || null;
      r.creatorName = (prof && prof.name)  || (data && data.name) || null;
      r.creatorPhoto= (prof && prof.photo) || null;
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
      rooms.delete(code);
      try { nsp.to(code).emit('roomClosed', { code }); } catch (e) {}
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      // Guests welcome (owner ask 3 Aug 2026). uid-dedup below only fires
      // for signed-in players.
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) {
        fail('No game with that code. It may have finished.');
        if (typeof ack === 'function') ack({ error: 'gone' });
        return;
      }
      // Same account already seated (a second tab, a refresh, or a fresh
      // page from the invite link): swap the seat onto this socket and
      // disconnect the old one. Prevents the "I appear twice" bug and lets
      // people rejoin from any device without losing their spot mid-game.
      const prof = socket.profile;
      if (prof && prof.uid) {
        for (const [oldId, p] of r.players) {
          if (p._uid === prof.uid) {
            // If the previous socket is still connected, boot it — its owner
            // is the same human, sitting in the new tab.
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
      if (prof && prof.uid) {
        const p = r.players.get(socket.id);
        if (p) p._uid = prof.uid;
      }
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('start', () => {
      if (!room || !me) return;
      if (room.state !== 'lobby') return fail('Already going.');
      if (socket.id !== room.hostId) return fail('Only the host can start.');
      if (room.players.size < MIN_PLAYERS) return fail('Need at least ' + MIN_PLAYERS + ' players.');
      // Remember where the round began, so we know when the ring closes.
      room.startedIdxThisRound = 0;
      beginGame(room);
    });

    socket.on('clue', (data) => {
      if (!room || !me) return;
      if (room.state !== 'clues') return;
      const turnId = room.order[room.turnIdx];
      if (turnId !== socket.id) return fail('Not your turn yet.');
      if (!me.alive) return;
      const w = clean(data && data.word);
      if (!norm(w)) return fail('Type a clue.');
      // Can't literally say either the civilian word or the spy word — the
      // whole game is describing without saying it.
      if (norm(w) === norm(room.civWord) || norm(w) === norm(room.spyWord)) {
        return fail('Too obvious — pick a different word.');
      }
      room.clues.push({ round: room.round, playerId: socket.id, name: me.name, word: w });
      advanceTurn(room);
      broadcast(room);
    });

    socket.on('vote', (data) => {
      if (!room || !me) return;
      if (room.state !== 'voting') return;
      if (!me.alive) return;
      const target = String((data && data.target) || '');
      const tp = room.players.get(target);
      if (!tp || !tp.alive) return fail('Pick someone still in the game.');
      if (target === socket.id) return fail('You cannot vote for yourself.');
      room.votes[socket.id] = target;
      broadcast(room);
      resolveVotes(room);
    });

    socket.on('nextRound', () => {
      if (!room || !me) return;
      if (room.state !== 'reveal') return;
      if (socket.id !== room.hostId) return fail('Only the host advances the round.');
      if (room.winner) return; // game over — use rematch
      room.round += 1;
      room.clues = room.clues; // keep full history
      room.votes = {};
      // Next round starts with the first alive player after whoever went last.
      // If the previous starter was eliminated, start with the next alive.
      let start = 0;
      for (let i = 0; i < room.order.length; i++) {
        const p = room.players.get(room.order[i]);
        if (p && p.alive) { start = i; break; }
      }
      room.turnIdx = start;
      room.startedIdxThisRound = start;
      room.state = 'clues';
      room.reveal = null;
      broadcast(room);
    });

    socket.on('rematch', () => {
      if (!room) return;
      if (room.state !== 'ended') return;
      // Reset everyone alive again in the same lobby.
      for (const p of room.players.values()) {
        p.alive = true; p.isSpy = false; p.word = null;
      }
      room.state = 'lobby';
      room.round = 1;
      room.clues = [];
      room.votes = {};
      room.winner = null;
      room.reveal = null;
      room.civWord = ''; room.spyWord = '';
      room.order = []; room.turnIdx = 0;
      broadcast(room);
    });

    // Any player can quit outright. In the lobby we just free the seat; mid-
    // game we mark them dead and check if that ends the round.
    socket.on('leave', () => {
      if (!room || !me) return;
      const r = room;
      r.players.delete(socket.id);
      if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
      if (r.order.length) {
        // If the leaver was mid-turn, advance.
        if (r.state === 'clues' && r.order[r.turnIdx] === socket.id) {
          r.order = r.order.filter(x => x !== socket.id);
          if (r.turnIdx >= r.order.length) r.turnIdx = 0;
        } else {
          r.order = r.order.filter(x => x !== socket.id);
        }
      }
      delete r.votes[socket.id];
      socket.leave(r.code);
      room = null; me = null;
      if (!r.players.size) return dropRoom(r.code);
      // If we lost a spy mid-game the civilians win by default; likewise if
      // civilians drop below the spy count. checkEndConditions handles both.
      if (r.state !== 'lobby') checkEndConditions(r);
      broadcast(r);
    });

    // Host can shut the room down for everyone — a "close the party" button
    // so a game that stalled doesn't sit half-alive forever.
    socket.on('endRoom', () => {
      if (!room || !me) return;
      if (socket.id !== room.hostId) return fail('Only the host can end the game.');
      const r = room;
      nsp.to(r.code).emit('roomClosed', { by: me.name });
      // Disconnect everyone from the socket room so nothing else lingers.
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
          // In lobby, free the seat outright. Mid-game, keep the player in the
          // list (so their role and any given clues stay attributed) but drop
          // their connection — the host can still finish the game around them.
          if (r.state === 'lobby') {
            r.players.delete(socket.id);
            if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
            if (!r.players.size) return dropRoom(r.code);
          } else {
            // If they were mid-turn, skip past them.
            if (r.state === 'clues' && r.order[r.turnIdx] === socket.id) {
              advanceTurn(r);
            }
            // If they were alive and their exit ends the game, resolve it.
            if (cur.alive) {
              cur.alive = false;
              checkEndConditions(r);
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
      if (now - (r.touched || 0) > ttl) rooms.delete(code);
    }
  }, 1000 * 60 * 10).unref?.();

  function spyLive() {
    const out = [];
    for (const r of rooms.values()) {
      const ps = [...r.players.values()];
      // Grace: a room stays visible on the Live tab for two minutes after
      // its last touch even with nobody currently connected — so a lobby
      // waiting-for-friends room or a page-refresh doesn't blink out.
      if (!ps.length) continue;
      const alive = ps.some(p => p.connected) || ((r.touched || 0) > Date.now() - 120000);
      if (!alive) continue;
      out.push({
        game: 'spy', icon: '🕵️', title: 'Who is the Spy?',
        code: r.code,
        href: '/spy?room=' + r.code, watchHref: '/spy?watch=' + r.code,
        state: r.state, cap: MAX_PLAYERS,
        players: ps.map(p => ({ name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected })),
        seatsFree: r.state === 'lobby' ? Math.max(0, MAX_PLAYERS - ps.length) : 0,
        lead: r.state === 'lobby' ? (ps.length + ' waiting')
          : r.state === 'ended' ? (r.winner === 'spy' ? 'Spy won' : 'Civilians won')
          : ('Round ' + r.round + (r.state === 'voting' ? ' — voting' : r.state === 'reveal' ? ' — reveal' : '')),
        turnName: r.state === 'clues'
          ? ((r.players.get(r.order[r.turnIdx]) || { name: null }).name)
          : null,
        watchers: r.watchers ? r.watchers.size : 0,
        since: r.touched || Date.now()
      });
    }
    return out;
  }

  console.log('spy module: mounted');
  return { rooms, live: spyLive };
}

module.exports = { mount, WORD_PAIRS };