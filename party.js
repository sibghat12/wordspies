// WordSpies Parties — audio rooms with speakers, listeners, chat, reactions.
//
// Concept (owner-designed):
//   · Someone starts a "party" — a persistent audio room.
//   · Public parties are listed on the Parties tab for anyone to join.
//     Private parties are only reachable by direct invite/link from the
//     host's follow-graph (Community wall + chat contacts).
//   · Anyone joins as a LISTENER by default. The host can promote a
//     listener to SPEAKER (mic on the room) or demote them back down.
//   · Speakers publish audio through Cloudflare Realtime SFU
//     (reuses /voice.js — same code path as the game rooms).
//   · Listeners can send AT MOST 2 text messages per party — a fun
//     rationing so a party doesn't get spammed but quiet folks can still
//     throw in a reaction or a question. Emoji reactions are unlimited.
//   · Room persists as long as the host is signed in and hasn't ended
//     it, 24 h idle otherwise.
//
// The socket protocol lives under /party (its own namespace) so it
// never trips on game-room state. REST endpoints live under
// /api/parties for the browser to list/create/inspect.

const crypto = require('crypto');

const CAP = 20;                          // max people per party
const MSG_MAX = 500;                     // text length cap
const LISTENER_MSG_LIMIT = 2;            // rationed chat for listeners
const IDLE_TTL_MS = 24 * 60 * 60 * 1000; // owner-owned rooms live 24 h idle
const RECENT_MSGS = 40;                  // history sent to newcomers

function makeCode() {
  // 4-char code — same shape as game rooms, so nothing looks alien.
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function makeUniqueCode(rooms) {
  let c; do { c = makeCode(); } while (rooms.has(c));
  return c;
}
const cleanText = (s, cap) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, cap);

function mount(app, io, options = {}) {
  const identify = typeof options.identify === 'function' ? options.identify : null;
  const nsp = io.of('/party');
  const rooms = new Map();     // code → room

  function publicView(r) {
    const now = Date.now();
    const members = [...r.members.values()].map(m => ({
      id: m.id, uid: m.uid || null, name: m.name, photo: m.photo || null,
      role: m.role, connected: !!m.connected, cfSession: m.cfSession || null,
      // How many of your 2 messages you've used (only sent back to yourself
      // via the personal `you` field below).
      msgsUsed: m.msgsUsed || 0
    }));
    return {
      code: r.code, title: r.title, subtitle: r.subtitle || '',
      visibility: r.visibility, hostUid: r.hostUid, hostId: r.hostId,
      createdAt: r.createdAt, touched: r.touched,
      cap: r.cap, count: r.members.size,
      members,
      messages: r.messages.slice(-RECENT_MSGS)
    };
  }

  function broadcast(r) {
    r.touched = Date.now();
    nsp.to(r.code).emit('state', publicView(r));
  }

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      if (now - r.touched > IDLE_TTL_MS) rooms.delete(code);
    }
  }, 10 * 60 * 1000).unref?.();

  // Reachable circle for private-party invites — anyone in follow / followers
  // / recent DM contacts. Delegated to the social module when present so we
  // stay in sync with its access rules.
  async function invitedCircle(hostUid) {
    try {
      if (!options.socialCircle) return null;
      return await options.socialCircle(hostUid);
    } catch (e) { return null; }
  }

  // ── REST: list + create + peek ─────────────────────────────────────
  const jsonBody = require('express').json({ limit: '4kb' });

  app.get('/api/parties', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const out = [];
    for (const r of rooms.values()) {
      // Only surface PUBLIC parties in the list — private ones require a
      // direct link or invite from a member of the host's circle.
      if (r.visibility !== 'public') continue;
      if (!r.members.size) continue;
      const speakers = [...r.members.values()].filter(m => m.role === 'speaker' || m.role === 'host');
      out.push({
        code: r.code, title: r.title, subtitle: r.subtitle || '',
        count: r.members.size, cap: r.cap,
        hostName: (r.members.get(r.hostId) || {}).name || null,
        hostPhoto: (r.members.get(r.hostId) || {}).photo || null,
        speakers: speakers.slice(0, 5).map(s => ({ name: s.name, photo: s.photo || null })),
        touched: r.touched
      });
    }
    out.sort((a, b) => b.count - a.count || b.touched - a.touched);
    res.json({ parties: out });
  });

  app.post('/api/parties', jsonBody, async (req, res) => {
    const uid = options.uidFromReq ? await options.uidFromReq(req) : null;
    if (!uid) return res.status(401).json({ error: 'Log in to host a party.' });
    const title    = cleanText((req.body || {}).title,    60) || 'Untitled party';
    const subtitle = cleanText((req.body || {}).subtitle, 120);
    const vis = ((req.body || {}).visibility === 'private') ? 'private' : 'public';
    const code = makeUniqueCode(rooms);
    const room = {
      code, title, subtitle, visibility: vis,
      hostUid: uid, hostId: null,
      cap: CAP,
      members: new Map(),       // socketId → { id, uid, name, photo, role, connected, msgsUsed, cfSession }
      messages: [],
      createdAt: Date.now(), touched: Date.now()
    };
    rooms.set(code, room);
    res.json({ code, room: publicView(room) });
  });

  app.get('/api/parties/:code', (req, res) => {
    const r = rooms.get(String(req.params.code || '').trim().toUpperCase());
    if (!r) return res.status(404).json({ error: 'No such party.' });
    // Private party: only return details if the caller is in the host's
    // circle (or the host themselves). Anyone with the link can still try
    // to join via socket, where we re-check on 'join'.
    res.json({ room: publicView(r) });
  });

  // ── Sockets ────────────────────────────────────────────────────────
  nsp.on('connection', (socket) => {
    socket.profile = null;
    socket.ready = identify
      ? identify(socket).then(p => { socket.profile = p || null; }).catch(() => { socket.profile = null; })
      : Promise.resolve();

    let room = null;
    let me = null;
    const fail = m => socket.emit('err', { msg: m });

    socket.on('sync', () => { if (room) socket.emit('state', publicView(room)); });

    socket.on('join', async (data) => {
      await socket.ready;
      if (room) return;
      const code = String((data && data.code) || '').trim().toUpperCase();
      const r = rooms.get(code);
      if (!r) return fail('That party has ended.');
      if (r.members.size >= r.cap) return fail('This party is full.');

      const prof = socket.profile;
      const uid = prof && prof.uid;
      // Private-party gate: only host + their circle may join.
      if (r.visibility === 'private' && uid !== r.hostUid) {
        const circle = await invitedCircle(r.hostUid);
        if (!circle || !circle.has(uid)) return fail('This is a private party — you need an invite.');
      }

      // Same account rejoining? Swap the existing seat onto this socket
      // so refreshes don't produce ghost members.
      if (uid) for (const [oldId, m] of r.members) {
        if (m.uid === uid) {
          const old = nsp.sockets.get(oldId);
          if (old) { old.emit('replaced'); old.leave(r.code); }
          r.members.delete(oldId);
          if (r.hostId === oldId) r.hostId = socket.id;
          break;
        }
      }

      // First to walk in? Whoever it is becomes the host if the recorded
      // hostUid matches — this handles the "creator joined after making
      // the room via REST" flow.
      const isHost = uid && uid === r.hostUid && !r.hostId;
      const member = {
        id: socket.id, uid: uid || null,
        name: (prof && prof.name) || cleanText((data && data.name), 20) || 'Guest',
        photo: (prof && prof.photo) || null,
        role: isHost ? 'host' : 'listener',
        connected: true, msgsUsed: 0,
        cfSession: (data && data.cfSession) || null
      };
      r.members.set(socket.id, member);
      if (isHost) r.hostId = socket.id;
      socket.join(r.code);
      room = r; me = member;
      socket.emit('joined', {
        code: r.code, you: socket.id, role: member.role,
        msgsLeft: LISTENER_MSG_LIMIT - member.msgsUsed
      });
      broadcast(r);
    });

    socket.on('leave', () => {
      if (!room) return;
      const r = room; room = null;
      r.members.delete(socket.id);
      socket.leave(r.code);
      broadcast(r);
    });

    // Host-only: raise a listener to speaker, or drop a speaker back.
    socket.on('promote', (data) => {
      if (!room || socket.id !== room.hostId) return;
      const target = room.members.get(String((data && data.id) || ''));
      if (!target || target.role === 'host') return;
      target.role = 'speaker';
      // On promotion, listener chat cap converts to unlimited (server also
      // stops rejecting their messages when role !== 'listener').
      broadcast(room);
    });
    socket.on('demote', (data) => {
      if (!room || socket.id !== room.hostId) return;
      const target = room.members.get(String((data && data.id) || ''));
      if (!target || target.role === 'host') return;
      target.role = 'listener';
      broadcast(room);
    });
    socket.on('kick', (data) => {
      if (!room || socket.id !== room.hostId) return;
      const id = String((data && data.id) || '');
      const target = room.members.get(id);
      if (!target || target.role === 'host') return;
      const s = nsp.sockets.get(id);
      if (s) { s.emit('kicked', { by: socket.id }); s.leave(room.code); }
      room.members.delete(id);
      broadcast(room);
    });
    // Host closes the entire party.
    socket.on('closeParty', () => {
      if (!room || socket.id !== room.hostId) return;
      const code = room.code;
      nsp.to(code).emit('closed');
      // Boot everyone from the room
      for (const [id] of room.members) {
        const s = nsp.sockets.get(id); if (s) s.leave(code);
      }
      rooms.delete(code);
      room = null;
    });

    // ── chat with the listener 2-message rule ──────────────────────
    socket.on('chat', (data) => {
      if (!room || !me) return;
      const text = cleanText((data && data.text), MSG_MAX);
      if (!text) return;
      if (me.role === 'listener') {
        if ((me.msgsUsed || 0) >= LISTENER_MSG_LIMIT) {
          return socket.emit('chatBlocked', {
            reason: 'You\'ve used both your chat messages. Wait for the host to promote you to speaker.'
          });
        }
        me.msgsUsed = (me.msgsUsed || 0) + 1;
      }
      const msg = {
        id: crypto.randomBytes(4).toString('base64url'),
        t: Date.now(),
        f: socket.id,
        n: me.name,
        r: me.role,
        x: text
      };
      room.messages.push(msg);
      if (room.messages.length > RECENT_MSGS * 4) room.messages.splice(0, room.messages.length - RECENT_MSGS * 2);
      nsp.to(room.code).emit('chat', msg);
      // Refresh the sender's remaining count.
      if (me.role === 'listener') socket.emit('chatMeta', { msgsLeft: LISTENER_MSG_LIMIT - me.msgsUsed });
      room.touched = Date.now();
    });

    // Emoji reactions — unlimited for everyone including listeners.
    socket.on('emoji', (data) => {
      if (!room || !me) return;
      const e = String((data && data.e) || '').slice(0, 8);
      if (!e) return;
      const now = Date.now();
      const bucket = (socket._eBucket = socket._eBucket || []);
      while (bucket.length && bucket[0] < now - 3000) bucket.shift();
      if (bucket.length >= 8) return;                 // hard cap 8/3s
      bucket.push(now);
      nsp.to(room.code).emit('emoji', { e, from: socket.id });
      room.touched = now;
    });

    // Voice presence relay (matches the game modules — voice.js emits these).
    socket.on('v-join', (data) => {
      if (!room || !me) return;
      me.cfSession = (data && data.cfSession) || null;
      socket.to(room.code).emit('v-peer', {
        id: socket.id, on: true, pub: me.role === 'host' || me.role === 'speaker',
        cfSession: me.cfSession, tracks: []
      });
    });
    socket.on('v-tracks', (data) => {
      if (!room || !me) return;
      me.cfSession = (data && data.cfSession) || me.cfSession;
      socket.to(room.code).emit('v-peer', {
        id: socket.id, on: true, pub: me.role === 'host' || me.role === 'speaker',
        cfSession: me.cfSession, tracks: (data && data.tracks) || []
      });
    });
    socket.on('v-leave', () => {
      if (!room) return;
      socket.to(room.code).emit('v-peer', { id: socket.id, on: false });
    });
    socket.on('v-signal', (data) => {
      if (!room || !data || !data.to) return;
      const dst = nsp.sockets.get(data.to);
      if (!dst || !dst.rooms.has(room.code)) return;
      dst.emit('v-signal', { from: socket.id, sdp: data.sdp || null, ice: data.ice || null });
    });

    socket.on('disconnect', () => {
      if (!room) return;
      const r = room; room = null;
      r.members.delete(socket.id);
      // If the host disconnects, the party keeps running for a while but
      // the host role sticks with them so a rejoin puts them straight
      // back in charge. If nobody's left, the sweeper will collect it.
      socket.to(r.code).emit('v-peer', { id: socket.id, on: false });
      broadcast(r);
    });
  });

  console.log('party module: mounted');
  return { rooms, live: () => {
    // Presence on the Live tab: only public parties, only those with a
    // signed-in speaker (a party of ghosts isn't a party).
    const out = [];
    for (const r of rooms.values()) {
      if (r.visibility !== 'public') continue;
      const speakers = [...r.members.values()].filter(m => m.role !== 'listener' && m.connected);
      if (!speakers.length) continue;
      out.push({
        game: 'party', icon: '🎉', title: r.title,
        code: r.code, href: '/party?room=' + r.code, watchHref: '/party?room=' + r.code,
        state: 'playing', cap: r.cap,
        players: [...r.members.values()].map(m => ({
          name: m.name, photo: m.photo || null, bot: false, connected: !!m.connected, team: m.role
        })),
        seatsFree: Math.max(0, r.cap - r.members.size),
        lead: (speakers.length + ' speaker' + (speakers.length !== 1 ? 's' : '') + ' · ' +
               r.members.size + ' member' + (r.members.size !== 1 ? 's' : '')),
        turnName: null, watchers: 0, since: r.touched
      });
    }
    return out;
  }};
}

module.exports = { mount };
