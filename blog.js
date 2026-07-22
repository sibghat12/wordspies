// Blog articles for WordSpies — server-rendered for SEO.
const SITE = 'https://wordspies.onrender.com';

const articles = {
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
  }
};

function layout(title, desc, body, path) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" type="image/png" href="/icon-192.png">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',system-ui,sans-serif;background:#f7f8fb;color:#111318;margin:0;line-height:1.7}
.wrap{max-width:720px;margin:0 auto;padding:24px 18px 60px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
.logo{font-family:'Fredoka';font-weight:700;font-size:24px;text-decoration:none}
.logo .r{color:#ff4d6b}.logo .b{color:#3d7bff}
.play{background:linear-gradient(180deg,#159f07,#0f7500);color:#fff;text-decoration:none;font-weight:900;padding:10px 20px;border-radius:12px;font-size:14.5px}
.card{background:#fff;border-radius:20px;padding:30px;box-shadow:0 2px 4px rgba(35,41,70,.06),0 10px 28px rgba(35,41,70,.09)}
h1{font-family:'Fredoka';font-size:28px;line-height:1.3;margin:0 0 6px}
h2{font-family:'Fredoka';font-size:20px;margin:26px 0 8px}
.date{color:#5f6675;font-size:13.5px;font-weight:700;margin-bottom:18px}
p{font-size:16px;margin:0 0 14px}
a{color:#2258d8;font-weight:800}
.cta{display:block;text-align:center;background:linear-gradient(180deg,#159f07,#0f7500);color:#fff;text-decoration:none;font-weight:900;padding:16px;border-radius:14px;font-size:17px;margin-top:26px}
.backrow{margin-top:22px;text-align:center;font-size:14.5px}
footer{margin-top:30px;text-align:center;color:#5f6675;font-size:13px;font-weight:700}
.list a{display:block;background:#fff;border-radius:18px;padding:22px;box-shadow:0 2px 4px rgba(35,41,70,.06),0 10px 28px rgba(35,41,70,.09);margin-bottom:14px;text-decoration:none;color:#111318}
.list h2{margin:0 0 6px;font-size:19px}
.list p{color:#5f6675;font-size:14.5px;margin:0}
</style></head>
<body><div class="wrap">
<div class="top"><a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a><a class="play" href="/">▶ Play free</a></div>
${body}
<footer>© 2026 Sibi — WordSpies is an independent game, not affiliated with Codenames or Czech Games Edition.</footer>
</div></body></html>`;
}

function articlePage(slug) {
  const a = articles[slug];
  if (!a) return null;
  const body = `<article class="card"><h1>${a.title}</h1><div class="date">${a.date} · WordSpies Blog</div>${a.html}
  <a class="cta" href="/">🎮 Play WordSpies free — no sign-up</a></article>
  <div class="backrow"><a href="/blog">← All articles</a></div>`;
  return layout(a.title, a.desc, body, '/blog/' + slug);
}

function indexPage() {
  const items = Object.entries(articles).map(([slug, a]) =>
    `<a href="/blog/${slug}"><h2>${a.title}</h2><p>${a.desc}</p></a>`).join('');
  const body = `<h1 style="font-family:'Fredoka';margin-bottom:18px">WordSpies Blog</h1><div class="list">${items}</div>`;
  return layout('WordSpies Blog — Word Game Guides & Tips', 'Guides, strategies and tips for Codenames-style word games and online party games with friends.', body, '/blog');
}

module.exports = { articles, articlePage, indexPage };
