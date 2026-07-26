// Mind Meld — the two-player side game.
//
// The whole thing in one sentence: you and one friend type a word at the same
// time, and you are trying to type the *same* word. You almost never do on the
// first go — so the two words you just said become the new target, and you both
// try to say the word that sits between them. Round after round the two words
// crawl towards each other until you both type the same thing at the same time,
// and that is the win. It is co-operative: nobody beats anybody.
//
// Two rules do all the work. You cannot say a word that has already been said
// by either of you (otherwise the obvious move is to keep repeating yourself
// forever), and neither player sees the other's word until both are in. Take
// either rule away and the game stops being a game.
//
// It is deliberately its own module with its own socket namespace and its own
// room table. Nothing in here can reach into a WordSpies match, so a bug in the
// side game can never take the main game down with it. It also needs no word
// list, no dictionary and no AI — any language works, because the only thing
// ever compared is your two answers against each other.

const path = require('path');

// Rooms live in memory, exactly like the main game. Losing them on a restart is
// fine: a round of this lasts two minutes, not two days.
const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 — they get misread aloud
const MAX_WORD = 32;
const ROOM_TTL = 1000 * 60 * 90;        // an abandoned room evaporates after 90 min

function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return 'M' + Date.now().toString(36).slice(-3).toUpperCase();
}

// What counts as "the same word". Accents, capitals, spaces, hyphens and
// punctuation are all thrown away before comparing, so ICE CREAM, ice-cream and
// icecream are one word, and café matches cafe. Being generous here matters:
// losing a meld to a typo would feel like the game cheating you.
const norm = s => String(s == null ? '' : s)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_WORD);

const safeName = s => {
  const n = clean(s).slice(0, 18);
  return n || 'Player';
};

// How impressed to be. Purely for the win screen — but the whole point of the
// game is the number at the end, so it deserves a real line rather than a score.
function verdict(rounds) {
  if (rounds <= 1) return { title: 'Telepathic', line: 'First try. That is not normal. Do it again and prove it.' };
  if (rounds === 2) return { title: 'Spooky', line: 'Two rounds. You two have clearly met before.' };
  if (rounds <= 4) return { title: 'Locked in', line: 'That is a properly good meld.' };
  if (rounds <= 7) return { title: 'Got there', line: 'Slow start, strong finish.' };
  if (rounds <= 11) return { title: 'Hard work', line: 'You got there, and it was not pretty.' };
  return { title: 'Eventually', line: 'You got there in the end. Nobody needs to know how long it took.' };
}

function mount(app, io, opts) {
  const options = opts || {};
  const identify = typeof options.identify === 'function' ? options.identify : null;

  app.get('/meld', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'meld.html'));
  });

  // A room born empty, over plain HTTP — for the chat's game picker, which
  // needs a code to put in the invite message before anyone has opened the
  // page. Whoever arrives first is simply the first player.
  app.post('/api/meld/new', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = newCode();
    rooms.set(code, {
      code, state: 'lobby', round: 1,
      players: new Map(), picks: {}, prompt: null,
      history: [], used: [], meld: null,
      hostId: null, touched: Date.now()
    });
    res.json({ code });
  });

  // Does this code still point at a live room? The page asks before it shows
  // someone a join screen, so an old link says "this game has finished" instead
  // of quietly dropping them into nothing.
  app.get('/api/meld/:code', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = rooms.get(String(req.params.code || '').trim().toUpperCase());
    if (!r) return res.json({ exists: false });
    res.json({ exists: true, full: r.players.size >= 2, state: r.state, host: r.players.size ? [...r.players.values()][0].name : null });
  });

  const nsp = io.of('/meld');

  function dropRoom(code) {
    rooms.delete(code);
  }

  // Everything the page is allowed to know. The other player's word in the
  // round being played is deliberately absent — only whether they have locked
  // one in — because seeing it early would turn the game into copying.
  function publicState(room) {
    return {
      code: room.code,
      state: room.state,
      round: room.round,
      players: [...room.players.values()].map(p => ({
        id: p.id, name: p.name, photo: p.photo || null,
        connected: p.connected, ready: !!room.picks[p.id]
      })),
      prompt: room.prompt,               // the two words from last round, or null on round 1
      history: room.history,
      used: room.used,
      meld: room.meld,                   // { word, rounds, title, line } once won
      hostId: room.hostId,
      watchers: room.watchers ? room.watchers.size : 0,
      // Who those eyes belong to — signed-in watchers by name and face so the
      // players can follow them back, everyone else an anonymous spy.
      crowd: room.watchers
        ? [...room.watchers.values()].map(w => (w && w.uid ? { uid: w.uid, name: w.name, photo: w.photo } : null))
        : []
    };
  }

  function broadcast(room) {
    room.touched = Date.now();
    nsp.to(room.code).emit('state', publicState(room));
  }

  // Both words are in — compare them, and either finish the game or make this
  // round's pair the next round's target.
  function resolveRound(room) {
    const ids = [...room.players.keys()];
    if (ids.length < 2) return;
    const a = room.picks[ids[0]], b = room.picks[ids[1]];
    if (!a || !b) return;

    const pa = room.players.get(ids[0]), pb = room.players.get(ids[1]);
    const matched = norm(a) === norm(b);

    room.history.push({
      round: room.round,
      a: { name: pa.name, word: a },
      b: { name: pb.name, word: b },
      matched
    });
    room.used.push(a);
    if (!matched) room.used.push(b);
    room.picks = {};

    if (matched) {
      const v = verdict(room.round);
      room.state = 'won';
      room.meld = { word: a, rounds: room.round, title: v.title, line: v.line };
    } else {
      room.prompt = { a: { name: pa.name, word: a }, b: { name: pb.name, word: b } };
      room.round += 1;
    }
    broadcast(room);
  }

  nsp.on('connection', (socket) => {
    let room = null;
    let me = null;

    // Signed-in players get seated under their own name and photo without
    // typing anything; guests still work, because making people sign up to
    // play a two-minute word game would be absurd.
    socket.profile = null;
    socket.ready = identify
      ? identify(socket).then(p => { socket.profile = p || null; }).catch(() => { socket.profile = null; })
      : Promise.resolve();

    const fail = msg => socket.emit('err', { msg });

    // Watching. A spectator joins the channel but never gets a seat, and every
    // action handler here opens with `if (!room || !me) return` — so `room`
    // staying null is the guard, not anything the page promises. publicState
    // has never carried the unlocked words, only whether someone has locked
    // one in, so a watcher sees exactly what the other player sees.
    let watch = null;
    socket.on('watch', async (data) => {
      if (room || watch) return;
      const r = rooms.get(String((data && data.code) || '').trim().toUpperCase());
      if (!r) { fail('That game has already finished.'); return; }
      // Know who's looking before we list them; re-check after the wait in
      // case this socket sat down in the meantime.
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
    socket.on('disconnect', () => {
      if (!watch) return;
      const r = watch; watch = null;
      if (r.watchers) { r.watchers.delete(socket.id); broadcast(r); }
    });

    const seat = (r, name) => {
      const prof = socket.profile;
      const p = {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        connected: true
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
      const code = newCode();
      const r = {
        code, state: 'lobby', round: 1,
        players: new Map(), picks: {}, prompt: null,
        history: [], used: [], meld: null,
        hostId: null, touched: Date.now()
      };
      rooms.set(code, r);
      seat(r, data && data.name);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) { fail('No game with that code. It may have finished.'); if (typeof ack === 'function') ack({ error: 'gone' }); return; }
      if (r.players.size >= 2) { fail('That game already has two players.'); if (typeof ack === 'function') ack({ error: 'full' }); return; }
      seat(r, data && data.name);
      // Two people in the room is the whole requirement — start immediately.
      if (r.players.size === 2 && r.state === 'lobby') { r.state = 'playing'; broadcast(r); }
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('word', (data) => {
      if (!room || !me) return;
      if (room.state !== 'playing') return fail('Not playing right now.');
      if (room.picks[socket.id]) return;                       // already locked in
      const w = clean(data && data.word);
      if (!w) return fail('Type a word first.');
      if (!norm(w)) return fail('That needs at least one letter.');
      if (room.used.some(u => norm(u) === norm(w))) return fail('That one has already been said. Fresh word.');
      room.picks[socket.id] = w;
      broadcast(room);
      resolveRound(room);
    });

    // Taking a word back before your friend has answered. Nobody has seen it,
    // so there is nothing unfair about it, and being stuck staring at a word
    // you regret is a miserable way to spend a round.
    socket.on('unpick', () => {
      if (!room || !me) return;
      if (room.state !== 'playing') return;
      if (!room.picks[socket.id]) return;
      const others = [...room.players.keys()].filter(id => id !== socket.id);
      if (others.some(id => room.picks[id])) return;           // too late, they have answered
      delete room.picks[socket.id];
      broadcast(room);
    });

    socket.on('rematch', () => {
      if (!room) return;
      if (room.state !== 'won') return;
      room.state = room.players.size >= 2 ? 'playing' : 'lobby';
      room.round = 1; room.picks = {}; room.prompt = null;
      room.history = []; room.used = []; room.meld = null;
      broadcast(room);
    });

    socket.on('disconnect', () => {
      if (!room || !me) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      broadcast(r);
      // A dropped phone gets a couple of minutes to come back before its seat
      // is freed; after that the room is only worth keeping if someone is in it.
      setTimeout(() => {
        const cur = r.players.get(socket.id);
        if (cur && !cur.connected) {
          r.players.delete(socket.id);
          delete r.picks[socket.id];
          if (r.hostId === socket.id) r.hostId = [...r.players.keys()][0] || null;
          if (!r.players.size) return dropRoom(r.code);
          if (r.state === 'playing') r.state = 'lobby';
          broadcast(r);
        }
      }, 120000);
    });
  });

  // Sweeper. Without it a room created by someone who closed the tab before
  // anyone joined would sit in memory until the process restarts.
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      if (now - (r.touched || 0) > ROOM_TTL) rooms.delete(code);
    }
  }, 1000 * 60 * 10).unref?.();

  // What the Live tab reads. The words in play never appear here — only the
  // round number and whether each person has locked one in, which is exactly
  // what the two players can see themselves.
  function meldLive() {
    const out = [];
    for (const r of rooms.values()) {
      const ps = [...r.players.values()];
      // same rule as the arcade: nobody connected, nothing to look in on
      if (!ps.some(p => p.connected)) continue;
      out.push({
        game: 'meld', icon: '🧠', title: 'Mind Meld', code: r.code, href: '/meld?room=' + r.code, watchHref: '/meld?watch=' + r.code,
        state: r.state, cap: 2,
        players: ps.map(p => ({ name: p.name, photo: p.photo || null, bot: false, connected: !!p.connected })),
        seatsFree: Math.max(0, 2 - ps.length),
        lead: r.meld ? ('Melded on "' + r.meld.word + '" in ' + r.meld.rounds)
          : (r.state === 'playing'
            ? 'Round ' + r.round + (r.prompt ? ' — linking ' + r.prompt.a.word + ' + ' + r.prompt.b.word : '')
            : 'Waiting to start'),
        turnName: null,
        watchers: r.watchers ? r.watchers.size : 0,
        since: r.touched || Date.now()
      });
    }
    return out;
  }

  console.log('meld module: mounted');
  return { rooms, live: meldLive };
}

module.exports = { mount, norm, verdict };

