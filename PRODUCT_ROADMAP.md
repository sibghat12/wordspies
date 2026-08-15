# WordSpies — Product Roadmap (forward-looking)

_Generated 15 Aug 2026. Companion to `QA_AUDIT.md` (bugs + 30 suggestions), `PRODUCT_REVIEW.md` (ship checklist), `BOT_ROADMAP.md` (per-game bots), `MODERATION_STRATEGY.md` (safety policy). This doc is the “what to build next” — not a duplicate of any of those._

**Legend** — Effort: **S** ≤1 session · **M** 2–3 sessions · **L** ≥1 week · **XL** month+. Impact: **S/M/L**. `SUGG-##` refs → `QA_AUDIT.md` §Part 4. `BUG-###` refs → same file, Part 3.

---

## Part 0 — TL;DR

**Positioning (3 sentences).**
WordSpies is a language-exchange app where you actually *play* the language you’re learning — 9 real-time games, voice parties, an AI conversation expert, and native-speaker chats, all in one tab. It is for adult self-learners (18+) who bounce off Duolingo drills and get overwhelmed by Tandem’s inbox. It differs by fusing three surfaces competitors keep separate: **learning (Duolingo) + partners (Tandem) + games (Discord party bots)** — with fair, transparent, user-owned data as the trust wedge (owner banned by Tandem is our origin story).

**Top 10 features to build next.**

| # | Feature | Effort | Impact |
|---|---|---|---|
| 1 | Party Games mode — voice-room + Word Chain / Codenames in the same sheet | M | L |
| 2 | Daily lesson streak + user-picked local push (SUGG-01 extended) | S | L |
| 3 | Quiet-start toggle in wizard + inbox filter | S | L |
| 4 | Language-match score on every member card + wall sort | S | L |
| 5 | Party auto-transcript + shareable recap page (SUGG-04 extended) | L | L |
| 6 | Voice-notes on the wall with waveform + transcript + 1-tap translate | S | L |
| 7 | “Practise with a stranger” no-signup taster (SUGG-18 extended) | L | L |
| 8 | AI expert *inside* the party (drop-in host for cold rooms) | M | L |
| 9 | Level-placement quiz → CEFR badge + wizard fast-path | M | M |
| 10 | Codenames game (word-association, team-based) at `/codenames` | M | M |

**The ONE bet to differentiate on.** _Language games you play by voice, together._ Nobody in the category owns this. Duolingo is solo drills. Tandem is DMs. Discord is unmoderated chaos. WordSpies already ships 9 games + parties + AI experts on one URL. Weld them: **party-games mode**, then **AI expert as a party host**, then **shareable transcript recaps**. That trio compounds. Everything else in this doc supports it.

---

## Part 1 — Competitor teardown

Each competitor, 5 strengths / 5 weaknesses / what to steal / what to avoid / 1-line beat.

### Tandem
| Strengths | Weaknesses |
|---|---|
| Tight onboarding, quality-first profile | Women drown in 50+ inbound DMs day one |
| Corrections built into chat UI | Search-only discovery; empty feed on day 1 |
| Ambassadors + Featured Parties | Learn tab is a graveyard, no retention loop |
| Brand trust in the language-exchange niche | Opaque bans (owner’s founding grievance) |
| Broad language coverage + level tags | No games, no AI, no live captioning |

- **Steal:** correction preference in profile · listener-by-default party · ambassador/schedule model.
- **Avoid:** paywall on message length · opaque moderation · one-way ban appeals.
- **Beat:** Quiet-start toggle + language-match scoring + games make first-day retention 2× theirs.

### HelloTalk
| Strengths | Weaknesses |
|---|---|
| Correction UI is the industry benchmark | Wall = spammy voice-note dating pool |
| In-room live translation | Push settings buried, off by default |
| Moments feed (public voice + text) | UI clutter, ad-heavy on free tier |
| Voicerooms by language + level | Weak retention on Learn side |
| Correction credits economy | Native-verification is nominal |

- **Steal:** correction-credit economy · Moments-style voice wall · room-topic tagging.
- **Avoid:** ad density on free tier · aggressive upsell modals · pay-to-see-who-liked-you.
- **Beat:** verified-native badge (ElevenLabs classifier) + one-tap wall translation.

### Speaky
| Strengths | Weaknesses |
|---|---|
| Simple, clean signup | Wall is undifferentiated |
| Recently added Claude AI | No history retention on AI |
| Free-tier generous on chat | No parties / voice at all |
| Fast web app | No games or gamified learning |
| Low friction to first chat | No teachers / no monetisation surface |

- **Steal:** minimal signup vibe · Claude integration UX.
- **Avoid:** feature staleness · zero voice product.
- **Beat:** we already have voice + games + a real Learn plan — just ship faster.

### Duolingo
| Strengths | Weaknesses |
|---|---|
| Streak psychology is unmatched | No real humans to talk to |
| Course depth + gamified levels | Path locks progression, forces boredom |
| Widgets, notifications, tuned habits | Cartoon vibe alienates adult pros |
| Massive brand + free tier | Grammar depth is thin at B1+ |
| Character personalities (Lily etc.) | Owl push-guilt is a meme people quit over |

- **Steal:** streak + local-hour push · widget · daily-lesson pill · character personas (we already have Amy/Matthew/Ashley).
- **Avoid:** dark-pattern guilt push · gamified paywall on hearts · forced-linearity.
- **Beat:** streak + real conversation + gentle correction (no guilt copy).

### Preply / italki
| Strengths | Weaknesses |
|---|---|
| Verified paid teachers | Expensive, gatekept teacher market |
| Video-lesson tooling built in | Zero community outside the lesson |
| Trust: refunds, ratings, escrow | Discovery is search-only |
| Global teacher supply | No AI, no games, no free practice |
| Corporate/B2B footprint | Teacher take-rate is opaque |

- **Steal:** teacher profile schema · availability calendar · rating system.
- **Avoid:** high take-rates · walled community · aggressive teacher marketplace UX.
- **Beat:** free peer-to-peer practice **and** paid teachers → students graduate from free → paid inside the same app.

### Discord
| Strengths | Weaknesses |
|---|---|
| Voice UX is the industry gold standard | Not language-oriented — no leveling, no correction |
| Server culture + bots | Onboarding to a server is confusing |
| Free voice with low latency | Moderation is server-owner’s problem |
| Screen share, video, streaming | Discovery of language servers is poor |
| Massive existing user base | Not a mobile-first product |

- **Steal:** party voice smoothness bar · reaction emojis floating over the sheet · bots as first-class citizens.
- **Avoid:** infinite-scroll server list · toxic culture default.
- **Beat:** every voice room has a Learn-mode overlay Discord can’t bolt on (transcript + corrections + AI host).

### Clubhouse
| Strengths | Weaknesses |
|---|---|
| Made audio-rooms mainstream | Died from empty rooms + no async |
| Speaker/listener model is proven | No text, no reactions early on |
| Cool factor + celebrity hosts | No translation, no learning angle |
| Ambient-listen UX | No games, no persistence |
| Simple hierarchy | Signup was invite-only for too long |

- **Steal:** listener-by-default · raise-hand promotion · pinned host chip.
- **Avoid:** invite-only friction · async gap · content ephemerality.
- **Beat:** async transcript + recap DM turns the room into a persistent artifact.

### Bumble BFF (adjacent — friend discovery UX)
| Strengths | Weaknesses |
|---|---|
| Female-first safety UX | Not built for language exchange |
| Card-swipe discovery | No voice / no video / no games |
| Time-limited match pressure | Time-limit stresses beginners |
| Verified photos | Verification is US-heavy |
| Prompts guide bio quality | Prompts feel dating-app-ish |

- **Steal:** female-first safety toggles · verified photo badge · prompt-guided bios.
- **Avoid:** swipe-scarcity mechanics · dating vibes.
- **Beat:** language-match score is a *deterministic* better signal than a swipe.

---

## Part 2 — Feature backlog (grouped by theme)

Feature IDs prefixed `RM-` (roadmap). Where a QA_AUDIT `SUGG-##` already exists, we **extend** it rather than restate. **New** IDs have no upstream ref.

### Theme A — Learning velocity (the Learn tab)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-A01 | CEFR placement quiz (10 Qs → level A1–C2 badge) | M | L | Duolingo (path-locked), Tandem (self-declared only) |
| RM-A02 | “Continue where you left off” pill on Learn hero (SUGG-03 done) | S | M | Tandem |
| RM-A03 | Streak + daily local-hour push (extends SUGG-01) with **no guilt copy** — “welcome back” not “you disappointed us” | S | L | Duolingo |
| RM-A04 | Weekly digest email (extends SUGG-12), gated by explicit consent | S | M | Duolingo/Tandem |
| RM-A05 | Learn sub-tabs: Roadmap · Phrasebooks · Roleplay · Grammar Q&A · Kids | M | L | Nobody has all 5 |
| RM-A06 | Roleplay scenarios (order coffee, airport, interview) with AI expert | M | L | Duolingo (canned only) |
| RM-A07 | Vocab-from-your-chats — Claude parses accepted corrections into flashcards | M | L | Nobody |
| RM-A08 | Grammar Q&A — free-form “why is this wrong?” answered by Claude | S | M | Speaky (their Claude has no context) |
| RM-A09 | “Explain like I’m A1” toggle in AI chat (SUGG-29 extended) | S | M | Speaky |
| RM-A10 | Focus mode / Pomodoro (SUGG-26 extended) with a lesson-per-25min prompt | S | S | All |
| RM-A11 | Custom prompt → 3-lesson mini plan (SUGG-22 extended) | M | L | Duolingo |
| RM-A12 | Public learning journal (SUGG-35 extended) — indexable, SEO growth loop | L | L | All |
| RM-A13 | Micro-lessons ≤ 60 s each in Roadmap — “5 minutes = 5 lessons” | S | M | Duolingo (lessons feel longer than they are) |
| RM-A14 | Home-screen PWA widget for today’s lesson (SUGG-38) | L | L | Duolingo |
| RM-A15 | Level-adaptive Amy/Matthew (Amy speaks slower to A1, faster to B2) | M | M | Nobody |

### Theme B — AI conversation experts

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-B01 | AI expert **in-party** drop-in host (see Part 1 bet) | M | L | Discord/Tandem |
| RM-B02 | “Correct my last 5 messages” bulk action (SUGG-09 extended) | S | L | Tandem |
| RM-B03 | Named personas per language: Isabella (ES), Kenji (JA), Mateo (PT), Léa (FR), Anya (RU), Ravi (HI) — expand from 3 to 12 | M | L | All (only WordSpies has this) |
| RM-B04 | AI accent picker (US/UK/AU English; Iberian/LatAm Spanish) | S | M | Duolingo |
| RM-B05 | AI expert opens with **your** interests from wizard step 4 | S | M | All |
| RM-B06 | Save any AI conversation as a “lesson” for later replay | S | M | All |
| RM-B07 | Voice-to-voice mode: mic → STT → Claude → ElevenLabs, low latency | L | L | Speaky/Duolingo (text only) |
| RM-B08 | Persona memory (remembers your name + goals across sessions) | S | M | All |
| RM-B09 | AI expert as **safety fallback** — offline hours native? AI corrects for free | S | M | HelloTalk (credits gate this) |
| RM-B10 | Emotion-aware Amy (recognises “I’m nervous” → slows down + reassures) | M | M | All |

### Theme C — Real-user chats + wall

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-C01 | Language-match % on member cards (SUGG-11 extended) + wall sort default | S | L | HelloTalk (crude match) |
| RM-C02 | Wall post types: Question · Correction request · Milestone (SUGG-06) | M | M | Speaky |
| RM-C03 | Voice-note on the wall (SUGG-07 extended) — waveform + transcript + translate | S | L | Tandem |
| RM-C04 | 1-tap wall translate (SUGG-21) with cache to skip re-translation | S | L | Tandem |
| RM-C05 | Public corrections feed (SUGG-16) — mini Stack-Overflow, upvoteable | M | L | Tandem |
| RM-C06 | Correction credits economy (SUGG-15 extended) with AI fallback | M | M | HelloTalk |
| RM-C07 | Quiet-start toggle (default OFF, but visible on wizard step 6) | S | L | Tandem (their #1 App Store complaint) |
| RM-C08 | Inbox filter chips: New · Followed · Same target lang · Nearby local time | S | M | Tandem |
| RM-C09 | “Undo send” DM (SUGG-31) — 5s window | S | S | All |
| RM-C10 | “Ready for a call?” live queue (SUGG-13 extended) — 15-min window | M | L | Tandem (passive Featured only) |
| RM-C11 | Match cards on Community — top 3 daily matches (SUGG-25) | S | M | Tandem |
| RM-C12 | Reply-with-voice on any DM | S | M | Tandem |
| RM-C13 | Slow-mode + typing indicator with your target lang keyboard hint | S | S | All |
| RM-C14 | Global search bar in nav (SUGG-32) — members, clubs, posts, lessons | M | M | Tandem (member-only search) |

### Theme D — Parties / voice rooms

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-D01 | Party smoothness Layer 1 (mixed audio, single mic, pagehide, auto-rejoin) | M | L | Tandem |
| RM-D02 | Emoji reactions floating over sheet | S | M | Tandem |
| RM-D03 | In-party text chat, namespaced `.pty-chat-*` | M | M | Tandem (missing) / HelloTalk (has it) |
| RM-D04 | Tap speaker → mini profile card + Say hi / Follow / Invite to game | S | M | Tandem (plans, not shipped) |
| RM-D05 | Scheduled / Featured party + pinned card + push 10 min before | M | L | Clubhouse (died from empty rooms) |
| RM-D06 | Party topic + level tags on the card | S | M | HelloTalk |
| RM-D07 | Party auto-transcript (Whisper 30s chunks, per-speaker) + recap page (SUGG-04) | L | L | Nobody |
| RM-D08 | Consent-gated audio recording (SUGG-08) — banner at party start | L | L | Nobody |
| RM-D09 | Live captions in party (SUGG-30) — accessibility + cross-language wins | L | L | Nobody |
| RM-D10 | Live word-help panel — shared translation chip visible to whole room | M | M | HelloTalk (has 1-to-1 only) |
| RM-D11 | Party recap DM — “you spoke with 4 people, say hi” + follow buttons | S | M | All |
| RM-D12 | Raise-hand + host promote/demote flow (already partly there — polish) | S | M | Tandem parity |
| RM-D13 | In-app-browser detection → “Open in Safari” prompt for iOS | S | M | All (a smoothness moat) |
| RM-D14 | Room capacity + level cap (“B1+ only”) enforced softly at join | S | S | HelloTalk |

### Theme E — Games with a language layer (the moat)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-E01 | **Party-games mode** — Word Chain voice mode in the party sheet | M | L | Nobody |
| RM-E02 | **Codenames** (team word-association) at `/codenames` | M | M | Nobody in learning space |
| RM-E03 | Wordspace / Salsa (word-association guess) | M | M | Nobody |
| RM-E04 | Per-language word lists on every word game (ES/FR/DE/JA/HI/UR/…) | M | L | All |
| RM-E05 | In-game translation chip — “what does that word mean?” one-tap | S | M | All |
| RM-E06 | Post-game vocab card — “5 words you saw, save to flashcards” | M | L | All |
| RM-E07 | Bot backfill for empty games — extends `BOT_ROADMAP.md`, per-game AI | (see BOT_ROADMAP) | L | Discord |
| RM-E08 | Cross-game daily challenge — “win any word game today for a streak star” | S | M | Duolingo |
| RM-E09 | Language-mode Hoop — timed free-throws with a target-lang word prompt per shot | S | S | Nobody |
| RM-E10 | Public game leaderboard per language + weekly reset | S | M | Discord (server-scoped) |
| RM-E11 | Spectator mode for popular games (learn by watching) | M | M | All |
| RM-E12 | “Play together” from a member profile → picks a game they play | S | M | Tandem (nothing like it) |

### Theme F — Teachers / tutors (Phase C in memory)

_Bootstrapped solo dev constraint = no Stripe until demand is proven. Free-lesson-first._

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-F01 | Teacher role: profile schema + availability grid (free trial slots only) | L | L | Preply/italki |
| RM-F02 | Booking flow — student picks slot → both get a party link at time | M | M | Preply |
| RM-F03 | Post-lesson review (5-star + short note) | S | M | Preply |
| RM-F04 | Teacher discovery page filterable by language + level + native | M | M | Preply/italki |
| RM-F05 | AI teacher-recommender — based on your level + goal | M | M | Preply |
| RM-F06 | Teacher application form (extends `module-become-a-teacher`) with verification queue | S | M | All |
| RM-F07 | Stripe Connect payouts (deferred until demand proved) | XL | L | Preply |
| RM-F08 | Post-lesson AI recap — Claude summarises errors, writes flashcards | M | L | Preply (no AI layer) |

### Theme G — Kids mode

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-G01 | Kids-mode Learn sub-tab — bigger UI, mascot, story lessons (SUGG-14 extended) | L | L | All (unlocks parents-of-learners market) |
| RM-G02 | Adult-verified chaperone account → child sub-profile · no DMs · no photos of others | L | L | Duolingo Family (paid tier) |
| RM-G03 | Sticker/star reward system, no XP dark patterns | S | M | Duolingo |
| RM-G04 | Kid-safe games list (subset of the 9) — no chat lobby | S | M | All |
| RM-G05 | Weekly report to parent email — minutes practised, words learned | S | M | Duolingo Family |

### Theme H — Clubs

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-H01 | Re-land clubs behind a feature flag (last attempt broke chat; verify diff) | M | M | Discord (unstructured) |
| RM-H02 | Club → “Start a club party” button, pre-tagged with topic | S | L | Discord |
| RM-H03 | Weekly club digest (top posts + upcoming parties) | S | M | Discord |
| RM-H04 | Club leaderboard per language | S | S | Discord |
| RM-H05 | Public club SSR page + JSON-LD (already partly done — polish per QA_AUDIT) | S | M | All |

### Theme I — Notifications / retention

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-I01 | Web Push (PWA) — user-picked local hour, opt-in banner | M | L | Tandem/HelloTalk (buried) |
| RM-I02 | Push categories toggleable: Streak · New follower · Party starting · Correction received | S | M | HelloTalk |
| RM-I03 | Followed-user wall post → push (SUGG-05) | S | M | HelloTalk |
| RM-I04 | Followed-user opens a party → push | S | M | All |
| RM-I05 | “Native speaker of your target lang just came online” badge on chats list | S | M | HelloTalk (crude only) |
| RM-I06 | Digest bundle to prevent notification spam (max 1 per 4h non-DM) | S | M | Duolingo |
| RM-I07 | Snooze all for 24h from one tap | S | S | All |

### Theme J — Content / SEO (organic growth)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-J01 | Public profile SSR + OG (SUGG-23 extended) | M | M | Speaky |
| RM-J02 | Public party transcript SSR pages — indexable | M | L | Nobody |
| RM-J03 | Phrasebook pages per topic × language pair (auto-generated + human-reviewed) | L | L | Duolingo blog |
| RM-J04 | Weekly blog post from real user milestones (opt-in) | M | M | Tandem blog (staff-written) |
| RM-J05 | JSON-LD Course markup on Learn plans → Google rich results | S | M | Duolingo |
| RM-J06 | Sitemap includes clubs + public profiles + transcripts | S | M | All |
| RM-J07 | Landing “compare us” pages — /vs-tandem, /vs-hellotalk (honest) | S | M | Programmatic SEO win |

### Theme K — Monetisation (fair, transparent, user-owned)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-K01 | WordSpies Pro £4.99/mo (SUGG-20 extended) — unlimited plans, priority voices, custom persona | M | M | Tandem Pro |
| RM-K02 | Pro perks non-list: **no** rate-limit on message, **no** pay-to-see-visitors — keep free tier fair | (guardrail) | L | Tandem (locks basic features) |
| RM-K03 | AdSense on `/clubs/:slug` + `/blog/*` only (SUGG-19) — never in-app | S | M | HelloTalk (ad-heavy in feed) |
| RM-K04 | Teacher take-rate — flat 10 %, published on landing | (with F07) | M | Preply (20–33 %) |
| RM-K05 | Gift a plan (SUGG-33) — pay once, invite recipient | M | M | Duolingo (no gifting) |
| RM-K06 | Enterprise pack — 20 seats for a language school (post-teacher) | L | M | Preply B2B |
| RM-K07 | Public financial dashboard — MRR, expenses, teacher payouts (trust play) | S | M | Nobody (differentiator) |

### Theme L — Trust & Safety (extends `MODERATION_STRATEGY.md`)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-L01 | Auto-hide on 1 report from followed user + 3 from strangers (SUGG-36) | S | M | Tandem (opaque queue) |
| RM-L02 | Public moderation log — anonymised (what, why, when) | S | M | All (transparency wedge) |
| RM-L03 | Ban appeals with a real reply within 72h — SLA on landing page | S | L | Tandem (owner banned unfairly — this is the origin story) |
| RM-L04 | Verified native badge via ElevenLabs classifier (SUGG-37) | M | M | HelloTalk (nominal only) |
| RM-L05 | Voice-only wizard step alternative (accessibility + verification 2-in-1) | M | M | All |
| RM-L06 | Report + block from every surface (audit for gaps) | S | M | Ongoing |
| RM-L07 | Suspicious-DM detector (Claude) — hides message-first-time-asks-for-Telegram | S | L | Tandem (rampant problem) |
| RM-L08 | Age re-verification prompt on any age-related report | S | M | All |

### Theme M — Accessibility

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-M01 | Screen-reader labels sweep (SUGG-27 extended) | M | M | All |
| RM-M02 | Keyboard shortcuts (SUGG-28) — /, g w, g c, g l | S | S | All |
| RM-M03 | High-contrast + dyslexia-friendly font toggle | S | M | Duolingo |
| RM-M04 | Live captions in AI expert chat + parties (RM-D09 dual-use) | L | L | All |
| RM-M05 | Slow-motion speech toggle for AI voices | S | M | Duolingo |
| RM-M06 | Focus trap audit on every modal + Esc-closes | S | M | All |

### Theme N — Platform / performance

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-N01 | Split `public/social.html` (SUGG-02 extended) — extract Learn, then Wall, then Me | L | L | Engineering safety net |
| RM-N02 | PWA installability + offline shell for Learn tab | M | M | Duolingo |
| RM-N03 | Service worker cache for TTS output (extends server disk cache) | S | M | All |
| RM-N04 | Structured logs + free-tier Grafana dashboard (droplet metrics) | S | M | Owner sanity |
| RM-N05 | Rate-limit sanity pass — invites, DMs, wall posts, TTS, translate | S | M | Protect the droplet |
| RM-N06 | Nightly TTS-cache eviction + 5 GB cap (BUG-001) | S | L | Blocker |
| RM-N07 | Session-kick fix (BUG-002) — `location.reload()` on lose | S | L | Blocker |
| RM-N08 | Auto backup: nightly Redis `BGSAVE` + rsync to a second bucket | S | L | Owner sleep |
| RM-N09 | Feature flags in-Redis so ships can be dark-launched | S | M | All |
| RM-N10 | Boot-test hook in `wsdeploy.timer` — rollback on failed healthz | M | L | Prevents auto-deploy from shipping broken commits |

### Theme O — Data ownership / privacy (values wedge)

| ID | Feature | Effort | Impact | Beats |
|---|---|---|---|---|
| RM-O01 | One-tap “Export my data” — full JSON of profile, DMs, corrections, lessons | M | L | Tandem (opaque) |
| RM-O02 | One-tap “Delete my account” — real delete, 30-day grace, no dark pattern | S | L | Tandem |
| RM-O03 | Consent-first analytics — off by default, granular categories | S | M | HelloTalk (default-on) |
| RM-O04 | Public privacy statement in plain English — no jargon | S | M | All |
| RM-O05 | On-page “what data are we storing for you right now” inspector | M | M | Nobody |
| RM-O06 | E2E encryption evaluation for DMs (deferred; documents the trade-offs) | L | M | Signal-parity messaging (aspirational) |

---

## Part 3 — 12-week plan

Rule: each week = **2–3 features + 1 polish + 1 growth**. Every week compounds — Layer 1 party smoothness before party features; streak before push; language-match before match cards; etc. Boot test + chat regression before every push (see `project-complete-roadmap-wizard-profile-clubs-parties` guardrails). Auto-deploy → smoke test after 60s.

### Week 1 — Stop the bleeding + streak (retention baseline)
- **RM-N06** TTS cache eviction (BUG-001).
- **RM-N07** Session-kick reload (BUG-002).
- **RM-A03** Streak counter (no push yet) shown on Learn hero.
- **Polish:** BUG-008 private-party leak + BUG-003 iAmHost-by-name.
- **Growth:** Post the streak feature on r/languagelearning + Indie Hackers.

### Week 2 — Notifications on
- **RM-I01** Web Push infra (PWA setup, user hour-picker).
- **RM-I02** Push category toggles.
- **RM-A03 cont.** Local-hour daily push (streak feed).
- **Polish:** RM-M06 focus-trap audit on all modals.
- **Growth:** Enable AdSense on `/clubs/:slug` (RM-K03) — first monetisation dollar.

### Week 3 — Language-match discovery
- **RM-C01** Match % on member cards + default wall sort.
- **RM-C11** Daily match cards on Community.
- **RM-C07** Quiet-start toggle in wizard step 6.
- **Polish:** RM-A02 Continue-where-left-off pill.
- **Growth:** Draft “WordSpies vs Tandem” compare page (RM-J07) — honest, links to both.

### Week 4 — Wall becomes voice-first
- **RM-C03** Voice notes on wall (waveform + transcript + translate).
- **RM-C04** 1-tap wall translate (cached).
- **RM-C09** Undo send (5 s) — cheap trust win.
- **Polish:** Wall JSON-LD + sitemap (RM-J06).
- **Growth:** Ship RM-J07 landing pages `/vs-tandem` and `/vs-hellotalk`.

### Week 5 — Party smoothness Layer 1
- **RM-D01** Mixed audio + single mic + pagehide + auto-rejoin.
- **RM-D13** In-app-browser prompt.
- **RM-D02** Emoji reactions.
- **Polish:** iOS test matrix — a physical iPhone Safari session.
- **Growth:** Record a 60-s screen video of parties for Twitter/TikTok.

### Week 6 — Party table-stakes
- **RM-D03** In-party text chat.
- **RM-D04** Tap-speaker → mini profile card.
- **RM-D06** Party topic + level tags.
- **Polish:** RM-D12 raise-hand polish.
- **Growth:** Host the first “English Practice Hour” Featured Party ourselves.

### Week 7 — The moat: party-games
- **RM-E01** Word Chain voice mode in party sheet.
- **RM-D11** Post-party recap DM.
- **RM-E12** “Play together” from a member profile.
- **Polish:** RM-E05 in-game translation chip.
- **Growth:** ProductHunt launch: “Play word games in a voice room, in your target language.”

### Week 8 — Codenames + AI expert as host
- **RM-E02** Codenames at `/codenames`.
- **RM-B01** AI expert drop-in as party host.
- **RM-B05** AI opens with your interests.
- **Polish:** RM-B03 add 3 new personas (JA/PT/FR).
- **Growth:** DM the Codenames official Twitter for a boost (they’ve retweeted community ports before).

### Week 9 — Learning gets serious
- **RM-A01** CEFR placement quiz → level badge.
- **RM-A05** Learn sub-tabs skeleton (Roadmap · Phrasebooks · Roleplay · Grammar · Kids-placeholder).
- **RM-A11** Custom-prompt mini plans.
- **Polish:** RM-A13 micro-lesson trim (≤60 s).
- **Growth:** Add JSON-LD Course markup (RM-J05) → aim for rich-results eligibility.

### Week 10 — Corrections economy
- **RM-C05** Public corrections feed (upvoteable).
- **RM-C06** Correction credits (with AI fallback).
- **RM-B02** Correct-my-last-5-messages bulk.
- **Polish:** RM-B09 AI fallback offline hours.
- **Growth:** Weekly digest email (RM-A04) opt-in launched.

### Week 11 — Trust & Safety wedge (the origin story)
- **RM-L03** Ban appeal SLA on landing + form.
- **RM-L02** Public moderation log.
- **RM-L07** Suspicious-DM detector (Claude).
- **Polish:** RM-L04 verified-native badge — MVP for one language.
- **Growth:** Blog post: “Why I built WordSpies after Tandem banned me.” — the founder story, published to HN.

### Week 12 — Party recap + shareables
- **RM-D07** Auto-transcript (Whisper) + recap page.
- **RM-J02** Public transcript SSR — indexable.
- **RM-J01** Public profile SSR + OG (extends what’s there).
- **Polish:** RM-N08 nightly Redis backup + rsync.
- **Growth:** Publish first 10 party recap URLs to Google Search Console; measure indexation over 4 weeks.

**End of quarter checkpoint.** Retention (D7) should have moved from unknown → measurable. Streak accounts / DAU · party recap pages indexed · Pro sign-ups (from Week 8-ish soft launch) — whichever is nonzero tells you which pillar to double down on in Weeks 13–24.

---

## Part 4 — 12-month vision (by Aug 2027)

**Users:** 5–15k monthly actives (conservative solo-dev range); one clear breakout language pair (likely EN ↔ ES or EN ↔ JA based on wall traffic). Ban-appeal SLA proven, cited in a small-press piece.

**Revenue model:** three legs.
1. WordSpies Pro £4.99/mo (target 3 % conversion of MAU = £750–£2 250/mo).
2. AdSense on public SEO surfaces only (target £200–£800/mo depending on transcript-page indexation).
3. Teacher take-rate 10 % on booked lessons (Phase C, Q4-ish 2026). Break-even before EOY 2026.

**Features unlocked:** party games in five languages, Codenames + Wordspace live, AI experts in 12 languages with persona memory, CEFR placement, Learn sub-tabs shipped end-to-end, kids mode in closed beta, teacher role in public beta, public transcript pages driving 20 % of new signups.

**Team shape:** still solo dev + Claude. One paid contractor for **1**  Whisper/transcript infra tuning and **2** first-line moderation queue (4 h/day). No investors, no cofounders, ownership stays 100 %. Values line-item: refuse acquisition offers that would touch user data (fair/transparent/user-owned data is non-negotiable).

**North-star metric:** *Days per week a user has a real conversation* (with any human or AI, min 5 min, in target lang). Target median = 3.5/week by month 12.

---

## Part 5 — Risks + counters

| # | Risk | Counter |
|---|---|---|
| R1 | **Auto-deploy ships broken code unattended** (memory says pushes to main go live in ~60s). One bad `npm ci` and social is 500 for hours. | RM-N10 (boot-test hook in `wsdeploy.timer` + auto-rollback on failed `/healthz`). Two-file commit cap already helps; enforce with a pre-push hook. Owner-facing pager: uptime-monitor push to phone. |
| R2 | **Whisper transcript + Cloudflare SFU + ElevenLabs bill runs away.** One viral moment = £500 in one day. | Per-user daily cap on TTS, translate, transcript. Hard cap on total-daily spend across all APIs (Redis counter + soft-fail with an in-app “try again in an hour” message, not a 500). Public cost dashboard (RM-K07) doubles as an alerting surface. |
| R3 | **Tandem-style ban problem lands on us.** Adult app + voice + games + AI + kids-mode = every moderation edge case. One press piece about a wrongful ban would break the trust wedge that is our origin story. | RM-L02 (public moderation log), RM-L03 (72 h appeal SLA on landing), a real human replying (owner + one contractor by month 6). Never automate a ban without a human review pass. |
| R4 | **Kids mode invites regulator scrutiny** (COPPA in US, GDPR-K in EU, age-verification laws now everywhere). | Ship kids mode adult-verified-chaperone-only (RM-G02). No under-13 accounts, ever. Get a one-hour legal read before launch. Delay kids mode from week-9 spec if legal isn’t clear — it’s not the whole business. |
| R5 | **Solo-dev burnout / bus factor of 1**. Auto-deploy + 11k-line social.html + no cofounder. | RM-N01 (split social.html) is not a nice-to-have, it’s a survival lever. Weekly “no-code Sunday” — owner blocks a day. Document architecture in `README.md`. Second contractor on stand-by (contract, not equity). Owner already writes memory files — keep doing that; they are the DR plan. |

---

## Part 6 — Questions only Sibghat can answer

Before Weeks 1–3 kick off, need answers on:

1. **Push notifications** — are we going Web Push (PWA, works everywhere but not iOS-perfect) or native wrappers via Capacitor? Answer changes Week 2 architecture.
2. **Streak copy tone** — Duolingo-style guilt ("your streak is on fire, don’t lose it!") is proven but violates our fair/kind values. Confirm we ship "welcome back" tone only, even if D7 is 20 % lower.
3. **Quiet-start toggle default** — memory says default OFF. Confirm? (Default ON would put us further from Tandem but might spook new users who want messages.)
4. **AdSense on `/clubs/:slug`** — you approved SEO surfaces monetisation in memory; confirm still yes, and any languages/regions where we must exclude ads for legal reasons.
5. **Teacher payments timeline** — free-lessons-only for how long? 2 months of demand data? 6? Different answers change whether Stripe Connect is a Week-24 or Week-40 task.
6. **Kids mode legal** — do you have a lawyer on retainer for a 1 h read? If not, we defer Kids to a later quarter and use the RM-G01 slot for RM-A12 (public learning journal) instead.
7. **Ban-appeal SLA** — are you personally comfortable committing to a 72 h reply promise, or should it be 7 days? The number goes on the landing page.
8. **Financial dashboard (RM-K07)** — you liked the transparency angle; confirm we publish MRR + expenses publicly and update monthly. (Vulnerable to lulls, but bulletproof for trust.)
9. **Codenames trademark** — Czech Games Edition owns the name. Ship as "Codenames" and risk a takedown, or rebrand ("Spymaster Words" / "Codewords")? Answer changes RM-E02 branding.
10. **Contractor for moderation queue (Week 24-ish)** — do you have anyone in mind, or should I add a “find contractor” Week to the plan?

---

_This document is forward-looking product functionality only. Bugs live in `QA_AUDIT.md`. Bot AI plans live in `BOT_ROADMAP.md`. Moderation policy lives in `MODERATION_STRATEGY.md`. Manual-test steps for what already ships live in `PRODUCT_REVIEW.md`._
