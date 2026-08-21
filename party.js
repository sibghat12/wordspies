// TalkSibi Parties — audio rooms with speakers, listeners, chat, reactions.
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

// Party title moderation. Owner ask 21 Aug 2026: 'no bad or prohibited
// racist words in the party title'. Play Store child-safety review will
// flag any surfaced content with slurs / CSAM markers, so we reject
// server-side before the room exists. This is a first-pass filter — it
// blocks the obvious 90% (unambiguous slurs + CSAM markers). Casual
// swearing (damn, hell) is intentionally allowed. Leetspeak is
// normalized so 'n1gg3r' / 'p3d0' still trip it.
function normalizeForFilter(s) {
  return String(s || '').toLowerCase()
    .replace(/[0]/g, 'o').replace(/[1!]/g, 'i').replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '');
}
const BLOCKED_TERMS = [
  // Racial slurs
  'nigger', 'nigga', 'chink', 'gook', 'spic', 'kike',
  'towelhead', 'sandnigger', 'raghead', 'coon', 'jigaboo', 'wetback',
  // Homophobic / transphobic slurs
  'faggot', 'faggit', 'fagot', 'tranny', 'dyke',
  // CSAM markers — Play Store zero tolerance
  'pedo', 'pedophile', 'pedofile', 'paedo', 'loli', 'shota',
  'childporn', 'childsex', 'underagesex', 'kidporn', 'kidsex',
  // Extreme sexual/violent
  'rapist', 'incest', 'bestiality'
];
function containsBlockedTerm(input) {
  const norm = normalizeForFilter(input);
  return BLOCKED_TERMS.some(t => norm.includes(t));
}
function partyTextBlocked(...fields) {
  return fields.some(f => containsBlockedTerm(f));
}

function mount(app, io, options = {}) {
  const identify = typeof options.identify === 'function' ? options.identify : null;
  const nsp = io.of('/party');
  const rooms = new Map();     // code → room

  function publicView(r) {
    const now = Date.now();
    const members = [...r.members.values()].map(m => ({
      id: m.id, uid: m.uid || null, name: m.name, photo: m.photo || null,
      role: m.role, connected: !!m.connected, cfSession: m.cfSession || null,
      // Which CF trackNames this member has published — non-empty means
      // their mic is currently open. Clients render the mic mute/unmute
      // chip from this and the local micOn state for self.
      tracks: (m.vTracks || []).slice(0, 4),
      // Explicit mic-on flag driven by the v-mic event (fires the instant
      // the user taps unmute, before Cloudflare's publish round-trip
      // completes and before vTracks is populated). Lets remote clients
      // flip the mic chip immediately. Owner bug 2026-08-14: 'I speak,
      // my mic is on for me but others can't see my mic is on'.
      micOn: !!m.micOn,
      // Connection-quality bucket ('good' | 'weak' | 'bad'). Set by the
      // speaker's own client via v-quality on transition; omitted (undefined)
      // for 'good' so publicView payload stays small on the common path.
      quality: (m.quality && m.quality !== 'good') ? m.quality : undefined,
      handRaised: !!m.handRaised, handAt: m.handAt || 0,
      // How many of your 2 messages you've used (only sent back to yourself
      // via the personal `you` field below).
      msgsUsed: m.msgsUsed || 0
    }));
    return {
      code: r.code, title: r.title, subtitle: r.subtitle || '',
      langs: Array.isArray(r.langs) ? r.langs : [],
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
      // Show freshly-created empty rooms only for 5 minutes (owner ask
      // 10 Aug 2026 — 'if zero host + zero listener don't show in the
      // archive'). Was 60 min which left ghost cards up for an hour.
      const isFresh = (Date.now() - (r.createdAt || r.touched || 0)) < 5 * 60 * 1000;
      if (!r.members.size && !isFresh) continue;
      const all = [...r.members.values()];
      const speakers = all.filter(m => m.role === 'speaker' || m.role === 'host');
      const listeners = all.filter(m => m.role === 'listener');
      out.push({
        code: r.code, title: r.title, subtitle: r.subtitle || '',
        langs: Array.isArray(r.langs) ? r.langs : [],
        count: r.members.size, cap: r.cap,
        speakerCount: speakers.length,
        listenerCount: listeners.length,
        // hostUid is the stable, immutable id — clients MUST match on
        // this for iAmHost, not on hostName (BUG-003 fix: two users
        // named "Anna" collided under the name-based check).
        hostUid: r.hostUid || null,
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
    // Owner ask 14 Aug 2026: 'if I am host in one party, don't let me
    // make/start a new party until I leave that one'. r.hostUid is the
    // original creator and is never reassigned — the room belongs to
    // them until closeParty or the 10-min no-host auto-end. Skip DM
    // call rooms (isCall) — those are 2-person phone calls, not parties.
    for (const r of rooms.values()) {
      if (r.isCall) continue;
      if (r.hostUid !== uid) continue;
      return res.status(409).json({
        error: 'already-hosting',
        code: r.code,
        title: r.title || 'Untitled party',
        message: 'You are already hosting "' + (r.title || 'Untitled party') + '". Leave it first.'
      });
    }
    const title    = cleanText((req.body || {}).title,    60) || 'Untitled party';
    const subtitle = cleanText((req.body || {}).subtitle, 120);
    const vis = ((req.body || {}).visibility === 'private') ? 'private' : 'public';
    // Owner ask 10 Aug 2026 — host tags the party with the languages
    // being practised so the archive card can show flags. Free text so
    // the client picks up new languages without a server release.
    const langs = (Array.isArray((req.body || {}).langs) ? (req.body || {}).langs : [])
      .map(s => String(s || '').trim().slice(0, 40))
      .filter(Boolean).slice(0, 6);
    // Moderation gate: reject slurs, hate speech, CSAM markers in any
    // visible field. Play Store review will flag them; user reports would
    // too. See BLOCKED_TERMS above for scope.
    if (partyTextBlocked(title, subtitle, langs.join(' '))) {
      console.log('[party] blocked title/subtitle — uid=' + uid.slice(0, 8));
      return res.status(400).json({
        error: 'Please pick a different title — that word isn\'t allowed here.'
      });
    }
    const code = makeUniqueCode(rooms);
    console.log('[party] create', code, 'vis=' + vis, 'host=' + uid.slice(0, 8), 'title=' + title.slice(0, 40));
    const room = {
      code, title, subtitle, visibility: vis, langs,
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
      // Owner ask 14 Aug 2026: "guests should NOT be able to join a party
      // — push them to make an account first." Belt-and-braces guard —
      // the client also pre-checks and redirects to /social?login=1&next=,
      // but reject at the socket too so a hand-crafted client can't sneak
      // in as a Guest. The 'auth-required' code lets the client redirect
      // cleanly to signup instead of just showing a toast.
      if (!uid) {
        socket.emit('err', { msg: 'Please make an account to join this party.', code: 'auth-required' });
        return;
      }
      // Private-party gate: host + their circle. A call room
      // (isCall=true) also has an explicit callWhitelist so the callee
      // can join even when they're not in the caller's follow circle.
      // NOTE: anyone with the room CODE effectively has an invite —
      // links are the invite mechanism. So we only gate private
      // parties against fully-anonymous (no uid) users. Logged-in
      // users who received the link get in regardless of circle.
      // (Fixes owner-reported: 'users can't join with the link'.)
      if (r.visibility === 'private' && uid !== r.hostUid) {
        // Logged-in user with the link: treated as invited, added to
        // the room's callWhitelist so they can re-enter freely.
        if (!r.callWhitelist) r.callWhitelist = new Set();
        r.callWhitelist.add(uid);
      }
      console.log('[party] join', r.code, 'uid=' + (uid || 'guest').slice(0, 8), 'vis=' + r.visibility);

      // Same account rejoining? Sweep EVERY member sharing this uid (there
      // shouldn't be more than one but if there is — dead sockets that
      // never cleaned up — we don't want stale seats). Carry over the
      // most-recent seat's role/msgs/hand so a refresh reseats correctly.
      //
      // Owner bug 2026-08-14 (two-tab same-user): the mic-on / vTracks /
      // cfSession that Tab A published were being wiped when Tab B took
      // the seat — so Tab B (and every other participant) saw the user
      // as muted even though Tab A's mic was still hot on Cloudflare.
      // Carry those over too. If ANY previous socket for this uid was
      // still connected AND had mic open, the seat stays "unmuted" from
      // the room's POV. Tab A's socket still gets 'replaced' + leaves
      // the room, but its audio stream on CF keeps flowing until the
      // user closes that tab — matching what listeners actually hear.
      let carryRole = null, carryMsgs = 0, carryHand = false, carriedAt = 0;
      let carryMic = false, carryTracks = [], carryCfSession = null, carryFrom = 0;
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
          // Mic/tracks/cfSession: prefer a still-connected socket (the
          // one actually publishing right now) over a disconnected seat
          // in its grace window. Tie-break by most-recent connected.
          const rank = m.connected ? 2 : (m.discAt ? 1 : 0);
          if (rank > carryFrom || (rank === carryFrom && (m.discAt || 0) >= carriedAt)) {
            carryMic = !!m.micOn;
            carryTracks = Array.isArray(m.vTracks) ? m.vTracks.slice() : [];
            carryCfSession = m.cfSession || null;
            carryFrom = rank;
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
        // Carry over the mic/publish state from the prior same-uid seat
        // so a second tab / device doesn't reset the user to "muted"
        // while the original tab is still actively publishing to CF.
        // Only speakers/hosts can be treated as unmuted from the room's
        // POV — matches the guard in the v-mic handler below.
        micOn: (role === 'host' || role === 'speaker') ? carryMic : false,
        vTracks: (role === 'host' || role === 'speaker') ? carryTracks : [],
        cfSession: (data && data.cfSession) || carryCfSession || null
      };
      r.members.set(socket.id, member);
      if (role === 'host' && (!r.hostId || isCreator)) r.hostId = socket.id;
      socket.join(r.code);
      room = r; me = member;
      // For call rooms: stamp startedAt the moment the SECOND party arrives.
      // Enables accurate "Call · 2:14" durations in the chat log later.
      if (r.isCall && !r.startedAt && r.members.size >= 2) r.startedAt = Date.now();
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
      // Call rooms are 2-person only: one leaves → call ends for both.
      if (r.isCall) {
        if (!r.ended) {
          r.ended = true;
          try {
            if (options.onCallEnd) options.onCallEnd({
              hostUid: r.hostUid,
              calleeUid: [...(r.callWhitelist || [])].find(u => u !== r.hostUid) || null,
              startedAt: r.startedAt || 0,
              endedAt: Date.now(),
              answered: !!r.startedAt
            });
          } catch (e) { console.error('onCallEnd:', e.message); }
          try { nsp.to(r.code).emit('closed'); } catch (e) {}
        }
        rooms.delete(r.code);
        return;
      }
      // Owner ask 10 Aug 2026 — 'if zero host + zero listener → party
      // should not show in the archive and should end immediately'.
      // Kill the room the moment the last member is gone, instead of
      // holding a ghost for the weekly sweep.
      if (r.members.size === 0) {
        try { nsp.to(r.code).emit('closed'); } catch (e) {}
        rooms.delete(r.code);
      } else {
        broadcast(r);
      }
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
      // Force-close their microphone AT the moment of demotion. Owner
      // reported: "make the listener never able to speak — as someone
      // moves from the speaker they should not be able to speak, they
      // still able to speak." Root cause: role changed to listener but
      // their published tracks stayed. Now we clear vTracks on the server
      // AND emit a targeted 'force-mute' event so their client tears
      // down its local mic stream.
      target.vTracks = [];
      // Also clear the explicit mic-on flag so their remote chip flips
      // to muted the instant we demote them — without waiting for their
      // client's force-mute handler to emit v-mic {on:false} back.
      target.micOn = false;
      // Clear the connection-quality bucket too — listeners don't publish
      // so the signal chip on their card no longer means anything.
      target.quality = 'good';
      const tsock = nsp.sockets.get(target.id);
      if (tsock) { try { tsock.emit('force-mute'); } catch (e) {} }
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

    // Chat removed (owner ask 10 Aug 2026). Parties are voice-only now.
    // The client UI is hidden but we no-op the handler server-side so a
    // stale client build (or a scripted request) can't burn listener
    // quotas or leak messages into a party that no longer displays them.
    socket.on('chat', () => { /* intentionally dropped */ });

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
    // Lightweight mic-on/off signal, decoupled from Cloudflare publish.
    // v-tracks is authoritative for audio routing but arrives 300-800ms
    // late (after the CF /tracks/new round-trip) and never fires at all
    // if publishTrack throws — leaving remote UIs stuck showing the
    // speaker as muted. v-mic fires immediately from setMic() so the
    // chip flips in sync with the local UI. Owner bug 2026-08-14.
    socket.on('v-mic', (data) => {
      if (!room || !me) return;
      // Only speakers/hosts can be "unmuted" from the room's POV — a
      // listener who tries to open a mic gets rejected here so their
      // chip never lights up on other people's screens.
      if (me.role !== 'host' && me.role !== 'speaker') return;
      me.micOn = !!(data && data.on);
      broadcast(room);
    });
    // Speaker's own connection-quality bucket ('good' | 'weak' | 'bad').
    // Fired by voice.js when the outbound RTP stats transition to a new
    // bucket (2 consecutive polls of the same bucket, ~6s cadence min).
    // Owner ask 15 Aug 2026: 'if some connection is bad or less as host
    // or speaker, please show a red signal on their profile'. Listeners
    // don't publish audio → no meaningful outbound stats → we ignore
    // any v-quality event from a listener.
    socket.on('v-quality', (data) => {
      if (!room || !me) return;
      if (me.role !== 'host' && me.role !== 'speaker') return;
      var b = data && data.bucket;
      if (b !== 'good' && b !== 'weak' && b !== 'bad') return;
      if (me.quality === b) return;
      me.quality = b;
      broadcast(room);
    });
    socket.on('v-tracks', (data) => {
      if (!room || !me) return;
      // Reject publish attempts from listeners. Their voice.js may have
      // published tracks to Cloudflare before demotion; we refuse to
      // relay their presence so nobody subscribes to them.
      if (me.role !== 'host' && me.role !== 'speaker') return;
      me.cfSession = (data && data.cfSession) || me.cfSession;
      me.vTracks = (data && data.tracks) || [];
      socket.to(room.code).emit('v-peer', {
        id: socket.id, on: true, pub: true,
        cfSession: me.cfSession, tracks: me.vTracks
      });
      // ALSO broadcast the room state so every client's paint() re-runs
      // memberCard() with the updated vTracks. Without this the OTHER
      // clients only get the voice-presence event (handled by voice.js
      // for subscribe/unsubscribe) — their party UI never learns the
      // mic chip should flip on/off. Owner bug 2026-08-01: 'i speak
      // open my mic but the other people cant see my mic open and
      // close'.
      broadcast(room);
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
      // EXCEPTION: call rooms end the moment either party drops. A call
      // is a phone call — if the other side hangs up, the whole thing
      // ends for both of us. No "waiting for reconnect".
      if (r.isCall) {
        r.members.delete(socket.id);
        if (!r.ended) {
          r.ended = true;
          try {
            if (options.onCallEnd) options.onCallEnd({
              hostUid: r.hostUid,
              calleeUid: [...(r.callWhitelist || [])].find(u => u !== r.hostUid) || null,
              startedAt: r.startedAt || 0,
              endedAt: Date.now(),
              answered: !!r.startedAt
            });
          } catch (e) { console.error('onCallEnd:', e.message); }
          try { nsp.to(r.code).emit('closed'); } catch (e) {}
        }
        rooms.delete(r.code);
        return;
      }
      const m = r.members.get(socket.id);
      // Also clear vTracks + micOn on disconnect so a slot in the 5-min
      // grace window doesn't visually show a green mic chip for someone
      // who's gone offline. Rejoin repopulates both via v-join/v-mic.
      if (m) { m.connected = false; m.discAt = Date.now(); m.vTracks = []; m.micOn = false; m.quality = 'good'; }
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

      // Owner ask 10 Aug 2026 — the moment nobody's left after the grace
      // sweep, kill the room so it doesn't sit as a ghost in the archive
      // list. Fresh empty rooms (see /api/parties visibility rule) still
      // linger briefly for the "I created but haven't opened" edge, but
      // this catches rooms that were populated then emptied.
      if (r.members.size === 0 && (now - (r.createdAt || 0)) > 3 * 60 * 1000) {
        try { nsp.to(r.code).emit('closed'); } catch (e) {}
        rooms.delete(code);
        continue;
      }

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
