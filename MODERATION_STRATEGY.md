# WordSpies — Party Moderation Strategy

**Author:** Claude, for Sibghat
**Date:** 14 Aug 2026
**Decision status:** Recommendation — awaits owner sign-off
**Scope:** Voice-first party rooms (up to ~120 concurrent target, Cloudflare Realtime SFU). Real-time speech between strangers. No native app; web / mobile-web only. UK-based operator, EU-facing traffic.

---

## TL;DR

**Recommended: Option C — Hybrid. No recording by default; a rolling in-memory buffer of the last 60 seconds is captured on every speaker device and only PERSISTED to the server when a listener taps "report" during a party. Listener-by-default + raise-hand + host demote + block/mute do 90% of the work; the 60-second evidence clip does the other 10% for the cases that actually need review.**

Why: it's the only option that gives victims a real evidence trail without storing everything, respects GDPR data-minimisation, keeps monthly infra cost near zero, and — critically — is legible to users ("we only record if you report"). That legibility is what beats Tandem: no opaque always-on surveillance, no ban-without-evidence, but a real evidence trail when someone genuinely misbehaves.

---

## Decision table

Ratings are for WordSpies at 2026 scale (~120 concurrent target, sole owner/dev, UK-registered, pre-revenue).

| Option | Storage / infra cost | Privacy / GDPR risk | Effectiveness for victims | User trust / chilling effect | Legal / regulatory risk |
|---|---|---|---|---|---|
| **A** — Record every party, N-day retention | **High** (bandwidth + storage — hundreds of GB / month at scale) | **High** (large voice archive = crown-jewel breach target; broad lawful-basis burden) | **High** (any incident reviewable) | **High chilling** (people speak less, competitors weaponise "they record you") | **High** (must justify retention, DPIA required, ICO-visible if breached) |
| **B** — Never record; complaint-only, written reports + witnesses | **Zero** | **Very low** | **Low-Med** (he-said-she-said; owner can't verify) | **Very high trust** | **Low** — but zero evidence when a genuine safeguarding referral is needed (children's charity / police request) |
| **C** — Hybrid: no default recording, 60s rolling buffer flushed on report, persisted 30 days | **Very low** (only reported clips saved — order of MB/month) | **Low** (minimisation defensible: only capture when a user asks for review) | **High** (report always carries evidence) | **High trust** ("recorded only if reported" is a marketing win) | **Low** — lawful basis = legitimate interest (safety), explicit in ToS |
| **D** — No recording ever, reports + witnesses only | **Zero** | **Very low** | **Low** (owner routinely can't tell who's telling the truth) | **Very high trust** | **Med** — if a child is harmed and there's no evidence trail, "reasonable steps" defence weakens |
| **E** — Live LLM transcription for keyword flagging; transcripts saved only on trigger | **High** (STT for every speaker-minute is expensive: ~$0.006/min × 20 speakers × room-hours) | **Med** (transcripts are personal data; false-positive flags are a data-processing event) | **Med-High** (catches slurs / grooming keywords proactively, misses tone/sarcasm) | **Med** (users don't love "AI listens to everything", even if transcripts are ephemeral) | **Med** — automated processing of personal data with legal effects (bans) triggers Art. 22 GDPR concerns |

**Reads:**
- **A** protects best but destroys the "fair, transparent, not-Tandem" positioning and costs real money.
- **B / D** are values-pure but leave real victims with no case.
- **C** is the sweet spot: victims get evidence, everyone else is not surveilled.
- **E** is powerful long-term but too expensive and too "creepy AI" for a 1-person team pre-revenue.

---

## 1. The core decision (long form)

### Option A — Record every party

- **How it works:** Server-side mix of the room audio is written to disk / S3 as each party runs. Retained N days (typically 30 or 90), then hard-deleted.
- **Cost:** Cloudflare Realtime SFU doesn't record for us — we'd need to pull tracks server-side, mix, encode, store. At 120 concurrent × 20 speakers per room × ~$0.02/GB stored, a busy month = hundreds of GB. Engineering to add a recording pipeline reliably is a week+ for one person. Not the "$20/month" cost profile that made Cloudflare the pick in [[project-audio-infra-decision]].
- **Privacy risk:** A voice archive is a crown-jewel dataset. Any breach = biometric-adjacent PII spill. ICO fines under UK-GDPR scale with data volume and sensitivity. And every user has right-to-erasure — you'd have to build the tooling to selectively scrub any given voice from mixed recordings, which is genuinely hard.
- **False-positive risk:** N/A — recording itself doesn't classify, it just archives.
- **Chilling effect:** High. This is exactly the "you're being listened to" thing that kills spontaneity in a language-exchange product. Learners are already nervous about speaking a new language; "and it's recorded" is the last thing they need to hear on the join screen.
- **Victim protection value:** High. Any incident reviewable. But 99% of recordings are never listened to — you're paying storage + risk for a very rare need.
- **Verdict:** REJECT. Wrong for our values, wrong for our budget, wrong for our stack.

### Option B — Never record; complaint-driven with written reports

- **How it works:** The existing `/report` endpoint (see `social.js:792`) captures reporter, target, reason, note. Owner reads the queue, contacts both sides, decides.
- **Cost:** Zero. Already shipped.
- **Privacy risk:** Very low. Minimal data.
- **False-positive risk:** N/A — no classifier.
- **Chilling effect:** None; users know they're not recorded.
- **Victim protection value:** Low-to-medium. Owner has no way to verify who's telling the truth. Repeat-offender pattern detection helps ("this user has 4 reports in 2 months"), but a single serious incident may go unpunished for lack of evidence.
- **Verdict:** DEFENSIBLE FOR YEAR 1 IF WE PAIR IT WITH STRONG PREVENTATIVE LAYERS (age gate, listener-default, host demote, block). But when a child-safety issue eventually lands — and at party scale it will — the owner will wish there were evidence.

### Option C — Hybrid (RECOMMENDED)

- **How it works:**
  1. Every speaker's browser keeps a **60-second rolling in-memory buffer** of its own outgoing audio (a `MediaRecorder` on the local mic stream, chunked to 5-second blobs, oldest dropped as new ones arrive). Never sent anywhere.
  2. When ANY listener taps "Report this speaker" during a party, the server pings the reported speaker's client → their client uploads its current buffer (last 60s of THEIR audio only) as evidence. Reporter can also add a text note.
  3. Server stores the clip against the report entry in `soc:reports`, retention **30 days**, then hard-deleted. If the report escalates to a ban, retention extends to **1 year** as evidence for the appeal window, then deleted.
  4. Both parties are notified: "A report was filed. A 60-second clip of the reported speaker was captured. Review may take up to 48 hours."
- **Cost:** Trivial. A busy month = maybe a hundred reports × 60s Opus = single-digit MB storage. LLM optional (owner can listen). Engineering ~2-3 days for the buffer + upload + admin viewer.
- **Privacy risk:** Low. Data-minimisation gold: we only capture what was flagged, from the person who was flagged, from a listener who was present. Lawful basis = legitimate interest (Art. 6(1)(f) UK-GDPR) — safety of the platform's users. Documented in the privacy policy.
- **False-positive risk:** Some — a listener can trigger a capture maliciously (see rate-limit mitigation in §5). But the CAPTURE isn't the sanction; the review is. Nothing happens to the speaker until owner listens.
- **Chilling effect:** Very low. The join screen honestly says "we don't record parties. If someone reports you, a 60-second clip of your voice from around that moment is saved for review." That's a rule most reasonable users find fair — the same rule dashcams operate under.
- **Victim protection value:** High. Every report has audio. Owner isn't guessing.
- **Verdict:** RECOMMENDED. See §8.

Two important nuances on C:
- **Client-side buffer, not server-side.** The server never has the audio unless a report triggers upload. Compare to always-on recording: infinitely less data at rest.
- **Only the reported speaker's outgoing track is captured**, not the whole room. This further minimises: we don't accidentally archive the reporter's or bystanders' voices.

### Option D — No recording ever, reports + witnesses only

- Essentially B with a stronger "we will never record" pledge in ToS.
- Same protection weakness as B; slightly stronger marketing.
- **Verdict:** REJECT — same evidence-vacuum problem, and locking the door on evidence via ToS makes it harder to add evidence later when you'll want to.

### Option E — Live LLM transcription with keyword flagging

- **How it works:** Every speaker's audio streamed to STT (Whisper API / Deepgram / self-hosted Whisper). Transcripts scanned for slurs, grooming keywords, threats. Only flagged transcripts persist.
- **Cost:** Whisper API is ~$0.006/audio-min. 20 speakers × 60min × 100 rooms = 120,000 speaker-mins = **~$720/month**. Self-hosted Whisper on the droplet is doable but hammers CPU during parties and hurts audio latency.
- **Privacy risk:** Transcripts of every conversation exist ephemerally. Deleting them within seconds if no flag hits is defensible but requires airtight engineering — bugs = accidental data lake.
- **False-positive risk:** Real. Language-exchange context is exactly where slurs and heavy topics get discussed innocently ("how do you say [taboo word] in Spanish?"). Grooming-keyword classifiers famously misfire on adult flirtation. A model deciding "this is bad speech" ends up either too loose (useless) or too tight (bans wrongly — the exact wound WordSpies exists to heal).
- **Chilling effect:** Medium. "AI transcribes everything you say" is a hard sell in a language-learning context where users are already shy about mistakes.
- **Legal risk:** Art. 22 UK-GDPR restricts automated decisions with legal / significant effects on users. Auto-flagging + auto-actioning would need explicit consent + human review path. Add-on complexity.
- **Verdict:** REJECT FOR PHASE 1. Revisit at Phase 3 (10k+ parties/month) when human review no longer scales, and only for a narrow purpose (CSAM/threat-keyword detection with human-in-loop), not general moderation.

### Why Option C wins for WordSpies specifically

- **Anti-Tandem is the north star** ([[user-motivation]]). Always-on recording is exactly the opaque surveillance layer Tandem-scarred users flee. Never-recording with no evidence is the OTHER trap — it's what enables ban-by-whim, because moderators fall back on gut feel. Hybrid is the only stance that lets us say "here's exactly what triggered the review" to a user under investigation.
- **Cost fits the pre-revenue reality.** [[project-audio-infra-decision]] pinned Cloudflare because it costs ~$20/month at target scale. Option A blows that up 20-100×; Option E adds ~$720/month. Option C adds ~$0.
- **We already have the primitives.** `/report` endpoint (social.js:792), `soc:reports` list, dedup keys, block/unblock, host demote in party.js. The delta is: (a) client-side rolling buffer on speaker mics, (b) upload endpoint for the captured clip, (c) an admin queue viewer for the owner to review.

---

## 2. Legal groundwork (UK-GDPR / EU-GDPR)

WordSpies is UK-registered, EU-facing. UK-GDPR + Data Protection Act 2018 apply; EU-GDPR applies to EU users. In practice: assume the stricter of the two.

### Lawful basis for the 60-second evidence clip

- **Legitimate interest** — Art. 6(1)(f). The interest is safety of platform users. Passes the three-part test easily: (1) legitimate — user safety, (2) necessary — no less-intrusive alternative gives us evidence, (3) balanced — capture only on user-triggered report, minimal data (60s of one speaker), short retention (30 days).
- Voice recordings are **personal data** but not automatically "special category" (biometric) data under GDPR unless we're using them to uniquely identify someone (e.g. voiceprint). We are not. So Art. 9 (special category) doesn't apply.
- We must maintain a **Legitimate Interests Assessment (LIA)** — a one-page document. I can draft one; owner keeps it on file.

### Retention limits

- **Default clip retention: 30 days.** After that, the audio blob is deleted; a minimal metadata record (reporter id, reported id, reason, "clip existed, deleted DATE") is kept indefinitely as part of the moderation audit trail — non-audio, non-sensitive.
- **If the report results in a warning or ban: 1 year.** Rationale: the appeal window. If the user appeals 6 months later, the owner needs the evidence to justify the decision. After 1 year, delete regardless — the sanction stands on its logged reason, not on re-listenable audio.
- **No clip retained if the report is dismissed within 48h.** Delete on dismissal.

### Consent flow

- **Not consent** as the lawful basis (legitimate interest is a better fit — consent for safety-recording is legally shaky because it's not freely given: "consent or you can't use parties" is coerced). But be transparent.
- **Banner on first join to any party:** "We don't record parties. If someone reports a speaker, a 60-second clip of that speaker's voice is saved for review. [Learn more]" — one-time, dismissable, dismissal recorded server-side.
- **In the ToS + privacy policy:** the full text (draft below).
- **On the report button:** "Filing a report will save a 60-second clip of this person's audio for review. Continue?"

### Data-subject rights

- **Right to access (Art. 15):** on request, we tell a user (a) if any clips exist for them, (b) the reason for capture, (c) who reported them (may be redacted for reporter safety — case-by-case, defensible).
- **Right to erasure (Art. 17):** users can request deletion of their captured audio. GRANT unless the report is under active investigation OR is a live safeguarding referral. Otherwise, erase within 30 days.
- **Right to restrict / object:** if the user objects to the ongoing retention, pause processing (i.e. don't use the clip for anything except responding to the request) until we've reviewed.
- **Reporter identity:** protected. Reported users get "you were reported" but not "by whom" by default. Owner reveals the reporter only if the report is malicious (harassment via report system) — see §4.

### Recommended plain-English policy paragraph (drop into /privacy)

> **Party voice.** We do not record parties. Live audio is relayed in real time by Cloudflare and disappears the moment the room ends. There's one exception: if a listener in a party taps "Report" on a speaker, we automatically save the last 60 seconds of THAT speaker's outgoing audio so a moderator (currently: WordSpies' founder) can review the incident. The clip is stored for 30 days and then deleted. If we act on the report — a warning or a temporary suspension — we keep the clip for up to 1 year so we can defend the decision if you appeal it. We never save the reporter's audio, the other listeners' audio, or the rest of the room. We never keep transcripts. If you want to see any clip we hold about you, email hello@wordspies.co.uk.
>
> **Reporting a report.** If you think someone reported you unfairly and you want to appeal, tap "Appeal" on the notification email or DM the founder. Every decision that touches your account is reviewed by a human, and you'll always be told what triggered it — no silent bans. If we get it wrong, we fix it, and we tell you what changed.

---

## 3. User-facing complaint flow

Design principle: **one tap to file, one screen to explain, one message back within 48h**. Nothing more.

### During a party

- Every speaker tile has a `⋯` menu (long-press on mobile). Menu items: **Mute for me · Report · Block**.
- **Mute for me** is instant, local, no server call — for users who just want silence.
- **Block** hides the user everywhere, both directions (already implemented — social.js:855).
- **Report** opens a bottom-sheet:
  - Reason chips (pick one): *Hate speech · Harassment · Sexual content · Grooming / minor safety · Spam / scam · Threat / self-harm · Other*
  - Optional 500-char note.
  - Fine-print: "A 60-second clip of this person's audio just now will be saved for review. Only WordSpies moderators can hear it. [Privacy]"
  - Big **Report** button. Filing = fire-and-forget; toast "Report sent — thank you. We review every one within 48h."
- Client-side rolling buffer (see §6, Phase 1) already has the audio; on Report tap, POST clip + report metadata.
- Rate-limit reports at the existing `/report` limiter (already 8/min — see social.js:796). Also add a per-target dedup (already done — social.js:807).

### After a party

- The party page's history entry ("You were in Chai Chat, 21:14–21:47") has an "Ended too fast? Something went wrong? Tell us." tail.
- Same reason chips + note. But NO clip (buffer is only live during the party). Server sends the owner a report entry with kind=`post-party`, no snapshot — pure written report.

### DM reports

- Already exist per `module-refs-reports`; unchanged.

### What happens to the reported user

- **Nothing immediate by default.** No auto-mute, no auto-kick. Rationale: reporting is not sanction. The owner reviews within 48h. This matters more here than anywhere else — the alternative is a mob-report → auto-mute → the target thinks "these people just silenced me, what happened?" which is the exact Tandem wound.
- **Exception — 3 different reporters in the same room in 5 minutes:** auto-demote-to-listener (they still hear the room, they can't broadcast). Notify them: "Multiple people just reported you. You've been moved to listener while we review. You can appeal now: [button]." Undoable by moderator.
- **Exception — reason chip = "grooming / minor safety":** the client also nudges the reporter with "If you believe this involves a minor, please also contact IWF (uk) / NCMEC (us) — [links]." Server flags this report as **priority-1** in the queue.

### Reuse of existing module

- Reuses `/report` (social.js:792), `soc:reports` list, `soc:reported:*` dedup keys.
- New endpoint: `POST /report/clip` — accepts multipart audio blob keyed by report id.
- New Redis key: `soc:report:clip:<reportId>` — small binary blob or reference to disk path in `/var/wordspies/clips/<yyyy-mm>/<id>.opus`. Actual audio bytes on disk, not in Redis (Redis is not built for blobs at scale).
- New endpoint: `GET /admin/reports` — owner-only; lists queue with clip playback.

---

## 4. Owner review queue

Owner is sole moderator today. Design must not require > 15 min/day at current scale (est. < 5 reports/day for months).

### Where reports land

- Redis list `soc:reports` (already exists, capped 1000).
- Each entry: `{ id, by, target, kind, reason, note, snapshot, at, clipPath?, status? }`.
- New: `status` field on the entry — one of `open | actioned | dismissed | appealed`.
- New: `soc:reports:priority` — LIST of ids where reason ∈ {grooming, threat, self-harm}. Owner sees these first.

### Admin route

- `/admin/reports` — password-gated (env var, owner-only). Simple HTML table:
  - Newest 100. Priority items pinned to top.
  - Each row: reporter (id + name), target (id + name), reason chip, note excerpt, timestamp, audio player if clip exists.
  - Actions per row: **Dismiss · Warn · Timeout 24h · Timeout 7d · Ban · Open target's profile**.
  - Every action requires a **reason field** (auto-filled from the report but editable). Reason is what gets sent to the target. No blank sanctions.
- `/admin/appeals` — separate queue.

### Response SLA (owner-set)

- **Priority-1** (grooming, threat, self-harm keyword report): 6h.
- **Standard**: 48h.
- **Reporter receives an ack email within 5 minutes**: "We got it. Review in 48h." — one line, human-signed. This ONE change alone fixes the Tandem "black-hole" feeling.

### Sanction ladder

Start with the LEAST severe and escalate:
1. **Dismiss** — reporter is thanked; nothing to target.
2. **Warn** — target gets in-app notification + email: "Someone reported you for X on DATE. Here's the rule: [link]. Please take a look — no action taken this time."
3. **Timeout 24h** from parties only — DMs still work, games still work. "You're on a party cool-off until DATE because of X."
4. **Timeout 7d** from parties.
5. **Ban from parties** (permanent — from parties, not the whole app).
6. **Full account ban** — reserved for CSAM, credible threat, or repeat-offender after ban-from-parties. Requires a written owner note in the audit log stating why the ladder was skipped.

Each rung sends the target an email that includes:
- What rule was broken (link to the specific rule in the Party Guidelines page — new page needed, see Phase 1).
- The 60-second clip if one exists ("here is what was flagged"). YES — send the clip to the target. This is the anti-Tandem move: you know exactly what triggered your sanction.
- The appeal link.

### Appeals — critical

This section is the reason WordSpies exists. Get it right.

- Every sanction email has an **Appeal** button — one click, opens a form.
- Appeal form: 1000-char free text + optional voice note (user records max 60s explaining their side).
- Appeals land in `soc:appeals` list. Owner reviews within 5 business days.
- **Presumption on borderline appeals: reinstate.** WordSpies' bias is toward the accused-of-being-toxic, not the accuser, when evidence is weak. Reversal of a sanction = friction of ~30 seconds for the owner (change status, send email); persistence of an unfair sanction = the exact wound the product exists to heal.
- Appeal outcomes are ALSO explained — no "your appeal was denied" without a reason.
- **Meta-appeal:** if an appeal is denied and the user is still unhappy, they can email the founder directly. Named human recourse. At current scale, this is possible; at 100k users it won't be, and that's when we hire.

### Redis key structure sketch

```
soc:reports                     LIST  { report entries, newest at tail }
soc:reports:priority            LIST  { ids of priority-1 reports }
soc:report:<id>                 HASH  full report metadata (owner status writes here)
soc:report:clip:<id>            STRING  path to /var/wordspies/clips/<yyyy-mm>/<id>.opus (or S3 key)
soc:reported:<from>:<kind>:<target>[:<msgId>]  STRING, 24h TTL  (dedup — already exists)
soc:appeals                     LIST  appeal entries
soc:appeal:<id>                 HASH  appeal metadata + verdict
soc:sanctions:<uid>             LIST  audit trail of every action taken against a user
soc:sanction:<uid>:active       STRING  current active sanction (party-timeout, party-ban, etc.) with expiry
```

The `soc:sanctions:<uid>` LIST is the user's **standing history** they can see on their own profile — the "here's every action against your account and why" page. Reversed sanctions stay in the log with a "REVERSED — appeal upheld DATE" marker. Total transparency, per [[user-motivation]].

---

## 5. Preventive layers (before moderation even kicks in)

Moderation is what you build when prevention isn't enough. Most incidents can be prevented by product design.

### Already shipped
- **18+ age gate** on signup ([[project-session-2026-08-01]]). Hard block.
- **Face check on signup** (real face, not stock — [[project-session-2026-08-04]]).
- **Guest-to-party path is closed** — must have an account to join a party ([[project-session-2026-08-07-08]]).
- **Block system** (bidirectional, breaks graph — social.js:855).
- **Report system** (existing `/report`).
- **Host demote** (party.js:332).
- **Report rate-limit** (8/min — social.js:796) and per-target dedup.

### To ship in Phase 1 (weeks, not months)

- **Listener-by-default + raise-hand → host promotes** ([[project-tandem-parties-research]] point 2). The single highest-leverage anti-abuse lever: bad actors have no mic until an actual human promotes them. Halves report volume overnight.
- **Host moderation menu on tap-tile: demote · report · block** ([[project-tandem-parties-research]] point 6). Demote (not kick) as primary sanction.
- **Per-user "mute for me" in parties** — already partly there via block, but a lighter-touch "quiet for this session only" is friendlier.
- **First 3 parties = supervised.** A new-account user joining their first 3 parties can only listen — they cannot raise hand. After 3 parties (or after posting 3 accepted community-wall posts), they can raise hand. Cuts drive-by abuse to zero.
- **Party Guidelines page** — plain-English, short (< 500 words). Linked from the join screen and every sanction email. Rules people actually understand > legalese.
- **Rate-limit party joins per account per hour** — otherwise a banned user's alt hops all rooms in minutes.

### Phase 2

- **Reputation score (private)** — invisible number, function of (age of account, parties attended without report, references received, follows). Score below threshold = still can join but can't create parties. Score above high threshold = trusted-user badge, host tools unlocked.
- **Trusted-user badge visible in room** — small green dot, "3+ months, no reports." Signals safety to newcomers.
- **Anti-mass-report** — if user X files > 5 reports across > 3 distinct targets in 24h, silently deprioritise their reports (still received, marked as "review only after everything else"). Notify owner. This is the [[project-tandem-parties-research]] "Tandem bans users for mass-reporting" pattern, but done gently.
- **Daily time cap** in parties (60min/day like Tandem — burnout + calm lever). Optional.

### Phase 3

- **Reputation-weighted trust:** when a high-reputation user reports someone, it counts more toward the "auto-demote at 3 reports" threshold than a low-rep user's report. Hidden from users.
- **Session-recap emails to hosts:** "Your party had 12 speakers. 3 reports were filed. Here's what happened." Empowers hosts.

---

## 6. Trust & Safety roadmap (phased)

### Phase 1 — Ship this month (est. 5-7 dev days)

**Goal:** Option C hybrid live end-to-end with an owner-review admin queue.

- [ ] **Client-side rolling audio buffer** on every speaker's mic — 60s, 5-second chunks (MediaRecorder API, `audio/webm;codecs=opus`, ~64kbps mono). ~1 day. `party.html` / party client.
- [ ] **`POST /api/parties/:code/report`** endpoint — accepts report metadata + audio blob multipart. Writes to `/var/wordspies/clips/<yyyy-mm>/<reportId>.opus` (auto-mkdir), extends existing `/report` entry with `clipPath` + `partyCode`. Enforce 500KB / 60s clip cap. 0.5 day.
- [ ] **`GET /admin/reports`** — password-gated (env `ADMIN_TOKEN`) HTML page with audio player, action buttons, appeal viewer. 1 day.
- [ ] **Sanction actions** — Warn / Timeout 24h / Timeout 7d / Party-ban / Dismiss. Writes to `soc:sanctions:<uid>`. Timeouts enforced via existing party-join checks. 1 day.
- [ ] **Sanction email to target** — sends the clip URL (signed, expiring in 7 days) + rule broken + appeal button. 0.5 day.
- [ ] **Appeal form** — public route `/appeal/:sanctionId` (id from email link, no login required — user might have been logged out). 0.5 day.
- [ ] **Standing / history page** — a "Your account standing" section on `/me` showing every sanction (active + past) with reasons. 0.5 day.
- [ ] **Party Guidelines page** in `pages.js`. 0.5 day.
- [ ] **Report bottom-sheet UI** in party.html with 60s-clip disclosure. 0.5 day.
- [ ] **Consent banner** — first-time join to any party, dismissable, dismissal stored server-side. 0.5 day.
- [ ] **Privacy + ToS update** with the paragraph in §2. 0.25 day.
- [ ] **Listener-by-default + raise-hand promote** (from [[project-tandem-parties-research]] point 2) — required for the ladder to make sense. 1 day.

**Cost:** dev time only. Storage < 100 MB/month at current volume. Zero external services.

### Phase 2 — Ship in 3 months (est. 4-5 dev days)

- Reputation score (invisible, computed on cron).
- Trusted-user green dot.
- Anti-mass-report deprioritisation.
- First-3-parties supervised.
- Priority queue (grooming / threat auto-pin).
- Ack email within 5min of every report.
- Per-user party time cap (optional).

### Phase 3 — Ship at 5k+ MAU (est. 10 dev days OR delegate)

- Community-jury option for borderline reports (three trusted users review, majority vote, owner override).
- Delegate moderation to trusted power-users (paid or perks-based).
- LLM-assisted triage on transcripts — for CSAM/threat KEYWORD screen only, human-in-loop for every action. NOT general classification.
- Public transparency report (monthly): "12 reports this month, 4 warnings, 1 ban, 2 appeals upheld." Owner's north star made public.

---

## 7. How competitors moderate (and what to avoid)

Not exhaustive — public-behaviour inference + [[project-tandem-parties-research]].

### Tandem (the one to beat)
- Reports go into an opaque queue, decisions arrive as terse emails, appeals are largely fictional (owner's own story).
- Bans wipe chat history and connections — irreversible even if unjust.
- Bans for "mass-reporting" exist (server rate-limits coordinated attacks) — good pattern to copy.
- **What to steal:** party guidelines exist and are enforced; host tools = remind/demote/report/block; demote (not kick) as primary sanction.
- **What to avoid:** no-appeal culture; history wipe; no explanation with sanction.

### HelloTalk
- Similar to Tandem — opaque moderation, ban-happy for anything vaguely political.
- Voice rooms have host controls but no evidence trail.
- **What to avoid:** ideological moderation. WordSpies rules should be BEHAVIOURAL (what you did), never ideological (what you think).

### Discord
- Server-owner-first model: individual servers moderate themselves, Discord Trust & Safety only escalates for platform-wide rule breaks (CSAM, doxxing, threats).
- Uses ML models on voice + text for CSAM detection (industry standard now).
- **What to steal:** delegate moderation to hosts inside their own parties (they already can demote); publish clear "site-wide" rules distinct from "party-house" rules.
- **What's not applicable:** we're too small for a T&S team; hosts aren't accountable enough to be sole judges.

### Clubhouse
- Rolling audio buffer captured only on report — **this is exactly Option C**. Clubhouse pioneered the model. It works.
- Retention is 60 days. Ours will be 30.
- **What to steal:** the model itself. Validation that the industry considers it a compliant, effective baseline.

### Twitter Spaces
- Records EVERYTHING for 30 days (Option A). Users don't love it; big platforms can absorb the storage cost we can't.

### General industry pattern
- Small platforms: written-report only.
- Medium (100k+ MAU): rolling-buffer-on-report (Clubhouse model).
- Large (1M+ MAU): always-record OR always-transcribe with automated triage.

WordSpies at Phase 1 is medium-sized-thinking with small-sized-infra. Option C is right for that stage.

---

## 8. Recommendation (one paragraph)

**Ship Option C — the hybrid rolling-buffer model — as Phase 1 (est. 5-7 dev days) alongside listener-by-default and the Party Guidelines page.** It's the only model that lets WordSpies say "we don't record you" AND "if you report someone, we have the evidence to act fairly" in the same breath — which is the exact positioning the owner's Tandem-ban origin demands. Cost is negligible, GDPR posture is defensible (legitimate interest, minimisation, 30-day retention, transparent policy), and every piece of it maps cleanly onto infrastructure that already exists (`/report`, `soc:reports`, block system, host demote). The critical piece is not the recording — it's the human review + always-explained sanction + one-click appeal. That combination, publicly stated, is the moderation stance that beats every competitor on fairness without costing the owner more than 15 minutes a day at current scale.

---

## Appendix — text of the join-party disclosure banner

> **A note before you join.**
> We don't record parties. Live audio disappears the moment the room ends.
> The one exception: if a listener reports a speaker, a 60-second clip of that speaker's audio is saved so we can review what happened. Reviews are done by a human within 48 hours. If a rule was broken, we tell you which one. If we get it wrong, you can appeal.
> That's the deal. Have fun. [Got it]

---

## Appendix — files that need to change (Phase 1)

Do NOT modify these now — this doc is decision-only. When owner approves:

- `party.js` — new socket event `party-report`, invokes clip capture on speaker's client, forwards to REST.
- `party.html` — speaker tile ⋯ menu, report bottom-sheet, MediaRecorder buffer on local mic, join-time consent banner, listener-by-default (already partly there — verify).
- `social.js` — extend `/report` to accept clip metadata + party context; new `/report/clip` upload handler; new `/appeal/*` routes; new `/admin/reports` + `/admin/appeals` gated pages.
- `pages.js` — Party Guidelines page + updated privacy policy paragraph.
- `auth.js` — no change (age gate already blocks < 18).
- New: `moderation.js` module — sanction state machine, admin queue rendering, appeal handling. Consolidates the moderation surface out of `social.js` so it stays reviewable.

End of document.
