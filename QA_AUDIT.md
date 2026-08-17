# TalkSibi — Quality Audit
_Read-only sweep of the 14 Aug 2026 codebase (commit 3af66da + WIP). Focuses on the code paths that JUST shipped: Learn redesign, ElevenLabs TTS, party mic sync, invite modal on four/pool/meld, single-session enforcement, community visitors stripe, profile hero clock, 60-language list, per-club SSR._

> **2026-08-17 — DEPRECATED for removed games.** Ludo, Connect 4 (`/four`), 8-Ball Pool (`/pool`), Hoop (`/hoop`) were deleted from the app. Bugs and test cases referencing those routes below are historical — the routes now 404.

**How to use this doc.** Part 1 is the 30-second exec view. Part 2 is the real bug list — every entry cites `file:line` you can jump to. Part 3 is the test-case matrix a coworker (or Playwright) can run through — grouped by feature, checkbox-ready. Part 4 is the "beat Tandem/HelloTalk/Speaky" wish list — 30+ prioritised ideas sorted by effort vs impact. Part 5 is the honest "if I had one more session" pick. Don't treat this as gospel — the audit is deep but not exhaustive; where a section says "not verified" I ran out of read-budget, not evidence of a clean bill of health.

---

## Part 1 — Executive summary

**State of the app.** WordSpies is at a healthy inflection point. The 14 Aug session landed three genuinely competitor-grade features in one push: (1) a Learn tab that no longer hides its plans behind a modal and now leads with a gradient hero CTA, (2) a server-cached ElevenLabs TTS pipeline that lets any phrase play in near-native voice for a cost that trends toward zero as usage grows, and (3) a set of party-voice fixes (`v-mic`, `carryMic`, 409 already-hosting) that resolve two long-standing "my mic isn't showing" complaints. Community-tab visitors stripe, per-club SEO landing pages, and expanded (30→60) language list continue the Tandem-adjacent push. Biggest risks: `public/social.html` is now **10,879 lines** — well past the point where any single edit is safe to reason about without grep — and the single-session enforcement built this session is UX-only (the "kicked" tab doesn't actually stop its Socket.IO subscriptions, so the polite kick is cosmetic, not enforced).

**Bug count by severity.**

| Severity | Count | What it means |
|---|---|---|
| **P0** (ship blocker / data loss / auth) | **2** | Fix same session |
| **P1** (visible bug or clear risk) | **9** | Fix within a week |
| **P2** (edge case / cleanup / dead code) | **13** | Backlog, batch when you're in the file |
| **Total** | **24** | |

**Top 3 bugs by severity.**
1. **BUG-001 (P0)** — TTS disk cache is unbounded and one authenticated attacker at 60 req/min × 500 chars = trivial disk-fill DoS (`social.js:26`, `2141-2274`).
2. **BUG-002 (P0)** — Single-session "kick" is cosmetic. The losing tab shows the overlay but its Socket.IO / DM poll / pingLoop keep running (`public/social.html:7040-7047`). Two tabs → duplicate typing indicators, unread counts double-decrement.
3. **BUG-003 (P1)** — `iAmHost` compares by display name, not uid. Two users named "Anna" collide and one gets no Join button on their own party card (`public/social.html:5864`).

**Top 3 suggestions.**
1. **SUGG-01** — Ship "streak + XP + daily lesson push" (Duolingo loop). Learn already has plans + progress rings; add a 5-minute daily push and a streak counter and retention goes up structurally, not incrementally. **S effort, L impact.**
2. **SUGG-02** — Split `public/social.html` into 5-8 partials (wall / chats / learn / parties / me / member / games / boot) before it breaks a session. It is the single largest risk in the repo. **M effort, L impact.**
3. **SUGG-08** — Server-side automatic transcript in every party (whisper.cpp or ElevenLabs STT batched every 30s). Nobody else does this; it turns a party into a searchable, translatable, and moderatable artefact. **L effort, L impact.**

**Risky files flagged.**
- `public/social.html` — 10,879 LOC. Flag for **splitting** (SUGG-02). Grep is currently the only reliable way to navigate it.
- `social.js` — 2,926 LOC. Approaching the same problem. Learn / TTS / STT / sessions / DM voice / invite / clubs mount all in one file.
- `party.js` — 666 LOC. Concentrated logic, but the density here is intentional (single Socket.IO namespace). Keep as-is.

---

## Part 2 — Bugs found

Format: **ID · Severity · Title · file:line · What's wrong · Reproduce / trigger · Fix.**

### BUG-001 · P0 · TTS disk cache is unbounded (disk-fill DoS)
- **Where:** `/Users/sibghatullah/Downloads/wordspies/social.js:26` (declaration), `2141-2274` (route).
- **What:** `TTS_CACHE_DIR` has no size cap, no LRU, no directory-scan sweep. Comment at line 22-25 explicitly says "phrases don't expire — cache lives forever until we manually clean up." Rate limit is 60/min per IP × 500 chars per call. One authenticated user can push ~2 GB of MP3s/hour before hitting ElevenLabs's own account-level throttle.
- **Trigger:** Any logged-in account posts unique 500-char strings in a tight loop. Each is a distinct sha256, so each writes a new file.
- **Fix:** Add a nightly cron: `find $TTS_CACHE_DIR -type f -atime +30 -delete` **plus** a soft cap (`fs.stat` running total; if > 5 GB, reject miss with 503 and log). Long-term: store `atime` metadata in Redis so eviction is LRU rather than atime-random.

### BUG-002 · P0 · Single-session "kick" doesn't stop background work
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:7040-7047` (`showSessionKick`).
- **What:** Setting `SESS_KICKED = true` stops `checkSession()` only. `pingLoop()` (line 4437), `chatTimer` (5819), `liveTimer` (5827), the Socket.IO connection for calls, and DM read-receipt writes all keep firing. Two tabs = doubled writes on `/api/social/message/read`, doubled `soc:online:*` heartbeats, and race-y unread badge maths (owner rule: "one session at a time" — currently violated on the server too).
- **Reproduce:** Open `/social` in two tabs of the same account. Second tab shows overlay. Open network panel on losing tab — you'll see `/api/social/ping` and `/api/social/chats` continue every 25s / 5s.
- **Fix:** In `showSessionKick`, clear every registered interval (`window.__pingT`, `chatTimer`, `liveTimer`, `window.__ptTimer`, `_ptRefreshT`), close the shared Socket.IO connection if one is open, and gate every fetch behind `if (SESS_KICKED) return;`. Simpler alternative: `location.reload()` sends the poll-in-progress user to `/social` and lets `registerSession()` decide whether to log them back in.

### BUG-003 · P1 · `iAmHost` matches by display name, not uid
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:5864`.
- **Code:** `const iAmHost = !!(ME && p.hostName && ME.name && ME.name.toLowerCase() === String(p.hostName).toLowerCase());`
- **What:** `/api/parties` doesn't leak host uid publicly (`party.js:130-136` only exposes `hostName` / `hostPhoto`). The client falls back to a case-insensitive name compare. Two users called "Anna" — one is the host — the OTHER Anna sees the host's card with the "You're hosting this" state (no Join button, own-host affordances).
- **Fix (a):** Expose `hostUid` on the /api/parties response in `party.js:130-136` (host uid is not sensitive — every joiner sees it once they enter the room). Then compare `p.hostUid === (ME && ME.id)`. **Fix (b) if worried about privacy:** Server-side compute `mine: r.hostUid === callerUid` per row and return that boolean.

### BUG-004 · P1 · TTS `URL.createObjectURL` per replay + client cache misses reuse
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6316-6338`.
- **What:** `speakLessonPhrase` correctly revokes on `onended` / `onerror`, but if the user taps 5 lesson phrases quickly, `_lnStopAudio()` pauses+clears `_lnAudio.src` without revoking the prior object URL — the `onended` never fires for the interrupted audio. Small leak (each phrase = ~10-30 KB decoded). Adds up on a long study session.
- **Fix:** Store the object URL alongside `_lnAudio` (e.g. `_lnAudio = { audio, url }`) and revoke in `_lnStopAudio` before nulling.

### BUG-005 · P1 · Learn tab dead-code refs `lnMethodAiSub` (removed DOM id)
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6376-6382` (`updateAiMethodSubtitle`) and callsite at 6371 (`loadLearnPlan`).
- **What:** The 14 Aug redesign removed the `ln-methods` grid and its `lnMethodAiSub` subtitle span. `updateAiMethodSubtitle` early-returns silently when the element is null — no crash — but the function fires on every `loadLearnPlan` call. Confusing to the next reader and pins the mental model on a UI that no longer exists.
- **Fix:** Delete `updateAiMethodSubtitle` and the call. If you keep the CSS `.ln-methods` at line 907-908, delete that too — it's dead selector.

### BUG-006 · P1 · Party create-flow: `submitCreateParty` sends langs but no length cap client-side
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6649-6660` and party toggle at `6190`.
- **What:** Client `_ptLangs` (a Set) has no upper bound; user can multi-select every flag in the picker. Server caps at 6 (`party.js:167-169`) so no data leak — but the client's summary line ("Spanish, French, +8 more") can overflow the modal on mobile. Not a crash, just polish.
- **Fix:** Cap `_ptLangs.size` at 6 in the click handler at 6190 — refuse the add and toast "6 languages max".

### BUG-007 · P1 · `/api/social/tts` fetch has no error-body surfaced to client, but has vague fallback
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6283-6297` + `social.js:2245-2249`.
- **What:** On ElevenLabs 401 (bad key) the server returns 503 "TTS failed", client throws, `speakLessonPhrase` catches and silently falls to browser speechSynthesis. User hears the phrase in the browser's robot voice with no signal that ElevenLabs is down. Owner won't know their API key expired until the invoice drops.
- **Fix:** In `social.js:2245-2249`, on 401/402 also `console.error('[tts] KEY BAD or QUOTA — falling back'); notifyOwnerOncePerHour();`. Or: emit a per-hour warning via the existing `soc:ai-usage:*` list.

### BUG-008 · P1 · `/api/parties` public row omits `visibility` — private parties leak on wall strip
- **Where:** `/Users/sibghatullah/Downloads/wordspies/party.js:118-140` (list route) vs. `party.js:143-163` (private flag on create).
- **What:** The list endpoint iterates every room including `visibility: 'private'` ones. The map at 122-137 omits the `visibility` field so the client can't filter — every private party still shows in `paintParties` and `paintCommunityPartyStrip`. Grepped the client: no branch filters on `p.visibility`.
- **Reproduce:** Create a party with visibility: 'private'. Load `/api/parties` from another account — the private party is in the response.
- **Fix:** Skip `if (r.visibility === 'private') continue;` in the loop at 121, OR expose `visibility` on each row and filter client-side. Server-side skip is safer.

### BUG-009 · P1 · Clubs SSR — every miss triggers a slug-index rebuild after 5s (grep-DoS)
- **Where:** `/Users/sibghatullah/Downloads/wordspies/clubs.js:262-272`.
- **What:** `resolveSlug` rebuilds the entire slug map (SMEMBERS + N × GET) on every unknown slug older than 5s. `/clubs/<random>` in a loop = one full club-set scan per request. Compounded by the `sitemap-clubs.xml` also being uncapped.
- **Fix:** Track "last rebuild time for a miss" separately — refuse to rebuild more than once per 60s regardless of miss frequency. Add `limited(req, 'clubs-ssr', 30)` at the top of the `/clubs/:slug` route.

### BUG-010 · P1 · Party `carryMic` racy under 3-tab join burst
- **Where:** `/Users/sibghatullah/Downloads/wordspies/party.js:257-287`.
- **What:** The rank algorithm at 272-278 iterates existing same-uid members in Map insertion order. If Tab A is connected+micOn, Tab B joins → `carryMic = true` (good), Tab B is deleted+replaced by C in the SAME `join` handler tick? No — each `join` is a separate socket event. But: three tabs joining within the same 100 ms all read `r.members` before any of them completes `r.members.delete`. Tab C's join sees Tab A still present (correct), inherits its mic (correct), then deletes Tab A. Tab B's join, arriving between A's delete and C's set, might not find A → `carryMic = false`. Result: Tab B and Tab C both think they're the "current" member, briefly both publishing.
- **Trigger:** Chrome dev-tools "restore all tabs" or a user with 3+ pinned WordSpies tabs on browser restart.
- **Fix:** Move the same-uid sweep into a transaction: sort matched members before mutating, decide the winner, then delete losers and set winner in one atomic block. Or: gate the join handler behind a `Map<uid, Promise>` so same-uid joins serialise.

### BUG-011 · P2 · Visitors stripe shows for users without a photo but WITH a bio
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:5444`.
- **What:** Guard is `if (!ME.photo) ... hidden`. Perfect for the common case, but a user who signed up via the pre-wizard era and never uploaded a photo but DID write a bio → their profile is publicly visitable. Their stripe stays hidden and they never learn people looked.
- **Fix:** Change guard to `if (GUEST || !ME || !ME.id) ...` (drop the photo check). Users without a photo who somehow have visitors deserve to see them.

### BUG-012 · P2 · Timezone map: no fallback message when country is unknown
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:9911-9917` (`localTimeForCC`).
- **What:** Unknown `cc` returns literal `'—'`. Rendered on the profile hero as "🕐 —". Cosmetic but reads like a placeholder that failed to fill. 100+ countries not covered (parts of Africa, Oceania, small Caribbean).
- **Fix:** Either hide the clock row entirely when tz missing (`return null` + check callsite), or fall back to browser-local time with a small "(your time)" caption.

### BUG-013 · P2 · Community-visitors stripe blur stack shows initials without visual difference from photos
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:5470-5475`.
- **What:** `vsAv` renders a `<span>` with either an `<img>` or an initial letter. Initials get no blur (blur is on the img). Tease pattern breaks for members without photos — you see the letter clearly.
- **Fix:** Wrap initial in a `.vsAv-init` with the same blur/backdrop filter, or exclude photo-less members from the tease slice (`fresh.filter(v => v.user && v.user.photo).slice(0,3)`).

### BUG-014 · P2 · `wsActiveParty` and `wsActiveGame` stale after account switch
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:7000-7011` + game-shell logout flow.
- **What:** Log-out clears the cookie but not `localStorage.wsActiveParty` / `wsActiveGame`. Log in as a different user → the partybar shows "Rejoin PARTY-4XYZ" pointing at the previous user's party. Tap fails inside `party.html` (bounced back to /social) but the pill re-appears.
- **Fix:** In the logout button handler, `try { localStorage.removeItem('wsActiveParty'); localStorage.removeItem('wsActiveGame'); } catch(e){}` before redirect. Also stamp uid into the localStorage payload and refuse to paint if `payload.uid !== ME.id`.

### BUG-015 · P2 · `openMemberById('')` fires when visitor `u.id` is missing
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:5414`.
- **Code:** `onclick="openMemberById(\'' + esc(u.id || '') + '\')"`.
- **What:** If `v.user` is null (deleted account) we still render a tile with empty id. Tap → `openMemberById('')` fetches `/api/social/user/`. Server likely 404s but the modal opens on a spinner briefly.
- **Fix:** Skip the row: `list.filter(v => v.user && v.user.id)` before `.map`.

### BUG-016 · P2 · `/api/social/tts` request logging never records cache-hit metadata
- **Where:** `/Users/sibghatullah/Downloads/wordspies/social.js:2261-2267`.
- **What:** Cost log only fires on cache miss (comment at 2260 correctly says so). But hit-rate visibility is now zero — you can't answer "what fraction of TTS calls hit disk?" without instrumenting X-TTS-Cache response headers in prod. This matters because the whole cost story hinges on hit rate.
- **Fix:** RPUSH a lightweight `{kind:'tts-hit', u, chars, t}` on cache hit too (no `$` field). Cost stays at 0.

### BUG-017 · P2 · Learn tab `deleteLearnPlan` has no confirmation
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6441` (`ln-plandel` button onclick calls `deleteLearnPlan(planId)`).
- **What:** Grep of `deleteLearnPlan` — no `confirm()` / no SweetAlert step. One accidental tap wipes a 20-lesson plan the user built.
- **Fix:** Wrap in `Swal.fire({icon:'warning', title:'Delete this plan?', text:'You'll lose your progress on ' + plan.language, showCancelButton:true, confirmButtonText:'Delete', confirmButtonColor:'#e8506b'})`.

### BUG-018 · P2 · `checkSession` polls at 5s but visibilitychange re-checks immediately even if we just checked
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:7059-7060`.
- **What:** No debounce. Fast tab-swap = a `check` per visibility event. Cheap endpoint but on 3G it's a noticeable radio wake.
- **Fix:** Track `_lastCheckAt` and skip if `Date.now() - _lastCheckAt < 2000`.

### BUG-019 · P2 · `/api/social/session/check` returns `current:true` if sid pattern invalid — silent
- **Where:** `/Users/sibghatullah/Downloads/wordspies/social.js:1028`.
- **What:** `if (!/^[a-f0-9]{32}$/.test(mine)) return res.json({ current: true });` — silently accepts bogus sids. Fine as a permissive fallback, but no log. Debugging a "client stuck" bug is harder because the server never records the malformed poll.
- **Fix:** `console.warn('[session/check] malformed sid from uid=' + u.id.slice(0,8))` before returning.

### BUG-020 · P2 · Party `.pt-modal` z-index 200 collides with `.ob-wizard` z-index 200
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:93` (`.ob-wizard`) vs `1659` (`.pt-modal`).
- **What:** Onboarding wizard and create-party modal share z-index. If wizard is somehow re-triggered while a party create modal is open (edge case: interrupted signup), later element wins by DOM order — but that's fragile.
- **Fix:** Push `.pt-modal` to 250 (still under `.sesskick` at 400 and `.imgzoom` at 20000).

### BUG-021 · P2 · Ludo bot solo-vs-3-bots fires `addBot` × 3 with no server ack
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/ludo.html:432-442`.
- **What:** Three `emit('addBot')` back-to-back with no per-call callback. If the room is already full (rare race with another player joining in the same tick), the second/third `addBot` is silently dropped and `emit('start')` fires 60ms later with 3 humans + 1 bot instead of 1 human + 3 bots. User sees the wrong lobby.
- **Fix:** Chain the emits with acks: `socket.emit('addBot', {}, () => socket.emit('addBot', {}, () => socket.emit('addBot', {}, () => socket.emit('start'))));`. Or add a server `botFill: 3` param.

### BUG-022 · P2 · Client TTS cache key omits voiceId — one-language, one-voice assumption
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:6276`.
- **What:** Key = `primaryLang + '|' + text`. Server key = `text + '|' + primaryLang + '|' + voiceId`. Today the server picks `voiceId` deterministically from lang, so they align. If we ever expose per-user voice choice, client cache will serve the wrong voice.
- **Fix:** Pass `voice` in the POST body and include in the cache key. Zero user-visible bug today; landmine for tomorrow.

### BUG-023 · P2 · `refreshGameBar` doesn't validate that stamped `path` is a known game route
- **Where:** `/Users/sibghatullah/Downloads/wordspies/public/social.html:7081-7094`.
- **What:** `bar.href = s.path` writes whatever's in localStorage. XSS-safe (`href` doesn't execute) but a malicious extension could stamp `path: 'javascript:...'` and `<a href>` would fire on click.
- **Fix:** Whitelist: `const OK = ['/codenames','/spy','/wordchain','/guessword','/wordrace','/four','/pool','/meld','/ludo','/hoop']; if (!OK.some(p => s.path === p || s.path.startsWith(p + '?'))) return bar.classList.add('hidden');`.

### BUG-024 · P2 · Learn lesson `openLearnLesson` — no null guard for `plan.lessons[i]`
- **Where:** referenced from `/Users/sibghatullah/Downloads/wordspies/public/social.html:6415`.
- **What:** Not read directly here, but the onclick passes `esc(plan.id)` + `i`. If the plan is re-fetched mid-open and lessons length shrinks (e.g. server issue), `openLearnLesson` may deref an out-of-range index.
- **Fix:** In `openLearnLesson`, `const lesson = plan.lessons[i]; if (!lesson) return toast('Lesson unavailable — refresh Learn');`.

**Grep for TODO / FIXME / XXX / HACK across `.js` + `.html`:** clean. Only `HACKER` in `words.js:157` (Codenames wordlist) and comment-only "XXXX" in `server.js:36`. Nothing actionable outstanding.

---

## Part 3 — Test cases

Each block is copy-pasteable into a Playwright/manual pass. P0 = must pass every release; P1 = must pass weekly; P2 = spot-check.

### FEATURE-SIGNUP-WIZARD
Goal: 9-step wizard runs to completion and persists all fields.
Pre-conditions: Fresh Chrome profile, no cookies.
- [ ] P0: Land on `/`, tap Log in / Join → email + password → wizard opens on step 1.
- [ ] P0: Complete every step, refresh mid-way at each step → resume at correct step (`ME.obStep`).
- [ ] P0: Face photo required at step 4 → try to advance without one → block + toast.
- [ ] P0: DOB wheel (iOS) — pick 20 Jan 2010 (under 18) → age-gate blocks.
- [ ] P1: Language pickers — pick 3 speaks + 3 learns → verify persisted after finish (`ME.speaks.length === 3`).
- [ ] P1: Location auto-suggest → accept → verify `ME.location` + `ME.cc` stored.
- [ ] P2: Skip → skip → skip → skip; profile is minimal but valid; wall access still gated by photo.

### FEATURE-LOGIN
Goal: Google OAuth + email fallback both land the user in /social.
- [ ] P0: Email/password login → land on /social → `ME.id` populated → `registerSession` fires and stores `SESS_SID`.
- [ ] P0: Google button (if `SOC_GOOGLE_CLIENT_ID` set) → returns to /social.
- [ ] P1: Wrong password → toast, stays on login modal.
- [ ] P2: Password reset flow (if any) — check server logs for email dispatch.

### FEATURE-GUEST-BROWSING
Goal: Guest can read the wall + open member profiles; login required to interact.
- [ ] P0: Open /social in incognito → wall paints → tap a member → member profile paints.
- [ ] P0: Tap Chats → requireLogin modal.
- [ ] P0: Open /party?room=XYZ → identity check → redirect to /social?login=1&next=... (BUG fix landed 14 Aug).
- [ ] P1: Reactions on wall posts → requireLogin.
- [ ] P2: Visitors stripe is hidden for guest (`GUEST` guard at 5441).

### FEATURE-COMMUNITY-WALL
Goal: Post, image, react, share all work; wall search + filter chips stable.
- [ ] P0: Compose text → post → appears at top of wall.
- [ ] P0: Compose + attach image → post → image renders + zoomable.
- [ ] P0: Filter chips: All / Online / Nearby / AI / Reset → each subset correct.
- [ ] P1: Search "Anna" → members matching name / location / country surface.
- [ ] P1: React with emoji → count increments, tap again to remove.
- [ ] P1: Share member profile → deep link `?u=<uid>` opens their card.
- [ ] P2: My own card never appears in the wall (line 9931).

### FEATURE-VISITORS-STRIPE (Community + Me)
Goal: Slim stripe at top of #tabWall + full card on /me.
- [ ] P0: Log in on account A → visit account B (`/user/B`) → back to A → Community tab shows "1 person visited your profile" with B's blurred avatar.
- [ ] P0: Tap stripe → opens /me and scrolls to visitors card.
- [ ] P0: Tap ✕ → stripe hides; localStorage `wsVisitorStripeDismissed:<uid>` set.
- [ ] P1: New visit after dismiss → stripe re-appears with count of visits AFTER dismiss timestamp.
- [ ] P1: >3 visitors → shows 3 blurred faces + "+N" chip.
- [ ] P2: Visitor account is deleted mid-view (rare) — stripe row shows '?' initial, no crash (see BUG-015).
- [ ] P2: Photo-less members in stripe render as un-blurred initials (see BUG-013).

### FEATURE-LEARN-TAB
Goal: Hero CTA (full + compact), plans grid, detail view, lesson opener, TTS.
- [ ] P0: Fresh account, no plans → hero shows "Create your customized learning plan" + full-size CTA.
- [ ] P0: Complete Setup → plan appears in grid + hero switches to compact "Add another plan".
- [ ] P0: Tap plan → detail view; back → grid.
- [ ] P0: Tap lesson → lesson modal; mark done → tick, progress ring updates.
- [ ] P0: Delete plan button → **NO confirmation currently (BUG-017)** — verify plan is gone from grid.
- [ ] P0: TTS button in lesson → hear ElevenLabs voice; second tap on same phrase → **cache hit**, no server call in Network tab.
- [ ] P1: Turn off wifi mid-lesson → TTS falls back to browser speechSynthesis, no error toast.
- [ ] P1: Multiple plans (Spanish, French) → both list; each has own progress ring.
- [ ] P1: TTS in a language without a native voice (e.g. Zulu) → falls to default Rachel via multilingual v2, still plays.
- [ ] P2: 500-char phrase max → verify server rejects longer with 400.
- [ ] P2: `X-TTS-Cache` header on response is `HIT` or `MISS` (dev tools).

### FEATURE-CHATS
Goal: DM text, image, voice note, translate, AI experts, talk-to-AI mic.
- [ ] P0: Send text → arrives on peer within 3s poll cycle.
- [ ] P0: Send image (2 MB, JPEG) → renders both sides.
- [ ] P0: Record voice note (5s) → tap preview → send → peer plays.
- [ ] P0: Translate a foreign-language message → Claude Haiku returns translation inline.
- [ ] P0: DM with AI expert (Isabella / Kenji / etc.) → reply arrives; grammar correction card rendered if incorrect.
- [ ] P0: Talk-to-AI mic → speech-to-text via browser Web Speech (free, no key).
- [ ] P1: Voice note > 60s → client refuses to send.
- [ ] P1: Voice note > 3 MB → server rejects (413).
- [ ] P2: Two tabs same account, one open chat → typing indicators don't fire twice (fails today per BUG-002).

### FEATURE-PARTY
Goal: Create (with flags), join public + private, guest bounce, mic sync, mini-bar, 409 already-hosting.
- [ ] P0: Create party with title + 2 languages selected → 🎉 Start → land on /party?room=CODE as host.
- [ ] P0: Create a second party (still hosting the first) → server 409 → dialog "You're already hosting X. Leave it first."
- [ ] P0: Guest opens /party?room=CODE → bounces to /social?login=1&next=/party?room=CODE.
- [ ] P0: Host demotes a speaker → mic hard-stops on demoted client + chip flips to muted for all.
- [ ] P0: Host force-mutes a speaker → speaker's mic tears down within 500ms.
- [ ] P0: Tab A same account joins party → Tab B opens same party → carryMic keeps Tab A's mic live (owner's fix, 14 Aug).
- [ ] P1: 3 tabs same account join within 100ms (browser restart) → verify only one mic broadcasts (currently racy, BUG-010).
- [ ] P1: Mini-bar visible on all tabs while party is live; hidden when on `/party` itself (body.in-party gate).
- [ ] P1: Private party → verify NOT in `/api/parties` public list (currently leaks, BUG-008).
- [ ] P1: Reactions (emoji) — 8/3s bucket → 9th in 3s is dropped.
- [ ] P2: Host closes party → all clients get `closed`, land back on /social.
- [ ] P2: No host for 10 min → server auto-ends.
- [ ] P2: Grace window: disconnect → reconnect within 5 min → seat kept.

### FEATURE-GAMES-INVITE-MODAL (four / pool / meld)
Goal: Invite friends modal mirrors spy.html.
- [ ] P0: `/four` create room → tap "👥 Invite friends" → picker opens with your follows.
- [ ] P0: Pick 2, tap Send → both receive a DM with the join link (verify `game: 'four'` in the payload).
- [ ] P0: Same on `/pool` and `/meld`.
- [ ] P1: Logged out user opens invite modal → "You need to be logged in" empty state.
- [ ] P2: Invite hoop or wordrace (not in the whitelist) → verify server 400.

### FEATURE-BOTS (ludo / pool / four)
Goal: Bot buttons prominent and functional.
- [ ] P0: `/ludo` — "🤖 Play with the Bots" → solo lobby with 3 bots → game starts.
- [ ] P0: `/four` — 3 bot difficulty buttons (Easy / Normal / Hard) → each starts a game against correct difficulty.
- [ ] P0: `/pool` — bot button starts a 1v1 vs bot.
- [ ] P1: Ludo — verify all 3 addBot calls take effect (BUG-021 race check).
- [ ] P2: Bot moves within 3s of user's move.

### FEATURE-PROFILE-ME
Goal: Hero fields, bio chip, photo upload, follows drawer.
- [ ] P0: /me hero: photo + name + @handle + 📍 city + 🕐 local time (60s ticker updates).
- [ ] P0: Own profile with no bio → "+ Add a bio" chip shows; tap → scrolls to bio textarea + focuses.
- [ ] P0: Own profile with a bio → chip hidden.
- [ ] P0: Edit bio, save → chip disappears; About card populates.
- [ ] P0: Change photo → crop modal → save → hero updates.
- [ ] P0: Tap Following / Followers / Blocked → 3-tab drawer opens, correct rows per tab.
- [ ] P1: Timezone unknown (e.g. Antarctica) → shows '—' (BUG-012).
- [ ] P1: Follow drawer row → tap → member profile opens; block from drawer → row disappears.
- [ ] P2: Location edit → country detection updates `ME.cc` → clock switches timezone within 60s.

### FEATURE-PROFILE-OTHER
Goal: /user/:id — hero, About card only when real bio, visitors count on target.
- [ ] P0: Open another user's profile → hero paints; NO "+ Add a bio" chip.
- [ ] P0: Their profile with only the seeded default bio → About card HIDDEN (realBio strips default).
- [ ] P0: Their profile with a real bio → About card shows.
- [ ] P0: Visit fires `/user/:id` → server records visit → their /me visitors card updates within 60s.
- [ ] P1: Block user from ⋯ menu → they disappear from all wall/follows/visitors lists.
- [ ] P1: Report user → hits reports queue (`soc:reports`).
- [ ] P2: Follow / unfollow → follower count updates on their profile.

### FEATURE-CLUBS
Goal: List, detail, feed, per-club SSR URL.
- [ ] P0: /social → Clubs subtab → list of clubs with covers + member counts.
- [ ] P0: Tap a club → detail view with feed.
- [ ] P0: Post in a club → own post at top.
- [ ] P0: Direct URL: `/clubs/club_english_pronunciation` → SSR page with cover, description, JSON-LD.
- [ ] P0: Same URL from a bot UA (curl `-A "facebookexternalhit"`) → SSR does NOT redirect to /social.
- [ ] P1: Bad slug: `/clubs/foobar` → soft 404 page (`notFoundPage`).
- [ ] P1: `/sitemap-clubs.xml` returns valid XML with every club URL.
- [ ] P1: Legacy raw-id URL → 301 to canonical slug URL.
- [ ] P2: Rate-limit stress: 100 misses/sec → verify server doesn't melt (BUG-009 shows it will).

### FEATURE-SESSION-ENFORCEMENT
Goal: One active session per account.
- [ ] P0: Log in on Tab A → `registerSession` runs → `SESS_SID` in memory.
- [ ] P0: Open Tab B same account → poll on A detects `current: false` → overlay "You opened WordSpies in another window" appears.
- [ ] P0: Tap "Use WordSpies here" on Tab A → `reclaimSession` → Tab B eventually shows the overlay.
- [ ] P0: In-party or in-game → `inActiveVoice()` returns true → poll skipped (owner constraint).
- [ ] P1: Losing tab: verify pingLoop / chatTimer / liveTimer STOP after overlay (currently they don't, BUG-002).
- [ ] P1: Offline for 30s → poll fails → user is NOT falsely kicked (poll catches error, no state change).
- [ ] P2: Redis TTL expires → next poll returns `current:true` (permissive fallback) — user isn't kicked by our housekeeping.

### FEATURE-MODERATION
Goal: Report + block work end-to-end.
- [ ] P0: Report a user → confirmation → entry appears in `soc:reports` list (admin).
- [ ] P0: Block a user → they vanish from wall, chats, follows drawer, visitors stripe.
- [ ] P1: Admin queue exists? — per memory, task #46 unclear. **Verify with owner before running.**
- [ ] P2: Block-bypass check: blocked user posts → not in blocker's wall feed.

### FEATURE-ACCESSIBILITY
Goal: Keyboard-only + screen-reader viable.
- [ ] P0: Tab through top nav → focus outlines visible on each tab.
- [ ] P0: Enter/Space on visitors stripe → opens visitors card (handler at 2910 present).
- [ ] P1: All buttons have accessible names — grep for `<button` without `aria-label` or visible text (owner: not done today, add to backlog).
- [ ] P1: Modal focus traps (`ln-lesson-bd`, `pt-modal`, etc.) — Tab loops inside, Esc closes.
- [ ] P2: Contrast ratio ≥ 4.5:1 on all body text — Lighthouse a11y audit.

### FEATURE-PERFORMANCE
Goal: Load-time budgets on the SEO surfaces.
- [ ] P0: `/` (landing) LCP < 2.5s on 4G throttle (Chrome DevTools).
- [ ] P0: `/clubs/:slug` TTFB < 400ms warm cache; < 800ms cold.
- [ ] P1: `/social` bundle size — `public/social.html` is 10,879 lines of HTML+CSS+JS in one shot. Measure transferred KB gzipped; if > 200 KB gzipped, prioritise SUGG-02 split.
- [ ] P2: TTS second-hit latency (cache hit) < 30ms server + 5ms client Cache API.

### FEATURE-MOBILE
Goal: iOS Safari + Android Chrome parity, notch/safe-area respected.
- [ ] P0: iOS Safari — join a party, mic works (WebRTC quirks per memory: mono/44.1k required).
- [ ] P0: iOS Safari — pinch-zoom disabled inside the wizard (viewport meta).
- [ ] P0: Android Chrome — visitors stripe swipe → doesn't trigger horizontal scroll on the tab.
- [ ] P0: Notch — partybar / gamebar bottom padding respects `env(safe-area-inset-bottom)` (verified in CSS).
- [ ] P1: iOS Safari — TTS audio plays inline (autoplay policies).
- [ ] P1: Android — background tab tunnels connection idle > 30s → `visibilitychange` re-checks session cleanly.

### FEATURE-SEO
Goal: Landing, blog, clubs indexable.
- [ ] P0: `curl -A "Googlebot" https://wordspies.co.uk/` → HTML with hero + h1 + meta description.
- [ ] P0: `curl https://wordspies.co.uk/sitemap.xml` → 200 + valid XML.
- [ ] P0: `curl https://wordspies.co.uk/sitemap-clubs.xml` → 200 + valid XML.
- [ ] P0: `curl https://wordspies.co.uk/robots.txt` → both sitemaps listed.
- [ ] P1: JSON-LD on `/clubs/:slug` validates (Google Rich Results test).
- [ ] P1: OG image on `/clubs/:slug` → renders in WhatsApp / Twitter link preview.
- [ ] P2: Meta title < 60 chars, description < 155 chars per club.

---

## Part 4 — Suggestions to beat competitors

Ranked mentally by impact × ease. `S = ~1 session`, `M = 2-3 sessions`, `L = >1 week`.

| ID | Idea | Why it beats Tandem / HelloTalk / Speaky | Effort | Impact |
|---|---|---|---|---|
| **SUGG-01** | Streak + daily lesson push (Duolingo loop) — 5-min lesson every day, 3-day streak = lifetime XP badge, 7 = flame icon on avatar | Tandem's Learn has zero retention mechanic; Speaky doesn't even have Learn. Duolingo owns this loop; borrow it. | S | L |
| **SUGG-02** | Split `public/social.html` into 8 partials (wall / chats / learn / parties / me / member / games / boot) served via `<template>` or ES modules | Not a competitor feature — an engineering safety net so future sessions ship faster and safer | M | L |
| **SUGG-03** | Learn hero: add "Continue where you left off" pill that jumps directly to next incomplete lesson | Tandem forces re-navigation every session; friction they never fixed | S | M |
| **SUGG-04** | Party auto-transcript (whisper.cpp on server every 30s) with per-speaker attribution, saved to the party's page after it ends | Nobody does this. Turns parties into shareable, searchable, moderatable content. | L | L |
| **SUGG-05** | Push notification when a followed user posts on the wall OR opens a party | HelloTalk buries this in settings; WordSpies default-on with a one-tap opt-out beats it | S | M |
| **SUGG-06** | Wall post types: "Question" (get answers), "Correction request" ("please correct my Spanish"), "Milestone" ("first conversation in Italian") — 3 taps + prompts | Speaky's wall is undifferentiated. Templated post types drive higher-quality feed content. | M | M |
| **SUGG-07** | Voice-note-in-wall (owner already has recorder for DM) — 30s max, waveform + transcript + translate | Tandem's wall is text/image only. Voice on the wall = actual language practice at scale | S | L |
| **SUGG-08** | Party recording (audio-only, opt-in per party) — 15-min max, saved to host's Me tab, sharable link | Nobody does this. Consent obviously required (banner at party start). | L | L |
| **SUGG-09** | AI expert bots per language (Isabella/Kenji already there) — add "reply to my last 5 messages with corrections" bulk action | Tandem has zero AI. Speaky just launched Claude but doesn't retain history | S | L |
| **SUGG-10** | Learn plan gamification: 3-day streak = confetti; 7-day = "First week" badge on profile hero | Streaks are proven; badges show up on profile → social pressure to keep up | S | M |
| **SUGG-11** | "Language match" score on member cards ("You both speak ES + learn EN — 100%") | HelloTalk shows this crudely; WordSpies could rank the wall by match score by default | S | M |
| **SUGG-12** | Weekly digest email: "You practised 42 min this week, 3 new followers, 1 correction from a native" | Duolingo's weekly digest is a retention hammer. Tandem's is spam. Do the Duolingo one. | S | M |
| **SUGG-13** | "Ready for a call?" widget on Me tab — one-tap flag that puts you in a live-call queue for 15 min; match with anyone learning your native language | Tandem "Featured" is passive; queue matching is active and beats the awkward "who wants to talk" DM dance | M | L |
| **SUGG-14** | Kids mode (owner memory says queued) — separate wall, adult-verified chaperones, no DMs, no photos on other users | Tandem/HelloTalk have zero minor safety story. This unlocks the parents-of-language-learners market. | L | L |
| **SUGG-15** | Correction credits: give a correction → earn 1 credit → spend to get your own text corrected by a native. Native speakers earn faster. | HelloTalk has this crudely; WordSpies could tie it to the AI expert as a fallback ("no native online? Isabella will correct for 3 credits") | M | M |
| **SUGG-16** | Public "corrections" feed — every accepted correction becomes a mini-post ("Anna corrected 'yo tengo hambre' → 'tengo hambre'"). Social pressure to correct kindly. | Tandem's corrections are private; making them public + upvoteable creates a mini-Stack-Overflow for language | M | L |
| **SUGG-17** | Auto-detect user's browser language and preselect the "I want to learn X" in the wizard | 1-second UX win; every wizard-drop-off is a lost user | S | S |
| **SUGG-18** | "Practice with a stranger" button on landing (no signup) — 5 min chat, then invited to sign up | HelloTalk requires signup to see anything; a taste-first flow inverts the funnel | L | L |
| **SUGG-19** | AdSense-compliant footer + sidebar ads on `/clubs/:slug` only (SSR page has high organic traffic potential) — never in-app | Monetisation without breaking "user-owned data" trust — ads only on public SEO surfaces | S | M |
| **SUGG-20** | WordSpies Pro (£4.99/mo): unlimited plans, priority TTS voices, no invite rate limit, custom AI expert persona | Freemium is table stakes; keep the free tier generous | M | M |
| **SUGG-21** | Wall post "translate to my native" button — Claude Haiku (already integrated) — one-tap on any foreign post | Tandem makes you copy-paste to Google Translate. This is literally a one-tap win. | S | L |
| **SUGG-22** | Search bar in Learn: "Teach me how to order coffee in French" → generates a mini-plan of 3 lessons | Duolingo doesn't do custom prompts; only ours can via Claude | M | L |
| **SUGG-23** | Public profile → embed / "share this profile" URL with pre-generated OG image | SEO growth loop: each shared profile is a landing page for a new visitor | M | M |
| **SUGG-24** | Onboarding: "Add 3 people to follow before you finish signup" step — pre-loaded with active users matching learn/speak | Cold-start solved. Tandem's empty feed on day 1 kills new users. | S | L |
| **SUGG-25** | "You + this person could talk" match cards on Community tab — top 3 members by language match, refreshed daily | Passive suggestions >> Tandem's search-only discovery | S | M |
| **SUGG-26** | Focus mode: hide game shelves, hide community, show only Learn + Chats — for 25min Pomodoro sessions | Serious learners want no distraction; competitors don't have a study mode | S | S |
| **SUGG-27** | Screen-reader labels on every interactive element in social.html (currently patchy) — position WordSpies as the accessible language app | Tandem's a11y audit is embarrassing; owning this niche is defensible | M | M |
| **SUGG-28** | Keyboard shortcuts (?, /, g w, g c, g l) — jumpto tabs, focus search, new post | Power users love it; competitors are mobile-only mentality | S | S |
| **SUGG-29** | "Explain like I'm a beginner" toggle in AI expert chat — simplifies vocabulary + sentence length | Speaky doesn't tune AI difficulty. Fastest path to matching CEFR levels. | S | M |
| **SUGG-30** | Real-time captions in party voice (whisper streaming) — turns a party into an accessible + language-learnable event | Nobody does this. Captions + AI translation = deaf users + cross-language parties | L | L |
| **SUGG-31** | "Undo send" for DMs (5s window before delivery) | WhatsApp copycat but a UX polish that competitors lack | S | S |
| **SUGG-32** | Global search bar in top nav — search members, clubs, wall posts, lessons | Tandem's search is member-only; ours could be omni-search | M | M |
| **SUGG-33** | Learn plan gifting — buy a plan for a friend (free while we're free; £2 once monetised) | Growth hack: gifter invites recipient who wasn't on the platform | M | M |
| **SUGG-34** | Community wall "your feed" vs "everyone" toggle (like Twitter Following / For You) | Personalisation without algorithmic dark patterns | M | M |
| **SUGG-35** | Public "learning journal" per user — auto-generated from completed lessons + accepted corrections | Portfolio-style, indexable by Google, retention + SEO in one | L | L |
| **SUGG-36** | "Report + auto-hide" on wall posts — one report from a followed user hides for reporter; 3 from strangers hides for everyone pending review | Beats Tandem's opaque report queue; instant feel-good moderation | S | M |
| **SUGG-37** | Verified native speaker badge — one 30s voice sample judged by ElevenLabs' native-speaker classifier | Fights the "native who isn't" plague on Tandem | M | M |
| **SUGG-38** | Learn plan resume: iOS/Android home screen widget with today's next lesson | PWA + widget = zero-friction daily lesson | L | L |

---

## Part 5 — Recommended next-session priorities

Ranked. Do them in this order.

1. **Fix BUG-001 (TTS disk cache DoS)** — 30-min task. Add a nightly `find | rm` cron + soft 5 GB cap check. Ship before any marketing pushes drive TTS-heavy traffic. **Blocker.**
2. **Fix BUG-002 (session-kick doesn't stop background work)** — 45-min task. Simplest fix: `location.reload()` on kick, let `registerSession` decide. Otherwise: clear every interval + close the shared socket. **Blocker for owner's "one session at a time" north-star.**
3. **Fix BUG-008 (private parties leak in /api/parties)** — 5-min task. Add `if (r.visibility === 'private') continue;` to the list route. **Trust bug.**
4. **Ship SUGG-01 (streak + daily push)** — 1-day task. Learn tab has plans + progress; add a streak counter + daily `notifyUser` at user-picked local hour. This is the retention lever the whole product hinges on. **Growth.**
5. **Start SUGG-02 (split social.html)** — Book a session next week. Every future feature costs 20% more than it should because this file is 10.9 k lines. Extract Learn first (self-contained, ~800 lines), then wall, then me. Keep the DOM in the same file; move the JS into modules. **Debt.**

Runner-ups that are also fair game if the above land quickly: **BUG-003 (iAmHost by name)**, **SUGG-17 (auto-detect browser locale in wizard)**, **SUGG-21 (one-tap translate on wall)**. Each is ≤30 min and each shows up in daily use.

---

_End of audit. Generated on the 14 Aug 2026 tree from a read-only sweep. No source files were modified._
