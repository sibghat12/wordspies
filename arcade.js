// Arcade — the games everybody already knows.
//
// Two of them live in here. Ludo, which is the reason this file exists: it is
// the game most people already have the rules for in their head, it works with
// two, three or four people, and bots can fill the empty seats so one person
// on their own still gets a real game. And Connect 4, which is thirty seconds
// to explain and takes two minutes to play.
//
// Same house rules as the other side games: its own socket namespaces, its own
// room tables, and it reaches into nothing that belongs to WordSpies. If this
// file throws on load the main game does not notice.

const path = require('path');

// ── shared odds and ends ──────────────────────────────────────────────────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1, they get misread aloud
const ROOM_TTL = 1000 * 60 * 90;

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 32);
const safeName = s => clean(s).slice(0, 18) || 'Player';
const d6 = () => 1 + Math.floor(Math.random() * 6);
const pick = a => a[Math.floor(Math.random() * a.length)];

function makeCode(table) {
  for (let i = 0; i < 200; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!table.has(c)) return c;
  }
  return 'G' + Date.now().toString(36).slice(-3).toUpperCase();
}

const BOT_NAMES = ['Pixel', 'Bolt', 'Mochi', 'Rusty', 'Nova', 'Biscuit', 'Kiwi', 'Tofu'];

// ══════════════════════════════════════════════════════════════════════════
//  LUDO
// ══════════════════════════════════════════════════════════════════════════
//
// Board geometry, once, so the server and the page agree on every square.
// The main loop is 52 cells laid out on the classic 15x15 cross. A token's
// position `p` is measured from its OWN start cell, which is what makes four
// players work with one set of rules:
//
//    p = -1        sat in the base, needs a 6 to come out
//    p = 0..50     on the shared loop; the real square is (start + p) % 52
//    p = 51..55    the five squares of its own colour running to the middle
//    p = 56        home
//
// So every token walks exactly 57 steps, and the last one has to be exact.

const LUDO_TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0]
];

const LUDO_STARTS = [0, 13, 26, 39];

// The five run-in squares for each colour, then the middle.
const LUDO_HOME = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]]
];

// Where the four tokens sit while they are still in the base.
const LUDO_BASE = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]]
];

// The four start squares and the four stars. Nothing gets taken on these.
const LUDO_SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

const LUDO_COLORS = ['red', 'green', 'yellow', 'blue'];
const LUDO_LABELS = ['Red', 'Green', 'Yellow', 'Blue'];

const ludoRooms = new Map();

const absCell = (seat, p) => (LUDO_STARTS[seat] + p) % 52;

// Every legal thing this player could do with this roll. If it comes back
// empty the turn is simply over — which happens a lot, and is the game.
function ludoMoves(room, seat, dice) {
  const out = [];
  const toks = room.tokens[seat];
  for (let t = 0; t < 4; t++) {
    const p = toks[t];
    if (p === 56) continue;                          // already home
    if (p === -1) {
      if (dice === 6) out.push({ token: t, from: p, to: 0 });
      continue;
    }
    const np = p + dice;
    if (np > 56) continue;                           // needs an exact roll to finish
    // Your own tokens do not block each other — stacking is allowed, which is
    // how most people actually play it.
    out.push({ token: t, from: p, to: np });
  }
  return out;
}

function ludoApply(room, seat, mv, dice) {
  const events = { captured: [], finished: false };
  room.tokens[seat][mv.token] = mv.to;

  // A capture only happens out on the shared loop, and never on a safe square.
  if (mv.to <= 50) {
    const cell = absCell(seat, mv.to);
    if (!LUDO_SAFE.has(cell)) {
      for (let s = 0; s < 4; s++) {
        if (s === seat) continue;
        for (let t = 0; t < 4; t++) {
          const q = room.tokens[s][t];
          if (q >= 0 && q <= 50 && absCell(s, q) === cell) {
            room.tokens[s][t] = -1;
            events.captured.push({ seat: s, token: t });
          }
        }
      }
    }
  }
  if (mv.to === 56) events.finished = true;

  // A six, a capture or a token getting home all buy you another go.
  const again = dice === 6 || events.captured.length > 0 || events.finished;
  return { events, again };
}

const ludoWon = (room, seat) => room.tokens[seat].every(p => p === 56);

// The bot. Not clever, just sensible: send someone home if you can, get a
// token home, come out of the base on a six, otherwise push the one furthest
// along. Playing against something that never takes your token would be dull.
function ludoBotChoice(room, seat, dice, moves) {
  let best = null, bestScore = -1e9;
  for (const mv of moves) {
    let sc = 0;
    if (mv.to === 56) sc += 100;
    if (mv.from === -1) sc += 40;
    if (mv.to <= 50) {
      const cell = absCell(seat, mv.to);
      if (!LUDO_SAFE.has(cell)) {
        for (let s = 0; s < 4; s++) {
          if (s === seat) continue;
          for (let t = 0; t < 4; t++) {
            const q = room.tokens[s][t];
            if (q >= 0 && q <= 50 && absCell(s, q) === cell) sc += 80;
          }
        }
      } else sc += 12;
    }
    if (mv.to >= 51) sc += 25;
    sc += mv.to * 0.4;
    if (sc > bestScore) { bestScore = sc; best = mv; }
  }
  return best || moves[0];
}

// ══════════════════════════════════════════════════════════════════════════
//  CONNECT 4
// ══════════════════════════════════════════════════════════════════════════

const C4_W = 7, C4_H = 6;
const fourRooms = new Map();

const c4Empty = () => Array.from({ length: C4_H }, () => Array(C4_W).fill(0));

function c4Drop(board, col, who) {
  for (let r = C4_H - 1; r >= 0; r--) {
    if (!board[r][col]) { board[r][col] = who; return r; }
  }
  return -1;
}

// Returns the four-in-a-row as cells so the page can draw a line through it.
function c4Win(board, who) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < C4_H; r++) for (let c = 0; c < C4_W; c++) {
    if (board[r][c] !== who) continue;
    for (const [dr, dc] of dirs) {
      const cells = [[r,c]];
      for (let k = 1; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= C4_H || cc < 0 || cc >= C4_W || board[rr][cc] !== who) break;
        cells.push([rr, cc]);
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

const c4Full = b => b[0].every(v => v);
const c4Cols = b => { const o = []; for (let c = 0; c < C4_W; c++) if (!b[0][c]) o.push(c); return o; };

function c4Score(board, me) {
  const you = me === 1 ? 2 : 1;
  const runs = (who) => {
    let s = 0;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < C4_H; r++) for (let c = 0; c < C4_W; c++) for (const [dr,dc] of dirs) {
      const er = r + dr*3, ec = c + dc*3;
      if (er < 0 || er >= C4_H || ec < 0 || ec >= C4_W) continue;
      let mine = 0, theirs = 0;
      for (let k = 0; k < 4; k++) {
        const v = board[r+dr*k][c+dc*k];
        if (v === who) mine++; else if (v) theirs++;
      }
      if (theirs) continue;
      s += mine === 3 ? 40 : mine === 2 ? 8 : mine === 1 ? 1 : 0;
    }
    return s;
  };
  return runs(me) - runs(you);
}

function c4Best(board, me, depth) {
  const you = me === 1 ? 2 : 1;
  const search = (b, d, turn, alpha, beta) => {
    if (c4Win(b, me)) return { score: 100000 - (6 - d) };
    if (c4Win(b, you)) return { score: -100000 + (6 - d) };
    const cols = c4Cols(b);
    if (!cols.length || d === 0) return { score: c4Score(b, me) };
    let bestCol = cols[Math.floor(cols.length / 2)];
    if (turn === me) {
      let best = -Infinity;
      for (const c of cols) {
        const nb = b.map(r => r.slice());
        c4Drop(nb, c, me);
        const s = search(nb, d - 1, you, alpha, beta).score;
        if (s > best) { best = s; bestCol = c; }
        alpha = Math.max(alpha, s);
        if (alpha >= beta) break;
      }
      return { score: best, col: bestCol };
    }
    let best = Infinity;
    for (const c of cols) {
      const nb = b.map(r => r.slice());
      c4Drop(nb, c, you);
      const s = search(nb, d - 1, me, alpha, beta).score;
      if (s < best) { best = s; bestCol = c; }
      beta = Math.min(beta, s);
      if (alpha >= beta) break;
    }
    return { score: best, col: bestCol };
  };
  const r = search(board, depth, me, -Infinity, Infinity);
  return r.col != null ? r.col : pick(c4Cols(board));
}

// ══════════════════════════════════════════════════════════════════════════
//  8-BALL POOL
// ══════════════════════════════════════════════════════════════════════════
//
// The physics runs HERE, on the server, not in the browser. When you shoot,
// the whole shot is simulated in one go at a fixed timestep and the result is
// sent down as a list of keyframes for the page to animate. That is what makes
// two phones (or a phone and the bot) always agree about where every ball is —
// there is exactly one copy of the truth.
//
// The rules are the friendly kitchen-table version: solids and stripes are
// claimed by the first ball potted, pot all of yours and then the 8 to win,
// potting the cue ball gives your opponent ball-in-hand, and potting the 8
// early loses on the spot. No called pockets, no push-out rules — nobody at
// the kitchen table uses them either.

const POOL_W = 1000, POOL_H = 500;          // table space; pages scale to fit
// chunkier balls and slightly kinder pockets — the table reads better on a
// phone this way, and potting stops feeling like threading a needle
const BALL_R = 16, POCKET_R = 30;
const FRICTION = 0.988, STOP = 0.06, MAX_POWER = 26;
const POCKETS = [
  [22, 22], [POOL_W / 2, 14], [POOL_W - 22, 22],
  [22, POOL_H - 22], [POOL_W / 2, POOL_H - 14], [POOL_W - 22, POOL_H - 22]
];

const poolRooms = new Map();

function poolRack() {
  // Cue on the left, the triangle on the right, 8-ball in the middle of it.
  const balls = [{ n: 0, x: POOL_W * 0.25, y: POOL_H / 2, vx: 0, vy: 0, in: false }];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let i = 0;
  const sx = POOL_W * 0.72, gap = BALL_R * 2 + 1;
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= col; row++) {
      balls.push({
        n: order[i++],
        x: sx + col * gap * 0.87,
        y: POOL_H / 2 + (row - col / 2) * gap,
        vx: 0, vy: 0, in: false
      });
    }
  }
  return balls;
}

// One complete shot, from strike to standstill. Returns keyframes for the
// animation plus everything the rules need to know about what happened.
function poolSim(balls, angle, power) {
  const bs = balls.map(b => ({ ...b }));
  const cue = bs.find(b => b.n === 0);
  if (!cue || cue.in) return null;
  const pw = Math.min(MAX_POWER, Math.max(2, power));
  cue.vx = Math.cos(angle) * pw;
  cue.vy = Math.sin(angle) * pw;

  const frames = [];
  const potted = [];
  let firstHit = null;
  const snap = () => frames.push(bs.filter(b => !b.in).map(b => [b.n, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]));

  for (let step = 0; step < 2400; step++) {
    let moving = false;
    for (const b of bs) {
      if (b.in) continue;
      b.x += b.vx; b.y += b.vy;
      b.vx *= FRICTION; b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP) b.vx = 0;
      if (Math.abs(b.vy) < STOP) b.vy = 0;
      if (b.vx || b.vy) moving = true;

      // cushions
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx * 0.92; }
      if (b.x > POOL_W - BALL_R) { b.x = POOL_W - BALL_R; b.vx = -b.vx * 0.92; }
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy * 0.92; }
      if (b.y > POOL_H - BALL_R) { b.y = POOL_H - BALL_R; b.vy = -b.vy * 0.92; }

      // pockets
      for (const [px, py] of POCKETS) {
        const dx = b.x - px, dy = b.y - py;
        if (dx * dx + dy * dy < POCKET_R * POCKET_R) {
          b.in = true; b.vx = 0; b.vy = 0;
          potted.push(b.n);
          break;
        }
      }
    }

    // ball-to-ball collisions, elastic and equal-mass — which for pool is true
    // enough that nobody will ever notice the simplification.
    for (let i2 = 0; i2 < bs.length; i2++) for (let j = i2 + 1; j < bs.length; j++) {
      const a = bs[i2], b = bs[j];
      if (a.in || b.in) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy, min = BALL_R * 2;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      if (firstHit == null && (a.n === 0 || b.n === 0)) firstHit = a.n === 0 ? b.n : a.n;
      const overlap = (min - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (dv > 0) {
        a.vx -= dv * nx; a.vy -= dv * ny;
        b.vx += dv * nx; b.vy += dv * ny;
      }
    }

    if (step % 3 === 0) snap();
    if (!moving) break;
  }
  snap();
  return { frames, potted, firstHit, balls: bs };
}

const poolGroup = n => (n >= 1 && n <= 7) ? 'solid' : (n >= 9 && n <= 15) ? 'stripe' : null;

function poolRemaining(balls, group) {
  return balls.filter(b => !b.in && poolGroup(b.n) === group).length;
}

// The bot lines up on a legal target ball and samples a fan of angles around
// the direct line, keeping whichever simulated shot pots the most of its own
// without scratching. Sampling real simulations instead of doing geometry
// makes it look uncannily human — including the occasional total miss.
function poolBotShot(room) {
  const balls = room.balls;
  const cue = balls.find(b => b.n === 0);
  const mine = room.groups[room.turn - 1];
  let targets = balls.filter(b => !b.in && b.n !== 0 && (mine ? poolGroup(b.n) === mine : b.n !== 8));
  if (!targets.length) targets = balls.filter(b => !b.in && b.n === 8);
  if (!targets.length) return { angle: 0, power: 10 };

  let best = null, bestScore = -1e9;
  for (const t of targets) {
    const base = Math.atan2(t.y - cue.y, t.x - cue.x);
    for (let off = -0.18; off <= 0.18; off += 0.045) {
      for (const pw of [12, 18, 24]) {
        const r = poolSim(balls, base + off, pw);
        if (!r) continue;
        let sc = 0;
        for (const n of r.potted) {
          if (n === 0) sc -= 120;
          else if (n === 8) sc += (mine && poolRemaining(balls, mine) === 0) ? 500 : -400;
          else if (mine && poolGroup(n) === mine) sc += 100;
          else if (!mine) sc += 60;
          else sc -= 40;
        }
        if (r.firstHit == null) sc -= 50;                 // air shot
        sc += Math.random() * 6;                          // don't be a robot about ties
        if (sc > bestScore) { bestScore = sc; best = { angle: base + off, power: pw }; }
      }
    }
  }
  return best || { angle: Math.atan2(targets[0].y - cue.y, targets[0].x - cue.x), power: 14 };
}

// ══════════════════════════════════════════════════════════════════════════

function mount(app, io, opts) {
  const options = opts || {};
  const identify = typeof options.identify === 'function' ? options.identify : null;

  const page = (route, file) => app.get(route, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', file));
  });

  page('/games', 'games.html');
  page('/ludo', 'ludo.html');
  page('/four', 'four.html');
  page('/pool', 'pool.html');

  const peek = (table) => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = table.get(String(req.params.code || '').trim().toUpperCase());
    if (!r) return res.json({ exists: false });
    const humans = [...r.players.values()].filter(p => !p.bot);
    res.json({
      exists: true,
      state: r.state,
      full: humans.length >= r.cap,
      host: humans.length ? humans[0].name : null,
      count: humans.length
    });
  };
  // A room born empty, over plain HTTP. This is what the chat's game picker
  // uses: it needs a code to put in the message BEFORE anyone has opened the
  // game page. Whoever arrives first takes the first seat and becomes host.
  const born = (maker, table) => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = makeCode(table);
    table.set(code, maker(code));
    res.json({ code });
  };
  app.post('/api/ludo/new', born(code => ({
    code, cap: 4, state: 'lobby',
    players: new Map(), seatOrder: [null, null, null, null],
    tokens: [[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]],
    turn: 0, dice: 0, rolled: false, moves: [], last: null,
    sixes: 0, winner: null, order: [], hostId: null, touched: Date.now()
  }), ludoRooms));
  app.post('/api/four/new', born(code => ({
    code, cap: 2, state: 'lobby',
    players: new Map(), seatOrder: [null, null],
    board: c4Empty(), turn: 1, winner: null, line: null, lastCol: null,
    scores: [0, 0], depth: 5, hostId: null, touched: Date.now()
  }), fourRooms));
  app.post('/api/pool/new', born(code => ({
    code, cap: 2, state: 'lobby',
    players: new Map(), seatOrder: [null, null],
    balls: poolRack(), turn: 1, groups: [null, null],
    winner: null, why: null, ballInHand: 0, scores: [0, 0],
    hostId: null, touched: Date.now()
  }), poolRooms));

  app.get('/api/ludo/:code', peek(ludoRooms));
  app.get('/api/four/:code', peek(fourRooms));
  app.get('/api/pool/:code', peek(poolRooms));

  // ── Watching ─────────────────────────────────────────────────────────────
  // A spectator is a socket that joined the room's channel but never took a
  // seat. That distinction is the entire security model: every action handler
  // in this file opens with `if (!room) return`, and a watcher's `room` stays
  // null forever, so there is no path from watching to acting even if the page
  // is lying about what it is. The client-side lock is manners; this is the
  // lock. `W` is a holder rather than a plain variable only so the shared
  // helper can write into each connection's own closure.
  const spectate = (socket, table, pub, broad, W, seated) => {
    socket.on('watch', async (data) => {
      if (W.r || seated()) return;
      const r = table.get(String((data && data.code) || '').trim().toUpperCase());
      if (!r) { socket.emit('err', { msg: 'That game has already finished.' }); return; }
      // Know who's looking before we list them: wait for the identity lookup,
      // then re-check — the socket may have taken a seat while we waited.
      await socket.ready;
      if (W.r || seated()) return;
      const p = socket.profile;
      (r.watchers || (r.watchers = new Map()))
        .set(socket.id, p && p.uid ? { uid: p.uid, name: p.name, photo: p.photo } : null);
      W.r = r;
      socket.join(r.code);
      socket.emit('watching', { code: r.code });
      socket.emit('state', pub(r));
      broad(r);                       // the players watch the eye count go up
    });
    // Being watched should never be a secret, and asking for a seat should
    // never be a shove: this just taps the players on the shoulder.
    socket.on('knock', () => {
      const r = W.r;
      if (!r) return;
      const now = Date.now();
      if (now - (r.lastKnock || 0) < 8000) return;
      r.lastKnock = now;
      const prof = socket.profile;
      socket.to(r.code).emit('knock', {
        name: safeName((prof && prof.name) || 'Someone'),
        photo: (prof && prof.photo) || null
      });
    });
    socket.on('leaveWatch', () => {
      const r = W.r; if (!r) return;
      W.r = null;
      socket.leave(r.code);
      if (r.watchers) { r.watchers.delete(socket.id); broad(r); }
    });
    socket.on('disconnect', () => {
      const r = W.r; if (!r) return;
      W.r = null;
      if (r.watchers) { r.watchers.delete(socket.id); broad(r); }
    });
  };
  const eyes = (r) => (r.watchers ? r.watchers.size : 0);
  // Who those eyes belong to. Signed-in watchers show as themselves so the
  // players can follow them back; everyone else is just an anonymous spy.
  const crowd = (r) => (r.watchers
    ? [...r.watchers.values()].map(w => (w && w.uid ? { uid: w.uid, name: w.name, photo: w.photo } : null))
    : []);

  // Identity is borrowed, not reimplemented: signed-in players get seated
  // under their own name and photo, guests type a name and play anyway.
  const attach = (socket) => {
    socket.profile = null;
    socket.ready = identify
      ? identify(socket).then(p => { socket.profile = p || null; }).catch(() => { socket.profile = null; })
      : Promise.resolve();
  };

  // ── Ludo ────────────────────────────────────────────────────────────────
  const lnsp = io.of('/ludo');

  function ludoPublic(r) {
    return {
      code: r.code, state: r.state, cap: r.cap,
      seats: r.seatOrder.map((id, i) => {
        const p = id ? r.players.get(id) : null;
        return {
          seat: i, color: LUDO_COLORS[i], label: LUDO_LABELS[i],
          id: id || null,
          name: p ? p.name : null,
          photo: p ? (p.photo || null) : null,
          bot: p ? !!p.bot : false,
          connected: p ? !!p.connected : false,
          home: r.tokens[i].filter(v => v === 56).length
        };
      }),
      tokens: r.tokens,
      turn: r.turn, dice: r.dice, rolled: r.rolled,
      moves: r.moves, last: r.last, winner: r.winner,
      order: r.order, hostId: r.hostId, watchers: eyes(r), crowd: crowd(r)
    };
  }

  const lbroad = (r) => { r.touched = Date.now(); lnsp.to(r.code).emit('state', ludoPublic(r)); };

  const ludoSeatOf = (r, id) => r.seatOrder.indexOf(id);
  const ludoLive = (r) => r.seatOrder.filter(Boolean).length;

  function ludoNextTurn(r) {
    r.rolled = false; r.dice = 0; r.moves = []; r.sixes = 0;
    for (let i = 1; i <= 4; i++) {
      const s = (r.turn + i) % 4;
      if (r.seatOrder[s]) { r.turn = s; break; }
    }
    ludoMaybeBot(r);
  }

  // Bots take their turn on a timer so you can see what happened rather than
  // the board teleporting between your goes.
  function ludoMaybeBot(r) {
    const id = r.seatOrder[r.turn];
    const p = id && r.players.get(id);
    if (!p || !p.bot || r.state !== 'playing') return;
    clearTimeout(r.botT);
    r.botT = setTimeout(() => {
      if (r.state !== 'playing' || r.seatOrder[r.turn] !== id) return;
      const dice = d6();
      r.dice = dice; r.rolled = true;
      const moves = ludoMoves(r, r.turn, dice);
      r.moves = moves;
      lbroad(r);
      setTimeout(() => {
        if (r.state !== 'playing' || r.seatOrder[r.turn] !== id) return;
        if (!moves.length) {
          r.last = { seat: r.turn, dice, none: true };
          ludoNextTurn(r); lbroad(r); return;
        }
        const mv = ludoBotChoice(r, r.turn, dice, moves);
        const res = ludoApply(r, r.turn, mv, dice);
        r.last = { seat: r.turn, dice, token: mv.token, captured: res.events.captured, finished: res.events.finished };
        if (ludoWon(r, r.turn)) {
          r.order.push(r.turn);
          if (r.order.length >= Math.max(1, ludoLive(r) - 1)) { r.state = 'over'; r.winner = r.order[0]; }
        }
        if (r.state === 'playing') {
          if (res.again && dice === 6) r.sixes++; else r.sixes = 0;
          if (res.again && r.sixes < 3) { r.rolled = false; r.dice = 0; r.moves = []; ludoMaybeBot(r); }
          else ludoNextTurn(r);
        }
        lbroad(r);
      }, 850);
    }, 900);
  }

  lnsp.on('connection', (socket) => {
    attach(socket);
    let room = null;
    const fail = m => socket.emit('err', { msg: m });
    const W = { r: null };
    spectate(socket, ludoRooms, ludoPublic, lbroad, W, () => room);

    const seat = (r, name, seatIdx) => {
      const prof = socket.profile;
      r.players.set(socket.id, {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        bot: false, connected: true
      });
      r.seatOrder[seatIdx] = socket.id;
      if (!r.hostId) r.hostId = socket.id;
      room = r;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id, seat: seatIdx });
      lbroad(r);
    };

    // The lobby asks for this every few seconds. The room already broadcasts on
    // every join, but a slept phone or a dropped socket can miss that push, so
    // this is the belt to the braces: whoever is sat down gets the truth back.
    socket.on('sync', () => {
      if (room) socket.emit('state', ludoPublic(room));
      else if (W.r) socket.emit('state', ludoPublic(W.r));
    });

    socket.on('create', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const cap = Math.min(4, Math.max(2, parseInt((data && data.cap) || 4, 10) || 4));
      const code = makeCode(ludoRooms);
      const r = {
        code, cap, state: 'lobby',
        players: new Map(), seatOrder: [null, null, null, null],
        tokens: [[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]],
        turn: 0, dice: 0, rolled: false, moves: [], last: null,
        sixes: 0, winner: null, order: [], hostId: null, touched: Date.now()
      };
      ludoRooms.set(code, r);
      seat(r, data && data.name, 0);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = ludoRooms.get(code);
      if (!r) { fail('No game with that code. It may have finished.'); return ack && ack({ error: 'gone' }); }
      if (r.state !== 'lobby') { fail('That game has already started.'); return ack && ack({ error: 'started' }); }
      let idx = -1;
      for (let i = 0; i < r.cap; i++) if (!r.seatOrder[i]) { idx = i; break; }
      if (idx < 0) { fail('That game is full.'); return ack && ack({ error: 'full' }); }
      seat(r, data && data.name, idx);
      if (typeof ack === 'function') ack({ code });
    });

    // Bots fill the empty seats, which is the whole reason one person on their
    // own can still play a real four-way game of Ludo.
    socket.on('addBot', () => {
      if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
      let idx = -1;
      for (let i = 0; i < room.cap; i++) if (!room.seatOrder[i]) { idx = i; break; }
      if (idx < 0) return fail('Every seat is taken.');
      const taken = [...room.players.values()].map(p => p.name);
      const name = BOT_NAMES.find(n => !taken.includes(n)) || ('Bot ' + (idx + 1));
      const id = 'bot:' + idx + ':' + Math.random().toString(36).slice(2, 7);
      room.players.set(id, { id, name, photo: null, bot: true, connected: true });
      room.seatOrder[idx] = id;
      lbroad(room);
    });

    socket.on('kickBot', (data) => {
      if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
      const i = parseInt((data && data.seat), 10);
      const id = room.seatOrder[i];
      const p = id && room.players.get(id);
      if (!p || !p.bot) return;
      room.players.delete(id);
      room.seatOrder[i] = null;
      lbroad(room);
    });

    socket.on('start', () => {
      if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
      if (ludoLive(room) < 2) return fail('Ludo needs at least two players — share the code and the seat will fill in here.');
      room.state = 'playing';
      room.turn = room.seatOrder.findIndex(Boolean);
      room.rolled = false; room.dice = 0; room.moves = []; room.sixes = 0;
      lbroad(room);
      ludoMaybeBot(room);
    });

    socket.on('roll', () => {
      if (!room || room.state !== 'playing') return;
      if (room.seatOrder[room.turn] !== socket.id) return;
      if (room.rolled) return;
      const dice = d6();
      room.dice = dice; room.rolled = true;
      room.moves = ludoMoves(room, room.turn, dice);
      // Nothing you can do with it — say so, then move on.
      if (!room.moves.length) {
        room.last = { seat: room.turn, dice, none: true };
        lbroad(room);
        setTimeout(() => {
          if (room && room.state === 'playing' && room.rolled && !room.moves.length) {
            ludoNextTurn(room); lbroad(room);
          }
        }, 1100);
        return;
      }
      lbroad(room);
    });

    socket.on('move', (data) => {
      if (!room || room.state !== 'playing') return;
      if (room.seatOrder[room.turn] !== socket.id) return;
      if (!room.rolled) return fail('Roll first.');
      const t = parseInt((data && data.token), 10);
      const mv = room.moves.find(m => m.token === t);
      if (!mv) return fail('That token cannot move that many.');

      const dice = room.dice;
      const res = ludoApply(room, room.turn, mv, dice);
      room.last = { seat: room.turn, dice, token: mv.token, captured: res.events.captured, finished: res.events.finished };

      if (ludoWon(room, room.turn)) {
        room.order.push(room.turn);
        if (room.order.length >= Math.max(1, ludoLive(room) - 1)) { room.state = 'over'; room.winner = room.order[0]; }
      }
      if (room.state === 'playing') {
        if (res.again && dice === 6) room.sixes++; else room.sixes = 0;
        // Three sixes in a row and the turn is forfeited — otherwise a lucky
        // streak never ends and everyone else just watches.
        if (res.again && room.sixes < 3) { room.rolled = false; room.dice = 0; room.moves = []; }
        else ludoNextTurn(room);
      }
      lbroad(room);
    });

    socket.on('rematch', () => {
      if (!room || room.state !== 'over') return;
      room.state = 'playing';
      room.tokens = [[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]];
      room.turn = room.seatOrder.findIndex(Boolean);
      room.dice = 0; room.rolled = false; room.moves = [];
      room.last = null; room.sixes = 0; room.winner = null; room.order = [];
      lbroad(room);
      ludoMaybeBot(room);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      lbroad(r);
      setTimeout(() => {
        const cur = r.players.get(socket.id);
        if (!cur || cur.connected) return;
        const s = ludoSeatOf(r, socket.id);
        r.players.delete(socket.id);
        if (s >= 0) r.seatOrder[s] = null;
        if (r.hostId === socket.id) {
          r.hostId = [...r.players.values()].filter(x => !x.bot).map(x => x.id)[0] || null;
        }
        const humans = [...r.players.values()].filter(x => !x.bot).length;
        if (!humans) { clearTimeout(r.botT); ludoRooms.delete(r.code); return; }
        // Someone left mid-game: hand their colour to a bot rather than
        // stranding everyone else on a turn that will never come.
        if (r.state === 'playing' && s >= 0) {
          const id = 'bot:' + s + ':' + Math.random().toString(36).slice(2, 7);
          r.players.set(id, { id, name: pick(BOT_NAMES), photo: null, bot: true, connected: true });
          r.seatOrder[s] = id;
          if (r.turn === s) ludoMaybeBot(r);
        }
        lbroad(r);
      }, 45000);
    });
  });

  // ── Connect 4 ───────────────────────────────────────────────────────────
  const fnsp = io.of('/four');

  function fourPublic(r) {
    return {
      code: r.code, state: r.state,
      board: r.board, turn: r.turn, winner: r.winner, line: r.line,
      lastCol: r.lastCol, scores: r.scores,
      seats: r.seatOrder.map((id, i) => {
        const p = id ? r.players.get(id) : null;
        return { seat: i, id: id || null, name: p ? p.name : null, photo: p ? (p.photo || null) : null, bot: p ? !!p.bot : false, connected: p ? !!p.connected : false };
      }),
      hostId: r.hostId, watchers: eyes(r), crowd: crowd(r)
    };
  }
  const fbroad = (r) => { r.touched = Date.now(); fnsp.to(r.code).emit('state', fourPublic(r)); };

  function fourFinish(r, who, line) {
    r.state = 'over'; r.winner = who; r.line = line || null;
    if (who) r.scores[who - 1]++;
  }

  function fourBotGo(r) {
    const id = r.seatOrder[r.turn - 1];
    const p = id && r.players.get(id);
    if (!p || !p.bot || r.state !== 'playing') return;
    clearTimeout(r.botT);
    r.botT = setTimeout(() => {
      if (r.state !== 'playing' || r.seatOrder[r.turn - 1] !== id) return;
      const col = c4Best(r.board, r.turn, r.depth);
      if (col == null) return;
      c4Drop(r.board, col, r.turn);
      r.lastCol = col;
      const line = c4Win(r.board, r.turn);
      if (line) fourFinish(r, r.turn, line);
      else if (c4Full(r.board)) fourFinish(r, 0, null);
      else r.turn = r.turn === 1 ? 2 : 1;
      fbroad(r);
    }, 700);
  }

  fnsp.on('connection', (socket) => {
    attach(socket);
    let room = null;
    const fail = m => socket.emit('err', { msg: m });
    const W = { r: null };
    spectate(socket, fourRooms, fourPublic, fbroad, W, () => room);
    socket.on('sync', () => {
      if (room) socket.emit('state', fourPublic(room));
      else if (W.r) socket.emit('state', fourPublic(W.r));
    });

    const seat = (r, name, idx) => {
      const prof = socket.profile;
      r.players.set(socket.id, {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        bot: false, connected: true
      });
      r.seatOrder[idx] = socket.id;
      if (!r.hostId) r.hostId = socket.id;
      room = r;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id, seat: idx });
      fbroad(r);
    };

    socket.on('create', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = makeCode(fourRooms);
      const r = {
        code, cap: 2, state: 'lobby',
        players: new Map(), seatOrder: [null, null],
        board: c4Empty(), turn: 1, winner: null, line: null, lastCol: null,
        scores: [0, 0], depth: 5, hostId: null, touched: Date.now()
      };
      fourRooms.set(code, r);
      seat(r, data && data.name, 0);
      if (typeof ack === 'function') ack({ code });
    });

    // Playing on your own is the default way most people will open this, so
    // it is one tap: the bot takes the other seat and the game starts.
    socket.on('addBot', (data) => {
      if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
      if (room.seatOrder[1]) return;
      const lvl = String((data && data.level) || 'normal');
      room.depth = lvl === 'easy' ? 1 : lvl === 'hard' ? 6 : 4;
      const id = 'bot:' + Math.random().toString(36).slice(2, 7);
      room.players.set(id, { id, name: pick(BOT_NAMES), photo: null, bot: true, connected: true });
      room.seatOrder[1] = id;
      room.state = 'playing'; room.turn = 1;
      fbroad(room);
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = fourRooms.get(code);
      if (!r) { fail('No game with that code. It may have finished.'); return ack && ack({ error: 'gone' }); }
      const idx = r.seatOrder[0] ? (r.seatOrder[1] ? -1 : 1) : 0;   // first free seat
      if (idx < 0) { fail('That game already has two players.'); return ack && ack({ error: 'full' }); }
      seat(r, data && data.name, idx);
      if (r.seatOrder[0] && r.seatOrder[1]) { r.state = 'playing'; r.turn = 1; }
      fbroad(r);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('drop', (data) => {
      if (!room || room.state !== 'playing') return;
      const idx = room.seatOrder.indexOf(socket.id);
      if (idx < 0 || idx + 1 !== room.turn) return;
      const col = parseInt((data && data.col), 10);
      if (!(col >= 0 && col < C4_W)) return;
      if (room.board[0][col]) return fail('That column is full.');
      c4Drop(room.board, col, room.turn);
      room.lastCol = col;
      const line = c4Win(room.board, room.turn);
      if (line) fourFinish(room, room.turn, line);
      else if (c4Full(room.board)) fourFinish(room, 0, null);
      else room.turn = room.turn === 1 ? 2 : 1;
      fbroad(room);
      fourBotGo(room);
    });

    socket.on('rematch', () => {
      if (!room || room.state !== 'over') return;
      room.board = c4Empty();
      room.winner = null; room.line = null; room.lastCol = null;
      // Loser goes first, which keeps a run of games from being one-sided.
      room.turn = room.winner === 2 ? 2 : 1;
      room.state = 'playing';
      fbroad(room);
      fourBotGo(room);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      fbroad(r);
      setTimeout(() => {
        const cur = r.players.get(socket.id);
        if (!cur || cur.connected) return;
        const s = r.seatOrder.indexOf(socket.id);
        r.players.delete(socket.id);
        if (s >= 0) r.seatOrder[s] = null;
        const humans = [...r.players.values()].filter(x => !x.bot).length;
        if (!humans) { clearTimeout(r.botT); fourRooms.delete(r.code); return; }
        if (r.hostId === socket.id) r.hostId = [...r.players.values()].filter(x => !x.bot)[0].id;
        if (r.state === 'playing') r.state = 'lobby';
        fbroad(r);
      }, 45000);
    });
  });

  // ── 8-ball ──────────────────────────────────────────────────────────────
  const pnsp = io.of('/pool');

  function poolPublic(r) {
    // Per-player ball-count so the client can render "3 solids left". Balls
    // start at 7 apiece; ANY = balls still on the table for players whose
    // group hasn't been claimed yet (they see the pot count via seven-minus).
    const left = [
      r.groups[0] ? poolRemaining(r.balls, r.groups[0]) : null,
      r.groups[1] ? poolRemaining(r.balls, r.groups[1]) : null
    ];
    const potted = [
      r.groups[0] ? 7 - left[0] : r.balls.filter(b => b.in && poolGroup(b.n) === 'solid').length,
      r.groups[1] ? 7 - left[1] : r.balls.filter(b => b.in && poolGroup(b.n) === 'stripe').length
    ];
    return {
      code: r.code, state: r.state,
      balls: r.balls.map(b => ({ n: b.n, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, in: b.in })),
      turn: r.turn, groups: r.groups, winner: r.winner, why: r.why,
      ballInHand: r.ballInHand, scores: r.scores,
      left, potted,
      seats: r.seatOrder.map((id, i) => {
        const p = id ? r.players.get(id) : null;
        return { seat: i, id: id || null, name: p ? p.name : null, photo: p ? (p.photo || null) : null, bot: p ? !!p.bot : false, connected: p ? !!p.connected : false };
      }),
      hostId: r.hostId, watchers: eyes(r), crowd: crowd(r)
    };
  }
  const pbroad = (r) => { r.touched = Date.now(); pnsp.to(r.code).emit('state', poolPublic(r)); };

  // Apply the rules to what the simulation said happened.
  function poolResolve(r, res) {
    r.balls = res.balls;
    const me = r.turn, other = me === 1 ? 2 : 1;
    const mine = r.groups[me - 1];
    const scratched = res.potted.includes(0);
    const eight = res.potted.includes(8);
    const cue = r.balls.find(b => b.n === 0);

    if (eight) {
      // The 8 decides the game, one way or the other.
      const cleared = mine && poolRemaining(r.balls, mine) === 0;
      r.state = 'over';
      r.winner = (cleared && !scratched) ? me : other;
      r.why = (cleared && !scratched)
        ? 'potted the 8-ball to finish'
        : (scratched ? 'potted the 8 and the cue together' : 'sank the 8-ball too early');
      r.scores[r.winner - 1]++;
      return;
    }

    // First pot of the game claims a group.
    if (!r.groups[0] && !r.groups[1]) {
      const first = res.potted.find(n => n !== 0 && n !== 8);
      if (first) {
        const g = poolGroup(first);
        r.groups[me - 1] = g;
        r.groups[other - 1] = g === 'solid' ? 'stripe' : 'solid';
      }
    }

    if (scratched) {
      cue.in = false; cue.vx = 0; cue.vy = 0;
      cue.x = POOL_W * 0.25; cue.y = POOL_H / 2;
      r.ballInHand = other;                                 // they may drag it before shooting
      r.turn = other;
      return;
    }

    // Potting one of your own keeps the table; anything else hands it over.
    const keep = res.potted.some(n => n !== 0 && n !== 8 && (!mine || poolGroup(n) === mine));
    r.ballInHand = 0;
    if (!keep) r.turn = other;
  }

  function poolBotGo(r) {
    const id = r.seatOrder[r.turn - 1];
    const p = id && r.players.get(id);
    if (!p || !p.bot || r.state !== 'playing') return;
    clearTimeout(r.botT);
    r.botT = setTimeout(() => {
      if (r.state !== 'playing' || r.seatOrder[r.turn - 1] !== id) return;
      const shot = poolBotShot(r);
      const res = poolSim(r.balls, shot.angle, shot.power);
      if (!res) return poolRecoverAndHandOff(r, 'The cue got stuck — resetting.');
      poolResolve(r, res);
      pnsp.to(r.code).emit('shot', { frames: res.frames, by: id });
      pbroad(r);
      if (r.state === 'playing') poolBotGo(r);
    }, 1400);
  }

  // Belt-and-braces recovery for when a shot cannot be resolved (bad cue state,
  // race with a disconnect, etc). Puts a fresh cue at the head spot, hands the
  // other seat ball-in-hand, tells everyone why, and — if the other seat is a
  // bot — kicks its next go so nothing sits idle.
  function poolRecoverAndHandOff(r, msg) {
    const cue = r.balls.find(b => b.n === 0);
    if (cue) { cue.in = false; cue.vx = 0; cue.vy = 0; cue.x = POOL_W * 0.25; cue.y = POOL_H / 2; }
    const other = r.turn === 1 ? 2 : 1;
    r.turn = other;
    r.ballInHand = other;
    pnsp.to(r.code).emit('err', { msg: msg || 'Shot fizzled — your turn.' });
    pbroad(r);
    if (r.state === 'playing') poolBotGo(r);
  }

  // If the player whose turn it is disappears (disconnects or is booted), the
  // game shouldn't just sit there. Move the turn to whoever else is at the
  // table so play continues. Called after any seat change.
  function poolTurnGuard(r) {
    if (!r || r.state !== 'playing') return;
    if (r.seatOrder[r.turn - 1]) return;
    const other = r.turn === 1 ? 2 : 1;
    if (r.seatOrder[other - 1]) {
      r.turn = other;
      r.ballInHand = other;                    // wronged player gets ball in hand
      pbroad(r);
      poolBotGo(r);
    }
  }

  pnsp.on('connection', (socket) => {
    attach(socket);
    let room = null;
    const fail = m => socket.emit('err', { msg: m });
    const W = { r: null };
    spectate(socket, poolRooms, poolPublic, pbroad, W, () => room);
    socket.on('sync', () => {
      if (room) socket.emit('state', poolPublic(room));
      else if (W.r) socket.emit('state', poolPublic(W.r));
    });

    const seat = (r, name, idx) => {
      const prof = socket.profile;
      r.players.set(socket.id, {
        id: socket.id,
        name: safeName((prof && prof.name) || name),
        photo: (prof && prof.photo) || null,
        bot: false, connected: true
      });
      r.seatOrder[idx] = socket.id;
      if (!r.hostId) r.hostId = socket.id;
      room = r;
      socket.join(r.code);
      socket.emit('seated', { code: r.code, you: socket.id, seat: idx });
      pbroad(r);
    };

    socket.on('create', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = makeCode(poolRooms);
      const r = {
        code, cap: 2, state: 'lobby',
        players: new Map(), seatOrder: [null, null],
        balls: poolRack(), turn: 1, groups: [null, null],
        winner: null, why: null, ballInHand: 0, scores: [0, 0],
        hostId: null, touched: Date.now()
      };
      poolRooms.set(code, r);
      seat(r, data && data.name, 0);
      if (typeof ack === 'function') ack({ code });
    });

    socket.on('addBot', () => {
      if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
      if (room.seatOrder[1]) return;
      const id = 'bot:' + Math.random().toString(36).slice(2, 7);
      room.players.set(id, { id, name: pick(BOT_NAMES), photo: null, bot: true, connected: true });
      room.seatOrder[1] = id;
      room.state = 'playing'; room.turn = 1;
      pbroad(room);
    });

    socket.on('join', async (data, ack) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = poolRooms.get(code);
      if (!r) { fail('No game with that code. It may have finished.'); return ack && ack({ error: 'gone' }); }
      const idx = r.seatOrder[0] ? (r.seatOrder[1] ? -1 : 1) : 0;   // first free seat
      if (idx < 0) { fail('That game already has two players.'); return ack && ack({ error: 'full' }); }
      seat(r, data && data.name, idx);
      if (r.seatOrder[0] && r.seatOrder[1]) { r.state = 'playing'; r.turn = 1; }
      pbroad(r);
      if (typeof ack === 'function') ack({ code });
    });

    // Ball in hand after a scratch: the wronged player may put the cue ball
    // where they like before they shoot.
    socket.on('place', (data) => {
      if (!room || room.state !== 'playing') return;
      const idx = room.seatOrder.indexOf(socket.id);
      if (idx < 0 || idx + 1 !== room.turn || room.ballInHand !== room.turn) return;
      const x = Math.min(POOL_W - BALL_R, Math.max(BALL_R, +((data && data.x)) || 0));
      const y = Math.min(POOL_H - BALL_R, Math.max(BALL_R, +((data && data.y)) || 0));
      const cue = room.balls.find(b => b.n === 0);
      // not on top of another ball
      for (const b of room.balls) {
        if (b.n === 0 || b.in) continue;
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < (BALL_R * 2) * (BALL_R * 2)) return fail('Not on top of another ball.');
      }
      cue.x = x; cue.y = y;
      pbroad(room);
    });

    socket.on('shoot', (data) => {
      if (!room || room.state !== 'playing') return;
      const idx = room.seatOrder.indexOf(socket.id);
      if (idx < 0 || idx + 1 !== room.turn) return;
      const angle = +((data && data.angle));
      const power = +((data && data.power));
      if (!isFinite(angle) || !isFinite(power)) return;
      const res = poolSim(room.balls, angle, power);
      // Historic bug: if the sim couldn't run (e.g. the cue was somehow marked
      // pocketed), we returned silently — the client never got a `shot` event,
      // the turn never advanced, and the game sat there until someone quit. Now
      // we recover: re-rack a fresh cue at the head spot, hand the other player
      // ball-in-hand, tell everyone what happened, and keep the room alive.
      if (!res) return poolRecoverAndHandOff(room, 'The cue got stuck — resetting.');
      poolResolve(room, res);
      pnsp.to(room.code).emit('shot', { frames: res.frames, by: socket.id });
      pbroad(room);
      if (room.state === 'playing') poolBotGo(room);
    });

    socket.on('rematch', () => {
      if (!room || room.state !== 'over') return;
      room.balls = poolRack();
      room.groups = [null, null]; room.winner = null; room.why = null;
      room.ballInHand = 0; room.turn = 1; room.state = 'playing';
      pbroad(room);
      poolBotGo(room);
    });

    // ── voice + emoji relays ────────────────────────────────────────────
    // The server never sees the audio: it only shuffles voice presence
    // between peers who are already in the same room. Emoji reactions are
    // broadcast the same way — thousands cheaper than any media pipeline.
    // Only seated players can publish (isPub true); watchers listen only.
    // Presence carries the CF session id + track names when mode=cloudflare,
    // and the socket id alone in the P2P fallback. Handles both.
    const inRoom = () => room || (W.r ? W.r : null);
    // The last presence each socket emitted, so we can replay it to
    // newcomers in the same room (i.e. "here's who's already on voice").
    const vPresence = pnsp._vPres || (pnsp._vPres = new Map());

    socket.on('v-join', (data) => {
      const r = inRoom(); if (!r) return;
      const seated = room && r.seatOrder.indexOf(socket.id) >= 0;
      const p = {
        id: socket.id,
        on: true,
        pub: !!seated,
        cfSession: (data && data.cfSession) || null,
        tracks: Array.isArray(data && data.tracks) ? data.tracks.slice(0, 4) : []
      };
      vPresence.set(socket.id, p);
      // Announce me to the room and reply to me with everyone else's presence.
      socket.to(r.code).emit('v-peer', p);
      const others = [];
      for (const sid of r.watchers ? [...r.watchers.keys()] : []) if (vPresence.has(sid) && sid !== socket.id) others.push(vPresence.get(sid));
      for (const sid of r.seatOrder) if (sid && vPresence.has(sid) && sid !== socket.id) others.push(vPresence.get(sid));
      socket.emit('v-roster', { peers: others });
    });
    // A publisher's set of track names may change after v-join (e.g. mic
    // toggled on after they joined voice). Broadcast the fresh list.
    socket.on('v-tracks', (data) => {
      const r = inRoom(); if (!r) return;
      const cur = vPresence.get(socket.id);
      if (!cur) return;
      cur.tracks = Array.isArray(data && data.tracks) ? data.tracks.slice(0, 4) : [];
      cur.cfSession = (data && data.cfSession) || cur.cfSession;
      socket.to(r.code).emit('v-peer', cur);
    });
    socket.on('v-leave', () => {
      const r = inRoom(); if (!r) return;
      vPresence.delete(socket.id);
      socket.to(r.code).emit('v-peer', { id: socket.id, on: false });
    });
    // Forward SDP / ICE to a specific peer in the same room. Verifies both
    // sockets share the room so a socket can't relay to arbitrary others.
    // Only used by the P2P fallback path — CF SFU sessions never need this.
    socket.on('v-signal', (data) => {
      const r = inRoom(); if (!r || !data || !data.to) return;
      const dst = pnsp.sockets.get(data.to);
      if (!dst || !dst.rooms.has(r.code)) return;
      dst.emit('v-signal', { from: socket.id, sdp: data.sdp || null, ice: data.ice || null });
    });
    socket.on('emoji', (data) => {
      const r = inRoom(); if (!r || !data || !data.e) return;
      // rate-limit: at most 6 emojis per socket per 3 seconds
      const now = Date.now();
      const bucket = (socket.emoBucket = socket.emoBucket || []);
      while (bucket.length && bucket[0] < now - 3000) bucket.shift();
      if (bucket.length >= 6) return;
      bucket.push(now);
      const e = String(data.e).slice(0, 8);
      pnsp.to(r.code).emit('emoji', { e, from: socket.id });
    });

    socket.on('disconnect', () => {
      // Tear down our voice presence unconditionally — even watchers.
      vPresence.delete(socket.id);
      if (!room) return;
      const r = room;
      const p = r.players.get(socket.id);
      if (p) p.connected = false;
      // Tell the rest of the room to tear down any peer connection to us.
      socket.to(r.code).emit('v-peer', { id: socket.id, on: false });
      pbroad(r);
      setTimeout(() => {
        const cur = r.players.get(socket.id);
        if (!cur || cur.connected) return;
        const s = r.seatOrder.indexOf(socket.id);
        r.players.delete(socket.id);
        if (s >= 0) r.seatOrder[s] = null;
        const humans = [...r.players.values()].filter(x => !x.bot).length;
        if (!humans) { clearTimeout(r.botT); poolRooms.delete(r.code); return; }
        if (r.hostId === socket.id) r.hostId = [...r.players.values()].filter(x => !x.bot)[0].id;
        // If the leaver's turn was up when they went, hand it to whoever is
        // still at the table so the remaining player isn't staring at a dead
        // game. Only tip the room back to lobby if nobody's sat opposite.
        if (r.state === 'playing') {
          if (r.seatOrder[0] && r.seatOrder[1]) poolTurnGuard(r);
          else r.state = 'lobby';
        }
        pbroad(r);
      }, 45000);
    });
  });

  // One sweeper for all three tables.
  setInterval(() => {
    const now = Date.now();
    for (const t of [ludoRooms, fourRooms, poolRooms]) {
      for (const [code, r] of t) {
        if (now - (r.touched || 0) > ROOM_TTL) { clearTimeout(r.botT); t.delete(code); }
      }
    }
  }, 1000 * 60 * 10).unref?.();

  // ── Live listing ─────────────────────────────────────────────────────────
  // What the Live tab reads. Rooms that are nothing but bots are left out —
  // "12 games in progress" means nothing if eleven of them are a computer
  // playing itself. Nothing here identifies anyone beyond the name and photo
  // they are already showing at the table.
  const sit = (seats) => seats.filter(s => s.name).map(s => ({
    name: s.name, photo: s.photo || null, bot: !!s.bot, connected: !!s.connected
  }));
  const named = (seats, i) => (seats[i] && seats[i].name) || 'Someone';

  function arcadeLive() {
    const out = [];

    for (const r of ludoRooms.values()) {
      const seats = ludoPublic(r).seats;
      // Grace: stay visible for 2 minutes after last touch even with nobody
      // currently connected, so a page-refresh or a solo host waiting for a
      // friend still shows up on the Live tab.
      const alive = seats.some(s => s.name && !s.bot && s.connected) ||
                    ((r.touched || 0) > Date.now() - 120000 && seats.some(s => s.name && !s.bot));
      if (!alive) continue;
      const front = seats.filter(s => s.name).slice().sort((a, b) => b.home - a.home)[0];
      out.push({
        game: 'ludo', icon: '🎲', title: 'Ludo', code: r.code, href: '/ludo?room=' + r.code, watchHref: '/ludo?watch=' + r.code,
        state: r.state, cap: r.cap, players: sit(seats),
        // seatOrder is always four long; a 2-player room only owns the first
        // two of them, so counting the whole array would advertise chairs
        // that don't exist.
        seatsFree: r.seatOrder.slice(0, r.cap).filter(x => !x).length,
        lead: r.winner != null && r.winner !== undefined && r.state === 'over'
          ? named(seats, r.winner) + ' won it'
          : (front && front.home ? front.name + ' leads — ' + front.home + '/4 home' : 'Nobody home yet'),
        turnName: r.state === 'playing' ? named(seats, r.turn) : null,
        watchers: eyes(r), since: r.touched || Date.now()
      });
    }

    for (const r of fourRooms.values()) {
      const seats = fourPublic(r).seats;
      // Grace: stay visible for 2 minutes after last touch even with nobody
      // currently connected, so a page-refresh or a solo host waiting for a
      // friend still shows up on the Live tab.
      const alive = seats.some(s => s.name && !s.bot && s.connected) ||
                    ((r.touched || 0) > Date.now() - 120000 && seats.some(s => s.name && !s.bot));
      if (!alive) continue;
      let down = 0;
      for (const row of r.board) for (const v of row) if (v) down++;
      const series = r.scores[0] || r.scores[1] ? r.scores[0] + '–' + r.scores[1] + ' in the series' : null;
      out.push({
        game: 'four', icon: '🔴', title: 'Connect 4', code: r.code, href: '/four?room=' + r.code, watchHref: '/four?watch=' + r.code,
        state: r.state, cap: 2, players: sit(seats),
        seatsFree: r.seatOrder.filter(x => !x).length,
        lead: r.state === 'over'
          ? (r.winner ? named(seats, r.winner - 1) + ' won it' : 'Drawn — board full')
          : (series || (down ? down + (down === 1 ? ' piece down' : ' pieces down') : 'Freshly racked')),
        turnName: r.state === 'playing' ? named(seats, r.turn - 1) : null,
        watchers: eyes(r), since: r.touched || Date.now()
      });
    }

    for (const r of poolRooms.values()) {
      const seats = poolPublic(r).seats;
      // Grace: stay visible for 2 minutes after last touch even with nobody
      // currently connected, so a page-refresh or a solo host waiting for a
      // friend still shows up on the Live tab.
      const alive = seats.some(s => s.name && !s.bot && s.connected) ||
                    ((r.touched || 0) > Date.now() - 120000 && seats.some(s => s.name && !s.bot));
      if (!alive) continue;
      let lead = 'Table open — no groups called yet';
      if (r.groups[0] && r.groups[1]) {
        const a = poolRemaining(r.balls, r.groups[0]), b = poolRemaining(r.balls, r.groups[1]);
        lead = a === b ? 'Level — ' + a + ' each'
          : (a < b ? named(seats, 0) + ' ahead — ' + a + ' left' : named(seats, 1) + ' ahead — ' + b + ' left');
      }
      if (r.state === 'over' && r.winner) lead = named(seats, r.winner - 1) + ' ' + (r.why || 'won');
      out.push({
        game: 'pool', icon: '🎱', title: '8-Ball Pool', code: r.code, href: '/pool?room=' + r.code, watchHref: '/pool?watch=' + r.code,
        state: r.state, cap: 2, players: sit(seats),
        seatsFree: r.seatOrder.filter(x => !x).length,
        lead,
        turnName: r.state === 'playing' ? named(seats, r.turn - 1) : null,
        watchers: eyes(r), since: r.touched || Date.now()
      });
    }

    return out;
  }

  console.log('arcade module: mounted (ludo, four, pool)');
  return { ludoRooms, fourRooms, poolRooms, live: arcadeLive };
}

module.exports = {
  mount,
  LUDO_TRACK, LUDO_STARTS, LUDO_HOME, LUDO_BASE, LUDO_SAFE, LUDO_COLORS, LUDO_LABELS,
  ludoMoves, ludoApply, ludoWon, c4Empty, c4Drop, c4Win, c4Best,
  poolRack, poolSim, poolGroup, poolRemaining
};
