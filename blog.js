// Blog articles for WordSpies — server-rendered for SEO.
const SITE = 'https://wordspies.co.uk';
const GA_ID = 'G-JTH809Z8NH';
const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const articles = {
  'games-like-codenames': {
    title: '6 Free Games Like Codenames to Play Online (2026)',
    desc: 'Love Codenames but want to play online free? Here are the best games like Codenames you can play in a browser with friends — no downloads or accounts.',
    date: '2026-07-22',
    html: `
<p>Codenames is a modern classic — but if you're looking to play something like it online, free, without buying the board game or making accounts, you've got great options. Here are six, starting with the one you can play in the next 30 seconds.</p>
<h2>1. WordSpies (free, no sign-up)</h2>
<p><a href="/">WordSpies</a> plays just like Codenames: two teams, a 5×5 word grid, spymasters giving one-word clues, and an assassin word that ends everything. Create a room, share a 4-letter code, and friends join on any phone. It adds a few nice touches of its own — cute avatars, sounds, turn timers, and boards drawn from 700+ words so games never repeat.</p>
<h2>2. Decrypto-style code games</h2>
<p>Instead of guessing your own team's words, you intercept the other team's coded clues. More brain-burny, brilliant with 6+ players who liked Codenames but want something harder.</p>
<h2>3. Just One-style cooperative clue games</h2>
<p>Everyone writes a one-word clue for a guesser — but duplicate clues cancel out. Cooperative rather than competitive, and very forgiving for new players.</p>
<h2>4. Twenty-questions party rooms</h2>
<p>Simple deduction with the same "read your friends' minds" energy, works even with 3 players.</p>
<h2>5. Charades and forbidden-word games</h2>
<p>Taboo-style games — describe a word without saying the obvious related words — scratch the same clue-giving itch and need nothing but a generator on one phone.</p>
<h2>6. Drawing party games</h2>
<p>Skribbl-style draw-and-guess games swap word clues for terrible sketches. Different skill, same laughing-until-crying result.</p>
<h2>The quickest one to start right now</h2>
<p>If your group is 4+ and already on a call, a Codenames-style game is the easiest sell — everyone knows guessing games instinctively. <a href="/">Start a free WordSpies room</a>, share the code in your group chat, and you're playing before the pizza arrives.</p>`
  },
  'codenames-rules-explained': {
    title: 'Codenames Rules Explained Simply (With Examples)',
    desc: 'Codenames rules made simple: how clues work, how many guesses you get, what the assassin does, and the mistakes every new player makes — with examples.',
    date: '2026-07-22',
    html: `
<p>Codenames-style games look confusing for about ninety seconds — then they click and you're hooked. Here are the rules explained the simple way, with examples.</p>
<h2>The setup</h2>
<p>25 word cards in a 5×5 grid. Two teams, red and blue. One team has 9 secret words, the other 8, there are 7 neutral words, and 1 assassin word. Only each team's <strong>spymaster</strong> knows which is which — everyone else just sees 25 plain words.</p>
<h2>The clue</h2>
<p>The spymaster says exactly one word plus one number. Example: the red words include APPLE and TREE, so the red spymaster says <em>"ORCHARD, 2."</em> That's it — no gestures, no extra hints, and the clue can't be a word visible on the board.</p>
<h2>The guessing</h2>
<p>The team taps words one at a time. Guess your own word? Keep going. Guess a neutral word? Turn ends. Guess the <em>other team's</em> word? Turn ends and you just helped them. You get a maximum of the clue number plus one guess — the bonus guess lets you pick up a word you missed earlier.</p>
<h2>The assassin</h2>
<p>One word is the assassin. Touch it and your team <strong>loses instantly</strong> — game over, no appeals. This single rule creates all the drama: is BANK the money kind (your word) or the river kind (the assassin)? Choose wisely.</p>
<h2>Winning</h2>
<p>First team to reveal all their words wins. The team that goes first has 9 words to the other's 8 — that's the balance for the first-move advantage.</p>
<h2>The three rookie mistakes</h2>
<p>One: spymasters giving clever clues nobody understands — clear beats clever. Two: guessers tapping fast without discussing — the debate IS the game. Three: forgetting the assassin exists — always ask "could this clue mean THAT word?" before tapping.</p>
<p>Rules make sense once you've played a single round. <a href="/">Try a free game on WordSpies</a> — no sign-up, and the whole group can join from their phones in seconds.</p>`
  },
  'word-games-for-zoom-calls': {
    title: 'Best Free Word Games to Play on Zoom or Google Meet (2026)',
    desc: 'Fun free word games for Zoom, Google Meet or Teams calls — browser games that need no downloads, work on phones, and keep remote game nights alive.',
    date: '2026-07-22',
    html: `
<p>Remote game night lives or dies on one thing: how fast everyone can actually start playing. Downloads, accounts, and payment walls kill the mood before the first round. These word games run in a browser, work alongside your Zoom or Meet call, and start in under a minute.</p>
<h2>1. WordSpies — the team game that fits calls perfectly</h2>
<p><a href="/">WordSpies</a> is a free Codenames-style team game that was practically made for video calls: the spymaster thinks silently while the guessers argue out loud on the call — which is exactly the fun part. Everyone opens the link on their phone or a second tab, joins with a 4-letter code, and the board syncs live for the whole room. 4–10+ players, no accounts.</p>
<h2>2. Wordle races</h2>
<p>Everyone solves the same puzzle in a screen-share race. Two minutes of fun per round, great as a warm-up.</p>
<h2>3. Drawing games</h2>
<p>Skribbl-style games with the drawing screen-shared work brilliantly on calls — the guessing chat scrolls faster than anyone can draw.</p>
<h2>4. Story chain games</h2>
<p>Gartic Phone's write-draw-write telephone chain produces a reveal at the end that's better than most TV. Needs 5+ people to shine.</p>
<h2>5. Trivia with a shared screen</h2>
<p>Host shares the questions, everyone answers in the meeting chat. Zero setup if you have a question list.</p>
<h2>Making it work smoothly on a call</h2>
<p>Three tips from many remote game nights: keep the game on phones and the call on laptops so nobody alt-tabs away from faces; put the join link in the meeting chat so latecomers self-serve; and pick games with 10–15 minute rounds so people can drop in and out. A <a href="/">WordSpies</a> room stays open between rounds, so the room code you share at the start works all night.</p>`
  },
  'codenames-with-4-players': {
    title: 'Can You Play Codenames-Style Games With 4 Players? (Best Setup)',
    desc: 'Yes — 4 players is the minimum for Codenames-style games. Here is the best 2v2 setup, how it changes strategy, and tips to make small games great.',
    date: '2026-07-22',
    html: `
<p>Short answer: yes — four players is exactly the minimum for a Codenames-style game, and 2v2 is a genuinely great way to play. It just feels different from a big party game. Here's how to set it up and what changes.</p>
<h2>The 4-player setup</h2>
<p>Each team gets one <strong>spymaster</strong> and one <strong>guesser</strong>. In <a href="/">WordSpies</a> that means: create a room, two friends join red, two join blue, one on each team taps "Be spymaster," and the host starts the game. Total setup time: about 40 seconds.</p>
<h2>How 2v2 changes the game</h2>
<p>With one guesser per team there's no group debate — so the game becomes a pure mind-meld between two people. Couples and best friends are terrifying at this: the spymaster learns exactly how their partner thinks and clues get almost telepathic by game three. It's faster too — rounds take 8–10 minutes instead of 15.</p>
<h2>Strategy tips for pairs</h2>
<p>Spymasters: with no debate to save your guesser from a bad tap, clarity matters double — prefer 2-word clues you're certain about. Guessers: say your reasoning out loud anyway ("ORCHARD… APPLE, obviously, and TREE, and hmm is FRUIT one of ours?") — hearing yourself think catches mistakes, and the spymaster's poker face becomes a hilarious mini-game.</p>
<h2>Rotate the spymaster seat</h2>
<p>In 2v2, swap roles every game with the rematch button — being spymaster is a completely different skill, and rotating keeps both players sharp. The running score in <a href="/">WordSpies</a> tracks the session, so a best-of-five gets competitive fast.</p>
<h2>What about 5 or 6 players?</h2>
<p>Five works as 2v3 (the team of 3 gets a debate advantage — give the pair the 9-word side by letting them start). Six as 3v3 is the sweet spot where table-talk really begins. Beyond that, every extra guesser adds chaos — the good kind.</p>
<p><a href="/">Start a free 4-player game now</a> — no sign-up, works on any phone.</p>`
  },
  'play-codenames-online-free': {
    title: 'How to Play Codenames Online Free (No Sign-Up Needed)',
    desc: 'Want to play a Codenames-style word game online free with friends? Here are the rules, how teams work, and how to start a game in under 30 seconds — no account needed.',
    date: '2026-07-22',
    html: `
<p>Codenames is one of the most popular party board games in the world — over 16 million copies sold. But you don't need the physical box, or even an account, to enjoy a Codenames-style game with friends online. Here's exactly how it works and how to start playing in under 30 seconds.</p>
<h2>The rules in one minute</h2>
<p>Two teams — red and blue — see the same 5×5 grid of 25 words. Each team has one <strong>spymaster</strong> who secretly knows which words belong to their team, and <strong>guessers</strong> who don't. The spymaster gives a one-word clue plus a number, like <em>OCEAN · 2</em>, meaning "two of our words relate to OCEAN." Guessers tap words one at a time: a correct word lets them keep going, a wrong one ends the turn, and one hidden <strong>assassin word</strong> loses the game instantly. First team to find all their words wins.</p>
<h2>How to play free online</h2>
<p>On <a href="/">WordSpies</a> — a free Codenames-style game — the whole setup takes seconds: type your name, tap <strong>New game</strong>, and share the 4-letter room code (or the invite link) with friends. Everyone joins from their own phone or laptop, picks a team, and one player per team taps "Be spymaster." The host presses start, and you're playing. There's no download, no registration, and no cost.</p>
<h2>How many players do you need?</h2>
<p>Four is the minimum — a spymaster and a guesser on each team. The sweet spot is 6–10 players: guessers can debate the clues out loud (or in the built-in chat), which is where the game gets funny.</p>
<h2>Tips for your first game</h2>
<p>Spymasters: start with safe clues that link just two words rather than risky three-word stretches. Guessers: say your reasoning out loud before tapping — half the fun is the debate. And whatever you do, think twice before touching a word nobody's sure about: that's how teams find the assassin.</p>
<p><strong>Ready to try it?</strong> Start a free game on WordSpies now — your friends can join in seconds.</p>`
  },
  'best-online-word-party-games': {
    title: '7 Best Free Word Party Games to Play Online With Friends (2026)',
    desc: 'The best free online word and party games to play with friends on any phone or laptop — from Codenames-style team games to drawing and trivia games.',
    date: '2026-07-22',
    html: `
<p>Game night doesn't need everyone in the same room anymore. These free browser games work on any phone or laptop, need no downloads, and are perfect for groups — whether you're together on a call or sitting in the same living room.</p>
<h2>1. WordSpies — Codenames-style team word game</h2>
<p><a href="/">WordSpies</a> is a free Codenames-style game: two teams, secret words, one-word clues, and a deadly assassin word. Create a room, share a 4-letter code, and play with 4–10+ people. No sign-up, works on any phone, and every board draws from 700+ words so games stay fresh.</p>
<h2>2. Skribbl — drawing and guessing</h2>
<p>One player draws a secret word while everyone else races to guess it in chat. Chaotic, hilarious, and needs zero artistic talent — bad drawings are the point.</p>
<h2>3. Gartic Phone — telephone with drawings</h2>
<p>Everyone writes a sentence, then draws someone else's sentence, then describes someone else's drawing… by the end, "a cat eating pizza" has become something unrecognisable and the reveal is the best part.</p>
<h2>4. Wordle-with-friends clones</h2>
<p>Racing the same 5-letter word puzzle against friends turns a solo habit into a competition. Great for two players.</p>
<h2>5. Trivia games</h2>
<p>Free trivia sites let one person host questions on a shared screen while everyone answers on their phones — the classic pub quiz, digitised.</p>
<h2>6. Charades generators</h2>
<p>Use a free online word generator on one phone and act the words out in person. Old-school, but unbeatable with family.</p>
<h2>7. Twenty questions rooms</h2>
<p>Simple, free, and surprisingly competitive with the right group.</p>
<h2>Which one should you pick?</h2>
<p>For groups of 4+ who like thinking games, a Codenames-style game like <a href="/">WordSpies</a> is the strongest pick — it's team-based, so nobody sits out, and rounds take 10–15 minutes. For maximum silliness, Gartic Phone wins. Either way: game night is free now.</p>`
  },
  'spymaster-clue-strategies': {
    title: 'How to Give Great Clues in Codenames-Style Games: Spymaster Guide',
    desc: 'Practical spymaster strategies for Codenames-style word games: how to link words safely, when to go for 3-word clues, and how to avoid the assassin.',
    date: '2026-07-22',
    html: `
<p>Being spymaster in a Codenames-style game like <a href="/">WordSpies</a> is the best seat in the house — and the most pressure. Your team's fate depends on your one-word clues. Here's how good spymasters think.</p>
<h2>Rule 1: The assassin comes first</h2>
<p>Before you even look for connections between your own words, find the assassin word and ask: "could my clue accidentally point at it?" A clue that links three of your words but also fits the assassin is a losing clue. When in doubt, pick the safer, smaller clue.</p>
<h2>Rule 2: Two safe beats three risky</h2>
<p>New spymasters chase glorious 3- and 4-word clues. Experienced ones know the maths: a 2-word clue your team gets 100% of the time beats a 4-word clue they get half of. Save the big clue for when the board genuinely offers it.</p>
<h2>Rule 3: Think about their brains, not yours</h2>
<p>The clue "MERCURY" might mean the planet to you — but your team might think of the metal, or the singer. Before giving a clue, imagine each of your guessers hearing it. If your cleverest connection needs an explanation, it's not a clue, it's a trap.</p>
<h2>Rule 4: Track the leftovers</h2>
<p>Words you clued earlier but your team never found are still on the board. A good trick: give a clue for new words, and your team can use spare guesses (you always get clue number +1) to pick up an old missed word.</p>
<h2>Rule 5: Watch the enemy board</h2>
<p>If the other team is one word from winning, a safe 1-word clue that guarantees progress beats any gamble. Play the scoreboard, not just the board.</p>
<h2>Practice makes the spymaster</h2>
<p>The only way to get good is reps. Start a free game on <a href="/">WordSpies</a>, take the spymaster seat, and try the two-safe-words rule tonight — your win rate will jump.</p>`
  },
  'virtual-team-building-word-games': {
    title: 'Virtual Team Building Games: Free Word Games for Remote Teams (2026)',
    desc: 'The best free virtual team building games for remote teams — no downloads or sign-ups. Word games that actually get quiet colleagues talking on video calls.',
    date: '2026-07-22',
    html: `
<p>Most "virtual team building games" are either awkward icebreakers or clunky paid platforms nobody opens twice. The ones that actually work share three traits: everyone can join in seconds, they spark real conversation, and they're genuinely fun. Here are free word games that hit all three.</p>
<h2>1. WordSpies — the team game built for calls</h2>
<p><a href="/">WordSpies</a> is a free Codenames-style game where two teams race to find their secret words from one-word clues. It's ideal for remote teams because the fun is in the debate: the guessers argue out loud on the call while the spymaster sweats silently. Everyone joins from their own screen with a 4-letter code — no accounts, no installs, no IT tickets. Split a team of 8 into two groups of 4 and you have an instant tournament.</p>
<h2>2. Word association warm-ups</h2>
<p>A 60-second round where each person adds a word linked to the last. Zero setup, works as a meeting opener, and quietly reveals how people think.</p>
<h2>3. Two truths and a word</h2>
<p>A wordy twist on two-truths-and-a-lie: describe yourself in three words, one of which is false. Fast, personal, and it makes remote colleagues feel like people.</p>
<h2>4. Collaborative story building</h2>
<p>The team writes a story one sentence at a time. Cooperative rather than competitive — good for groups where you want inclusion over rivalry.</p>
<h2>Why word games beat trivia for teams</h2>
<p>Trivia rewards the person who already knew the answer — everyone else just waits. Word games like Codenames reward discussion, so the quiet new hire and the loud director contribute equally. That's the actual point of team building.</p>
<h2>Running it well</h2>
<p>Keep rounds to 15 minutes, put the join link in the meeting chat so latecomers self-serve, and let people opt to spectate. <a href="/">Start a free WordSpies room</a>, drop the code in your team channel, and you'll get more talking in 15 minutes than in a month of "how was your weekend."</p>`
  },
  'family-game-night-word-games': {
    title: 'Family Game Night Ideas: Free Word Games Everyone Can Play (2026)',
    desc: 'Free word games for family game night that work across ages and phones — no board, no sign-up. Great for kids, grandparents and everyone in between.',
    date: '2026-07-22',
    html: `
<p>The best family game night games work for an 8-year-old and a grandparent at the same time — or on the same video call. No tiny pieces to lose, no rules that take twenty minutes to explain, and nothing to buy. Here are word games that do exactly that.</p>
<h2>1. WordSpies — teams keep everyone included</h2>
<p><a href="/">WordSpies</a> splits the family into two teams, so a younger player sits with an adult and nobody's left out. It's a Codenames-style game: give one-word clues, guess your team's secret words, dodge the assassin. Because it plays on any phone with just a 4-letter code, the cousins on a video call join the same game as the people in the room. Boards are drawn from 700+ everyday words, so they're friendly for all ages.</p>
<h2>2. Categories (Scattergories-style)</h2>
<p>Pick a letter, race to name a food, animal and place that start with it. Endless, needs nothing but a timer, and levels the field between kids and adults.</p>
<h2>3. Word chains</h2>
<p>Each player says a word starting with the last letter of the previous one. Deceptively addictive and great for younger kids learning spelling.</p>
<h2>4. Twenty questions</h2>
<p>One person thinks of something; everyone else narrows it down with yes/no questions. Works with any number of players and any age.</p>
<h2>Keeping it fair across ages</h2>
<p>Pair a younger player with an older one on the same team, let kids be the guessers (the fun, low-pressure role), and keep rounds short. A team game like <a href="/">WordSpies</a> does the balancing for you — the team wins together, so there's no single loser. Set up a free room and the whole family, near and far, is playing in under a minute.</p>`
  },
  'how-to-win-codenames': {
    title: 'How to Win at Codenames: 7 Winning Strategies & Tips (2026)',
    desc: 'Want to win more Codenames-style games? Here are 7 proven strategies for spymasters and guessers — clue maths, the assassin rule, and smart guessing tactics.',
    date: '2026-07-22',
    html: `
<p>Codenames-style games look like luck, but the same players keep winning — because clue-giving and guessing are skills. Here are seven strategies that reliably raise your win rate, whether you're the spymaster or a guesser.</p>
<h2>1. Spymasters: guard against the assassin first</h2>
<p>Before hunting for clever links, find the assassin word and make sure your clue can't point at it. One accidental assassin clue loses the whole game — no comeback. Safe beats clever, every time.</p>
<h2>2. Two words you'll get beats four you might</h2>
<p>A guaranteed 2-word clue outscores a risky 4-word clue over a full game. Only reach for the big number when the board genuinely hands it to you.</p>
<h2>3. Clue for your team's brains, not your own</h2>
<p>Your clever connection is worthless if your teammates don't see it. Picture each guesser hearing your word. If it needs explaining, it's a trap you set for yourself.</p>
<h2>4. Guessers: start with the word you're surest of</h2>
<p>Tap your most confident word first. If you're right, you've earned momentum and information about the rest of the clue.</p>
<h2>5. Use — but respect — the bonus guess</h2>
<p>You always get the clue number plus one guess. That bonus is best spent picking up a word you missed from an earlier clue, not gambling on a fresh hunch.</p>
<h2>6. Stop while you're ahead</h2>
<p>Got both words from a "2" clue? Stop. Greedily guessing a third unclued word is how teams hand points — or the game — to their opponents.</p>
<h2>7. Play the scoreboard</h2>
<p>If the other team is one word from winning, take the safe guaranteed clue and deny them the turn. Track how many words each team has left and let it dictate your risk.</p>
<h2>Put it into practice</h2>
<p>Strategy sticks through playing, not reading. <a href="/">Start a free WordSpies game</a>, try the "two safe words" and "stop while ahead" rules tonight, and watch how quickly your team starts winning.</p>`
  }
};

function layout(title, desc, body, path, banner, schema) {
  return `<!DOCTYPE html>
<html lang="en"><head>
${GA}
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f7500">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" type="image/png" href="/icon-192.png">
<meta property="og:site_name" content="WordSpies"><meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og-image.png">
${schema || ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#fafafa;color:#1c1e21;margin:0}
.sitehead{background:#fff;border-bottom:1.5px solid #e6e8ef;position:sticky;top:0;z-index:50}
.hwrap{max-width:1080px;margin:0 auto;padding:0 20px}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.wrap{max-width:1080px;margin:0 auto;padding:34px 20px 70px}
article,.post{max-width:860px}
.logo{font-family:'Fredoka',sans-serif;font-weight:700;font-size:23px;text-decoration:none}
.logo .r{color:#ff4d6b}.logo .b{color:#3d7bff}
.navlinks{display:flex;gap:20px;align-items:center;font-weight:700;font-size:14.5px;color:#5f6675}
.navlinks a:hover{color:#1c1e21}
.play{background:#0f7500;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:10px;font-size:14px}
.play:hover{background:#0b5a00}
h1{font-size:30px;line-height:1.25;letter-spacing:-.5px;margin:0 0 10px;font-weight:800}
.date{color:#6b7280;font-size:14px;margin-bottom:26px}
article h2{font-size:21px;letter-spacing:-.3px;margin:30px 0 10px;font-weight:700}
article p{font-family:Georgia,'Times New Roman',serif;font-size:17.5px;line-height:1.8;margin:0 0 16px;color:#242628}
article a{color:#0f7500;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.cta{display:block;text-align:center;background:#0f7500;color:#fff;text-decoration:none;font-weight:700;padding:15px;border-radius:12px;font-size:16px;margin-top:30px;font-family:'Inter',sans-serif}
.cta:hover{background:#0b5a00}
.backrow{margin-top:26px;font-size:15px}
.backrow a{color:#374151;text-decoration:none;font-weight:600}
footer{margin-top:44px;padding:36px 0 44px;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13.5px;font-weight:700;line-height:2;font-family:'Inter',sans-serif}
footer a{color:#1c1e21;text-decoration:underline;text-underline-offset:3px}
.post{padding:26px 0;border-bottom:1px solid #e5e7eb}
.post h2{font-size:21px;margin:0 0 8px;letter-spacing:-.3px}
.post h2 a{color:#1c1e21;text-decoration:none}
.post h2 a:hover{color:#0f7500}
.post p{color:#4b5563;font-size:15.5px;line-height:1.65;margin:0 0 12px;font-family:Georgia,serif}
.more{color:#0f7500;font-weight:700;font-size:14.5px;text-decoration:none}
.more:hover{text-decoration:underline;text-underline-offset:3px}
.pagetitle{font-size:28px;margin:0 0 4px}
.pagesub{color:#6b7280;font-size:15.5px;margin:0 0 8px}
.bband{background:linear-gradient(135deg,#128a04,#0f7500);color:#fff;padding:42px 0 46px}
.bband h1{font-family:'Fredoka',sans-serif;font-weight:700;font-size:36px;letter-spacing:-.5px;margin:0 0 8px;color:#fff}
.bband p{margin:0;font-size:16.5px;font-weight:600;color:#eafbe7}
.relh{font-size:19px;font-weight:800;margin:38px 0 14px}
.relgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.relgrid{grid-template-columns:1fr}}
.rel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;text-decoration:none;display:block}
.rel:hover{border-color:#0f7500}
.rel b{color:#1c1e21;font-size:15.5px;line-height:1.4;display:block;margin-bottom:8px}
.rel span{color:#0f7500;font-weight:700;font-size:13.5px}
</style></head>
<body>
<header class="sitehead"><div class="hwrap">
<div class="top"><a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a><div class="navlinks"><a href="/blog">Blog</a><a class="play" href="/play">&#9654; Play free</a></div></div>
</div></header>
${banner || ''}
<div class="wrap">
${body}
<footer>
<a href="/play">Play</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a><br>
© 2026 WordSpies. All rights reserved.
</footer>
</div></body></html>`;
}

function articlePage(slug) {
  const a = articles[slug];
  if (!a) return null;
  const related = Object.entries(articles).filter(([s2]) => s2 !== slug).slice(0, 4)
    .map(([s2, r]) => `<a class="rel" href="/blog/${s2}"><b>${r.title}</b><span>Read article &rarr;</span></a>`).join('');
  const body = `<article><h1>${a.title}</h1><div class="date">${a.date} · WordSpies Blog</div>${a.html}
  <a class="cta" href="/">&#127918; Play WordSpies free — no sign-up</a></article>
  <div class="relh">Related articles</div>
  <div class="relgrid">${related}</div>
  <div class="backrow"><a href="/blog">&larr; All articles</a></div>`;
  const schema = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"BlogPosting","headline":"${esc(a.title)}","description":"${esc(a.desc)}","url":"${SITE}/blog/${slug}","datePublished":"${a.date}","dateModified":"${a.date}","inLanguage":"en","author":{"@type":"Organization","name":"WordSpies"},"publisher":{"@type":"Organization","name":"WordSpies","logo":{"@type":"ImageObject","url":"${SITE}/icon-512.png"}},"mainEntityOfPage":{"@type":"WebPage","@id":"${SITE}/blog/${slug}"}},
{"@type":"BreadcrumbList","itemListElement":[
{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},
{"@type":"ListItem","position":2,"name":"Blog","item":"${SITE}/blog"},
{"@type":"ListItem","position":3,"name":"${esc(a.title)}","item":"${SITE}/blog/${slug}"}]}
]}</script>`;
  return layout(a.title, a.desc, body, '/blog/' + slug, null, schema);
}

function indexPage() {
  const items = Object.entries(articles).map(([slug, a]) =>
    `<div class="post"><h2><a href="/blog/${slug}">${a.title}</a></h2><p>${a.desc}</p><a class="more" href="/blog/${slug}">Read article &rarr;</a></div>`).join('');
  const body = items;
  const banner = `<div class="bband"><div class="hwrap"><h1>WordSpies Blog</h1><p>Guides, strategies and tips for word games with friends.</p></div></div>`;
  const blogItems = Object.entries(articles).map(([slug, a]) =>
    `{"@type":"BlogPosting","headline":"${esc(a.title)}","description":"${esc(a.desc)}","url":"${SITE}/blog/${slug}","datePublished":"${a.date}"}`).join(',');
  const schema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Blog","@id":"${SITE}/blog","name":"WordSpies Blog","description":"Guides, strategies and tips for Codenames-style word games and online party games.","url":"${SITE}/blog","publisher":{"@type":"Organization","name":"WordSpies","logo":{"@type":"ImageObject","url":"${SITE}/icon-512.png"}},"blogPost":[${blogItems}]}</script>`;
  return layout('WordSpies Blog — Word Game Guides & Tips', 'Guides, strategies and tips for Codenames-style word games and online party games with friends.', body, '/blog', banner, schema);
}

module.exports = { articles, articlePage, indexPage };
