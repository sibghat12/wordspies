# Agora Voice migration — TalkSibi parties

**Owner decision (21 Aug 2026):** move party voice from Cloudflare Realtime SFU → Agora Voice SDK. Path B — ship v1.0.0 on Cloudflare, migrate during the 14-day tester period, ship as v1.1.0 with zero user disruption (Play Store auto-updates).

**Why Agora?** Tandem + HelloTalk use it. Production-grade reconnection (fixes owner's "auto disconnect" complaint), reliable broadcast (fixes "user can't broadcast in full room"), 10K free minutes/month, ~$0.06/participant-hour after.

**Coder session executes this. Owner supplies credentials only.** I never touch API keys.

---

## Phase 0 — Owner does (unblocks everything)

- [ ] Sign up: [agora.io/en/products/voice-call](https://www.agora.io/en/products/voice-call)
- [ ] Create project "TalkSibi Party" → get **App ID** + **App Certificate**
- [ ] Store both in 1Password (never paste in chat)
- [ ] SSH to droplet, add to `/etc/wordspies.env`:
  ```
  AGORA_APP_ID=<your app id>
  AGORA_APP_CERTIFICATE=<your certificate>
  AGORA_ENABLED=true
  ```
- [ ] Restart the service so new env vars load: `sudo systemctl restart wordspies` (the systemd unit is `wordspies.service`, WorkingDirectory=/opt/wordspies, EnvironmentFile=/etc/wordspies.env)
- [ ] Verify env via `cat /proc/$(pgrep -f 'node.*server.js')/environ | tr '\0' '\n' | grep AGORA`

## Phase 1 — Server: token generation (coder, 1 hour)

Agora Voice needs a short-lived token per user per room. Server generates it using the App Certificate. Client uses the token to join the Agora channel.

- [ ] `npm install agora-token` (official Agora SDK for Node)
- [ ] New route `POST /api/parties/:code/agora-token` in `party.js`:
  ```js
  const { RtcTokenBuilder, RtcRole } = require('agora-token');
  api.post('/parties/:code/agora-token', async (req, res) => {
    const uid = await options.uidFromReq(req);
    if (!uid) return res.status(401).json({ error: 'Log in first.' });
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ error: 'No such party.' });
    // Check membership: is this user actually in the room?
    const inRoom = Array.from(room.members.values()).some(m => m.uid === uid);
    if (!inRoom) return res.status(403).json({ error: 'Join the party first.' });
    // Determine role — hosts + speakers can PUBLISH (mic), listeners
    // can only SUBSCRIBE. This maps to Agora's PUBLISHER vs SUBSCRIBER.
    const member = Array.from(room.members.values()).find(m => m.uid === uid);
    const role = (member.role === 'speaker' || member.role === 'host')
      ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    // Numeric UID that Agora requires (browser SDK accepts string too but
    // number is more reliable). Hash the user uid into a stable int.
    const numericUid = hashToInt(uid);
    const channel = 'ts-' + code.toLowerCase();
    const expireSec = 3600;  // 1 hour — renew before expiry client-side
    const token = RtcTokenBuilder.buildTokenWithUid(
      process.env.AGORA_APP_ID,
      process.env.AGORA_APP_CERTIFICATE,
      channel, numericUid, role,
      Math.floor(Date.now()/1000) + expireSec,
      Math.floor(Date.now()/1000) + expireSec
    );
    res.json({
      appId: process.env.AGORA_APP_ID,
      channel, token, uid: numericUid, role: (role === RtcRole.PUBLISHER) ? 'publisher' : 'subscriber',
      expiresAt: Date.now() + (expireSec * 1000)
    });
  });
  function hashToInt(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  ```
- [ ] Add role-change notification: when a member gets promoted from listener → speaker (or demoted), server emits a socket event so client fetches a new token with the new role.

## Phase 2 — Client: swap voice.js internals (coder, 3 hours)

Keep the `voice.js` module INTERFACE the same (openMic, closeMic, on(event), publishTo(room)). Swap internals from Cloudflare Realtime → Agora.

- [ ] Add Agora SDK to HTML head: 
  ```html
  <script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js"></script>
  ```
  (Or `npm install agora-rtc-sdk-ng` if bundling — script tag is simpler)
- [ ] New file `public/agora-voice.js` — implements the same interface as `voice.js` but uses Agora SDK
- [ ] Feature-flag switch in `party.html` at boot:
  ```js
  const useAgora = window.AGORA_ENABLED === true;
  window.wsVoice = useAgora ? window.AgoraVoice : window.CloudflareVoice;
  ```
- [ ] Server injects `window.AGORA_ENABLED = true` into party.html when `AGORA_ENABLED=true` env var is set (so switch is server-controlled, not client-hackable)

## Phase 3 — Agora client wire-up (coder, 4 hours)

Standard Agora Voice flow. Reference: [Agora Web Quickstart](https://docs.agora.io/en/voice-calling/get-started/get-started-sdk).

```js
// public/agora-voice.js — sketch, coder fills in
class AgoraVoice {
  async join(roomCode, myRole) {
    // 1. Fetch token from our backend
    const r = await fetch(`/api/parties/${roomCode}/agora-token`, {credentials:'include'});
    const {appId, channel, token, uid, role} = await r.json();
    // 2. Create Agora client
    this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    await this.client.setClientRole(role);  // host=publisher, audience=subscriber
    // 3. Join channel with token
    await this.client.join(appId, channel, token, uid);
    // 4. If publisher, create + publish mic track
    if (role === 'publisher') {
      this.mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'music_standard',   // 48kHz, good for language learning
        AEC: true, ANS: true, AGC: true    // echo cancel, noise suppress, auto gain
      });
      await this.client.publish([this.mic]);
    }
    // 5. Auto-subscribe to remote publishers
    this.client.on('user-published', async (remoteUser, mediaType) => {
      if (mediaType !== 'audio') return;
      await this.client.subscribe(remoteUser, mediaType);
      remoteUser.audioTrack.play();
    });
    // 6. Emit our events for party.js to render UI
    this.client.on('connection-state-change', s => this.emit('state', s));
    this.client.on('user-left', u => this.emit('user-left', u.uid));
  }
  async mute() { if (this.mic) await this.mic.setMuted(true); }
  async unmute() { if (this.mic) await this.mic.setMuted(false); }
  async leave() {
    if (this.mic) { this.mic.close(); this.mic = null; }
    await this.client.leave();
    this.client = null;
  }
}
```

## Phase 4 — Party.js integration (coder, 2 hours)

- [ ] Where party.js currently calls `wsVoice.openMic()` — no change needed (interface preserved)
- [ ] Where party.js listens for `v-tracks` / `v-mic` events — verify the AgoraVoice class emits equivalent events
- [ ] Role change flow: when server promotes a listener to speaker, client re-calls Agora `setClientRole('host')` — no re-join needed. Agora handles this cleanly.
- [ ] Reconnection: Agora SDK auto-reconnects on network switch. Remove any manual reconnect code from `voice.js` (it's now dead code).

## Phase 5 — Mute/unmute reliability (fixes owner's ask)

This is a natural consequence of using Agora — mute state is authoritative because Agora syncs it as part of the track state. But wire up the UI cleanly:

- [ ] When user taps mic button → call `AgoraVoice.mute()` / `unmute()`
- [ ] Await the promise before updating UI (don't optimistically flip — wait for confirmation)
- [ ] On error → toast + revert UI state
- [ ] Listen for remote `user-published` / `user-unpublished` to detect when peers mute/unmute — update THEIR mic chip in the participant list

## Phase 6 — Test plan

**Sanity (coder does before committing):**
- [ ] Two browser tabs join same party, speaker in tab A can be heard in tab B
- [ ] Mute in tab A → immediately reflected as muted in tab B's participant list
- [ ] Tab A switches from wifi to mobile hotspot → connection recovers within 5s without page refresh
- [ ] Tab A backgrounded for 10s → returns to foreground → audio still working

**Load test (before promoting v1.1.0 to Play Store production):**
- [ ] 20 tabs in same room, all listeners, 5 speakers → verify audio latency < 300ms mouth-to-ear
- [ ] Kill a speaker's connection → their chip goes offline in participant list within 3s
- [ ] Speaker leaves + rejoins → they can publish again with a fresh token

**Cost sanity:**
- [ ] Check Agora dashboard after 24h of testing → verify free-tier minutes are burning at expected rate
- [ ] If overage triggers unexpectedly, kill switch: set `AGORA_ENABLED=false` on droplet → clients fall back to Cloudflare Realtime SFU

## Phase 7 — Rollback strategy

The `AGORA_ENABLED` env var + feature flag pattern in Phase 2 = **instant rollback**. If any critical bug emerges after v1.1.0 goes live:

1. SSH to droplet
2. `sudo sed -i 's/AGORA_ENABLED=true/AGORA_ENABLED=false/' /etc/wordspies.env`
3. `sudo systemctl restart wordspies`
4. Every future page load falls back to Cloudflare Realtime SFU
5. Debug + fix + re-enable

Zero client rebuild needed for rollback. Users don't notice.

## Phase 8 — When to delete the Cloudflare Realtime code

**Not until v1.2.0 at earliest.** Keep the fallback for 30+ days after v1.1.0 goes live in case an Agora issue we haven't found surfaces. Then delete `voice.js` (Cloudflare version), keep `agora-voice.js` only.

## Cost projection

Beta (100 users, 20 parties/month, 10 avg speakers, 30 min each): **~6,000 minutes/month → FREE**

Growth (1000 users, 200 parties/month): **~60,000 minutes/month → $50/month**

Scale (10k users, 1500 parties/month): **~450,000 minutes/month → $445/month**

For monetization: 1 Pro subscriber ($5/month) covers ~5,000 party-minutes. So even at 10k free users you need ~90 Pro subscribers to be profitable — very reachable.

## Docs the coder should read before starting

1. [Agora Voice SDK for Web — Quickstart](https://docs.agora.io/en/voice-calling/get-started/get-started-sdk?platform=web)
2. [Live Interactive Streaming for Web](https://docs.agora.io/en/interactive-live-streaming/get-started/get-started-sdk?platform=web) — this is closer to the "parties" model (host/audience)
3. [Token generation with agora-token npm](https://www.npmjs.com/package/agora-token)
4. [Reconnection best practices](https://docs.agora.io/en/help/quality-issues/connection_states)

## Timeline

Estimated coder session effort: **3-5 days focused work + 2-3 days testing**.

Owner's 14-day tester period on v1.0.0 gives more than enough runway. Ship v1.1.0 as a mid-testing-period upgrade so testers experience the improvement before public launch.

## Anti-scope

Do NOT bundle in this migration:
- Live translation captions (that's the next big feature — separate work)
- Recording (Agora supports it but adds cost — do it in v1.2.0)
- Video / screen share (TalkSibi is voice-only for the language pillar)
- Party games moving to Agora Data channel (they use the existing socket.io just fine)

Keep this focused on: parties feel bulletproof.
