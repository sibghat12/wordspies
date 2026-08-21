/* agora-voice.js — Agora Voice SDK adapter for TalkSibi parties.
 *
 * Matches the public interface of voice.js so party.js can use either
 * transparently. Boot-time switch in party.html decides which one wins:
 *
 *   window.wsVoice = window.AGORA_ENABLED === true
 *     ? AgoraVoice       (this file — Agora SDK)
 *     : CloudflareVoice  (voice.js — Cloudflare Realtime SFU)
 *
 * When AGORA_ENABLED is false (default), this file is still loaded but
 * doesn't touch anything — voice.js's window.wsVoice stays authoritative.
 *
 * Interface parity with voice.js (see line 1041 of voice.js):
 *   init(opts)  — { socket, myId, canPublish, roomCode }
 *   destroy()
 *   setMic(want)  → Promise<boolean>
 *   on(ev, cb)  → off()
 *   startQualityPoll() / stopQualityPoll()
 *   startOutboundQualityPoll() / stopOutboundQualityPoll()
 *   reconnectAudio()
 *   micOn / canPublish / mode  — getters
 *   setCanPublish(v) / setMyId(id)
 *
 * Events emitted to socket (same as voice.js so server-side handlers in
 * party.js do not need to know which transport is active):
 *   v-mic { on }        — this speaker's mic state change (optimistic)
 *   v-tracks { names }  — no-op in Agora (subscription is automatic)
 *   v-quality { bucket }— 'good' | 'weak' | 'bad' from outbound stats
 *
 * Events emitted to LOCAL listeners (for the party UI):
 *   'mic' { on, err? }  — mic state (same shape as voice.js)
 *
 * Additional Agora-specific handling:
 *   - 'agora-role' from server → re-fetch token + client.setClientRole
 *   - Auto-renewal: fetch a fresh token 5 min before expiry
 *   - Kill switch: if AGORA_ENABLED=false, this whole module is inert
 */
(function () {
  'use strict';

  // Bail hard if Agora is not enabled server-side. voice.js remains the
  // authoritative window.wsVoice. This keeps the migration safe to ship
  // dark — we can push code without touching any user's party.
  if (window.AGORA_ENABLED !== true) return;

  // Also bail if the Agora SDK didn't load (script tag failed / CDN
  // blocked). Users fall back to voice.js in that case, no exceptions
  // leak into the party socket.
  if (typeof AgoraRTC === 'undefined') {
    console.warn('[agora-voice] AgoraRTC SDK not loaded — keeping Cloudflare voice.js');
    return;
  }

  // ── module-scoped state ─────────────────────────────────────────────
  var socket = null;
  var myId = null;
  var roomCode = null;
  var canPublish = false;
  var joined = false;
  var micOn = false;
  var client = null;              // Agora RTCClient
  var micTrack = null;            // Agora MicrophoneAudioTrack
  var currentAgoraRole = null;    // 'publisher' | 'subscriber'
  var currentAppId = null;
  var currentChannel = null;
  var currentToken = null;
  var currentNumericUid = null;
  var tokenExpiresAt = 0;
  var tokenRenewTimer = null;
  var listeners = {};
  var remoteUsers = new Map();    // uid → { user, audioTrack }
  var lastQualityBucket = 'good';
  var _micBusy = null;

  // ── event helpers (identical shape to voice.js) ────────────────────
  function emit(ev, arg) {
    (listeners[ev] || []).forEach(function (cb) { try { cb(arg); } catch (e) {} });
  }
  function on(ev, cb) {
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function off() { listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== cb; }); };
  }

  // ── token lifecycle ────────────────────────────────────────────────
  //
  // Server-side endpoint: POST /api/parties/:code/agora-token
  // Response: { appId, channel, token, uid, role, expiresAt }
  //
  // Fetched on every join, on every agora-role event, and on a self-set
  // timer 5 min before expiry (Agora tokens default to 1h — renewing at
  // 55 min gives us a 5-min buffer to survive network hiccups).
  async function fetchToken(code) {
    var res = await fetch('/api/parties/' + encodeURIComponent(code) + '/agora-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      var msg = 'Could not get voice token (' + res.status + ')';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }
  function scheduleTokenRenewal() {
    if (tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
    if (!tokenExpiresAt) return;
    // Renew 5 minutes before expiry — but never less than 30 s from now
    // (protects against wall-clock jitter making the delay negative).
    var msUntilRenew = Math.max(30 * 1000, tokenExpiresAt - Date.now() - 5 * 60 * 1000);
    tokenRenewTimer = setTimeout(async () => {
      try {
        if (!client || !joined || !roomCode) return;
        var t = await fetchToken(roomCode);
        await client.renewToken(t.token);
        currentToken = t.token;
        tokenExpiresAt = t.expiresAt;
        scheduleTokenRenewal();
      } catch (e) {
        console.warn('[agora-voice] token renewal failed:', e.message);
        // Try again in 30 s — the current token still works until expiry.
        tokenRenewTimer = setTimeout(scheduleTokenRenewal, 30 * 1000);
      }
    }, msUntilRenew);
  }

  // ── client + role management ───────────────────────────────────────
  async function joinChannel(code) {
    roomCode = code;
    var t = await fetchToken(code);
    currentAppId = t.appId;
    currentChannel = t.channel;
    currentToken = t.token;
    currentNumericUid = t.uid;
    currentAgoraRole = t.role;
    tokenExpiresAt = t.expiresAt;
    // Agora client in live mode with subscriber-first defaults. Music
    // profile picks 48kHz Opus — best for language pronunciation.
    client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    await client.setClientRole(t.role === 'publisher' ? 'host' : 'audience');
    // Auto-subscribe to remote publishers as they arrive.
    client.on('user-published', async (user, mediaType) => {
      if (mediaType !== 'audio') return;
      try {
        await client.subscribe(user, mediaType);
        if (user.audioTrack) {
          user.audioTrack.play();
          remoteUsers.set(user.uid, { user: user, audioTrack: user.audioTrack });
        }
      } catch (e) { console.warn('[agora-voice] subscribe failed:', e.message); }
    });
    client.on('user-unpublished', (user) => {
      var r = remoteUsers.get(user.uid);
      if (r && r.audioTrack) { try { r.audioTrack.stop(); } catch (e) {} }
      remoteUsers.delete(user.uid);
    });
    client.on('user-left', (user) => {
      remoteUsers.delete(user.uid);
    });
    // Surface connection state to the UI. Agora reports 'DISCONNECTED',
    // 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTING'. Party UI
    // can show a "Reconnecting…" banner during transient network drops.
    client.on('connection-state-change', (cur, prev) => {
      emit('connection', { state: cur, previous: prev });
      if (cur === 'RECONNECTING') {
        // Uplink drops during reconnect — flag it visibly so listeners
        // don't wait silently for audio that isn't arriving.
        try { socket.emit('v-quality', { bucket: 'bad' }); } catch (e) {}
        lastQualityBucket = 'bad';
      } else if (cur === 'CONNECTED' && prev === 'RECONNECTING') {
        // Recovered — reset quality to good so the signal chip vanishes.
        try { socket.emit('v-quality', { bucket: 'good' }); } catch (e) {}
        lastQualityBucket = 'good';
      }
    });
    // Agora's own quality event — fires every 2 seconds. Uses ints 0-6:
    // 0=unknown, 1=excellent, 2=good, 3=fair, 4=poor, 5=bad, 6=very bad.
    // More accurate than parsing getRTCStats() ourselves.
    client.on('network-quality', (q) => {
      var up = q.uplinkNetworkQuality || 0;
      var bucket;
      if (up <= 2) bucket = 'good';
      else if (up <= 4) bucket = 'weak';
      else bucket = 'bad';
      if (bucket !== lastQualityBucket) {
        lastQualityBucket = bucket;
        // Only emit when the mic is actually publishing — a silent
        // listener with a bad uplink doesn't need a chip on their avatar.
        if (micOn) { try { socket.emit('v-quality', { bucket: bucket }); } catch (e) {} }
      }
    });
    // Agora warns us ~30 s before the token dies. Belt + suspenders on
    // top of our own 5-min renewal timer.
    client.on('token-privilege-will-expire', async () => {
      try {
        var t = await fetchToken(roomCode);
        await client.renewToken(t.token);
        currentToken = t.token;
        tokenExpiresAt = t.expiresAt;
        scheduleTokenRenewal();
      } catch (e) {
        console.warn('[agora-voice] emergency token renewal failed:', e.message);
      }
    });
    await client.join(t.appId, t.channel, t.token, t.uid);
    scheduleTokenRenewal();
  }

  async function switchRole(newRole) {
    // Called when server emits 'agora-role'. Fetches a fresh token
    // (role is baked into the token so we can't reuse the old one) and
    // flips setClientRole in place — no rejoin needed.
    if (!client || !roomCode) return;
    try {
      var t = await fetchToken(roomCode);
      await client.renewToken(t.token);
      await client.setClientRole(t.role === 'publisher' ? 'host' : 'audience');
      currentToken = t.token;
      currentAgoraRole = t.role;
      tokenExpiresAt = t.expiresAt;
      scheduleTokenRenewal();
      // If we got demoted to audience while the mic was hot, tear it
      // down — audience clients can't publish and Agora will refuse
      // any future publish call with the current token anyway.
      if (t.role === 'subscriber' && micTrack) {
        try { await client.unpublish([micTrack]); } catch (e) {}
        try { micTrack.close(); } catch (e) {}
        micTrack = null;
        micOn = false;
        try { socket.emit('v-mic', { on: false }); } catch (e) {}
        emit('mic', { on: false });
      }
    } catch (e) {
      console.warn('[agora-voice] role switch failed:', e.message);
    }
  }

  // ── mic on/off ─────────────────────────────────────────────────────
  //
  // Same OPTIMISTIC pattern voice.js uses (owner ask 21 Aug 2026 — mute
  // should feel Tandem-instant): flip local flag + emit v-mic + emit
  // local 'mic' event BEFORE any async work. Roll back if publish
  // fails. See voice.js:705-765 for the equivalent Cloudflare logic.
  async function setMic(want) {
    if (want && !canPublish) throw new Error('Only speakers can open the microphone.');
    if (want && currentAgoraRole !== 'publisher') throw new Error('Ask a host to give you the mic.');
    if (_micBusy) { try { await _micBusy; } catch (e) {} }
    if (!!want === !!micOn) return micOn;
    // OPTIMISTIC UPDATE — same order as voice.js after the 21 Aug patch.
    micOn = !!want;
    try { socket.emit('v-mic', { on: micOn }); } catch (e) {}
    emit('mic', { on: micOn });
    _micBusy = (async () => {
      if (want) {
        try {
          if (!micTrack) {
            micTrack = await AgoraRTC.createMicrophoneAudioTrack({
              encoderConfig: 'music_standard',
              AEC: true, ANS: true, AGC: true
            });
          } else {
            await micTrack.setMuted(false);
          }
          await client.publish([micTrack]);
        } catch (e) {
          // Revert optimistic state.
          try { if (micTrack) { micTrack.close(); micTrack = null; } } catch (e2) {}
          micOn = false;
          try { socket.emit('v-mic', { on: false }); } catch (e2) {}
          emit('mic', { on: false, err: e.message || 'Microphone permission denied.' });
          throw e;
        }
      } else {
        // Mute (keep the track alive so unmute is cheap) OR fully tear
        // down. Full close is simpler and matches voice.js semantics.
        try { if (micTrack) await client.unpublish([micTrack]); } catch (e) {}
        try { if (micTrack) { micTrack.close(); } } catch (e) {}
        micTrack = null;
      }
      return micOn;
    })();
    try { return await _micBusy; }
    finally { _micBusy = null; }
  }

  // ── quality polling ────────────────────────────────────────────────
  //
  // Agora's own 'network-quality' event (wired in joinChannel above)
  // fires every 2 s with an accurate uplink bucket and emits v-quality
  // to the server whenever it changes. That's more precise than our
  // manual getRTCStats() poll would be, so these functions are just
  // interface-parity shims for party.js — no ticker needed. The mic-on
  // gate lives inside the network-quality handler.
  function startOutboundQualityPoll() { /* handled by network-quality event */ }
  function stopOutboundQualityPoll() {
    // On mute we still want to reset the remote chip to 'good' — the
    // network-quality event will stop emitting because we gate on
    // micOn, so nothing else will do it.
    if (lastQualityBucket !== 'good') {
      lastQualityBucket = 'good';
      try { socket.emit('v-quality', { bucket: 'good' }); } catch (e) {}
    }
  }
  function startQualityPoll() { /* remote quality handled by Agora */ }
  function stopQualityPoll() {}

  // ── init / destroy ─────────────────────────────────────────────────
  async function init(opts) {
    if (joined) return;
    socket = opts.socket;
    myId = String(opts.myId || (socket && socket.id) || '');
    canPublish = !!opts.canPublish;
    // party.html should pass roomCode when it kicks off wsVoice.init().
    // If it's missing we can't fetch a token — bail loudly so the bug
    // is obvious in the console.
    var code = opts.roomCode || opts.room || (window.__partyCode || null);
    if (!socket || !myId) return;
    if (!code) { console.error('[agora-voice] init called without roomCode'); return; }
    joined = true;
    try {
      await joinChannel(String(code).trim().toUpperCase());
    } catch (e) {
      joined = false;
      console.error('[agora-voice] join failed:', e.message);
      emit('mic', { on: false, err: 'Could not join voice room. Try again.' });
      return;
    }
    // Server tells us to re-fetch the token + swap role.
    socket.on('agora-role', (data) => {
      var r = data && data.role;
      if (r === 'publisher' || r === 'subscriber') switchRole(r);
    });
    // Server tells us we've been force-muted (host demoted us mid-mic).
    // Same signal voice.js listens to — behave identically.
    socket.on('force-mute', () => {
      if (micOn || micTrack) setMic(false).catch(() => {});
    });
  }

  async function destroy() {
    if (!joined) return;
    if (tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
    stopOutboundQualityPoll();
    try {
      if (micTrack) {
        try { await client.unpublish([micTrack]); } catch (e) {}
        try { micTrack.close(); } catch (e) {}
        micTrack = null;
      }
      remoteUsers.forEach((r) => { try { r.audioTrack && r.audioTrack.stop(); } catch (e) {} });
      remoteUsers.clear();
      if (client) { try { await client.leave(); } catch (e) {} client = null; }
    } finally {
      joined = false; micOn = false;
      currentAppId = null; currentChannel = null; currentToken = null;
      currentNumericUid = null; currentAgoraRole = null; tokenExpiresAt = 0;
      emit('mic', { on: false });
    }
  }

  // Cheap no-op in Agora — the SDK auto-recovers when the tab wakes up.
  // Kept to preserve interface parity with voice.js.
  function reconnectAudio() {}

  // ── public interface (identical shape to voice.js line 1041) ────────
  window.AgoraVoice = {
    init: init, destroy: destroy, setMic: setMic, on: on,
    startQualityPoll: startQualityPoll, stopQualityPoll: stopQualityPoll,
    startOutboundQualityPoll: startOutboundQualityPoll,
    stopOutboundQualityPoll: stopOutboundQualityPoll,
    reconnectAudio: reconnectAudio,
    get micOn() { return micOn; },
    get canPublish() { return canPublish; },
    get mode() { return 'agora'; },
    setCanPublish: function (v) { canPublish = !!v; },
    setMyId: function (id) { myId = String(id || ''); }
  };

  // Boot switch: if AGORA_ENABLED, replace window.wsVoice with AgoraVoice.
  // voice.js has already assigned window.wsVoice to its Cloudflare
  // implementation by this point (loaded earlier in the head).
  window.CloudflareVoice = window.wsVoice;
  window.wsVoice = window.AgoraVoice;
  console.info('[agora-voice] Agora Voice active (mode: agora)');
})();
