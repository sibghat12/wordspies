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
  // Analyser on the LOCAL mic — samples our own volume so the party UI can
   // pulse OUR avatar the moment we start speaking, without waiting for a
   // round-trip through the SFU.
   var _localAnalyser = null;
   function attachLocalAnalyser(stream) {
     try {
       var Ctx = window.AudioContext || window.webkitAudioContext;
       if (!Ctx) return;
       var ac = new Ctx();
       var src = ac.createMediaStreamSource(stream);
       var an = ac.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.4;
       src.connect(an);
       _localAnalyser = { ac: ac, an: an };
       var buf = new Uint8Array(an.frequencyBinCount);
       function tick() {
         if (!_localAnalyser) return;
         an.getByteTimeDomainData(buf);
         var sum = 0;
         for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
         var rms = Math.sqrt(sum / buf.length);      // 0..~0.5 in practice
         emit('local-level', Math.min(1, rms * 4));  // scale so a normal voice reads ~0.4
         setTimeout(tick, 120);
       }
       tick();
     } catch (e) {}
   }
   function detachLocalAnalyser() {
     if (_localAnalyser) { try { _localAnalyser.ac.close(); } catch (e) {} _localAnalyser = null; }
   }

  async function openMic() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser has no microphone support.');
    }
    // HD audio ask. Push everything to the ceiling browsers actually
    // allow so live party voice reads as clearly as the DM voice notes:
    //  · 48 kHz sample rate
    //  · Stereo (ideal:2; browser drops to mono if the mic can't)
    //  · Echo-cancel + noise-suppress + AGC — the standard defensive
    //    trio, but see stereo/latency caveat below.
    //  · latency:0.02 = 20 ms target — matches Opus ptime=20.
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
    attachLocalAnalyser(localStream);
    return localStream;
  }
  // Once we've published, coax the RTP sender into music-grade Opus.
  //  · maxBitrate 128 kbps → matches the recorded voice-note pipeline.
  //  · high network priority so browsers don't down-shift under load.
  async function boostSender(sender) {
    if (!sender || !sender.getParameters) return;
    try {
      var params = sender.getParameters();
      params.encodings = params.encodings || [{}];
      params.encodings[0].maxBitrate = 128000;
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      await sender.setParameters(params);
    } catch (e) { /* not supported on this browser — no harm */ }
  }

  // Rewrite an SDP offer/answer so Opus runs at maximum fidelity:
  //  · stereo=1 + sprop-stereo=1  — two channels end-to-end
  //  · maxaveragebitrate=128000   — 128 kbps target
  //  · useinbandfec=1              — Forward Error Correction, hides
  //                                    the odd dropped packet without a
  //                                    retransmit round-trip.
  //  · usedtx=0                    — no silence suppression. DTX cuts
  //                                    off soft speech attacks and gives
  //                                    voice notes a "cleaner" edge — but
  //                                    live music/laughter/whispers
  //                                    suffer. Off keeps everything.
  //  · cbr=0                       — variable bitrate stays fluid.
  // Applied on both sides of every offer/answer so both peers agree.
  // Rewrite an Opus fmtp line. Two profiles now — owner ask 2 Aug 2026
  // after audio-infra research (stay on Cloudflare Realtime, cut listener
  // bandwidth 4× via mono 32kbps):
  //
  //   role='publish'   — our own mic upload. Keep stereo 128kbps + FEC
  //                       + no DTX so voice notes / music through the
  //                       party feel HD. Speakers only pay this cost.
  //   role='subscribe' — incoming remote track from CF SFU. Ask for
  //                       mono 32kbps + FEC. 4× less downstream
  //                       bandwidth per listener; imperceptible for
  //                       voice; huge win on flaky mobile + old phones.
  //
  // The wanted-string is applied to the fmtp line for Opus (payload
  // type matched from the rtpmap). Existing params merge in and get
  // overridden by our values.
  function tuneOpus(sdp, role) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    var lines = sdp.split(/\r?\n/);
    var opusPt = null;
    for (var i = 0; i < lines.length; i++) {
      var m = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(lines[i]);
      if (m) { opusPt = m[1]; break; }
    }
    if (!opusPt) return sdp;
    var fmtpPattern = new RegExp('^a=fmtp:' + opusPt + '\\s+(.*)$');
    // Default (publish/speaker): HD stereo 128kbps
    var wanted = 'stereo=1;sprop-stereo=1;maxaveragebitrate=128000;maxplaybackrate=48000;useinbandfec=1;usedtx=0;cbr=0';
    if (role === 'subscribe') {
      // Listener-side: mono 40kbps, FEC on so a dropped packet doesn't
      // stutter. 40 is a safe middle ground (fine for laughter + music
      // headroom); drop to 24 if the load test shows we need less.
      // sprop-stereo=0 tells CF SFU we can't play stereo → they don't
      // waste bytes sending it.
      wanted = 'stereo=0;sprop-stereo=0;maxaveragebitrate=40000;maxplaybackrate=48000;useinbandfec=1;usedtx=0;cbr=0';
    }
    var fmtpFound = false;
    for (var j = 0; j < lines.length; j++) {
      var fm = fmtpPattern.exec(lines[j]);
      if (fm) {
        var existing = {};
        fm[1].split(';').forEach(function (kv) { var p = kv.split('='); if (p[0]) existing[p[0].trim()] = (p[1] || '').trim(); });
        wanted.split(';').forEach(function (kv) { var p = kv.split('='); if (p[0]) existing[p[0].trim()] = (p[1] || '').trim(); });
        var merged = Object.keys(existing).map(function (k) { return existing[k] ? k + '=' + existing[k] : k; }).join(';');
        lines[j] = 'a=fmtp:' + opusPt + ' ' + merged;
        fmtpFound = true;
      }
    }
    if (!fmtpFound) {
      for (var k = 0; k < lines.length; k++) {
        if (new RegExp('^a=rtpmap:' + opusPt + '\\s').test(lines[k])) {
          lines.splice(k + 1, 0, 'a=fmtp:' + opusPt + ' ' + wanted);
          break;
        }
      }
    }
    return lines.join('\r\n');
  }
  function closeMic() {
    detachLocalAnalyser();
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
    subscribed: {},                      // peerSessionId+trackName → true (dedup once CONFIRMED)
    pending: [],                         // remote peers we couldn't subscribe to yet (pc not ready)
    // Last-seen roster of remote peers, keyed by remote cfSession → { cfSession, tracks }.
    // Used by the reconciliation sweep (below) to retry any subscribe that
    // silently failed (transient CF 500, InvalidStateError during renegotiation,
    // dropped v-peer packet). Without this, one bad renegotiation could leave a
    // listener permanently unable to hear a speaker until the speaker toggles
    // their mic. Owner bug 2026-08-15: "she can't hear me or anything".
    _knownPeers: {},
    // ── negotiation mutex ──────────────────────────────────────────────
    // Every operation that touches the local RTCPeerConnection's SDP
    // (createOffer / createAnswer / set{Local,Remote}Description) MUST
    // run one-at-a-time. WebRTC's signalling state machine goes
    // stable → have-local-offer → have-remote-pranswer/answer → stable,
    // and firing a second setLocalDescription while the first is in
    // flight throws "InvalidStateError" and silently drops the operation.
    //
    // Real-world symptom (owner-reported, 2026-08-01): a listener joining
    // a room with 2 speakers already publishing got a v-roster event with
    // BOTH speakers, fired subscribeTo() twice back-to-back, and the
    // second subscription crashed — so the listener heard only one
    // speaker. Now every SDP-mutating operation is queued behind
    // _negoQueue and awaits the previous one.
    _negoQueue: Promise.resolve(),
    _serialize: function (fn) {
      var p = this._negoQueue.then(fn, fn);
      this._negoQueue = p.catch(function () {});
      return p;
    },

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
      // ── Self-healing ──────────────────────────────────────────────
      // WebRTC connections drift silently: ICE fails, tab throttles,
      // CF closes the session after long idle. React by tearing down and
      // rebuilding — cheaper than trying to patch a half-dead PC.
      this.pc.onconnectionstatechange = function () {
        var s = self.pc && self.pc.connectionState;
        if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          // Small debounce so a brief flicker doesn't cause churn.
          clearTimeout(self._healT);
          self._healT = setTimeout(function () { self.heal('pc-' + s); }, s === 'disconnected' ? 4000 : 800);
        }
      };

      // Room-scoped presence over socket.io. `v-peer` events now include
      // cfSession + tracks so we know exactly which SFU tracks to subscribe to.
      socket.on('v-peer',   function (m) { self.onPeer(m); });
      socket.on('v-roster', function (m) { (m && m.peers || []).forEach(function (p) { self.onPeer(p); }); });

      // Tell the room we're on voice; server replies with the roster.
      socket.emit('v-join', { cfSession: this.sessionId, tracks: [] });

      // Periodic silence check: if we're supposed to hear someone but no
      // audio has arrived for 15 s, force a rebuild. Uses getStats to see
      // whether any inbound track is still ticking bytesReceived.
      this._lastBytesIn = 0;
      this._lastBytesAt = Date.now();
      clearInterval(this._statsT);
      // 500 ms so the "who's speaking" ring feels live. Silence check uses
      // a running window so 15 s silence still triggers a heal.
      this._statsT = setInterval(function () { self.checkTraffic(); }, 500);
      // Reconciliation sweep — every 10s, retry subscribes for any peer whose
      // tracks we know about but haven't confirmed subscribed. Cheap: the
      // fast-path (all subscribed) is a couple of Object.keys walks and
      // returns immediately. Only fires network work when there's a gap.
      clearInterval(this._reconT);
      this._reconT = setInterval(function () { self.reconcileSubscriptions(); }, 10000);
    },
    // Nuke everything and re-activate. If we had a mic open, re-publish.
    async heal(reason) {
      if (this._healing) return;
      this._healing = true;
      var wasPublishing = !!(localStream && this.localTrackNames.length);
      try {
        try { console && console.warn && console.warn('[voice] healing:', reason); } catch (e) {}
        emit('healing', { reason: reason });
        await this.deactivate();
        await this.activate();
        if (wasPublishing) await this.publishLocal();
      } catch (e) {
        try { console && console.warn && console.warn('[voice] heal failed:', e); } catch (e2) {}
      } finally { this._healing = false; }
    },
    async checkTraffic() {
      if (!this.pc || this._healing) return;
      try {
        var stats = await this.pc.getStats();
        var totalIn = 0, hasInbound = false;
        var self = this;
        // Sample per-track audio levels so callers can highlight who's
        // actually speaking — level ~ 0 = silent, ~ 1 = loud. Emitted as
        // a 'levels' event so the party UI can pulse the right avatar.
        var levels = {};
        stats.forEach(function (r) {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            hasInbound = true;
            totalIn += r.bytesReceived || 0;
            // audioLevel is 0..1 on standard browsers
            if (typeof r.audioLevel === 'number' && r.trackIdentifier)
              levels[r.trackIdentifier] = r.audioLevel;
          }
        });
        if (Object.keys(levels).length) emit('levels', levels);
        if (!hasInbound) { this._lastBytesAt = Date.now(); return; }
        if (totalIn > this._lastBytesIn) {
          this._lastBytesIn = totalIn;
          this._lastBytesAt = Date.now();
        } else if (Date.now() - this._lastBytesAt > 15000) {
          // 15 s of no bytes despite an active inbound stream — rebuild.
          this._lastBytesAt = Date.now();
          this.heal('silent-15s');
        }
      } catch (e) {}
    },

    async deactivate() {
      clearInterval(this._statsT); this._statsT = null;
      clearInterval(this._reconT); this._reconT = null;
      clearTimeout(this._healT); this._healT = null;
      try { socket.off('v-peer'); } catch (e) {}
      try { socket.off('v-roster'); } catch (e) {}
      try { socket.emit('v-leave'); } catch (e) {}
      if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
      // Detach any incoming <audio> tags — new session will attach fresh ones.
      try { document.querySelectorAll('audio[data-peer^="sfu:"]').forEach(function (a) { a.remove(); }); } catch (e) {}
      this.sessionId = null;
      this.localTrackNames = [];
      this.subscribed = {};
      this._knownPeers = {};
      // Reset the negotiation mutex so a fresh activate() doesn't chain
      // behind the old session's queued operations (which now target a
      // closed pc and will throw).
      this._negoQueue = Promise.resolve();
    },

    // Register a new local track (mic just opened) with Cloudflare.
    // Serialized behind _negoQueue so it never collides with a subscribe.
    publishTrack: function (track) {
      var self = this;
      return this._serialize(async function () {
        if (!self.pc || !self.sessionId) return;
        var transceiver = self.pc.addTransceiver(track, { direction: 'sendonly' });
        var offer = await self.pc.createOffer();
        // Rewrite our offer's Opus fmtp for stereo + FEC + 128 kbps + no DTX
        // BEFORE handing it to the PC, so the local view already reflects
        // the maxed-out params. CF echoes them back in its answer.
        offer = new RTCSessionDescription({ type: offer.type, sdp: tuneOpus(offer.sdp, 'publish') });
        await self.pc.setLocalDescription(offer);
        var body = {
          sdp: { type: 'offer', sdp: offer.sdp },
          tracks: [{ location: 'local', mid: transceiver.mid, trackName: track.id }]
        };
        var r = await fetch('/api/voice/cf/tracks/' + self.sessionId, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function (x) { return x.json(); });
        if (!r || !r.sessionDescription) throw new Error('Cloudflare publish failed.');
        await self.pc.setRemoteDescription(r.sessionDescription);
        // Cloudflare returns the assigned trackName for each pushed track.
        var names = (r.tracks || []).map(function (t) { return t.trackName; }).filter(Boolean);
        self.localTrackNames = self.localTrackNames.concat(names);
        // Tell the room what our tracks are called so subscribers can grab them.
        socket.emit('v-tracks', { cfSession: self.sessionId, tracks: self.localTrackNames });
      });
    },

    // Subscribe to every audio track a remote peer is publishing.
    // Serialized behind _negoQueue: renegotiation on the same PC MUST be
    // strictly sequential — a second setLocalDescription mid-flight throws
    // InvalidStateError and silently drops the subscription (owner bug
    // 2026-08-01: listener heard only 1 of 2 concurrent speakers).
    subscribeTo: function (peer) {
      var self = this;
      return this._serialize(async function () {
        if (!self.pc || !self.sessionId) return;
        if (!peer || !peer.cfSession || peer.cfSession === self.sessionId) return;
        if (!Array.isArray(peer.tracks) || !peer.tracks.length) return;
        // Dedup by (peer session, trackName). Filter BEFORE the fetch but
        // mark AFTER success — a failed subscribe must be retriable when
        // the next v-peer/v-roster event fires. (Old code marked before
        // fetch, so a transient error left the track permanently unheard.)
        var need = peer.tracks.filter(function (name) {
          var key = peer.cfSession + ':' + name;
          return !self.subscribed[key];
        });
        if (!need.length) return;
        var body = {
          tracks: need.map(function (name) {
            return { location: 'remote', sessionId: peer.cfSession, trackName: name };
          })
        };
        try {
          var r = await fetch('/api/voice/cf/tracks/' + self.sessionId, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          }).then(function (x) { return x.json(); });
          if (!r) return;
          // Cloudflare returns an OFFER we must answer via /renegotiate.
          if (r.requiresImmediateRenegotiation && r.sessionDescription) {
            await self.pc.setRemoteDescription(r.sessionDescription);
            var ans = await self.pc.createAnswer();
            // Tune Opus in our answer too so both directions run at 128 kbps.
            // Listener side — ask CF SFU for mono 40kbps (4× less
            // downstream bandwidth than the old stereo 128kbps).
            ans = new RTCSessionDescription({ type: ans.type, sdp: tuneOpus(ans.sdp, 'subscribe') });
            await self.pc.setLocalDescription(ans);
            await fetch('/api/voice/cf/renegotiate/' + self.sessionId, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sdp: { type: 'answer', sdp: ans.sdp } })
            });
          }
          // Only NOW mark these as subscribed — success confirmed.
          need.forEach(function (name) {
            self.subscribed[peer.cfSession + ':' + name] = true;
          });
        } catch (e) {
          try { console && console.warn && console.warn('[voice] subscribeTo failed for', peer.cfSession, e); } catch (e2) {}
          // Leave the dedup keys unset so the next v-peer for this speaker
          // (roster refresh, tab-return, or v-tracks re-broadcast) retries.
          throw e;
        }
      });
    },

    onPeer: function (m) {
      if (!m || m.id === myId) return;
      if (!m.on) {
        // Peer left / went off voice — forget them so the reconciliation
        // sweep stops trying to resubscribe.
        if (m.cfSession) delete this._knownPeers[m.cfSession];
        emit('peer-drop', { id: m.id });
        return;
      }
      // Remember every peer we've seen on voice so the reconciliation sweep
      // can retry silent failures. Track LIST is authoritative: an empty
      // list = they haven't published (or unpublished); a non-empty list
      // is what we must be subscribed to.
      if (m.cfSession) {
        this._knownPeers[m.cfSession] = {
          cfSession: m.cfSession,
          tracks: Array.isArray(m.tracks) ? m.tracks.slice() : []
        };
      }
      // If they've published tracks and we can, subscribe. Errors from
      // subscribeTo are swallowed here — they're already logged and will
      // retry on the next v-peer/v-roster/v-tracks event OR on the next
      // reconciliation sweep (every 10s).
      if (m.cfSession && m.tracks && m.tracks.length) {
        this.subscribeTo(m).catch(function () {});
      }
    },

    // Reconciliation sweep — every 10s, walk _knownPeers and re-issue a
    // subscribeTo for anyone whose tracks we haven't confirmed subscribed to.
    // subscribeTo is idempotent (dedups on this.subscribed[key]) so this is
    // safe to call repeatedly. Fixes the silent-failure class where a
    // transient CF 500 or an InvalidStateError during renegotiation left the
    // listener permanently unable to hear a speaker with no retry path.
    reconcileSubscriptions: function () {
      if (!this.pc || !this.sessionId) return;
      var self = this;
      var peers = this._knownPeers || {};
      Object.keys(peers).forEach(function (cfSession) {
        var p = peers[cfSession];
        if (!p || !p.tracks || !p.tracks.length) return;
        var missing = p.tracks.some(function (name) {
          return !self.subscribed[cfSession + ':' + name];
        });
        if (!missing) return;
        try { console && console.warn && console.warn('[voice] reconcile: retry subscribe to', cfSession, p.tracks); } catch (e) {}
        self.subscribeTo(p).catch(function () {});
      });
    },

    // Manual recovery — force re-subscribe to every known peer, ignoring the
    // dedup cache. Used by the "Reconnect audio" button in the party UI so
    // users have a one-tap escape hatch when audio is stuck.
    resubscribeAll: function () {
      if (!this.pc || !this.sessionId) return Promise.resolve();
      // Wipe dedup so subscribeTo re-runs even for already-subscribed tracks.
      this.subscribed = {};
      var self = this;
      var peers = this._knownPeers || {};
      var work = Object.keys(peers).map(function (cfSession) {
        return self.subscribeTo(peers[cfSession]).catch(function () {});
      });
      return Promise.all(work);
    },

    async publishLocal() {
      if (!localStream) return;
      var tracks = localStream.getAudioTracks();
      var anyFailed = false;
      for (var i = 0; i < tracks.length; i++) {
        try {
          await this.publishTrack(tracks[i]);
          // Coax the newly-added sender to 96 kbps Opus for HD voice.
          var senders = this.pc.getSenders().filter(function (s) { return s.track === tracks[i]; });
          for (var j = 0; j < senders.length; j++) await boostSender(senders[j]);
        } catch (e) {
          console.warn('sfu publish', e);
          anyFailed = true;
        }
      }
      // Loud fail path — the mic UI flips to "on" the moment the user taps,
      // but if Cloudflare's /tracks/new fails silently the room hears silence.
      // Fire a 'publish-fail' event so the party UI can toast + hint at the
      // Reconnect button. Owner bug 15 Aug 2026: "she can't hear me or anything."
      if (anyFailed) {
        try { emit('publish-fail', { reason: 'sfu' }); } catch (e) {}
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

  // Re-entrancy guard: double-taps on the mic button used to fire two
   // setMic calls concurrently. The `micOn === want` check at the top
   // returned early only if the first call had already updated the flag,
   // which it hadn't yet (both were awaiting activate/openMic). Both
   // proceeded, contending for the mic stream, leaving the UI stuck.
   var _micBusy = null;
   async function setMic(want) {
     // Only guard turning the mic ON. A demoted speaker must be able to
     // tear down their mic even after canPublish has been flipped to false
     // — otherwise the stream stays open and they keep broadcasting.
     if (want && !canPublish) throw new Error('Watchers cannot speak — only players can open the microphone.');
     if (_micBusy) { try { await _micBusy; } catch (e) {} }
     if (!!want === !!micOn) return micOn;
     // OPTIMISTIC UI — flip local mic flag + emit v-mic to peers + emit
     // local 'mic' event to update the mic button IMMEDIATELY, before any
     // async work. Feels Tandem-instant. If openMic/publish fails below,
     // we revert both the local flag and the peer chip. Owner ask
     // 21 Aug 2026: 'if I mute my mic it should be so fast and if unmute
     // it should be so fast and all speakers can see it right same like
     // the Tandem'.
     micOn = !!want;
     try { socket.emit('v-mic', { on: micOn }); } catch (e) {}
     emit('mic', { on: micOn });
     _micBusy = (async () => {
       await activate();
       if (want) {
         try { await openMic(); }
         catch (e) {
           // Permission denied / hardware failure — revert optimistic state.
           micOn = false;
           try { socket.emit('v-mic', { on: false }); } catch (e2) {}
           emit('mic', { on: false, err: e.message || 'Microphone permission denied.' });
           throw e;
         }
         // Publish to the SFU. If CF rejects, revert to muted so listeners
         // don't see a green chip they can't hear. Owner bug 2026-08-15.
         if (activePath.publishLocal) {
           try {
             await activePath.publishLocal();
             if (activePath === sfu && !sfu.localTrackNames.length) {
               throw new Error('Cloudflare accepted no tracks — publish silently failed.');
             }
           } catch (e) {
             try { console && console.warn && console.warn('[voice] publish failed, rolling back mic:', e); } catch (e2) {}
             try { if (activePath && activePath.unpublishLocal) await activePath.unpublishLocal(); } catch (e2) {}
             closeMic();
             micOn = false;
             try { socket.emit('v-mic', { on: false }); } catch (e2) {}
             emit('mic', { on: false, err: (e && e.message) || 'Voice publish failed — tap the mic again.' });
             throw e;
           }
         }
       } else {
         // Peer chip already flipped optimistically. Tear down the local
         // publish quietly in the background so audio actually stops.
         if (activePath && activePath.unpublishLocal) { try { await activePath.unpublishLocal(); } catch (e) {} }
         closeMic();
       }
       return micOn;
     })();
     try { return await _micBusy; }
     finally { _micBusy = null; }
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

  // When the tab wakes back up from being hidden (screen unlocked, tab
   // refocused, app foregrounded), do THREE things — cheap ones first:
   //   1. Force-play every remote <audio> element. Browsers routinely
   //      pause background-tab media; on refocus they DON'T auto-resume
   //      and the user hears silence with the mic chip still "on".
   //   2. Resume the local AudioContext if the browser suspended it.
   //   3. Only if the SFU peer connection is actually dead, rebuild.
   //      A live PC + stopped audio is by far the more common failure
   //      mode and doesn't need a full heal.
   document.addEventListener('visibilitychange', function () {
     if (document.hidden) return;
     if (!joined) return;
     // (1) Kick every remote audio element. Older Safari especially
     // needs an explicit .play() after backgrounding; the promise reject
     // is fine — usually just "already playing".
     document.querySelectorAll('audio[data-peer]').forEach(function (au) {
       try { var p = au.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
     });
     // (2) Resume the local analyser AudioContext if it was suspended
     // in the background. Suspended contexts drop the mic-level events
     // that pulse your own avatar, so the UI stops responding even
     // though the underlying WebRTC stream is fine.
     if (_localAnalyser && _localAnalyser.ac && _localAnalyser.ac.state === 'suspended') {
       try { _localAnalyser.ac.resume(); } catch (e) {}
     }
     // (3) Heal only if the peer connection is genuinely dead.
     if (VOICE_MODE === 'cloudflare' && activePath && activePath === sfu) {
       var pc = sfu.pc;
       if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
         sfu.heal('visibility');
       } else {
         // Owner ask 2 Aug 2026: 'auto-reconnect on foreground return'.
         // The pc can look 'connected' but be silently starved — iOS
         // Safari especially freezes the media pipeline after long
         // backgrounding. Reset the traffic-silence baseline so the
         // 500ms stats poll picks up the freeze immediately instead
         // of waiting the full 15s window.
         sfu._lastBytesIn = 0;
         sfu._lastBytesAt = Date.now();
         // Also nudge the receive-transport by explicitly reading stats
         // once — some browsers re-arm the pipeline on the first
         // getStats after a long background.
         try { pc.getStats(); } catch (e) {}
       }
     }
   });

  // ── connection-quality poll ─────────────────────────────────────────
  // Every 3s we call pc.getStats() and translate per-track inbound-rtp
  // packet-loss + jitter into a simple 0..3 score:
  //   3 = green   (< 2% loss, < 30ms jitter)
  //   2 = yellow  (< 8% loss, < 80ms jitter)
  //   1 = orange  (< 20% loss)
  //   0 = red     (worse — probably dropping words)
  // The party page listens for the 'quality' event and paints the dot
  // on each remote speaker's avatar.
  var _qualTimer = null;
  var _qualPrev = {}; // trackId -> { packets, lost, ts }
  function scoreFrom(lossPct, jitterMs) {
    if (lossPct < 2  && jitterMs < 30)  return 3;
    if (lossPct < 8  && jitterMs < 80)  return 2;
    if (lossPct < 20)                   return 1;
    return 0;
  }
  async function pollQuality() {
    if (!activePath || !activePath.pc) return;
    try {
      var stats = await activePath.pc.getStats();
      var out = {};
      stats.forEach(function (s) {
        if (s.type !== 'inbound-rtp' || s.kind !== 'audio') return;
        var id = s.trackIdentifier || s.id;
        if (!id) return;
        var packets = s.packetsReceived || 0;
        var lost    = s.packetsLost || 0;
        var jitter  = (s.jitter || 0) * 1000; // s → ms
        var prev = _qualPrev[id];
        var lossPct = 0;
        if (prev) {
          var dP = packets - prev.packets;
          var dL = lost    - prev.lost;
          if (dP + dL > 0) lossPct = (dL / (dP + dL)) * 100;
        }
        _qualPrev[id] = { packets: packets, lost: lost, ts: Date.now() };
        out[id] = scoreFrom(lossPct, jitter);
      });
      emit('quality', out);
    } catch (e) { /* getStats can throw during renegotiation — ignore */ }
  }
  function startQualityPoll() {
    if (_qualTimer) return;
    _qualTimer = setInterval(pollQuality, 3000);
  }
  function stopQualityPoll() {
    if (_qualTimer) { clearInterval(_qualTimer); _qualTimer = null; }
    _qualPrev = {};
    stopOutboundQualityPoll();
  }

  // ── outbound connection-quality poll (MY OWN upload) ────────────────
  // Owner ask 15 Aug 2026: if MY connection to the SFU is bad, show a
  // red signal on my avatar so I know it's my end that's flaking (and
  // broadcast it to the room so others see the same chip on my card).
  //
  // Different stats surface than the inbound poll above:
  //   · remote-inbound-rtp — the SFU's view of MY outgoing stream:
  //       roundTripTime (s), jitter (s), fractionLost (0..1), packetsLost.
  //   · outbound-rtp — MY sender's own counters: packetsSent + totalPacketsSent.
  //
  // We derive per-window loss from Δ(packetsLost) / Δ(packetsSent) since the
  // last poll — fractionLost is EWMA-smoothed by the browser and lags 3-4s.
  //
  // Buckets:
  //   good  — everything else
  //   weak  — loss > 3%  OR RTT > 250ms OR jitter > 30ms
  //   bad   — loss > 8%  OR RTT > 500ms OR jitter > 50ms
  //
  // Hysteresis: bucket must persist 2 consecutive polls before we EMIT a
  // transition — stops the chip from flickering on a single lossy sample.
  // First 5s after activate are skipped: fresh WebRTC stats are noisy
  // (initial ICE + DTLS setup shows loss/RTT spikes that self-heal).
  var _outQTimer = null;
  var _outQPrev = null;         // { packetsSent, packetsLost }
  var _outQEmittedBucket = 'good';
  var _outQCandidate = null;    // { bucket, count }
  var _outQStartedAt = 0;
  var GRACE_MS = 5000;

  function bucketFrom(lossPct, rttMs, jitterMs) {
    if (lossPct > 8 || rttMs > 500 || jitterMs > 50) return 'bad';
    if (lossPct > 3 || rttMs > 250 || jitterMs > 30) return 'weak';
    return 'good';
  }
  async function pollOutboundQuality() {
    // Only poll while publishing + tab visible.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (!activePath || !activePath.pc) return;
    // Only speakers publish audio — listeners have no outbound stream to score.
    if (!micOn || !localStream) return;
    if (Date.now() - _outQStartedAt < GRACE_MS) return;
    try {
      var stats = await activePath.pc.getStats();
      var packetsSent = 0, packetsLostRemote = 0, rttSec = 0, jitterSec = 0;
      var haveOutbound = false, haveRemoteInbound = false;
      stats.forEach(function (r) {
        if (r.type === 'outbound-rtp' && r.kind === 'audio') {
          haveOutbound = true;
          packetsSent += (r.packetsSent || 0);
        } else if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') {
          haveRemoteInbound = true;
          packetsLostRemote += (r.packetsLost || 0);
          // Some browsers report one remote-inbound per sender. Keep the
          // worst RTT / jitter across senders (usually only 1).
          if (typeof r.roundTripTime === 'number' && r.roundTripTime > rttSec) rttSec = r.roundTripTime;
          if (typeof r.jitter === 'number' && r.jitter > jitterSec) jitterSec = r.jitter;
        }
      });
      // Unsupported browser (no remote-inbound stats at all) — degrade silently.
      if (!haveOutbound || !haveRemoteInbound) return;
      var lossPct = 0;
      if (_outQPrev) {
        var dS = packetsSent - _outQPrev.packetsSent;
        var dL = packetsLostRemote - _outQPrev.packetsLost;
        if (dS + dL > 0 && dS >= 0 && dL >= 0) lossPct = (dL / (dS + dL)) * 100;
      }
      _outQPrev = { packetsSent: packetsSent, packetsLost: packetsLostRemote };
      var rttMs = rttSec * 1000;
      var jitterMs = jitterSec * 1000;
      var bucket = bucketFrom(lossPct, rttMs, jitterMs);
      // Hysteresis — require 2 consecutive same-bucket polls before emitting.
      if (bucket === _outQEmittedBucket) { _outQCandidate = null; return; }
      if (!_outQCandidate || _outQCandidate.bucket !== bucket) {
        _outQCandidate = { bucket: bucket, count: 1 };
        return;
      }
      _outQCandidate.count++;
      if (_outQCandidate.count >= 2) {
        _outQEmittedBucket = bucket;
        _outQCandidate = null;
        emit('outbound-quality', { bucket: bucket, lossPct: lossPct, rttMs: rttMs, jitterMs: jitterMs });
      }
    } catch (e) { /* getStats can throw during renegotiation — ignore */ }
  }
  function startOutboundQualityPoll() {
    if (_outQTimer) return;
    _outQStartedAt = Date.now();
    _outQPrev = null;
    _outQCandidate = null;
    _outQEmittedBucket = 'good';
    _outQTimer = setInterval(pollOutboundQuality, 3000);
  }
  function stopOutboundQualityPoll() {
    if (_outQTimer) { clearInterval(_outQTimer); _outQTimer = null; }
    _outQPrev = null;
    _outQCandidate = null;
    // Emit a synthetic 'good' so the caller can clear the chip on stop.
    if (_outQEmittedBucket !== 'good') {
      _outQEmittedBucket = 'good';
      emit('outbound-quality', { bucket: 'good', lossPct: 0, rttMs: 0, jitterMs: 0 });
    }
  }
  // Pause outbound polling while the tab is hidden (background tabs
  // throttle timers to ~1/min; stats sampled that sparsely are useless).
  // Resume on show — reset baseline so the next poll's delta isn't a huge
  // spike from the whole background window.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (!_outQTimer) return;
      _outQStartedAt = Date.now();
      _outQPrev = null;
      _outQCandidate = null;
    });
  }

  // Manual "reconnect audio" — the user-visible escape hatch when audio is
  // stuck. Two-part recovery:
  //   1. If we're a speaker with the mic open, re-publish our local track
  //      (tear down + push a fresh offer to CF). Fixes the case where our
  //      original publish silently died mid-session (CF closed our track,
  //      ICE went to failed, renegotiation lost).
  //   2. Ask the SFU path to re-subscribe to every known remote peer,
  //      ignoring the dedup cache. Fixes the listener side of the same
  //      failure — one bad renegotiation and we stopped hearing a speaker
  //      with no retry.
  // Both steps are idempotent + best-effort. Never throws.
  async function reconnectAudio() {
    try { console && console.warn && console.warn('[voice] reconnectAudio: user-triggered recovery'); } catch (e) {}
    try {
      // Step 1: republish if we're a speaker and mic is on.
      if (micOn && localStream && activePath && activePath.publishLocal) {
        // For the SFU path, clear our record of published tracks and
        // re-run publish. Cloudflare will assign new track names; we
        // rebroadcast v-tracks so listeners re-subscribe.
        if (activePath === sfu) {
          try { await sfu.unpublishLocal(); } catch (e) {}
          sfu.localTrackNames = [];
        }
        try { await activePath.publishLocal(); } catch (e) {
          try { console && console.warn && console.warn('[voice] reconnectAudio: republish failed', e); } catch (e2) {}
        }
      }
      // Step 2: re-subscribe to every known peer.
      if (activePath && activePath.resubscribeAll) {
        try { await activePath.resubscribeAll(); } catch (e) {}
      }
      // Step 3: kick every remote <audio> — browsers occasionally leave
      // them paused after a long stall even when the underlying stream
      // is fine. Same trick as the visibilitychange handler.
      try {
        document.querySelectorAll('audio[data-peer]').forEach(function (au) {
          try { var p = au.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        });
      } catch (e) {}
    } catch (e) {
      try { console && console.warn && console.warn('[voice] reconnectAudio failed:', e); } catch (e2) {}
    }
  }

  window.wsVoice = {
    init: init, destroy: destroy, setMic: setMic, on: on,
    startQualityPoll: startQualityPoll, stopQualityPoll: stopQualityPoll,
    startOutboundQualityPoll: startOutboundQualityPoll,
    stopOutboundQualityPoll: stopOutboundQualityPoll,
    reconnectAudio: reconnectAudio,
    get micOn() { return micOn; },
    get canPublish() { return canPublish; },
    get mode() { return VOICE_MODE; },
    setCanPublish: function (v) { canPublish = !!v; },
    setMyId: function (id) { myId = String(id || ''); }
  };
})();
