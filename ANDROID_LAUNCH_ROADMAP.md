# TalkSibi Android Launch — Roadmap

Living doc. Tick items as they ship. Owner triages before we touch code.

**Scope confirmed (17 Aug 2026):** 5 games only — guessword, meld, spy, wordchain, wordrace. Hoop/Pool/Ludo/Four are gone; their audit items dropped.

---

## Phase 0 — Prep (before touching code)

- [ ] Confirm which files the other session is currently editing (avoid collision)
- [ ] Check Play Console account type — personal (14-day closed-testing rule) vs organization (no rule)
- [ ] Confirm target Android package name (e.g. `com.talksibi.app`)
- [ ] Decide brand copy for Play listing (short desc 80c, long desc 4000c)

---

## Phase 1 — Fix mobile audit (37 items, grouped into 8 sweeps + 5 one-offs)

### Sweep 1 — Viewport meta (kills 3 items)
- [ ] Add `viewport-fit=cover` to every HTML head
- [ ] Remove `maximum-scale=1` (fails accessibility)
- [ ] Replace `100vh` with `100dvh` (with `100vh` fallback)
- Files: `public/index.html`, `public/social.html`, `public/party.html`, `public/call.html`, `public/games.html`, `public/guessword.html`, `public/meld.html`, `public/spy.html`, `public/wordchain.html`, `public/wordrace.html`

### Sweep 2 — Safe-area insets (kills 4 items)
- [ ] Add `env(safe-area-inset-bottom)` to every `position:fixed;bottom:*`
- [ ] Add `env(safe-area-inset-top)` to profile `.back` button
- [ ] Standardise toast bottom = `calc(96px + env(safe-area-inset-bottom))`
- Files: `public/social.html` (bottom nav / FAB / toast / composer), `public/party.html` (micfab, quickact), `public/call.html`

### Sweep 3 — Input attributes + font-size (kills 8 items)
- [ ] Every text input: add `enterkeyhint`, `inputmode`, `spellcheck="false"` where appropriate
- [ ] Every input: bump `font-size` to min 16px (kills iOS zoom-on-focus)
- Targets:
  - Chat `#msgIn`, wall search input, `.me-input`
  - Party `.pinput` composer
  - Each game: `#wordIn`, `#clueIn`, `#entryIn`, `#codeIn`

### Sweep 4 — Tap targets ≥ 44×44 (kills 5 items)
- [ ] Chat send button `.cbtn.send` (currently 40)
- [ ] Every game's `.howto-btn` (currently 26–34)
- [ ] Games hub `.top-link` (~30 tall)
- [ ] Profile `.upl` upload (32)
- [ ] Call `.hmin` minimize (36)

### Sweep 5 — `:hover` → `@media(hover:hover)` (kills 1 huge item)
- [ ] Wrap all `:hover` rules in `public/social.html` (175 occurrences)
- [ ] Same for game HTMLs
- Kills stuck-highlight after tap on Android

### Sweep 6 — Manifest + Service Worker rewrite (kills 7 BLOCKERS)
- [ ] `public/manifest.webmanifest`: rename to TalkSibi, `start_url: /app?src=app`, `id: /app`, fix `/play` shortcut → `/codenames` (or drop), add proper maskable icon with padding
- [ ] `public/sw.js`: precache `/app` shell HTML, add offline fallback page, real fetch handler
- [ ] Add `<meta name="theme-color" content="#5B6CFF">` consistently across all shells
- [ ] Add `apple-mobile-web-app-capable` + status bar style meta

### Sweep 7 — Chat keyboard handler (kills 4 items)
- [ ] Single `visualViewport.resize` listener sets CSS var `--kb-height`
- [ ] Composer + replybar reposition via `bottom: calc(70px + var(--kb-height))`
- [ ] Wall-search overlay uses same handler
- [ ] Learn modals cap `max-height: 100dvh - 40px`

### Sweep 8 — Text truncation fixes (kills 4 items)
- [ ] Wall `.wcard-name` — allow 2 lines
- [ ] Wordrace `.brow .nm` — `min-width:0; flex:1`
- [ ] Spy `.vbtn` names — allow 2 lines or bump min tile width
- [ ] Party `.phead-txt h1` — allow 2-line wrap on <520px

### One-offs (5 items)
- [x] Create `public/.well-known/assetlinks.json` (once TWA fingerprint known — Phase 5) — SHA-256 published 2026-08-21, commit `4a9d8a8`, live
- [ ] Party autoplay fallback: on `NotAllowedError`, show "Tap to enable audio" overlay
- [ ] Wall image upload: render thumbnail preview strip above composer on file select
- [ ] Chat images: add `loading="lazy"` in message renderer (`social.js`)
- [ ] Chat message-list: add `IntersectionObserver` windowing for threads > 200 msgs (optional — defer if not blocking)

---

## Phase 2 — Optimize

- [ ] Lighthouse mobile pass — target 90+ on Performance / Accessibility / PWA / SEO
- [ ] Compress or delete the ~30 dev screenshots at repo root (bloating clone size)
- [ ] Check `social.js` bundle size — split if > 200KB (chat / wall / profile chunks)
- [ ] Preload critical font (Hanken Grotesk) with `<link rel="preload" as="font" crossorigin>`
- [ ] Add response headers in `server.js`:
  - `Cache-Control: no-cache` on `sw.js` + `manifest.webmanifest`
  - `Permissions-Policy: microphone=(self), camera=(self), display-capture=()`
  - Baseline `Content-Security-Policy` (report-only first)
- [ ] Verify `X-Frame-Options: SAMEORIGIN` still allows `#gameHost` iframe

---

## Phase 3 — Claude testing (automated)

- [ ] New suite `/tmp/mobile-audit.js` — parses HTML/CSS, flags any element < 44px tap target
- [ ] New suite `/tmp/pwa-manifest.js` — asserts manifest fields, sw precache, meta tags present
- [ ] Add Puppeteer visual pass at 412×915 → screenshot every page → diff on future PRs
- [ ] Run all existing suites before push:
  - `/tmp/wizard.js`, `/tmp/wordrace.js`, `/tmp/activegame.js`, `/tmp/profile.js`
  - `/tmp/wall.js`, `/tmp/profile-view.js`, `/tmp/social-graph.js`, `/tmp/refs-reports.js`

---

## Phase 4 — Manual testing (owner)

- [ ] Owner plugs Android phone → USB debugging on → `chrome://inspect` on Mac
- [ ] Walk every flow at 412px in DevTools mobile view first:
  - Landing → CTA → signup wizard (9 screens)
  - Login → chat → send message → send image → voice note
  - Wall → post → comment → search
  - Profile → edit → visitors → follows drawer
  - Learn → AI plan → tick lesson
  - Party → create → mic → hand-raise → leave
  - Each game (5) → create → play → leave
- [ ] Real device pass: own Android + 1 friend's phone if available
- [ ] Log issues → Claude fixes → re-test loop

---

## Phase 5 — TWA build + Play Store submission

- [ ] `npm install -g @bubblewrap/cli`
- [x] `bubblewrap init --manifest https://talksibi.com/manifest.webmanifest` — done 2026-08-21
- [x] Extract SHA-256 fingerprint → generate `assetlinks.json` → deploy to `/well-known/` — done 2026-08-21, commit `4a9d8a8`, live
- [ ] `bubblewrap build` → sideload APK to owner's phone → smoke test
- [ ] Share APK via Google Drive with 5–10 friends → collect feedback → fix → rebuild
- [ ] Play Console: create app → fill listing (icon 512, feature graphic 1024×500, 4–8 screenshots, descriptions, category)
- [ ] Legal blockers (required by Play):
  - Privacy Policy public URL
  - Data Safety form (data collection disclosure)
  - Account deletion path (in-app or public URL)
  - Content rating questionnaire
- [ ] Upload signed `.aab` to Internal testing track → add testers
- [ ] If personal account: 12 testers × 14 days closed testing before Production unlocks
- [ ] Promote to Production → staged rollout 1% → 10% → 100%

---

## Phase 6 — CI/CD pipeline

- [ ] `.github/workflows/build-apk.yml` — on `git tag v*`, build signed AAB, upload as GitHub release asset
- [ ] `.github/workflows/publish-play.yml` — on release, upload AAB via `r0adkll/upload-google-play` action → Play internal track
- [ ] Play Console: generate service-account JSON → store as GitHub secret `PLAY_SERVICE_JSON`
- [ ] Optional: Fastlane setup for staged rollouts + release notes automation
- [ ] Add Sentry or Firebase Crashlytics for real-user crash telemetry

---

## Success criteria (Android-ready)

- ✅ Lighthouse mobile ≥ 90 across all categories
- ✅ Zero horizontal scroll at 412px on every page
- ✅ Every tap target ≥ 44×44
- ✅ Chat + party usable one-handed with soft keyboard open
- ✅ TWA install → no URL bar visible → looks like a real app
- ✅ Offline (airplane mode) → shows friendly fallback, not Chrome dinosaur
- ✅ Mic permission flow → clear before + recovery path after
- ✅ Cross-device party works: desktop + Android in same room
- ✅ `git push` still deploys live in ~60s (unchanged)
- ✅ `git tag v*` builds + uploads new APK automatically
