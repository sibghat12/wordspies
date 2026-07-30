/* voice.js — in-game WebRTC voice.
 *
 * A game page calls wsVoice.init({socket, myId, canPublish, roomCode}) once
 * the socket is connected and the local player's id is known. From then on:
 *   wsVoice.setMic(true|false)      → open or close the microphone
 *   wsVoice.on(event, cb)           → 'peer-add', 'peer-drop', 'mic', 'peers'
 *   wsVoice.destroy()               → tear everything down
 *
 * Server side just relays these events on the game namespace:
 *   'v-join'   → I'm on voice
 *   'v-leave'  → I'm off voice
 *   'v-signal' → SDP + ICE, addressed to a specific peer id
 *   'v-peer'   → server tells me another socket joined/left voice
 *
 * Uses Google's free STUN servers. Peer-to-peer mesh (fine for the tiny
 * game rooms we have — 2 seated players + a handful of watchers listening).
 * No TURN → in rare cases (symmetric-NAT carrier networks) the connection
 * will fail. Add TURN later if we see real complaints.
 */
(function () {
  'use strict';

  var RTC_CFG = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
  };

  var socket = null;
  var myId = null;
  var canPublish = false;
  var roomCode = null;
  var joined = false;
  var micOn = false;
  var localStream = null;
  var peers = {};               // id → { pc, audioEl, gotOffer }
  var listeners = {};
  var audioMountEl = null;

  function emit(ev, arg) {
    (listeners[ev] || []).forEach(function (cb) { try { cb(arg); } catch (e) {} });
  }

  function on(ev, cb) {
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function off() {
      listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== cb; });
    };
  }

  function ensureAudioMount() {
    if (audioMountEl) return audioMountEl;
    audioMountEl = document.createElement('div');
    audioMountEl.id = 'wsVoiceAudios';
    audioMountEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(audioMountEl);
    return audioMountEl;
  }

  function makePeer(id) {
    var p = peers[id];
    if (p && p.pc) return p;
    var pc = new RTCPeerConnection(RTC_CFG);
    pc.onicecandidate = function (e) {
      if (e.candidate) socket.emit('v-signal', { to: id, ice: e.candidate });
    };
    pc.ontrack = function (e) {
      var au = peers[id] && peers[id].audioEl;
      if (!au) {
        au = document.createElement('audio');
        au.autoplay = true;
        au.playsInline = true;
        au.setAttribute('data-peer', id);
        ensureAudioMount().appendChild(au);
      }
      au.srcObject = e.streams[0] || new MediaStream([e.track]);
      peers[id].audioEl = au;
      emit('peer-add', { id: id });
    };
    pc.onconnectionstatechange = function () {
      var s = pc.connectionState;
      if (s === 'failed' || s === 'closed') dropPeer(id);
    };
    // If we already have a local mic track, publish it up-front
    if (localStream) {
      localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
    }
    peers[id] = { pc: pc, audioEl: null, gotOffer: false };
    emit('peers', Object.keys(peers));
    return peers[id];
  }

  function dropPeer(id) {
    var p = peers[id]; if (!p) return;
    try { p.pc.close(); } catch (e) {}
    if (p.audioEl) { try { p.audioEl.remove(); } catch (e) {} }
    delete peers[id];
    emit('peer-drop', { id: id });
    emit('peers', Object.keys(peers));
  }

  // We negotiate as the "polite peer" toward peers with a lower id
  // (deterministic ordering). Whoever's id sorts higher creates the offer.
  function shouldInitiate(otherId) { return myId > otherId; }

  async function offerTo(id) {
    var p = makePeer(id);
    try {
      var offer = await p.pc.createOffer({ offerToReceiveAudio: true });
      await p.pc.setLocalDescription(offer);
      socket.emit('v-signal', { to: id, sdp: p.pc.localDescription });
    } catch (e) { console.warn('v offer', e); }
  }

  async function onSignal(msg) {
    if (!msg || !msg.from) return;
    var id = msg.from;
    var p = makePeer(id);
    try {
      if (msg.sdp) {
        var desc = new RTCSessionDescription(msg.sdp);
        if (desc.type === 'offer') {
          await p.pc.setRemoteDescription(desc);
          var answer = await p.pc.createAnswer();
          await p.pc.setLocalDescription(answer);
          socket.emit('v-signal', { to: id, sdp: p.pc.localDescription });
        } else if (desc.type === 'answer') {
          await p.pc.setRemoteDescription(desc);
        }
      } else if (msg.ice) {
        try { await p.pc.addIceCandidate(msg.ice); } catch (e) {}
      }
    } catch (e) { console.warn('v signal', e); }
  }

  function onPeer(msg) {
    if (!msg || !msg.id || msg.id === myId) return;
    if (msg.on) {
      // A new peer arrived. Whichever side is the initiator makes the offer;
      // the other side just prepares a PC so it can accept.
      makePeer(msg.id);
      if (shouldInitiate(msg.id)) offerTo(msg.id);
    } else {
      dropPeer(msg.id);
    }
  }

  async function openMic() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser has no microphone support.');
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    // Push the track into any existing peer connection
    Object.keys(peers).forEach(function (id) {
      var p = peers[id]; if (!p || !p.pc) return;
      localStream.getTracks().forEach(function (t) { p.pc.addTrack(t, localStream); });
      // Re-offer so the peer picks up the new track
      if (shouldInitiate(id)) offerTo(id);
    });
    return localStream;
  }

  function closeMic() {
    if (!localStream) return;
    try { localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    localStream = null;
    // Tell peers to drop the track; simpler to renegotiate by closing PCs.
    Object.keys(peers).forEach(function (id) {
      var p = peers[id]; if (!p) return;
      p.pc.getSenders().forEach(function (s) { try { p.pc.removeTrack(s); } catch (e) {} });
      if (shouldInitiate(id)) offerTo(id);
    });
  }

  async function setMic(want) {
    if (!canPublish) throw new Error('Watchers cannot speak — only players can open the microphone.');
    if (!!want === !!micOn) return micOn;
    if (want) {
      try { await openMic(); }
      catch (e) { emit('mic', { on: false, err: e.message || 'Microphone permission denied.' }); throw e; }
      micOn = true;
    } else {
      closeMic();
      micOn = false;
    }
    emit('mic', { on: micOn });
    return micOn;
  }

  function init(opts) {
    if (joined) return;
    socket = opts.socket;
    myId = String(opts.myId || (socket && socket.id) || '');
    canPublish = !!opts.canPublish;
    roomCode = opts.roomCode || null;
    if (!socket || !myId) return;
    socket.on('v-signal', onSignal);
    socket.on('v-peer', onPeer);
    socket.emit('v-join');
    joined = true;
  }

  function destroy() {
    if (!joined) return;
    try { socket.off('v-signal', onSignal); } catch (e) {}
    try { socket.off('v-peer', onPeer); } catch (e) {}
    try { socket.emit('v-leave'); } catch (e) {}
    Object.keys(peers).forEach(dropPeer);
    closeMic();
    joined = false; micOn = false;
    emit('mic', { on: false });
  }

  window.wsVoice = {
    init: init, destroy: destroy, setMic: setMic, on: on,
    get micOn() { return micOn; },
    get peerCount() { return Object.keys(peers).length; },
    get canPublish() { return canPublish; },
    setCanPublish: function (v) { canPublish = !!v; },
    setMyId: function (id) { myId = String(id || ''); }
  };
})();
