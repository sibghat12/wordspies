# Capacitor migration — TalkSibi TWA → Native shell

**Coder session executes this. Owner supplies credentials only.**

Same handoff pattern as `app/AGORA_MIGRATION.md`. Don't start until owner
confirms Phase 0 credentials are on the droplet.

**Why we're migrating:** TWA can't receive native FCM push. Android shows
`talksibi.com` (the domain) instead of `TalkSibi` (the app name) on
notifications for users who subscribe from Chrome browser. Fresh Play
Store users don't hit this, but for a "premium feel" (WhatsApp / Signal
style push) we need native FCM through a Capacitor wrapper.

**When to execute:** After v1.0.0 is stable on Play Store Production
(month 2 at earliest). NOT before launch — TWA works fine, this is
polish, not blocker.

**What ships:** v2.0.0 as a Capacitor-wrapped native APK. Same website
code (talksibi.com), same backend, same Agora voice. Only the SHELL
changes — from TWA (Chrome Custom Tab) to Capacitor (real native
Android process with WebView).

## What owner gets (visible improvements)

- ✅ Notifications say `TalkSibi` — no domain
- ✅ Full custom notification layouts (rich media, inline reply, grouped)
- ✅ Native mic access — better voice call quality on shaky networks
- ✅ Better battery behavior when app is backgrounded
- ✅ Native gestures + haptics
- ✅ App-icon badge counter that Android natively renders
- ✅ Everything else stays the same — website code still ships instantly

## What owner keeps

- ✅ `git push` still deploys web changes in ~60s (Capacitor loads the
  live site by default)
- ✅ One codebase (backend unchanged, frontend unchanged)
- ✅ Same Play Console listing, same testers, same reviews
- ✅ Same Agora Voice integration

---

## Phase 0 — Owner does (unblocks everything)

- [ ] Create a Firebase project at `console.firebase.google.com`
  - Name: `TalkSibi Push`
  - Add Android app → package name `app.talksibi.twa` (SAME as the TWA
    so users get seamless updates, no reinstall required)
  - Download `google-services.json` → SAVE to 1Password + Google Drive
    (do NOT commit to git — will end up in `.gitignore`)
- [ ] In Firebase console → Project Settings → Cloud Messaging tab →
  copy the **Server key** (aka Legacy Server Key). If missing, enable
  Cloud Messaging API via the "Manage API in Google Cloud Console" link.
- [ ] SSH to droplet, add to `/etc/wordspies.env`:
  ```
  FCM_SERVER_KEY=<paste-key-here>
  FCM_ENABLED=false
  ```
- [ ] `sudo systemctl restart wordspies`
- [ ] Verify: `cat /proc/$(pgrep -f 'node.*server.js')/environ | tr '\0' '\n' | grep -c '^FCM_'`
  → should print `2`
- [ ] Report back to coder: **"2 FCM vars on droplet"**

**Credential rules — hard:** Never accept `FCM_SERVER_KEY` in chat. Never
log it. Never `console.log(process.env.FCM_SERVER_KEY)`. Only touch it
via `process.env`.

## Phase 1 — Capacitor project init (coder, 2 hours)

Local machine (owner's Mac or coder's box):

- [ ] Prerequisites: Java 17, Node 20, Android Studio installed
- [ ] From repo root:
  ```bash
  npm install --save @capacitor/core @capacitor/cli @capacitor/android
  npm install --save @capacitor/push-notifications @capacitor/app @capacitor/status-bar @capacitor/splash-screen
  ```
- [ ] Init Capacitor:
  ```bash
  npx cap init TalkSibi app.talksibi.twa
  ```
- [ ] Create `capacitor.config.json` at repo root:
  ```json
  {
    "appId": "app.talksibi.twa",
    "appName": "TalkSibi",
    "webDir": "public",
    "server": {
      "url": "https://talksibi.com/app?src=capacitor",
      "cleartext": false,
      "hostname": "talksibi.com",
      "androidScheme": "https"
    },
    "android": {
      "backgroundColor": "#5B6CFF",
      "allowMixedContent": false,
      "captureInput": true,
      "webContentsDebuggingEnabled": false
    },
    "plugins": {
      "PushNotifications": {
        "presentationOptions": ["badge", "sound", "alert"]
      },
      "SplashScreen": {
        "launchShowDuration": 400,
        "backgroundColor": "#5B6CFF",
        "androidSplashResourceName": "splash",
        "androidScaleType": "CENTER_CROP"
      }
    }
  }
  ```
- [ ] Add Android platform:
  ```bash
  npx cap add android
  ```
- [ ] This creates `android/` directory. Add to `.gitignore`:
  ```
  android/app/build/
  android/build/
  android/.gradle/
  android/local.properties
  android/keystore.properties
  # Capacitor generated
  android/app/src/main/assets/capacitor.config.json
  android/app/src/main/assets/capacitor.plugins.json
  ```

## Phase 2 — Copy signing keystore + Firebase config (coder, 30 min)

- [ ] Copy the existing keystore from the TWA build folder — we must
  use the SAME keystore so Play Store treats v2.0.0 as an update to
  v1.x, not a new app:
  ```bash
  cp /Users/sibghatullah/Downloads/wordspies/app/android.keystore \
     /Users/sibghatullah/Downloads/wordspies/android/app/talksibi.keystore
  ```
- [ ] Create `android/keystore.properties` (gitignored):
  ```
  storeFile=talksibi.keystore
  storePassword=<from-1Password>
  keyAlias=android
  keyPassword=<from-1Password>
  ```
- [ ] Copy `google-services.json` (owner provides from Phase 0) to
  `android/app/google-services.json`. Do NOT commit — add to
  `.gitignore`.
- [ ] Update `android/app/build.gradle` to load the keystore properties
  file and add signingConfigs (standard Android Gradle pattern).
- [ ] Add Google Services Gradle plugin:
  - Root `android/build.gradle`: add `classpath 'com.google.gms:google-services:4.4.0'`
  - `android/app/build.gradle` bottom: `apply plugin: 'com.google.gms.google-services'`

## Phase 3 — Native push wire-up (coder, 4 hours)

**Client side** — add push subscribe code that runs at app boot when
running inside Capacitor:

- [ ] Create `public/capacitor-push.js`:
  ```javascript
  // Only runs when the page is loaded inside Capacitor (not browser,
  // not TWA). Detected via window.Capacitor or the user agent hint.
  (function () {
    if (typeof window === 'undefined') return;
    if (!window.Capacitor || !window.Capacitor.isNativePlatform) return;
    if (!window.Capacitor.isNativePlatform()) return;
    // Load once the page has ME (a logged-in user).
    document.addEventListener('DOMContentLoaded', async () => {
      // Wait for ME to be defined by social.js
      for (let i = 0; i < 40 && typeof window.ME === 'undefined'; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (!window.ME) return;
      const { PushNotifications } = window.Capacitor.Plugins;
      // Request permission
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;
      // Register with FCM
      await PushNotifications.register();
      // On successful registration, we get an FCM token
      PushNotifications.addListener('registration', async (token) => {
        try {
          await fetch('/api/social/push/fcm-register', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value, platform: 'android' })
          });
        } catch (e) { console.warn('[capacitor-push] register failed', e); }
      });
      // Handle received notifications
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        // Foreground receipt — router already handles the UI, no toast
      });
      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        // User tapped the notification. Deep-link to whatever URL is in data.
        const url = a.notification.data && a.notification.data.url;
        if (url) location.href = url;
      });
    });
  })();
  ```
- [ ] In `public/social.html`, add `<script src="/capacitor-push.js"></script>`
  in the head after voice.js loads.

**Server side** — add FCM send path in `social.js`:

- [ ] `npm install firebase-admin`
- [ ] In social.js, add near the existing `sendPush` function:
  ```javascript
  let _fcmApp = null;
  function initFcm() {
    if (_fcmApp) return _fcmApp;
    if (process.env.FCM_ENABLED !== 'true') return null;
    if (!process.env.FCM_SERVER_KEY) return null;
    try {
      const admin = require('firebase-admin');
      _fcmApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: 'talksibi-push',
          privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: process.env.FCM_CLIENT_EMAIL
        })
      });
      return _fcmApp;
    } catch (e) {
      console.error('[fcm] init failed');
      return null;
    }
  }

  // POST /api/social/push/fcm-register — capacitor-push.js calls this
  // once it has an FCM token from Firebase. Same shape as the existing
  // web push /push/subscribe endpoint.
  api.post('/push/fcm-register', async (req, res) => {
    try {
      const u = await userFromReq(req);
      if (!u) return res.status(401).json({ error: 'Please log in.' });
      const token = String((req.body || {}).token || '');
      if (!/^[a-zA-Z0-9:_-]{20,300}$/.test(token)) {
        return res.status(400).json({ error: 'Bad FCM token.' });
      }
      await db.sadd('soc:fcm:' + u.id, token);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Something went wrong.' }); }
  });

  // Extend sendPush so it ALSO fires FCM for users who registered from
  // Capacitor. Web Push still fires for browser/TWA users. Both paths
  // are best-effort; a user with both subscriptions gets one FCM ping
  // (which shows as native) and the Web Push is suppressed by tag.
  async function sendFcm(uid, title, body, url, photo) {
    if (!initFcm()) return;
    try {
      const tokens = await db.smembers('soc:fcm:' + uid);
      if (!tokens.length) return;
      const admin = require('firebase-admin');
      const message = {
        notification: { title, body },
        data: { url: url || '/app' },
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#5B6CFF',
            imageUrl: photo || undefined,
            channelId: 'talksibi_default'
          }
        },
        tokens
      };
      const resp = await admin.messaging().sendEachForMulticast(message);
      // Purge dead tokens
      if (resp.responses) {
        for (let i = 0; i < resp.responses.length; i++) {
          if (!resp.responses[i].success) {
            const e = resp.responses[i].error;
            if (e && (e.code === 'messaging/registration-token-not-registered'
                   || e.code === 'messaging/invalid-registration-token')) {
              await db.srem('soc:fcm:' + uid, tokens[i]);
            }
          }
        }
      }
    } catch (e) { console.error('[fcm] send failed'); }
  }

  // Splice into the existing sendPush so callers don't need to change.
  const _origSendPush = sendPush;
  sendPush = async function (uid, kind, title, body, url, photo) {
    // Fire both — FCM is cheap, users only see one due to notification tag
    sendFcm(uid, title, body, url, photo);
    return _origSendPush(uid, kind, title, body, url, photo);
  };
  ```

## Phase 4 — Native shell resources (coder, 2 hours)

- [ ] Copy Play Store icon assets into Android res folders:
  ```bash
  cp design-assets/TalkSibi-play-store-assets/icon/icon-512.png \
     android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
  # + resized variants for mdpi/hdpi/xhdpi/xxhdpi via sips or the
  # Android Studio "New Image Asset" wizard
  ```
- [ ] Add adaptive icon:
  - `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
    referencing the foreground and background layers
  - Foreground: `design-assets/TalkSibi-play-store-assets/icon/adaptive-fg.png`
  - Background: `design-assets/TalkSibi-play-store-assets/icon/adaptive-bg.png`
- [ ] Create notification icon (small silhouette used in status bar):
  - Android Studio → File → New → Image Asset → Notification Icons
  - Use the TalkSibi mark as the source, generate ic_notification variants
- [ ] Update `android/app/src/main/res/values/strings.xml`:
  ```xml
  <string name="app_name">TalkSibi</string>
  <string name="title_activity_main">TalkSibi</string>
  ```
- [ ] Update `android/app/src/main/AndroidManifest.xml` version:
  ```xml
  android:versionCode="2" android:versionName="2.0.0"
  ```
- [ ] Add notification channel bootstrap in `MainActivity.java`:
  ```java
  NotificationChannel channel = new NotificationChannel(
    "talksibi_default", "TalkSibi notifications",
    NotificationManager.IMPORTANCE_HIGH);
  channel.enableVibration(true);
  NotificationManager nm = getSystemService(NotificationManager.class);
  nm.createNotificationChannel(channel);
  ```

## Phase 5 — Build + local smoke test (coder, 3 hours)

- [ ] `npx cap sync android`
- [ ] `cd android && ./gradlew assembleRelease`
- [ ] APK output at `android/app/build/outputs/apk/release/app-release.apk`
- [ ] Sideload to owner's phone. Verify:
  - App icon on home screen shows the TalkSibi mark
  - App opens to talksibi.com (via server.url in capacitor.config.json)
  - Login works
  - Play a game, chat, join a party
  - `PushNotifications.register()` fires → check droplet Redis:
    `redis-cli SMEMBERS soc:fcm:<owner-uid>` should return the FCM token
- [ ] From a second account (Mac Chrome), send owner a chat message
- [ ] Owner's phone should receive a native FCM push:
  - Title: `New message from <name>`
  - Icon: TalkSibi mark (custom notification icon, not domain)
  - No `talksibi.com` shown anywhere — Android shows `TalkSibi` app name
  - Tap → opens the app (native intent, not URL redirect)

## Phase 6 — Ship as v2.0.0 (coder + owner, 1 hour)

- [ ] Flip `FCM_ENABLED=true` on droplet:
  ```bash
  ssh root@178.128.162.202 "sed -i 's/FCM_ENABLED=false/FCM_ENABLED=true/' /etc/wordspies.env && systemctl restart wordspies"
  ```
- [ ] Build the release AAB (not APK):
  ```bash
  cd android && ./gradlew bundleRelease
  # → android/app/build/outputs/bundle/release/app-release.aab
  ```
- [ ] Play Console → Testing → Internal testing → Create release →
  upload `app-release.aab`
- [ ] Release notes: "v2.0.0 — native app shell. Push notifications now
  show the TalkSibi name and sender photo (like WhatsApp). Same features,
  faster feel."
- [ ] Save + Review + Rollout to Internal Testing
- [ ] Existing testers get the update via Play Store's normal update flow
  within 24h (Play auto-updates). They keep all their data — user
  accounts, chats, settings — because the backend didn't change.
- [ ] Verify: existing tester opens the app after update. Their prior
  Web Push subscription still works (fires via old Web Push path). Their
  new native FCM registration fires on first launch of v2.0.0. Both
  paths update the same Redis user record. `sendPush()` prefers FCM if
  a token exists.

## Phase 7 — Ship to Production (owner triggers when ready)

- [ ] After 1-2 weeks of Internal testing on v2.0.0, promote same AAB to
  Closed Testing.
- [ ] After 14-day tester period, promote to Production.
- [ ] Staged rollout: 1% → 10% → 100% over 3 days.

## Rollback strategy

If v2.0.0 has issues after Production rollout:

**Instant:** Play Console → Rollout → **Halt rollout**. New users
downloading get whatever percentage was rolled out. Existing v1.x
users stay on v1.x.

**Full revert (rare):** Rebuild v1.x TWA via Bubblewrap, bump version
code to 3 (higher than v2.0.0), push as a "downgrade." Users get pushed
back to the TWA shell.

**Web-only rollback (any time):** Flip `FCM_ENABLED=false` on droplet →
`sendFcm()` becomes a no-op → users fall back to Web Push. Zero client
change needed. Native icon + native shell stay, but push routing goes
back to browser.

## Timeline estimate

- Phase 0 (owner): 15 min
- Phase 1-2 (coder): 3 hours
- Phase 3 (coder): 4 hours
- Phase 4 (coder): 2 hours
- Phase 5 (coder + owner smoke test): 3 hours
- Phase 6 (coder + owner ship): 1 hour
- **Total focused time: 2 working days.**
- **Calendar time (including testing between phases): 1 week.**

## Anti-scope — do NOT bundle in this migration

- iOS support — Capacitor supports iOS but that's a separate ~1 week
  add-on. Ship Android first, iOS second.
- Rewriting any feature — this is a wrapper change only. Same web code.
- Removing the TWA build — keep it as fallback. Don't delete `/app/`.
- Changing the backend — sendPush already routes correctly with the
  splice in Phase 3.

Keep focused. Ship v2.0.0 with just the wrapper change.

## Owner reads this and doesn't touch anything

Owner's job:
1. Phase 0 credentials on droplet (15 min)
2. Sideload smoke test in Phase 5 (30 min)
3. Press "Rollout to Internal" in Phase 6

Everything else is coder work.

## Coder reads this and executes

Coder's job:
1. Read the whole doc first
2. Do phases in order — don't skip
3. Show owner the diff before every commit
4. Store new files (google-services.json, keystore.properties,
   capacitor.config.json) in .gitignore where they contain secrets
5. Update `project-android-launch-state.md` after each phase
