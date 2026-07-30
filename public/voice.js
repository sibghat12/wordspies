/* voice.js — in-game voice, two paths:
 *
 *  (A) Cloudflare Realtime SFU (mode:'cloudflare')
 *      Every browser opens ONE PeerConnection to Cloudflare. To speak, we
 *      addTrack(mic) + POST /tracks/new with the local SDP; CF returns an
 *      answer + our track's public name. To hear a peer, we POST /tracks/new
 *      with { remoteSessionId, trackName }; CF sends us an SDP offer and
 *      we answer it via /renegotiate. Server-initiated renegotiations
 *      (when someone else appears) also come through /renegotiate.
 *
 *  (B) Peer-to-peer STUN mesh (mode:'p2p')                    ← the fallback
 *      Every browser opens a PeerConnection to every other peer directly,
 *      using Google STUN. Signalling for SDP+ICE goes through socket.io.
 *      Works ~85% of networks; used when CF env vars aren't set on the
 *      server.
 *
 * The game page calls wsVoice.init({socket, myId, canPublish}) once and
 * then wsVoice.setMic(true|false). The picking-a-mode is done by fetching
 * /api/voice/config on load, so the site can be flipped between modes by
 * just adding env vars on the droplet — no client rebuild.
 */
(function () {
  'use strict';

  // ── shared state ──────────────────────────────────────────────────────
  var VOICE_MODE = 'p2p';                  // 'p2p' | 'cloudflare'
  var ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  var socket = null;
  var myId = null;
  var canPublish = false;
  var joined = false;
  var micOn = false;
  var localStream = null;
  var listeners = {};
  var audioMountEl = null;
  var configReady = null;                  // Promise that resolves once /api/voice/config has been fetched

  function emit(ev, arg) {
    (listeners[ev] || []).forEach(function (cb) { try { cb(arg); } catch (e) {} });
  }
  function on(ev, cb) {
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function off() { listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== cb; }); };
  }
  function ensureAudioMount() {
    if (audioMountEl) return audioMountEl;
    audioMountEl = document.createElement('div');
    audioMountEl.id = 'wsVoiceAudios';
    audioMountEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(audioMountEl);
    return audioMountEl;
  }
  function attachAudio(stream, key) {
    var au = document.querySelector('audio[data-peer="' + key + '"]');
    if (!au) {
      au = document.createElement('audio');
      au.autoplay = true;
      au.playsInline = true;
      au.setAttribute('data-peer', key);
      ensureAudioMount().appendChild(au);
    }
    au.srcObject = stream;
    return au;
  }
  function detachAudio(key) {
    var au = document.querySelector('audio[data-peer="' + key + '"]');
    if (au) { try { au.remove(); } catch (e) {} }
  }

  // ── config bootstrap ──────────────────────────────────────────────────
  configReady = fetch('/api/voice/config', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j) return;
      if (Array.isArray(j.iceServers) && j.iceServers.length) ICE = j.iceServers;
      VOICE_MODE = j.mode || 'p2p';
    })
    .catch(function () {});

  // ── microphone access (shared) ────────────────────────────────────────
  async function openMic() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser has no microphone support.');
    }
    // Ask for HD audio: 48 kHz sample rate, stereo, and the browser's best
    // echo-cancel/noise-suppress. Combined with Cloudflare's Opus @ ~64 kbps
    // this is essentially the highest quality WebRTC allows. The browser
    // silently downgrades if the mic can't do stereo — we don't care.
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: { ideal: 2 },
        latency: { ideal: 0.02 }
      },
      video: false
    });
    return localStream;
  }
  // Once we've published, coax the RTP sender into high-quality Opus.
  // Bumps target bitrate + turns on DTX for silence savings. Safe to call
  // on any sender — falls back quietly if setParameters isn't supported.
  async function boostSender(sender) {
    if (!sender || !sender.getParameters) return;
    try {
      var params = sender.getParameters();
      params.encodings = params.encodings || [{}];
      params.encodings[0].maxBitrate = 96000;   // 96 kbps — top of Opus voice range
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      await sender.setParameters(params);
    } catch (e) { /* not supported on this browser — no harm */ }
  }
  function closeMic() {
    if (!localStream) return;
    try { localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    localStream = null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Path (B): peer-to-peer mesh over socket.io signalling. Only ever used
  // when VOICE_MODE === 'p2p'. Kept minimal — this is a fallback for hosts
  // that haven't set up the CF env vars.
  // ══════════════════════════════════════════════════════════════════════
  var p2p = {
    peers: {},                              // peerId → { pc, gotOffer }
    onOff: null,
    activate: function () {
      var self = this;
      this.onOff = function () {};
      socket.on('v-signal', function (m) { self.onSignal(m); });
      socket.on('v-peer',   function (m) { self.onPeer(m); });
      socket.emit('v-join', {});
    },
    deactivate: function () {
      Object.keys(this.peers).forEach(function (id) { p2p.drop(id); });
      try { socket.off('v-signal'); } catch (e) {}
      try { socket.off('v-peer'); } catch (e) {}
      try { socket.emit('v-leave'); } catch (e) {}
    },
    shouldInitiate: function (otherId) { return myId > otherId; },
    make: function (id) {
      if (this.peers[id]) return this.peers[id];
      var pc = new RTCPeerConnection({ iceServers: ICE });
      var self = this;
      pc.onicecandidate = function (e) { if (e.candidate) socket.emit('v-signal', { to: id, ice: e.candidate }); };
      pc.ontrack = function (e) { attachAudio(e.streams[0] || new MediaStream([e.track]), 'p2p:' + id); emit('peer-add', { id: id }); };
      pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') self.drop(id); };
      if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
      this.peers[id] = { pc: pc };
      emit('peers', Object.keys(this.peers));
      return this.peers[id];
    },
    drop: function (id) {
      var p = this.peers[id]; if (!p) return;
      try { p.pc.close(); } catch (e) {}
      detachAudio('p2p:' + id);
      delete this.peers[id];
      emit('peer-drop', { id: id });
      emit('peers', Object.keys(this.peers));
    },
    async offerTo(id) {
      var p = this.make(id);
      try {
        var offer = await p.pc.createOffer({ offerToReceiveAudio: true });
        await p.pc.setLocalDescription(offer);
        socket.emit('v-signal', { to: id, sdp: p.pc.localDescription });
      } catch (e) { console.warn('p2p offer', e); }
    },
    onPeer: function (m) {
      if (!m || !m.id || m.id === myId) return;
      if (m.on) { this.make(m.id); if (this.shouldInitiate(m.id)) this.offerTo(m.id); }
      else this.drop(m.id);
    },
    async onSignal(m) {
      if (!m || !m.from) return;
      var id = m.from, p = this.make(id);
      try {
        if (m.sdp) {
          var desc = new RTCSessionDescription(m.sdp);
          if (desc.type === 'offer') {
            await p.pc.setRemoteDescription(desc);
            var a = await p.pc.createAnswer();
            await p.pc.setLocalDescription(a);
            socket.emit('v-signal', { to: id, sdp: p.pc.localDescription });
          } else if (desc.type === 'answer') {
            await p.pc.setRemoteDescription(desc);
          }
        } else if (m.ice) {
          try { await p.pc.addIceCandidate(m.ice); } catch (e) {}
        }
      } catch (e) { console.warn('p2p signal', e); }
    },
    async publishLocal() {
      var self = this;
      Object.keys(this.peers).forEach(async function (id) {
        var p = self.peers[id]; if (!p) return;
        localStream.getTracks().forEach(function (t) { p.pc.addTrack(t, localStream); });
        // Boost every fresh sender so P2P mode also gets HD Opus.
        var senders = p.pc.getSenders().filter(function (s) { return s.track; });
        for (var i = 0; i < senders.length; i++) await boostSender(senders[i]);
        if (self.shouldInitiate(id)) self.offerTo(id);
      });
    },
    async unpublishLocal() {
      var self = this;
      Object.keys(this.peers).forEach(function (id) {
        var p = self.peers[id]; if (!p) return;
        p.pc.getSenders().forEach(function (s) { try { p.pc.removeTrack(s); } catch (e) {} });
        if (self.shouldInitiate(id)) self.offerTo(id);
      });
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Path (A): Cloudflare Realtime SFU. One RTCPeerConnection per browser,
  // hanging off Cloudflare's SFU. All API calls proxied through our own
  // /api/voice/cf/* so the App Token never touches the client.
  // ══════════════════════════════════════════════════════════════════════
  var sfu = {
    pc: null,
    sessionId: null,
    localTrackNames: [],                 // trackNames Cloudflare gave us for our own published tracks
    subscribed: {},                      // peerSessionId → [audioEls]
    pending: [],                         // remote peers we couldn't subscribe to yet (pc not ready)

    async activate() {
      var self = this;
      // Create our SFU session.
      var r = await fetch('/api/voice/cf/session', { method: 'POST' }).then(function (x) { return x.json(); });
      if (!r || !r.sessionId) throw new Error('Cloudflare session failed to open.');
      this.sessionId = r.sessionId;

      // Build the local peer connection.
      this.pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: 'max-bundle' });
      this.pc.ontrack = function (ev) {
        // Any incoming track gets attached to an <audio>. We tag it with
        // the trackId so we can later detach individual peers.
        var stream = ev.streams[0] || new MediaStream([ev.track]);
        attachAudio(stream, 'sfu:' + ev.track.id);
        emit('peer-add', { id: ev.track.id });
      };
      // Answer any offer Cloudflare sends us out-of-band (their SFU pushes
      // an offer whenever it has fresh remote tracks to deliver).
      this.pc.onnegotiationneeded = function () { /* renegotiate lazily below */ };

      // Room-scoped presence over socket.io. `v-peer` events now include
      // cfSession + tracks so we know exactly which SFU tracks to subscribe to.
      socket.on('v-peer',   function (m) { self.onPeer(m); });
      socket.on('v-roster', function (m) { (m && m.peers || []).forEach(function (p) { self.onPeer(p); }); });

      // Tell the room we're on voice; server replies with the roster.
      socket.emit('v-join', { cfSession: this.sessionId, tracks: [] });
    },

    async deactivate() {
      try { socket.off('v-peer'); } catch (e) {}
      try { socket.off('v-roster'); } catch (e) {}
      try { socket.emit('v-leave'); } catch (e) {}
      if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
      this.sessionId = null;
      this.localTrackNames = [];
      this.subscribed = {};
    },

    // Register a new local track (mic just opened) with Cloudflare.
    async publishTrack(track) {
      if (!this.pc || !this.sessionId) return;
      var transceiver = this.pc.addTransceiver(track, { direction: 'sendonly' });
      var offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      var body = {
        sdp: { type: 'offer', sdp: offer.sdp },
        tracks: [{ location: 'local', mid: transceiver.mid, trackName: track.id }]
      };
      var r = await fetch('/api/voice/cf/tracks/' + this.sessionId, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function (x) { return x.json(); });
      if (!r || !r.sessionDescription) throw new Error('Cloudflare publish failed.');
      await this.pc.setRemoteDescription(r.sessionDescription);
      // Cloudflare returns the assigned trackName for each pushed track.
      var names = (r.tracks || []).map(function (t) { return t.trackName; }).filter(Boolean);
      this.localTrackNames = this.localTrackNames.concat(names);
      // Tell the room what our tracks are called so subscribers can grab them.
      socket.emit('v-tracks', { cfSession: this.sessionId, tracks: this.localTrackNames });
    },

    // Subscribe to every audio track a remote peer is publishing.
    async subscribeTo(peer) {
      if (!this.pc || !this.sessionId) return;
      if (!peer || !peer.cfSession || peer.cfSession === this.sessionId) return;
      if (!Array.isArray(peer.tracks) || !peer.tracks.length) return;
      // Skip tracks we've already asked for (dedup by session+track).
      var self = this;
      var need = peer.tracks.filter(function (name) {
        var key = peer.cfSession + ':' + name;
        if (self.subscribed[key]) return false;
        self.subscribed[key] = true;
        return true;
      });
      if (!need.length) return;
      var body = {
        tracks: need.map(function (name) {
          return { location: 'remote', sessionId: peer.cfSession, trackName: name };
        })
      };
      var r = await fetch('/api/voice/cf/tracks/' + this.sessionId, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function (x) { return x.json(); });
      if (!r) return;
      // Cloudflare returns an OFFER we must answer via /renegotiate.
      if (r.requiresImmediateRenegotiation && r.sessionDescription) {
        await this.pc.setRemoteDescription(r.sessionDescription);
        var ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        await fetch('/api/voice/cf/renegotiate/' + this.sessionId, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: { type: 'answer', sdp: ans.sdp } })
        });
      }
    },

    onPeer: function (m) {
      if (!m || m.id === myId) return;
      if (!m.on) { emit('peer-drop', { id: m.id }); return; }
      // If they've published tracks and we can, subscribe.
      if (m.cfSession && m.tracks && m.tracks.length) this.subscribeTo(m);
    },

    async publishLocal() {
      if (!localStream) return;
      var tracks = localStream.getAudioTracks();
      for (var i = 0; i < tracks.length; i++) {
        try {
          await this.publishTrack(tracks[i]);
          // Coax the newly-added sender to 96 kbps Opus for HD voice.
          var senders = this.pc.getSenders().filter(function (s) { return s.track === tracks[i]; });
          for (var j = 0; j < senders.length; j++) await boostSender(senders[j]);
        } catch (e) { console.warn('sfu publish', e); }
      }
    },
    async unpublishLocal() {
      // Simplest: close and rebuild the session on next mic-on. Cloudflare
      // sessions are cheap and we've only got one participant per tab.
      if (!this.pc) return;
      var oldSession = this.sessionId;
      var names = this.localTrackNames.slice();
      this.localTrackNames = [];
      // Tell the room we no longer have publishable tracks (subscribers
      // will detach our audio elements).
      try { socket.emit('v-tracks', { cfSession: this.sessionId, tracks: [] }); } catch (e) {}
      // Ask Cloudflare to close the tracks (best-effort — session will TTL out).
      if (oldSession && names.length) {
        try {
          await fetch('/api/voice/cf/close/' + oldSession, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: names.map(function (n) { return { trackName: n, mid: '' }; }) })
          });
        } catch (e) {}
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Public surface — same shape as before; dispatch to the active path.
  // ══════════════════════════════════════════════════════════════════════
  var activePath = null;

  async function activate() {
    if (activePath) return;
    await configReady;
    if (VOICE_MODE === 'cloudflare') {
      try { await sfu.activate(); activePath = sfu; return; }
      catch (e) { console.warn('CF SFU activation failed, falling back to P2P:', e); VOICE_MODE = 'p2p'; }
    }
    p2p.activate();
    activePath = p2p;
  }

  async function setMic(want) {
    if (!canPublish) throw new Error('Watchers cannot speak — only players can open the microphone.');
    if (!!want === !!micOn) return micOn;
    await activate();
    if (want) {
      try { await openMic(); }
      catch (e) { emit('mic', { on: false, err: e.message || 'Microphone permission denied.' }); throw e; }
      micOn = true;
      if (activePath.publishLocal) { try { await activePath.publishLocal(); } catch (e) { console.warn(e); } }
    } else {
      if (activePath && activePath.unpublishLocal) { try { await activePath.unpublishLocal(); } catch (e) {} }
      closeMic();
      micOn = false;
    }
    emit('mic', { on: micOn });
    return micOn;
  }

  async function init(opts) {
    if (joined) return;
    socket = opts.socket;
    myId = String(opts.myId || (socket && socket.id) || '');
    canPublish = !!opts.canPublish;
    if (!socket || !myId) return;
    joined = true;
    await activate();
  }

  function destroy() {
    if (!joined) return;
    if (activePath && activePath.deactivate) activePath.deactivate();
    activePath = null;
    closeMic();
    joined = false; micOn = false;
    emit('mic', { on: false });
  }

  window.wsVoice = {
    init: init, destroy: destroy, setMic: setMic, on: on,
    get micOn() { return micOn; },
    get canPublish() { return canPublish; },
    get mode() { return VOICE_MODE; },
    setCanPublish: function (v) { canPublish = !!v; },
    setMyId: function (id) { myId = String(id || ''); }
  };
})();
