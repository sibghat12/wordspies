# Bot Roadmap — TalkSibi

> **2026-08-17 — DEPRECATED for removed games.** Ludo, Connect 4, 8-Ball Pool and Hoop were deleted from the app. Any bot plans below for those four games are historical and no longer apply. Word Race / Word Chain / Guess the Word / Mind Meld / Spy / TalkSibi (spy word game) plans remain valid.

Turning "make the language games playable with bots" into a safe, phased plan the owner can pick up game-by-game.

---

## Why this is phased

Building bots for all 7 games in a single session would ship broken code straight to a live, auto-deploying site (push to `main` → live in ~60s via `wsdeploy.timer`). Three reasons that would be a disaster:

1. **Complexity variance is huge.** Hoop needs 30 lines of client JS (fake score ticks). Codenames needs a Claude call per clue and per guess, with a hard problem — a spymaster bot that leaks an on-board word forfeits the game. Same commit shape, wildly different risk.
2. **LLM cost surface.** Spy, Codenames, and Guessword all need per-turn LLM calls to feel human. A 4-player Spy game with 2 bots + 5 rounds = ~10 clue-generation calls + ~10 vote-reasoning calls per game. At scale, that's a bill the owner has to opt into knowingly — not something a stray `if (bot) callClaude()` should smuggle in.
3. **Bots can silently ruin PvP.** The current 9-game roster already works with humans. A bot that always plays instantly (no `setTimeout` delay), or that misfires an event the client doesn't expect, will trash real games in production. Every bot has to be tested against a running human-vs-bot session before it goes near `main`.

The reference implementations (Ludo, Connect 4, Pool) already prove the safe pattern: `addBot`/`kickBot` socket events, `bot: true` flag on the player, decision function called on the bot's turn behind a `setTimeout` so humans can see what happened. Every new bot in this doc should mirror that shape.

---

## Priority order

Build in this order — easiest wins first, LLM-hard games last:

| # | Game | Why first / why later |
|---|---|---|
| 1 | **Hoop** | SIMPLE. Bots just emit a ticking score; no game rules to bend. Ships in half a session. |
| 2 | **Mind Meld** | MODERATE, tiny. 2-player only, one word per round. Bot picks from a static "in-between" table. Big UX win — turns a 2-player-only game into always-playable. |
| 3 | **Word Race** | MODERATE. Bots pull from a category→words JSON (no LLM). Feels alive because everyone types simultaneously; a bot dumping 12 fake words over 60s is convincing. |
| 4 | **Word Chain** | MODERATE. Bot picks a valid next-letter word from a wordlist filtered by used-set + starting letter. Curated 10k word file, no LLM. |
| 5 | **Guessword** | HARD (LLM). Bot as guesser is easy (string match on hints). Bot as describer needs Claude Haiku to generate hints without leaking the word. Do guesser-first, describer-second. |
| 6 | **Spy** | HARD (LLM). Bot has to give a one-word clue about a secret word without saying it, then vote sensibly. Every turn is a Claude call. Highest per-game cost. |
| 7 | **Codenames** | HARDEST (LLM). Spymaster bot has to find a word that links N of the team's cards without hitting the assassin, other team, or bystanders. Real research problem. Ship guesser bot first (way easier), spymaster bot later behind a `BOTS_CODENAMES_SPYMASTER=1` flag. |

One-line rationale per game:
- **Hoop** → fake scores; no rules to break.
- **Mind Meld** → 2-player game becomes single-player-safe, unlocks huge audience.
- **Word Race** → wordlist-driven, drip out words with a timer, no LLM.
- **Word Chain** → wordlist + last-letter filter, standard AI-turn timer pattern.
- **Guessword (guesser)** → hint-string similarity to word bank.
- **Guessword (describer)** → LLM to generate legal hints.
- **Spy** → LLM for clue + vote; every turn costs money.
- **Codenames** → LLM-hard research problem; bot must not leak assassin.

---

## Existing reference implementations

Three games in the arcade already have working bots. New bots should copy their shape, not reinvent it. All live in `/Users/sibghatullah/Downloads/wordspies/arcade.js`.

| Game | Bot function | Trigger | Socket events |
|---|---|---|---|
| **Ludo** | `ludoBotChoice(room, seat, dice, moves)` — L191 | `ludoMaybeBot(r)` — L668, called after every turn | `addBot`, `kickBot` — L791, L804 |
| **Connect 4** | inline in `fourBotGo(r)` — L935 | called after human plays | `addBot` — L1016 |
| **Pool** | `poolBotShot(r)` — L435 | `poolBotGo(r)` — L1166 | `addBot` — L1274 |

**Shared conventions to copy exactly:**

- Player object gets `bot: true` and `id: 'bot:' + Math.random().toString(36).slice(2, 7)`. Bot ids never overlap socket ids.
- Bot names pulled from `BOT_NAMES = ['Pixel', 'Bolt', 'Mochi', 'Rusty', 'Nova', 'Biscuit', 'Kiwi', 'Tofu']` (arcade.js:76). Reuse this list.
- Bot moves fire on a `setTimeout` (`r.botT`) — never instantly — so humans see the state update before the bot acts. Typical delay 800–1600ms.
- `live()` feed filters bot-only rooms out so "12 games in progress" doesn't lie. See `arcade.js:1477-1495` — new games' `live()` functions should do the same.
- On host disconnect: promote the next **human** (`filter(x => !x.bot)`), never a bot. See `arcade.js:896, 1084, 1430`.
- Store the bot timer handle on the room (`r.botT`) so it can be cleared on disconnect / room drop. Every existing bot does this.

There's also a **test-only** bot pattern in `server.js:1343` (`testFill`) that spawns 3 named dummies inside Codenames rooms for wheel/win-loop testing. Gated on `TEST_KEY`. Not a real bot — they never take turns — but the seat-object shape (`{ id: 'bot_...', bot: true, avatar, token, socUid: null, photo: null }`) is the template a future Codenames bot should extend.

---

## 1. Hoop 🏀 — SIMPLE

**File map:** server `hoop.js` (249 lines) · client `public/hoop.html` (894 lines)

### Game summary
60-second free-throw shootout. Physics-based basketball on an HTML canvas; player taps "Shoot", ball arcs, score increments on rim-clear. Solo score-attack **or** multiplayer 1–8 in a shared room where everyone plays the same 60s in their own iframe and a live leaderboard ticks. Server keeps roster + broadcasts every `score` event; no game-rule authority.

### What "bot mode" should mean
A **parallel player** filling an empty seat. Bot doesn't actually run physics — it just emits `score` events at a plausible cadence over the 60s window. Purely a leaderboard-companion so a lone player has someone to race.

### Complexity: SIMPLE
Half a session. No new game logic, no LLM, no client-side changes to physics.

### Concrete implementation sketch

- **File to touch:** `hoop.js` only. No client changes needed if the server emits `leaderboard` events with the bot's `id` — the existing `roster()` broadcast already renders any player.
- **New socket events (host in lobby only):**
  - `addBot` → creates `{ id: 'bot:' + …, name: pick(BOT_NAMES), score: 0, bot: true, uid: null }`, pushes to `seatOrder`, broadcasts `roster`.
  - `kickBot` → removes bot from `players` map + `seatOrder`.
- **New function `hoopBotRun(room, botId)`:**
  - Called from the `start` handler after `nsp.to(currentCode).emit('start', ...)`.
  - Pick a target score `T` between 4 and 22 (mimics real range — a good human hits ~15 in 60s).
  - Schedule `T` score bumps evenly-jittered over `ROUND_MS`. Each `setTimeout` bumps `bot.score += 1` and calls `nsp.to(code).emit('leaderboard', { players: roster(room) })`.
  - Store timeouts on `room.botTimers = []` so they can be cleared on `disconnect` / `rematch` / `endRound`.
- **Cleanup:** in `finishRound`, `clearAllBotTimers(room)`. In the `rematch` handler, reset bot scores to 0.
- **Storage keys:** none. In-memory Map only, same as human players.

### Cost/risk
- **LLM cost:** zero.
- **PvP risk:** low. Bot only writes its own `score`; can't interfere with humans' scores.
- **Auth pitfall:** bots have `uid: null` — make sure the `activeGame` guard (see `activegame.js` registration at `hoop.js:73`) never tries to `set` an active-game key for a bot uid.
- **Edge case:** if the host leaves mid-round, the room disconnect handler promotes hostId from `seatOrder[0]`. Skip bots when choosing the new host (`seatOrder.find(id => !room.players.get(id).bot)`).

---

## 2. Mind Meld 🧠 — MODERATE (tiny)

**File map:** server `meld.js` (445 lines) · client `public/meld.html` (775 lines)

### Game summary
Two players type a word simultaneously trying to type the *same* word. If they don't match, the two words they said become the new prompt and they try to say the word "between" them. Repeat until they meld. Cooperative — no scores. 2-player only.

### What "bot mode" should mean
The bot **fills the second seat** so a solo player can practice. Because meld is 2-player-strict, this game is dead if you have no friend online. A bot doubles the playable window.

### Complexity: MODERATE
One session. Simple pick-from-list logic, but has to handle the "in-between" concept convincingly enough that a bot game doesn't feel trivial.

### Concrete implementation sketch

- **Files to touch:** `meld.js` (add socket handler + bot pick fn), `public/meld.html` (add "Play with bot" button in lobby).
- **New socket event:** `addBot` in lobby. Seats a bot player using the same `seat()` helper's field shape (but skip the `socket.join` and `session` emit — bot has no socket).
- **New function `meldBotPick(room)`:**
  - Called when the human submits a word (in the `word` handler) if the other seat is a bot.
  - Round 1 (no prompt): pick a random common noun from a small curated list (`['coffee','ocean','music','summer','apple','moon','laughter','key','river','fire',...]` — ~60 words).
  - Round 2+: given `prompt.a.word` and `prompt.b.word`, find an "in-between" word. Use a static association table (`{'coffee+tea': 'drink', 'sun+moon': 'sky', ...}`) — build ~200 pairs by hand.
  - Fallback when pair not in table: pick a random word that shares a semantic category tag with both prompt words (tag every dictionary word with 1–3 categories: nature/food/emotion/etc). If nothing matches, pick a random word from the same category as `prompt.a`.
  - Never pick a word already in `room.used`.
  - Fire after `setTimeout(600 + Math.random() * 1400)` — feels like a human thinking.
  - Then set `room.picks[botId] = word` and call `resolveRound(room)`.
- **Client:** add a "Play with bot" button next to the invite link in the lobby. Fires `socket.emit('addBot')`. Existing state UI just works because bot appears in `players[]` like any human.
- **Storage:** none. All in-memory.

### Cost/risk
- **LLM cost:** zero (static tables).
- **PvP risk:** none — bot never plays if a second human joins first (add guard in `addBot`: `if (r.players.size >= 1 && [...r.players.values()].every(p => !p.bot)) allow`).
- **Auth pitfall:** in the `join` handler at meld.js:340, `if (r.players.size >= 2)` returns "full" — a bot counts as a seat, so a human trying to join a bot game gets rejected. **Fix:** when human joins and the other seat is a bot, kick the bot first, then seat the human.
- **UX pitfall:** meld's win screen mentions "you two" — copy stays fine when second player is a bot (owner may want a subtly different `verdict()` line if `history.some(h => h.a.name === 'Bot' || h.b.name === 'Bot')`).

---

## 3. Word Race 🏁 — MODERATE

**File map:** server `wordrace.js` (601 lines) · client `public/wordrace.html` (544 lines)

### Game summary
60-second category sprint. A prompt appears ("Animals", "Fruits", "Words starting with S"). Everyone types as many valid words as they can, Enter after each. Most words wins the round. First to 2 round-wins takes the match. 2–8 players, all playing simultaneously (not turn-based). Words type in any language; server just dedupes.

### What "bot mode" should mean
**Parallel player** — bot drips words into the round over the 60s. Bot's `word` submissions go through the same server path as humans (dedupe, count, `accepted` emit), so the leaderboard just works.

### Complexity: MODERATE
One session. Needs a category→words dataset per language, but no LLM.

### Concrete implementation sketch

- **Files to touch:** `wordrace.js` (bot handler + drip logic), `public/wordrace.html` (add-bot lobby button), new data file `wordrace-botdict.json`.
- **New data file** `wordrace-botdict.json`:
  ```json
  {
    "Animals": ["dog","cat","lion","tiger","horse","cow","bear","fox","wolf","rabbit",...],
    "Foods": ["pizza","pasta","bread","rice","cheese",...],
    ...
  }
  ```
  Aim for 30–80 words per category × 24 categories. Language: English only for v1. If the room's `learningLanguage` is set (from user profile) fall back to English for the bot.
- **New socket event:** `addBot` in lobby only. Same seat shape as humans but `bot: true`, `_uid: null`. Push to `players` map. Multiple bots allowed (up to `MAX_PLAYERS`).
- **New function `wordraceBotRun(room, botId)`:**
  - Called at `startRound()` for each bot.
  - Compute bot difficulty: pick `targetCount = 4 + rand(0, 14)` — this bot will submit `targetCount` words over 60s.
  - Look up `dict[category]`, shuffle, slice `targetCount` words, filter out anything already in that bot's `words` list.
  - Schedule submissions at jittered intervals (`ROUND_MS / targetCount * (0.7 + rand*0.6)`).
  - Each timeout runs the same logic as the human `word` handler: dedupe, push to `cur.words.get(botId)`, `broadcast(room)`. Skip the `accepted` emit (nobody to send to).
- **Cleanup:** in `endRound()`, clear all bot timers stored on `room.botTimers`. In `beginMatch()` and `again` handler, reset.
- **Difficulty tuning:** bots should occasionally "miss" — with 15% probability, submit a duplicate of a previous word (silently rejected by server, but the timing still burns a slot). Feels human.

### Cost/risk
- **LLM cost:** zero.
- **PvP risk:** low. Bot can't submit invalid or duplicate words (server rejects). Worst case: a bot with `targetCount = 22` obliterates a beginner human. Cap `targetCount` at 16 for now; expose difficulty slider later.
- **Auth pitfall:** the `join` handler's uid-dedup loop scans `p._uid === prof.uid`. Bots have `_uid: null`; make sure the `if (prof && prof.uid)` guard is respected so bots don't get "reconnected" over.
- **Language pitfall:** categories like "Words that start with S" work in English; "empezar con S" doesn't map. If a room's ambient language isn't English, bot picks from English dict but the human plays in Spanish — that's OK because server just dedupes on normalized letters, but the bot will look eerily English-native. Fine for v1; document as known-limitation.

---

## 4. Word Chain 🔗 — MODERATE

**File map:** server `wordchain.js` (636 lines) · client `public/wordchain.html` (910 lines)

### Game summary
Turn-based chain: each player types a word that starts with the last letter of the previous word. 30s per turn, 3 lives, no repeats. Last player standing wins. 2–8 players.

### What "bot mode" should mean
**Fills an empty seat** in the turn ring. When it's the bot's turn, bot picks a valid word (starts with required letter, isn't in `used` set) and calls the same `word` handler logic.

### Complexity: MODERATE
One session. Needs a decent wordlist (~10k words) filtered per-turn.

### Concrete implementation sketch

- **Files to touch:** `wordchain.js` (bot handler + word picker), `public/wordchain.html` (add-bot lobby button), new data file `wordchain-botdict.json`.
- **Data file:** flat array of 5–10k common English words, uppercase, no punctuation. Something like the [SCOWL 40](https://wordlist.aspell.net/) common-words list, filtered to 3–12 letters.
- **New socket event:** `addBot` (host only, lobby only). Same seat shape but `bot: true`, `_uid: null`, `token: null`.
- **New function `wordchainBotTurn(room)`:**
  - Called from `advanceTurn()` and `beginGame()` right after `armTurnTimer()`, only if the seated player is a bot.
  - Filter dict: `words.filter(w => w[0] === room.nextLetter && !room.used.has(w))`.
  - Difficulty knob (per-bot):
    - Easy: 8% chance to time out (do nothing), 3% chance to submit invalid (already-used word for a "miss").
    - Medium: 3% timeout, 1% miss.
    - Hard: never misses.
  - Success path: pick a random word from the filtered list. Fire `setTimeout(1500 + Math.random() * 4000)` (bots shouldn't be instant).
  - Inside the timeout, replicate the human `word` handler body: length check → letter check → dedupe → push to chain → advance turn → broadcast. Extract the shared body into a `handleWord(room, playerId, raw)` helper so bot and human paths call the same function.
- **Client:** add-bot button. Lobby renders bots with a `🤖` badge in the seat row (existing `players[].bot` isn't rendered yet — add it).
- **Storage:** none.

### Cost/risk
- **LLM cost:** zero.
- **PvP risk:** medium. A hard bot with a 10k wordlist beats most humans. Ship with default = medium, difficulty picker for v2.
- **Auth pitfall:** the disconnect grace period (`DROP_GRACE = 120000`) forfeits a mid-game human. Bots have no socket — they can't disconnect, so nothing special needed except: **don't include bots when computing `if (!ps.some(p => p.connected))`** in `chainLive()` (arcade convention already handles this via `filter(!p.bot)`).
- **Edge case:** if a bot is host and the human host leaves, promote a human. If **all** humans leave, drop the room (don't leave bots playing themselves).

---

## 5. Guess the Word ❓ — HARD (LLM)

**File map:** server `guessword.js` (703 lines) · client `public/guessword.html` (804 lines)

### Game summary
One player is the describer, gets a secret word (from a static bank of 170 concrete nouns). They type hints in chat; others race to guess. First correct guess = +2 for guesser, +1 for describer. Rounds rotate the describer role. 3–10 players.

### What "bot mode" should mean
Two roles the bot can take:
- **Bot as guesser:** looks at each hint and picks a candidate word from the word bank. Doable without LLM — string similarity + hand-tuned associations.
- **Bot as describer:** needs to type hints for a secret word without saying the word. This is genuinely hard without an LLM.

### Complexity: HARD (LLM only for describer)
- Guesser bot: MODERATE, one session, no LLM.
- Describer bot: HARD, one session, Claude Haiku per hint (~3–8 hints per round).

### Concrete implementation sketch — two phases

**Phase 5a — Guesser bot (do first):**
- **Files:** `guessword.js` + `public/guessword.html`.
- Handler: `addBot` seats a bot. Multiple bots allowed.
- New fn `guesswordBotGuess(room, botId, hint)`:
  - Called from the `hint` handler after `room.hints.push(...)`, for each seated bot that isn't the describer.
  - Build an association map: for each of the 170 `WORDS`, hand-annotate 3–6 associated tokens (`banana → ['yellow','fruit','peel','monkey','curved','tropical']`). Ship as `guessword-associations.json`.
  - Score each candidate word: how many of the last N hints' tokens appear in its association list? Highest score wins.
  - With 15% base chance and 40% chance after 3+ hints, bot fires a `guess` (using the same `guess` handler path). Otherwise silence.
  - `setTimeout(1500 + rand*3000)` before firing so humans get first crack.
- **Difficulty:** slow bots wait for 3+ hints; fast bots guess after 1. Ship with slow default.

**Phase 5b — Describer bot (later, LLM):**
- **Files:** same, plus reuse `getClaude()` from `social.js` (or extract to a shared `ai.js` module).
- New fn `guesswordBotDescribe(room)`:
  - Called from `startRound()` when `room.describerId` is a bot.
  - Call Claude Haiku with system prompt: *"You are playing Guess the Word. The secret word is '{word}'. Give a single short hint (under 60 chars) that helps players guess it WITHOUT saying the word, plurals, or obvious stems. Reply with only the hint."*
  - Guard: run the returned hint through `containsWord()` (already exists at guessword.js:687). If it fails, retry once with "You just said the word. Give a different hint."
  - Fire 1 hint immediately, then 1 more every 20s until round ends or somebody guesses.
- **LLM cost:** ~3–8 Claude Haiku calls per round bot-describes. At Haiku pricing (~$0.80/M input tokens, $4/M output), a hint = ~200 in + 30 out tokens = fractions of a cent. A busy day with 100 bot-described rounds = ~$0.10. Cheap.
- **Env flag:** `BOTS_GUESSWORD_DESCRIBER=1` — off by default until tested.

### Cost/risk
- **LLM cost:** described above. Zero for guesser phase.
- **PvP risk:** medium. Describer bot could leak the word if `containsWord` regex misses (e.g. metaphor). The existing regex is decent but not perfect.
- **Auth pitfall:** `MIN_PLAYERS = 3` — a solo human + 2 bots is a legal game only if bots count. Confirm the `start` handler's `if (room.players.size < MIN_PLAYERS)` treats bots as players (it will if they're in the `players` Map).
- **Chat pitfall:** bot hints appear in the same feed as human hints — make sure the client renders them with the bot's name (not a robot icon that breaks the layout).

---

## 6. Who is the Spy? 🕵️ — HARD (LLM)

**File map:** server `spy.js` (790 lines) · client `public/spy.html` (940 lines)

### Game summary
Players each get a secret word — most get the same "civilian" word, 1 (or 2 in ≥7-player rooms) get a similar-but-different "spy" word (e.g. Coffee vs Tea). Round-robin, each player says ONE word describing their word without giving it away. Then everyone votes. Most-voted player is revealed + eliminated. Civilians win when spy is out; spy wins when they equal/outnumber civilians. 4–10 players.

### What "bot mode" should mean
**Fills an empty seat.** Bot needs to:
1. Give a one-word clue about its secret word without leaking it.
2. Vote for who it thinks is the spy (or if it IS the spy, vote for a civilian).

Both are LLM tasks. There is no wordlist workaround — the whole game is nuanced association.

### Complexity: HARD
Multi-session. Every bot turn = 1 Claude call for clue + 1 Claude call for vote reasoning. And bots have to be believable spies AND believable civilians.

### Concrete implementation sketch

- **Files to touch:** `spy.js` + `public/spy.html`. Reuse `getClaude()` from `social.js` or extract to `ai.js`.
- **New socket event:** `addBot` (host, lobby only). Seat with `bot: true`, `_uid: null`, `token: null`.
- **New fn `spyBotClue(room, botId)`:**
  - Called from `beginGame()` (for the first player) and `advanceTurn()` after every human clue if next turn is a bot.
  - Get bot's role + word from `room.players.get(botId)`. Get the clue history so far: `room.clues.filter(c => c.round === room.round)`.
  - Prompt Claude Haiku:
    > *"You are playing Who Is The Spy. Your secret word is '{word}'. You are {isSpy ? 'the SPY (nobody knows your word is different)' : 'a civilian'}. Other players' clues this round: {clues}. Give ONE word (not a phrase) that hints at your word without saying it or an obvious form. If you're the spy, try to blend in without knowing what the civilian word is — be vague. Reply with only the word."*
  - Validate: not equal to `civWord`, not equal to `spyWord`. If it fails, retry with "You cannot say the word itself. Pick something else."
  - Fire `setTimeout(3000 + rand*5000)` — spy clues in real games have long pauses.
  - Then call the same code path as the human `clue` handler.
- **New fn `spyBotVote(room, botId)`:**
  - Called from the vote handler if it's a bot's turn to vote (bots vote AFTER a small delay so humans see the ballot state).
  - Prompt Claude Haiku:
    > *"You are playing Who Is The Spy. Your role: {isSpy ? 'spy — vote for a civilian to protect yourself' : 'civilian — find the spy'}. All clues so far: {cluesJSON with names}. Alive players: {names}. Which player name is most likely the spy? Reply with only the exact name from the list."*
  - Parse response to player id; fall back to random alive-other-player if parse fails.
  - Delay `2000 + rand*3000`, then call the vote code path.
- **Env flag:** `BOTS_SPY=1` — required for `addBot` to work. Owner ships this off until tested.

### Cost/risk
- **LLM cost:** ~1 clue call + 1 vote call per bot per round. 4-player game with 2 bots × 4 rounds average = ~16 calls per game. At Haiku ~200-token turns, budget ~$0.20 per 100 games. Cheap unless it becomes wildly viral.
- **PvP risk:** HIGH.
  - Spy bot leaking its word = instant loss (worse: reveals the pair so real players learn it).
  - Civilian bot naming the spy pre-emptively via clue = same. The prompt guards this but Haiku can slip.
  - **Mitigation:** validation loop on the clue (`norm(clue) === norm(civWord)` OR `norm(clue) === norm(spyWord)` → retry). Two retries max; if third fails, bot gives up their turn (server treats as pass — this state doesn't currently exist for humans, add it).
- **Auth pitfall:** vote handler at spy.js:602 checks `if (target === socket.id) return fail(...)` — bots have no socket. Guard needs to be by `player.id`.
- **Fairness pitfall:** with 2 spy bots in a 7-player room, they can silently coordinate through the LLM. Prompt should NOT tell a spy bot that another player is also a spy — spies in real games don't know each other's identity. Keep the prompt role-neutral aside from own role.

---

## 7. Codenames (WordSpies main game) 🕵️ — HARDEST (LLM)

**File map:** server `server.js` (1598 lines, codenames logic starts ~line 690–1594) · client `public/index.html` (2420 lines)

### Game summary
Classic Codenames. 5×5 grid of 25 word cards. Each team's spymaster sees the color key (9 red, 8 blue, 7 bystander, 1 assassin) and gives ONE-word clues with a number telling teammates how many cards on the grid relate. Operatives try to click their team's cards. Wrong click ends turn or (assassin) instantly loses. First team to reveal all their cards wins. 4+ players, 2 teams, each with ≥1 spymaster + ≥1 operative.

Existing bot infrastructure: only a `testFill` dev hatch (server.js:1343) that seats 3 named dummies for wheel-testing. Bots never actually take a turn.

### What "bot mode" should mean
Two roles the bot can take:
- **Bot as operative (guesser):** given the clue word + count + the visible board, pick which cards to reveal. Doable with a similarity model or LLM.
- **Bot as spymaster:** given the full color key, generate a one-word clue that links N of your team's cards without also hitting the opponent's, bystanders, or the assassin. This is the hardest problem in the entire game — the Codenames spymaster problem is a known research target.

### Complexity: HARDEST
Multi-session per role. Real cost. Real risk.

### Concrete implementation sketch — two phases

**Phase 7a — Operative bot (do first, MODERATE-to-HARD):**
- **Files:** `server.js`. Add `addBot` socket event alongside the existing `testFill`. Reuse the `testFill` player-object shape (bot id, `bot: true`, avatar, token).
- New handler `botGuess(room)`:
  - Called after a `clue` event if the current-turn team has bot operatives and no human operative has clicked in the last 4s.
  - Or: bot always guesses first (delay 3s) if it's the only operative on that team.
  - Prompt Claude Haiku:
    > *"You are playing Codenames as an operative on team {team}. The spymaster's clue is '{word}' for {count} cards. Unrevealed cards on the board: {list of the 15-25 remaining words}. Which single card is most related to the clue? Reply with only the exact card word."*
  - Parse response → find matching card index → call the same code path as the human `guess` handler.
  - If the bot's guess was right AND `guessesLeft > 0`, loop for another guess with a slightly weaker prompt ("Now which is the next most related?"). Bots should always leave the "+1 bonus" guess to humans if any are on the team.
- **Cost:** 1–3 Haiku calls per bot per team-turn. Typical game has ~6–10 team turns. 4-player 2-bot game = ~20 calls. ~$0.02 per game.

**Phase 7b — Spymaster bot (later, LLM, HARDEST, env-flagged):**
- **Files:** `server.js` + `public/index.html` (spymaster panel needs a "Generating clue…" state).
- New handler `botClue(room)`:
  - Called at the start of the bot's team-turn.
  - Prompt Claude Haiku (or Sonnet for quality — cost tradeoff):
    > *"You are the spymaster in Codenames. Your team: {red/blue}. YOUR TEAM'S REMAINING CARDS: {list}. OPPONENT'S CARDS: {list}. NEUTRAL CARDS: {list}. THE ASSASSIN CARD: {word}. Give a single-word clue that links exactly N of your team's cards, where 1 ≤ N ≤ 4. The clue must not be any word on the board or a form of it. It must NOT relate to the assassin. Reply as JSON: {\"word\": \"...\", \"count\": N, \"targets\": [\"card1\",\"card2\",...]}."*
  - Validate:
    - Word is not on the board (existing `visible.includes(word.toLowerCase())` check at server.js:1476).
    - Count is 0–4.
    - Retry once with "Invalid clue — {reason}. Try again." if validation fails.
  - Emit the clue via the same code path as the human `clue` handler.
- **Cost:** 1 call per bot spymaster turn, ~500 in + 50 out tokens with Haiku. ~10 turns per game = ~$0.005/game with Haiku. Sonnet would be ~5× more but noticeably better clues. Start with Haiku.
- **Env flag:** `BOTS_CODENAMES_SPYMASTER=1` — off by default.

### Cost/risk
- **LLM cost:** operative ~$0.02/game, spymaster ~$0.005–0.03/game.
- **PvP risk:** VERY HIGH.
  - Spymaster bot picking a clue that maps to the assassin = instant loss for its team. Even one such event in a public game will get complained about. Mitigation: after generating clue, do a *check pass* by asking Haiku "Does '{clue}' relate to '{assassin_word}'? Yes or no." If yes, regenerate.
  - Operative bot burning "+1" turn on a bystander = classic frustration. Prompt should never encourage the bonus guess.
- **Auth pitfall:** the win credit path (`credit(room, team)` at ~server.js:1109) writes stats to Redis for logged-in players. Bots have `socUid: null` → skip. Existing `testFill` bots already have this shape; just don't credit bots.
- **Fairness pitfall:** a strong Sonnet spymaster is a wall of skill. Start Haiku, and ship difficulty tiers (Easy = pick a random word from your team's 3 easiest word associations; Medium = Haiku; Hard = Sonnet). Only expose Easy + Medium in v1.
- **Deploy pitfall:** the auto-deploy pipeline pushes to `main` → live in 60s. Every new event handler (`addBot`, `botGuess`, `botClue`) must be tested against a real running human match locally before commit. See `reference-deploy-and-verify.md`.

---

## Shared implementation notes (apply to every bot)

### 1. Extract `getClaude()` to a shared module
It currently lives in `social.js:1973-1988`. When 3+ games need it, extract to `ai.js`:
```
module.exports = { getClaude, callClaudeHaiku, callClaudeSonnet };
```
so `spy.js`, `guessword.js`, and `server.js` (for codenames) all pull from the same place.

### 2. Bot player-object convention
```js
{
  id: 'bot:' + Math.random().toString(36).slice(2, 7),
  name: pick(BOT_NAMES),
  photo: null,
  connected: true,
  bot: true,
  _uid: null,
  token: null,          // no rejoin flow — bots don't refresh
  // ... game-specific fields (score, lives, alive, etc.)
}
```

### 3. Every bot needs a "never blocks the game" guarantee
- LLM call has a hard `setTimeout(15000)` fallback that either passes the turn or picks a random legal move.
- LLM parse failure = random-legal-move fallback, never throw.
- Bot's turn always fires eventually — worst case with `setTimeout(20000)` — so a human can't be stuck waiting forever if Claude times out.

### 4. `live()` feed must hide bot-only rooms
Copy the arcade convention (arcade.js:1494):
```js
const alive = seats.some(s => s.name && !s.bot && s.connected) ||
              ((r.touched || 0) > Date.now() - 120000 && seats.some(s => s.name && !s.bot));
if (!alive) continue;
```

### 5. `activeGame` guard skip for bots
`activegame.js` locks a user to one game. Bots have no uid — every bot-add path must `if (!prof || !prof.uid) skip activeGame.set(...)`.

### 6. Test-in-anger loop before push
Every new bot ships with a `/tmp/<game>-bot.js` runner (the same convention module docs point to). Run it against a real local server, then a browser session — never push a bot to `main` without having played at least one full game against it locally. The auto-deploy pipeline means a broken bot on `main` is broken on production 60s later.

### 7. Kill-switch env vars
```
BOTS_HOOP=1
BOTS_MELD=1
BOTS_WORDRACE=1
BOTS_WORDCHAIN=1
BOTS_GUESSWORD_GUESSER=1
BOTS_GUESSWORD_DESCRIBER=1
BOTS_SPY=1
BOTS_CODENAMES_OPERATIVE=1
BOTS_CODENAMES_SPYMASTER=1
```
Default all to unset (falsy). `addBot` handler returns "bots disabled" if the flag isn't set. Lets the owner ship each bot dark, flip it on for testing, then flip on for all users only when confident.

---

## Session-shape recommendation

| Session | What ships | Env flag flipped on |
|---|---|---|
| 1 | Hoop + Mind Meld | `BOTS_HOOP`, `BOTS_MELD` |
| 2 | Word Race + Word Chain | `BOTS_WORDRACE`, `BOTS_WORDCHAIN` |
| 3 | Guessword guesser only | `BOTS_GUESSWORD_GUESSER` |
| 4 | Extract `ai.js` + Guessword describer | `BOTS_GUESSWORD_DESCRIBER` |
| 5 | Spy (both roles at once — small game) | `BOTS_SPY` |
| 6 | Codenames operative bot | `BOTS_CODENAMES_OPERATIVE` |
| 7 | Codenames spymaster bot (Haiku) | `BOTS_CODENAMES_SPYMASTER` |
| 8 | (optional) Codenames spymaster Sonnet + difficulty tiers | — |

Sessions 1–2 have zero LLM cost. Sessions 3–8 start metered — owner should watch the Anthropic dashboard for the first week of each flip.
