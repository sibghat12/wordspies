// WordSpies — a Codenames-style online party game.
// Node.js + Express + Socket.IO. All game state lives in memory (no database).

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { PACKS } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// In-memory rooms
// ---------------------------------------------------------------------------
const rooms = new Map(); // code -> room

const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // clean up rooms idle for 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
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

function createBoard(packKey) {
  const pack = PACKS[packKey] || PACKS.classic;
  const words = shuffle(pack.words).slice(0, 25);
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
    hostId: null,
    players: new Map(), // socketId -> {id, name, team, role, connected}
    state: 'lobby', // lobby | playing | over
    settings: { pack: 'classic', timer: 0 }, // timer in seconds, 0 = off
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
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    settings: room.settings,
    packs: Object.fromEntries(Object.entries(PACKS).map(([k, p]) => [k, p.name])),
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, role: p.role, connected: p.connected, avatar: p.avatar
    })),
    board: room.board ? {
      startingTeam: room.board.startingTeam,
      cards: room.board.cards.map(c => ({
        word: c.word,
        revealed: c.revealed,
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
  room.board = createBoard(room.settings.pack);
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
    player = { id: socket.id, name, team: null, role: 'operative', connected: true, avatar: pickAvatar(room) };
    room.hostId = socket.id;
    room.players.set(socket.id, player);
    socket.join(room.code);
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
    player = { id: socket.id, name: finalName, team: null, role: 'operative', connected: true, avatar: pickAvatar(room) };
    room.players.set(socket.id, player);
    socket.join(room.code);
    addLog(room, { type: 'join', name: finalName });
    broadcast(room);
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
    // Can't become spymaster mid-game if you were an operative (you'd have seen nothing, it's fine actually — but switching teams mid-game is not allowed)
    if (room.state === 'playing' && player.team && player.team !== team) {
      socket.emit('errorMsg', 'You can\'t switch teams during a game.');
      return;
    }
    player.team = team;
    player.role = role;
    broadcast(room);
  }));

  socket.on('setSettings', guard(({ pack, timer }) => {
    if (!room || socket.id !== room.hostId || room.state === 'playing') return;
    if (pack && PACKS[pack]) room.settings.pack = pack;
    if (typeof timer === 'number' && [0, 60, 90, 120, 180].includes(timer)) room.settings.timer = timer;
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
    if (!room || !player) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    addLog(room, { type: 'chat', name: player.name, team: player.team, text });
    broadcast(room);
  }));

  socket.on('disconnect', guard(() => {
    if (!room || !player) return;
    player.connected = false;
    // Give the player 60s to come back (page refresh) before removing them.
    const r = room, p = player, sockId = socket.id;
    setTimeout(() => {
      const current = r.players.get(sockId);
      if (current && !current.connected) {
        r.players.delete(sockId);
        addLog(r, { type: 'leave', name: p.name });
        if (r.hostId === sockId) {
          const next = [...r.players.keys()][0];
          r.hostId = next || null;
          if (!next) { clearTimer(r); rooms.delete(r.code); return; }
        }
        broadcast(r);
      }
    }, 60000);
    broadcast(room);
  }));
});

server.listen(PORT, () => {
  console.log(`WordSpies running → http://localhost:${PORT}`);
});
