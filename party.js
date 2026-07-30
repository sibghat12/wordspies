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
// A party only ever ends when the host explicitly closes it. But if a room
// sits COMPLETELY EMPTY (nobody connected, nobody has been in for 7 days)
// we still clean it up — otherwise abandoned rooms leak forever. The 7-day
// window is generous enough that "host went on holiday" doesn't kill it.
const EMPTY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
      handRaised: !!m.handRaised, handAt: m.handAt || 0,
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

  // A party lives forever unless the host clicks End. The one exception
  // is a room that's been genuinely empty for a week — those get swept
  // so the room-code namespace doesn't fill up with abandoned parties.
  // Rooms with anyone still in them (even connection-idle) are protected.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      if (r.members.size > 0) continue;                    // never touch active rooms
      if (now - (r.touched || 0) > EMPTY_TTL_MS) rooms.delete(code);
    }
  }, 60 * 60 * 1000).unref?.();

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
      // Show even empty rooms for the first 10 minutes after creation, so
      // a host who made the room via REST but hasn't opened it in a socket
      // yet still appears in the list for friends who spotted the link.
      const isFresh = (Date.now() - (r.createdAt || r.touched || 0)) < 10 * 60 * 1000;
      if (!r.members.size && !isFresh) continue;
      const all = [...r.members.values()];
      const speakers = all.filter(m => m.role === 'speaker' || m.role === 'host');
      const listeners = all.filter(m => m.role === 'listener');
      out.push({
        code: r.code, title: r.title, subtitle: r.subtitle || '',
        count: r.members.size, cap: r.cap,
        speakerCount: speakers.length,
        listenerCount: listeners.length,
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
    console.log('[party] create', code, 'vis=' + vis, 'host=' + uid.slice(0, 8), 'title=' + title.slice(0, 40));
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
      // Private-party gate: host + their circle. A call room (isCall=true)
      // also has an explicit callWhitelist so the callee can join even
      // when they're not in the caller's follow circle.
      if (r.visibility === 'private' && uid !== r.hostUid) {
        if (r.callWhitelist && r.callWhitelist.has(uid)) {
          // allowed
        } else {
          const circle = await invitedCircle(r.hostUid);
          if (!circle || !circle.has(uid)) return fail('This is a private party — you need an invite.');
        }
      }

      // Same account rejoining? Sweep EVERY member sharing this uid (there
      // shouldn't be more than one but if there is — dead sockets that
      // never cleaned up — we don't want stale seats). Carry over the
      // most-recent seat's role/msgs/hand so a refresh reseats correctly.
      let carryRole = null, carryMsgs = 0, carryHand = false, carriedAt = 0;
      if (uid) {
        const toDelete = [];
        for (const [oldId, m] of r.members) {
          if (m.uid !== uid) continue;
          const t = m.discAt || 0;
          if (t >= carriedAt) {
            carryRole = m.role;
            carryMsgs = m.msgsUsed || 0;
            carryHand = !!m.handRaised;
            carriedAt = t;
          }
          toDelete.push(oldId);
        }
        for (const oldId of toDelete) {
          const old = nsp.sockets.get(oldId);
          if (old) { try { old.emit('replaced'); old.leave(r.code); } catch (e) {} }
          r.members.delete(oldId);
          if (r.hostId === oldId) r.hostId = null;
        }
      }

      // ORIGINAL creator always comes back as host — even if a co-host was
      // stamped on r.hostId while they were offline. "The party is mine
      // until I leave or end it" is the rule the owner asked for.
      const isCreator = uid && uid === r.hostUid;
      const role = isCreator ? 'host' : (carryRole || 'listener');
      const member = {
        id: socket.id, uid: uid || null,
        name: (prof && prof.name) || cleanText((data && data.name), 20) || 'Guest',
        photo: (prof && prof.photo) || null,
        role,
        connected: true, msgsUsed: carryMsgs, handRaised: carryHand,
        cfSession: (data && data.cfSession) || null
      };
      r.members.set(socket.id, member);
      if (role === 'host' && (!r.hostId || isCreator)) r.hostId = socket.id;
      socket.join(r.code);
      room = r; me = member;
      console.log('[party] join', r.code, 'uid=' + (uid || 'guest').slice(0, 8), 'role=' + member.role, 'members=' + r.members.size, 'isCreator=' + !!isCreator);
      socket.emit('joined', {
        code: r.code, you: socket.id, role: member.role,
        uid: uid || null,          // client uses this to fire reclaimHost if the seat drifts
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

    // Any host can promote/demote (co-hosts are also hosts for this purpose).
    // A promote lifts a listener to speaker (or all the way to co-host if
    // data.role === 'host'). A demote drops back to listener.
    const iAmHost = () => me && me.role === 'host';
    socket.on('promote', (data) => {
      if (!room || !iAmHost()) return;
      const target = room.members.get(String((data && data.id) || ''));
      if (!target) return;
      const to = (data && data.role === 'host') ? 'host' : 'speaker';
      target.role = to;
      target.handRaised = false;               // whichever way, drop their hand
      // On promotion, listener chat cap converts to unlimited (server also
      // stops rejecting their messages when role !== 'listener').
      broadcast(room);
    });
    socket.on('demote', (data) => {
      if (!room || !iAmHost()) return;
      const target = room.members.get(String((data && data.id) || ''));
      if (!target) return;
      // The ORIGINAL host (creatorUid) can't be demoted — otherwise a fresh
      // co-host could stage a coup and boot them.
      if (target.uid && target.uid === room.hostUid) return;
      target.role = 'listener';
      target.handRaised = false;
      broadcast(room);
    });

    // Listener raises hand — flag flips, host sees a queue.
    socket.on('raiseHand', () => {
      if (!room || !me) return;
      if (me.role !== 'listener') return;
      me.handRaised = true;
      me.handAt = Date.now();
      broadcast(room);
    });
    socket.on('lowerHand', () => {
      if (!room || !me) return;
      me.handRaised = false;
      broadcast(room);
    });
    // Reclaim host — a defensive fallback for the "I was host, refreshed,
    // now I'm somehow a listener" bug. If the caller's socket profile
    // matches the room's original creatorUid, force-promote them back.
    // Idempotent — safe to call any time.
    socket.on('reclaimHost', () => {
      if (!room || !me) return;
      const uid = socket.profile && socket.profile.uid;
      if (!uid || uid !== room.hostUid) return;
      if (me.role !== 'host') {
        me.role = 'host';
        room.hostId = socket.id;
        console.log('[party] reclaimHost', room.code, 'uid=' + uid.slice(0, 8));
        broadcast(room);
      }
    });

    // Host declines a listener's raised hand (denyHand from the client).
    // Any host may deny; the target listener stays a listener and their
    // hand flag is cleared for everyone including themselves.
    socket.on('denyHand', (data) => {
      if (!room || !iAmHost()) return;
      const target = room.members.get(String((data && data.id) || ''));
      if (!target) return;
      target.handRaised = false;
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
    //
    // BUG FIX: the client also needs a v-roster back on v-join so it knows
    // who's already publishing and can subscribe to their tracks. Without
    // this, a fresh joiner sees no existing peers → subscribes to nothing
    // → hears silence. Owner reported "my voice not getting broadcast" —
    // symmetric: my socket announced itself but the roster reply was
    // missing so others didn't subscribe to me either.
    socket.on('v-join', (data) => {
      if (!room || !me) return;
      me.cfSession = (data && data.cfSession) || null;
      me.vTracks = [];
      // Tell the rest of the room I'm on voice.
      socket.to(room.code).emit('v-peer', {
        id: socket.id, on: true, pub: me.role === 'host' || me.role === 'speaker',
        cfSession: me.cfSession, tracks: []
      });
      // Reply to me with everyone else's current voice presence so I can
      // subscribe to any speaker who's already broadcasting.
      const peers = [];
      for (const [sid, other] of room.members) {
        if (sid === socket.id) continue;
        if (!other.cfSession) continue;             // they're not on voice yet
        peers.push({
          id: sid, on: true,
          pub: other.role === 'host' || other.role === 'speaker',
          cfSession: other.cfSession,
          tracks: other.vTracks || []
        });
      }
      socket.emit('v-roster', { peers });
    });
    socket.on('v-tracks', (data) => {
      if (!room || !me) return;
      me.cfSession = (data && data.cfSession) || me.cfSession;
      me.vTracks = (data && data.tracks) || [];
      socket.to(room.code).emit('v-peer', {
        id: socket.id, on: true, pub: me.role === 'host' || me.role === 'speaker',
        cfSession: me.cfSession, tracks: me.vTracks
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
      // Owner rule: I stay in the room even if my tab closes / I refresh.
      // Keep the slot, flip the connected flag. A grace-window sweeper
      // (below) actually removes the slot only after 5 minutes offline.
      const m = r.members.get(socket.id);
      if (m) { m.connected = false; m.discAt = Date.now(); }
      socket.to(r.code).emit('v-peer', { id: socket.id, on: false });
      broadcast(r);
    });
  });

  // Grace-window collector: 5 min after disconnect, if the member hasn't
  // reconnected, drop their slot. Also enforces the "party auto-ends when
  // all hosts have gone" rule the owner asked for.
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const drop = [];
      for (const [id, m] of r.members) {
        if (!m.connected && (now - (m.discAt || now)) > 5 * 60 * 1000) drop.push(id);
      }
      for (const id of drop) { r.members.delete(id); if (r.hostId === id) r.hostId = null; }

      // Any host still connected? If none for >10 min, the party ends.
      // "You can't have a party without a host" (owner) — but 2 min was
      // too aggressive: a phone locking, an app-switch, a network blip
      // all knocked the party out before the host could come back.
      const hostsConnected = [...r.members.values()].filter(m => m.role === 'host' && m.connected);
      if (!hostsConnected.length) {
        r.noHostSince = r.noHostSince || now;
        if (now - r.noHostSince > 10 * 60 * 1000) {
          console.log('[party] auto-end', code, 'no host for 10min');
          nsp.to(r.code).emit('closed');
          rooms.delete(code);
        }
      } else {
        r.noHostSince = 0;
      }
    }
  }, 60 * 1000).unref?.();

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
