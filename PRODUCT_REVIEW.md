# WordSpies — Manual Product Review

**For:** WordSpies tester
**From:** Sibghat (owner)
**Site:** https://wordspies.co.uk
**Environment:** Production. Every push to `main` auto-deploys in ~60s, so if a bug appears mid-test, refresh and retry once before filing.
**Doc version:** 14 Aug 2026

---

## 1. Quickstart (read this first — 5 min)

### 1.1 What you need
- **Desktop:** latest Chrome (primary). Also spot-check Safari + Firefox if you have time.
- **Mobile:** iPhone Safari (mandatory — WebRTC quirks live here) and one Android Chrome.
- **Accounts:** create at least **two fresh accounts** on two devices/browsers so you can test DMs, follows, invites, and multi-player games against yourself.
- **Mic + camera permissions:** grant them when the browser asks. Party rooms, voice notes, and the wizard face-check all need mic; the wizard also asks for camera.
- **A headset** for party rooms (avoids echo when you have two devices in the same room).

### 1.2 Sign up (do this now, both devices)
1. Open https://wordspies.co.uk in a private/incognito window.
2. Landing page → click **Sign up** (top right or hero CTA).
3. Use a real email you can check. Password: anything ≥ 8 chars.
4. Confirm you are **18+** at the DOB step — the site hard-blocks under-18.
5. Walk the whole wizard (9 screens). Fill everything honestly — that data feeds the profile you will be testing next.
6. When you land in the Community tab you are done.

### 1.3 Ground rules while testing
- **Never** file "bug: I don't like the copy" — that is design feedback. Route those separately.
- If something looks broken, **hard-refresh once** (Cmd/Ctrl+Shift+R). Auto-deploy may have raced you.
- Screenshot **before** you refresh. A refresh often masks the real state.
- Test **logged-out** as well as logged-in on every public page. Half the bugs live in the anonymous flow.

### 1.4 Priorities
| Level | Meaning | Example |
|---|---|---|
| **P0** | Blocks core use, data loss, or 18+ safety leak | Signup broken, DM never sends, under-18 slips through |
| **P1** | Feature is degraded but usable, or is a 14 Aug ship item | Learn plan detail crashes, invite modal shows empty list |
| **P2** | Cosmetic, layout drift, copy issues | Emoji clipped on iOS, footer overlaps on 320px |

### 1.5 Bug report template — copy this for every bug
```
TITLE: [P0/P1/P2] short summary
URL: https://wordspies.co.uk/…
Device / Browser: iPhone 14, Safari 17.4  (or  MBP, Chrome 128)
Account: tester1@… (or "logged out")
Steps:
  1.
  2.
  3.
Expected:
Actual:
Screenshot / screen recording: [attach]
Console errors (F12 → Console): [paste any red lines]
Notes:
```

---

## 2. What shipped in the 14 Aug 2026 session — TEST FIRST

These three areas are freshly landed. They are the owner's top priority and are most likely to have regressions. Do them **before** the general coverage.

### 2.1 Learn tab redesign (owner ask — no more modal wall, no "Coming soon" tiles)

**Where:** log in → top nav → **Learn**.

**What changed:**
- The old "method grid" with dead "Coming soon" tiles is gone.
- Plans are now shown as a **2-column grid inline on the page** (1 column on ≤520px width).
- Tapping a plan **swaps the grid out in place** and shows the plan detail. A `← My plans` back chip returns to the grid.
- The setup form (build a new plan) is still a modal — that is intentional.
- There was a bug where the tab was blank on first load; the fix removed an initial `hidden` class. **Confirm the tab is never blank.**

| # | Steps | Expected | Priority |
|---|---|---|---|
| L1 | Log in → click Learn | Page renders. If no plans exist: 🌱 empty state + "Create new plan" button. If plans exist: 2-col grid of plan cards. **Never blank.** | P0 |
| L2 | Click **＋ Create new plan** | Setup modal opens with language pickers, level, goal, minutes/day | P1 |
| L3 | Fill setup + submit | Wait ~5s. New plan card appears in the grid | P1 |
| L4 | Tap a plan card | Grid disappears, detail view slides in with lessons | P0 |
| L5 | Tap `← My plans` | Detail view disappears, grid is back exactly as before | P0 |
| L6 | Press browser back from detail | Should also return to the grid (not exit the tab) | P1 |
| L7 | Create a 2nd, 3rd plan | All plans list in the grid, most recent first | P1 |
| L8 | Delete a plan from detail (trash link) | Plan disappears, returns to grid, grid updates | P1 |
| L9 | Resize desktop → 500px width | Grid collapses to 1 column, no horizontal scroll | P2 |
| L10 | Reload the page while on Learn tab | Learn tab still renders (not blank) | P0 |
| L11 | On mobile Safari, tap the Learn tab from another tab | Tab loads, no white flash, no stuck state | P1 |

### 2.2 Lesson listen icon — WhatsApp-style play/pause circle

**Where:** Learn tab → open a plan → open any lesson → each phrase row.

**What changed:** The old pink 🔊 emoji button is replaced with a small 32px grey circle containing a play triangle. While the phrase is speaking, the circle turns **dark (filled ink)** with a pause icon.

| # | Steps | Expected | Priority |
|---|---|---|---|
| S1 | Open a lesson | Every phrase has a small grey circle with a play triangle on the right | P1 |
| S2 | Tap one phrase's play button | Circle turns dark + shows pause icon. Phrase speaks in the target language voice | P1 |
| S3 | Tap same button again mid-speak | Speech stops. Circle returns to grey/play | P1 |
| S4 | Tap phrase A, then phrase B before A finishes | A stops, B starts. Only one dark button at a time | P1 |
| S5 | Close the lesson modal mid-speak | Speech stops. No orphan audio in background | P0 |
| S6 | Mobile Safari: tap the play button | Speaks (iOS may need one tap prompt for audio). No silent failure | P1 |
| S7 | Rapid-tap 5x fast | No double-audio, no stuck-on button | P2 |
| S8 | Visual — old pink 🔊 must be gone everywhere | Only the new grey circle appears | P2 |

### 2.3 Invite friends modal — added to Connect 4, Pool, Mind Meld

**Where:** `/four`, `/pool`, `/meld`. Previously each of these three games had a "Send the link" button. Now they have a **👥 Invite friends** button that opens a friend picker (same look as WordSpies/Codenames).

**Data source:** modal calls `GET /api/social/people` to list your following/followers, and `POST /api/social/invite` when you hit Send.

**Test on all three URLs** (`/four`, `/pool`, `/meld`) — the code is duplicated per file, so a bug can exist in one and not the others.

| # | Steps | Expected | Priority |
|---|---|---|---|
| I1 | Log in → open `/four` → create a room | Lobby shows a **👥 Invite friends** button (no "Send the link" button) | P0 |
| I2 | Click Invite friends | Modal opens with your followers/following list | P0 |
| I3 | Empty state check: log in with a brand-new account with 0 follows → open modal | Friendly empty state, not a JS error, not a blank list | P1 |
| I4 | Tap 2-3 people | Each row toggles selected. "Send invite (2)" reflects the count | P1 |
| I5 | Click Send invite | Modal closes. Recipients get a DM with a room-link | P0 |
| I6 | Recipient (tester 2) taps the DM link | Lands directly in the lobby of the invited room, sees inviter | P0 |
| I7 | Open picker while logged out (visit `/four?code=XYZ`) | Shows "You need to be logged in… Log in on the Community" | P1 |
| I8 | Repeat I1-I6 on `/pool` | Same behaviour, no drift from Four | P0 |
| I9 | Repeat I1-I6 on `/meld` | Same behaviour, no drift from Four | P0 |
| I10 | Close modal without sending, reopen | Selections cleared, no ghost state | P2 |
| I11 | Mobile Safari: modal opens full-screen appropriately, no scroll trap | Body underneath does not scroll while modal is open | P1 |
| I12 | Compare visually to Codenames invite modal (`/codenames`) | Same picker style, same button copy, no drift | P2 |

---

## 3. Full-site coverage

### 3.1 Marketing pages (logged out)

| # | URL | Check | Priority |
|---|---|---|---|
| M1 | `/` | Landing loads. Hero + 4 pillars + CTA. Footer at the bottom | P0 |
| M2 | `/about`, `/privacy`, `/terms`, `/child-safety` | All 4 render, same shared footer, no 500 | P1 |
| M3 | `/how-to-play` | Loads | P1 |
| M4 | `/blog` and any `/blog/:slug` | Index lists posts. Each post loads with white banner | P1 |
| M5 | `/become-a-teacher` | Public form loads (see 3.14) | P1 |
| M6 | Footer links (every public page) | All links resolve, no 404 | P2 |
| M7 | Any onrender or `www.` URL | 301 redirects to `https://wordspies.co.uk` | P2 |

### 3.2 Signup wizard (9 screens)

Wizard opens after fresh signup or if the user hits the site without a completed profile.

| # | Steps | Expected | Priority |
|---|---|---|---|
| W1 | Step 1: Name + DOB on one page | Both required. Age < 18 → hard block, no advance | P0 |
| W2 | Step 2 → 9 | Each step: one question focus, progress dots at top, smooth slide | P1 |
| W3 | Photo step | Camera opens, face detection prompt, gallery upload also works | P0 |
| W4 | Language "you speak" step | Multi-select chips, at least 1 required | P1 |
| W5 | Language "you learn" step | Same UX, at least 1 required | P1 |
| W6 | Back button (on wizard) | Returns to previous step, keeps values | P1 |
| W7 | Complete wizard | Lands in Community tab, profile is populated | P0 |
| W8 | Reload mid-wizard | Resumes on the same step (no re-entry from 1) | P1 |
| W9 | Try to skip a required field | Cannot advance, error shown | P1 |
| W10 | Mobile Safari native date-picker wheel on DOB | Wheel opens correctly, no keyboard-only trap | P1 |

### 3.3 Community tab (`/social` → Community)

The main tab after login. Shows the wall (posts from everyone) + "Who to follow" + happening-now banner.

| # | Steps | Expected | Priority |
|---|---|---|---|
| C1 | Open Community | Wall paginated, "Who to follow" row, live parties strip | P0 |
| C2 | Compose a post | Text + optional image + optional language tag → posts to top | P0 |
| C3 | Scroll to end of wall | Pagination loads more (or shows end-of-feed) | P1 |
| C4 | Like a post | Heart fills, count increments, persists on reload | P1 |
| C5 | Comment on a post | Comment appears, author avatar, correct order | P1 |
| C6 | Report a post | Confirm dialog, submits, dedup (report twice same post = no double log) | P1 |
| C7 | Tap author name/avatar | Opens `/user/:id` profile view | P0 |
| C8 | Follow / unfollow from a wall row | Button toggles, persists on reload | P1 |
| C9 | Block a user from their profile | User's posts no longer visible in wall | P1 |
| C10 | New-post badge on tab | Increments while another user posts | P2 |

### 3.4 Chats + DMs

**Tab:** Chats. Desktop = split view (list left, thread right). Mobile = list → tap → thread.

| # | Steps | Expected | Priority |
|---|---|---|---|
| CH1 | Open Chats, no threads yet | Empty state, not blank | P1 |
| CH2 | From another tab, receive a DM (get tester 2 to send one) | Chats tab badge increments | P1 |
| CH3 | Open the thread | History loads, scrolled to bottom | P0 |
| CH4 | Send a text message | Appears immediately, delivered check | P0 |
| CH5 | Send an emoji | Renders full-size where appropriate | P2 |
| CH6 | Send an image | Uploads, previewable, tappable to expand | P1 |
| CH7 | Send a voice note (hold mic button) | Waveform preview, tap ➤ to send, recipient plays back | P1 |
| CH8 | **Listen back before sending** a voice note | Preview player works, tap ✕ to discard | P1 |
| CH9 | Voice/video call button | Rings other tester, `/call` page opens for both | P1 |
| CH10 | Back arrow (mobile) | Returns to list, keeps unread state | P1 |
| CH11 | Delete a thread | Removes from list, no ghost badge | P2 |
| CH12 | Type + send at 20 msgs rapid-fire | All arrive in order, no dropped | P1 |

### 3.5 Chat translation

Two directions:
- **Incoming** — tap a peer's bubble → translates to your native language.
- **Outgoing** — tap the 🌐 next to Send → translates what you typed before sending.

| # | Steps | Expected | Priority |
|---|---|---|---|
| T1 | Peer sends a message in French. Tap the bubble | Translated to your native. Original stays visible or toggleable | P1 |
| T2 | Type "hello" in English, hit 🌐 | Field replaced with translation to your chat partner's native | P1 |
| T3 | Translate an emoji-only message | Emoji preserved unchanged | P2 |
| T4 | Translate a very long message | Waits, spinner or subtle loading state, returns | P1 |
| T5 | Anthropic outage sim (retry a few times) | Graceful error, does not crash the composer | P2 |

### 3.6 AI experts + voice-to-text

AI-persona chats have a purple ✨ AI badge on the avatar, and the composer shows an extra 🎙️ **talk-to-AI** mic (only on AI-expert chats — not on human chats).

| # | Steps | Expected | Priority |
|---|---|---|---|
| A1 | Chats list → tap an AI expert | Thread opens, purple ✨ badge visible on avatar | P0 |
| A2 | Send a text message | AI replies within ~5-10s | P0 |
| A3 | AI 🎙️ mic button visible in composer | Only on AI chats, not on human chats | P1 |
| A4 | Tap 🎙️, allow mic | Button turns red + pulses. Speak. Words transcribe into the input | P1 |
| A5 | Tap 🎙️ again mid-listen | Stops recording | P1 |
| A6 | Send transcribed text | AI replies, may include a voice-note reply | P1 |
| A7 | Send a voice note to the AI | AI receives it, replies (currently: text reply — STT-to-AI is deferred) | P2 |
| A8 | Grammar correction — send a wrong-grammar sentence | AI gently corrects in-thread (single-box reply — the two-box variant was reverted) | P1 |
| A9 | Try 🎙️ on mobile Safari | Prompts mic permission, works. iOS quirks noted below | P1 |

### 3.7 Me tab (`/me`)

Own profile. Contains hero, stats, follows, visitors card, badges, edit buttons.

| # | Steps | Expected | Priority |
|---|---|---|---|
| ME1 | Tap avatar (top right) → Me | Own profile renders. Hero uses OpenStreetMap of your city | P0 |
| ME2 | Edit fields (bio, goals, languages) | Save persists on reload | P1 |
| ME3 | Add/remove languages | Chip UI works, persists | P1 |
| ME4 | Photos | Add + remove, min 1 profile pic | P1 |
| ME5 | Visitors card | Up to 12 latest visitors, block-aware (blocked users don't appear) | P1 |
| ME6 | Followers/Following/Blocked stat tap | Opens 3-tab drawer (see 3.8) | P1 |
| ME7 | Copy share-my-profile link | Link is `/user/<myid>`, opens in another browser | P1 |
| ME8 | Log out | Returns to landing, session cleared | P0 |

### 3.8 3-tab Follows drawer

Bottom-sheet drawer with Following / Followers / Blocked tabs.

| # | Steps | Expected | Priority |
|---|---|---|---|
| F1 | From Me: tap Following count | Drawer opens on Following tab | P1 |
| F2 | Swipe/click tabs | Underline slides between the 3 tabs | P1 |
| F3 | Row content | Avatar + name + location + language chip | P2 |
| F4 | Tap a row | Opens that user's `/user/:id` | P1 |
| F5 | Empty state on Following | Friendly empty state + CTA to explore wall | P1 |
| F6 | Empty state on Followers | Different friendly copy | P1 |
| F7 | Unblock from Blocked tab | Row disappears, unblocked user's posts return on wall | P1 |
| F8 | Close drawer (tap outside / swipe down) | Drawer closes cleanly | P2 |

### 3.9 User profile view (`/user/:id`)

Anyone else's profile.

| # | Steps | Expected | Priority |
|---|---|---|---|
| U1 | Open a stranger's profile | Hero + languages + bio + photos load | P0 |
| U2 | Follow / Unfollow button | Toggles, persists | P1 |
| U3 | Message button | Opens Chats thread with them | P1 |
| U4 | Report user | Confirm + submit, no duplicate reports | P1 |
| U5 | Block user | Confirms; posts + DMs blocked, appears in Me → Blocked | P1 |
| U6 | Visiting logs a visitor | Refresh their `/me` (tester 2), you appear in their visitors card | P1 |
| U7 | View your own `/user/<myid>` | Should just be your Me view, no ghost "follow yourself" button | P2 |
| U8 | Non-existent id `/user/xyz-fake` | 404 or friendly not-found | P2 |

### 3.10 Party rooms (`/party` and Social → Language Parties)

Voice rooms — Cloudflare Realtime SFU. iOS Safari has known WebRTC quirks (see §5).

| # | Steps | Expected | Priority |
|---|---|---|---|
| P1 | Social tab → Language Parties | List of live rooms, cards show host + speaker/listener counts | P0 |
| P2 | Create a room, pick language | Lands in room as host (speaker), mic active by default for host | P0 |
| P3 | Second tester joins via link | Joins as listener (mono, muted by default) | P0 |
| P4 | Listener raises hand → host promotes | Listener becomes speaker, mic unlocks | P1 |
| P5 | Host demotes a speaker | Speaker → listener, mic locks | P1 |
| P6 | Kick a user | Removed from room, cannot rejoin same session | P1 |
| P7 | Speaker avatar shows mic activity ring | Ring pulses while speaking | P2 |
| P8 | Party mini-strip persists across tabs | Switch to Community — mini-strip stays at bottom, mic still active | P1 |
| P9 | Swipe-down on mini-strip / tap X | Leaves party cleanly, mic released | P1 |
| P10 | Browser back on `/party` | Leaves party, returns to prior page (no history spam) | P1 |
| P11 | Mobile Safari, background the tab 30s, foreground | Reconnects, Wake Lock keeps screen alive when speaker | P0 |
| P12 | 4-way party (need 4 accounts) | All hear each other. No echo. Chat panel shows correctly | P1 |
| P13 | Languages filter dropdown | Filters list by language | P2 |

### 3.11 Language Clubs (Social → Language Clubs)

Text-based rooms grouped by language. Note: currently a lighter feature than Parties.

| # | Steps | Expected | Priority |
|---|---|---|---|
| CB1 | Social → Language Clubs subtab | Loads list, flag filter chips at top | P1 |
| CB2 | Tap a flag chip | Filters to clubs in that language | P1 |
| CB3 | Open a club | Detail view with posts | P1 |
| CB4 | Join a club | Button state changes to Joined | P1 |
| CB5 | Post in a club | Post appears at top | P1 |
| CB6 | Like/comment on club post | Both persist | P2 |
| CB7 | Leave a club | Removed from your club list | P2 |

### 3.12 Learn tab — full coverage (beyond the 14 Aug ship items)

See §2.1 for the 14 Aug redesign checks. Also verify:

| # | Steps | Expected | Priority |
|---|---|---|---|
| LN1 | Setup: pick learn + native | Both pickers work, same-language pair blocked | P1 |
| LN2 | Level chips (Beginner/Intermediate/Advanced) | Exactly one selectable | P1 |
| LN3 | Goal chips (Travel/Work/Chat/Exam/Partner/Fun) | Exactly one selectable | P2 |
| LN4 | Time chips (5/10/15/30 min) | Exactly one selectable | P2 |
| LN5 | Build → Claude generates plan (~5s) | Progress hint visible, plan lists 5 lessons per topic | P1 |
| LN6 | Open lesson → 5 phrases each with speak button | 5 phrases, translations, examples | P1 |
| LN7 | Mark lesson done | Progress ring on plan card advances, persists | P1 |
| LN8 | Do all lessons in a plan | Plan card marks fully complete | P2 |
| LN9 | Return to plan later | Progress preserved | P1 |

### 3.13 Games — all 9

Common checks (**run these once per game**):

- **G-common-a** Direct URL works logged out (game loads, prompts for name).
- **G-common-b** Direct URL works logged in (game loads with your identity).
- **G-common-c** `?` info popup opens with how-to-play.
- **G-common-d** Active-game guard: after starting game A, opening game B says "you're already playing …" and offers to jump back.
- **G-common-e** Browser back leaves the game cleanly (no history spam, back goes to prior page — social or landing).
- **G-common-f** URL bar reflects the open game (e.g. `/wordrace` when Wordrace is open even if launched inside `/social`).
- **G-common-g** Persistent shell inside `/social`: switch to Chats tab, come back to Games — game state preserved.
- **G-common-h** Rejoin: refresh mid-game → session token restores your seat (no duplicate seat).
- **G-common-i** Mobile portrait renders (no clipped board / off-screen buttons).

| # | Game | URL | Key checks | Priority |
|---|---|---|---|---|
| G1 | WordSpies (Codenames) 🕵️ | `/codenames` | Team assign, spymaster clues, red/blue/nut/assassin tiles, chat | P0 |
| G2 | Who is the Spy? | `/spy` | Word reveal to non-spies, vote round, results | P1 |
| G3 | Word Chain | `/wordchain` | Player types word starting with last letter, timer, dictionary check | P1 |
| G4 | Guess the Word | `/guessword` | Wordle-style, colour feedback rows | P1 |
| G5 | Word Race | `/wordrace` | 60s vocab sprint, own socket, per-player scores, end-of-round board | P1 |
| G6 | Connect 4 | `/four` | 4-in-a-row, invite modal (see §2.3) | P1 |
| G7 | 8-Ball Pool | `/pool` | Physics table, invite modal (see §2.3), turn passing | P1 |
| G8 | Mind Meld | `/meld` | Prompt shown, both players submit, match reveal, invite modal (§2.3) | P1 |
| G9 | Hoop 🏀 | `/hoop` | Client-side arcade free-throw, personal best persists in localStorage | P2 |
| G10 | Ludo | `/ludo` | Dice roll, 4-player board, tokens move | P2 |

**Cross-game specifics to file if you see them:**
- Waiting-room / AUTOGO hang after invite (owner has this on the top-priority list — highly worth checking on WordSpies + Pool especially).
- Any duplicate seat after refresh.
- Any game where the `?` info popup is missing.
- Any game where browser back leaves multiple history entries.

### 3.14 Become-a-teacher form (`/become-a-teacher`)

| # | Steps | Expected | Priority |
|---|---|---|---|
| BT1 | Open `/become-a-teacher` logged out | Form loads | P1 |
| BT2 | Submit valid form | Success confirmation, no duplicate submits | P1 |
| BT3 | Missing required field | Client-side or server-side error, no silent fail | P1 |
| BT4 | Spam submit 5x | Rate-limited after N attempts, friendly message | P2 |
| BT5 | Footer "Become a teacher" button (any public page) | Lands on form | P2 |

### 3.15 Visitors card (Me tab)

| # | Steps | Expected | Priority |
|---|---|---|---|
| V1 | Fresh account | Empty state, not blank | P1 |
| V2 | Tester 2 views your `/user/<myid>` | You appear on your Me → Visitors within a few seconds | P1 |
| V3 | Block tester 2 | Tester 2 disappears from card | P1 |
| V4 | 12 different viewers | Only 12 latest appear | P2 |
| V5 | Card tap → visitor profile | Opens `/user/:id` correctly | P2 |
| V6 | Free-tier check | No paywall / Pro upsell (visitors is free for all) | P1 |

### 3.16 Nav + shell

| # | Steps | Expected | Priority |
|---|---|---|---|
| N1 | Tab bar: Community / Chats / Social / Learn / Games / Me | All 6 present, active one highlighted | P0 |
| N2 | Avatar chip top-right | Opens the avatar menu (Me / Settings / Log out) | P1 |
| N3 | Live-games ⚡ chip (when present) | Opens live-games tab | P2 |
| N4 | Deep link `/social#learn` | Opens directly on Learn tab | P1 |
| N5 | Deep link `/social#chats` | Opens directly on Chats tab | P1 |
| N6 | Refresh on any tab | Same tab active after reload | P1 |
| N7 | Mobile: bottom tab bar reachable one-thumb | Yes, thumb-safe area respected | P1 |

### 3.17 Authentication edge cases

| # | Steps | Expected | Priority |
|---|---|---|---|
| AU1 | Signup with an existing email | 409 error, friendly message | P1 |
| AU2 | Login with wrong password | Error, no lockout of the account | P1 |
| AU3 | Signup under 18 | Hard blocked, cannot advance | P0 |
| AU4 | Session persists across browser restart | Yes (cookie) | P1 |
| AU5 | Log out from one tab | Other tab in same browser also loses session on next request | P2 |
| AU6 | Password reset (if surfaced) | Flow completes | P1 |
| AU7 | Google sign-in (if enabled) | Works, lands in wizard for first-time users | P1 |

### 3.18 Cross-device parity

Run each of these **once on iPhone Safari** and **once on desktop Chrome**:

- Sign up + wizard.
- Send a DM, receive a DM, translate a message.
- Voice note in a DM.
- 🎙️ talk-to-AI in an expert chat.
- Join a party, listen, raise hand, become speaker.
- Play one full round of WordSpies.
- Open Learn, generate a plan, listen to a phrase.
- Invite a friend from `/four`.

Any behavioural drift between the two = file it.

---

## 4. Performance + accessibility smoke test

| # | Check | Target | Priority |
|---|---|---|---|
| PA1 | Landing page LCP | < 3s on 4G (Chrome DevTools throttle) | P2 |
| PA2 | Social first paint after login | < 2s | P2 |
| PA3 | No console `error` red lines on any page (F12) | Zero red | P1 |
| PA4 | Tab through the wizard with keyboard only | Reachable, focus visible | P2 |
| PA5 | Image alt text on hero + avatars | Present | P2 |
| PA6 | Colour contrast (grey text on white) | Legible | P2 |
| PA7 | Mobile viewport meta / no horizontal scroll on any page | Enforced | P1 |

---

## 5. Known limitations — do NOT file these

These are known/deferred. Please skip and do not open bugs for them.

- **Bots / AI opponents for games.** WordSpies is human-vs-human by design. Only Hoop (single-player free-throw) has no opponent requirement. Games 2-8 all need real humans; do not file "no bot to play against."
- **Two-box AI correction** (fix + grammar note). Was shipped 12 Aug (`825044b`), reverted 12 Aug (`4f85590`). Current correction shows as a single reply — this is intentional until an owner-approved retry.
- **Voice-note → AI expert STT-to-AI**. Sending a voice note to an AI expert is accepted, but the AI currently transcribes and replies in text. Deferred.
- **Kids mode** and **Learn sub-tabs**. Queued, not shipped.
- **Language Clubs full feature** (reverted at `901ab12`). Current club view is the pared-back version — thin posts/comments only. Do not file "clubs lacks moderation / roles / etc."
- **iOS Safari WebRTC quirks in party rooms.**
  - Audio can drop when the tab is fully backgrounded > ~60s.
  - Bluetooth headphones may require one extra tap to route.
  - These are platform quirks, not our bugs — file only if you can reproduce a *new* failure mode.
- **AdSense / monetization.** Not live yet. No "where are the ads?" bugs.
- **Following-yourself / self-DM UI edge case.** Cosmetic; on the backlog.
- **/wordrace P2 rejoin edge case** where refreshing at second 59 can occasionally seat late-join. Known.
- **Landing pivot to language-exchange (9 Aug).** Copy is what the owner wants. Do not file marketing-copy bugs — route those separately.

---

## 6. How to hand results back

1. One bug per report, following the template in §1.5.
2. Group your bugs into a single email/thread with sections `P0 blockers`, `P1 majors`, `P2 minors`.
3. For the 14 Aug ship items (§2), always put the section number (L, S, or I) in the title so triage is fast — e.g. `[P1][L4] Learn plan detail crashes when plan has 0 lessons`.
4. If you find something that could hit under-18 users (age gate leak, unmoderated content reachable to minors), tag `[SAFETY]` and send it straight to Sibghat — do not sit on it.
5. When you finish, send one summary line: `X P0, Y P1, Z P2 filed. Coverage: [list of §§ done].`

Thanks — this review is what tells us the site is ready for the next push.
