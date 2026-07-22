// WordSpies marketing landing page — server-rendered at "/"
const SITE = 'https://wordspies.co.uk';
const GA_ID = 'G-JTH809Z8NH';
const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
module.exports.GA = GA;
module.exports.GA_ID = GA_ID;

function avatar(hat, skin, blushOpacity = '.8') {
  return `<svg viewBox="0 0 100 100" width="52" height="52" aria-hidden="true">
  <circle cx="50" cy="54" r="30" fill="${skin}"/>
  <ellipse cx="50" cy="30" rx="30" ry="7" fill="${hat}"/>
  <path d="M31 28 q0 -17 19 -17 q19 0 19 17 q0 4 -19 4 q-19 0 -19 -4z" fill="${hat}" opacity=".85"/>
  <circle cx="41" cy="55" r="3.2" fill="#20263b"/><circle cx="59" cy="55" r="3.2" fill="#20263b"/>
  <circle cx="35" cy="63" r="3.4" fill="#ffb1a8" opacity="${blushOpacity}"/><circle cx="65" cy="63" r="3.4" fill="#ffb1a8" opacity="${blushOpacity}"/>
  <path d="M43 66 q7 6 14 0" stroke="#c96b4a" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
}

const DEMO_WORDS = ['TIGER','MOON','PIZZA','ROBOT','PARIS','HONEY','CLOUD','KING','OCEAN','TRAIN','APPLE','GHOST','PIANO','RIVER','CROWN','SNOW','DRAGON','BEACH','STAR','BRIDGE','CANDY','WOLF','ROCKET','ISLAND','MAGIC'];

function page() {
  const ASSASSIN_IDX = 12; // exactly one black assassin tile, like a real game
  const demoTiles = DEMO_WORDS.map((w, i) => {
    const cls = i === ASSASSIN_IDX ? 'tk' : 't' + (i % 7);
    return `<div class="t ${cls}" style="animation-delay:${(i * 0.9) % 9}s">${w}</div>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en"><head>
${GA}
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WordSpies — Play a Free Codenames-Style Word Game Online With Friends</title>
<meta name="description" content="WordSpies is a free online Codenames-style word game. Create a room in seconds, share a 4-letter code, and play with 4–10+ friends on any phone or laptop. No sign-up, no download.">
<meta name="keywords" content="codenames online, codenames game, free codenames, word game online, play codenames with friends, online party game, codenames style game, spymaster game, word guessing game">
<meta name="author" content="WordSpies">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f7500">
<link rel="canonical" href="${SITE}/">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:site_name" content="WordSpies">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="WordSpies — Free Codenames-Style Word Game Online">
<meta property="og:description" content="Two teams. Secret words. One assassin. Play free with friends — no sign-up.">
<meta property="og:url" content="${SITE}/"><meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/icon-512.png"><meta property="og:image:alt" content="WordSpies word game board">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="WordSpies — Free Codenames-Style Word Game Online">
<meta name="twitter:description" content="Two teams. Secret words. One assassin. Play free with friends — no sign-up.">
<meta name="twitter:image" content="${SITE}/icon-512.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"WebApplication","@id":"${SITE}/#app","name":"WordSpies","url":"${SITE}/","applicationCategory":"GameApplication","operatingSystem":"Any web browser","browserRequirements":"Requires JavaScript","description":"Free Codenames-style online word game for friends. Create a room, share a 4-letter code, and play with 4–10+ friends on any phone or laptop. No sign-up.","inLanguage":"en","offers":{"@type":"Offer","price":"0","priceCurrency":"GBP"},"publisher":{"@id":"${SITE}/#org"}},
{"@type":"Organization","@id":"${SITE}/#org","name":"WordSpies","url":"${SITE}/","logo":"${SITE}/icon-512.png","email":"contact@wordspies.co.uk"},
{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"WordSpies","publisher":{"@id":"${SITE}/#org"}},
{"@type":"FAQPage","@id":"${SITE}/#faq","mainEntity":[
{"@type":"Question","name":"Is WordSpies really free?","acceptedAnswer":{"@type":"Answer","text":"Yes. WordSpies is completely free to play with no sign-up, no downloads and no account required."}},
{"@type":"Question","name":"How many players do I need?","acceptedAnswer":{"@type":"Answer","text":"You need at least 4 players — one spymaster and one guesser on each team — and it scales up to 10 or more."}},
{"@type":"Question","name":"Is it like Codenames?","acceptedAnswer":{"@type":"Answer","text":"Yes — if you enjoy Codenames-style games, WordSpies plays the same way with spymasters, one-word clues and a hidden assassin. WordSpies is an independent game, not affiliated with Codenames or Czech Games Edition."}},
{"@type":"Question","name":"Can we play remotely on a video call?","acceptedAnswer":{"@type":"Answer","text":"Absolutely. Everyone joins from their own phone or laptop using the room code, so it is perfect for Zoom, Google Meet and Teams game nights."}},
{"@type":"Question","name":"Do you store my data?","acceptedAnswer":{"@type":"Answer","text":"No accounts and no personal data. Game rooms live only while you play."}}
]}
]}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--ink:#111318;--muted:#5f6675;--line:#e6e8ef;--red:#ff4d6b;--blue:#3d7bff;--green:#0f7500;--bg:#f7f8fb;
--sh:0 2px 4px rgba(35,41,70,.06),0 10px 28px rgba(35,41,70,.09);--spring:cubic-bezier(.34,1.56,.64,1)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Nunito',system-ui,sans-serif;color:var(--ink);
background:
  radial-gradient(1100px 520px at 82% -8%, rgba(61,123,255,.13), transparent 60%),
  radial-gradient(900px 500px at 2% -4%, rgba(255,77,107,.12), transparent 58%),
  var(--bg);
background-repeat:no-repeat}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
a{text-decoration:none;color:inherit}
.sitehead{background:#fff;border-bottom:1.5px solid var(--line);position:sticky;top:0;z-index:50}
.nav{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.band{padding:56px 0}
.band.white{background:#fff}
.band.gray{background:var(--bg)}
.band.greenb{background:linear-gradient(135deg,#128a04,var(--green));color:#fff}
.band.greenb .sec-h{color:#fff}
.band.greenb p{color:#d8f5d0}
.logo{font-family:'Fredoka';font-weight:700;font-size:24px}
.logo .r{color:var(--red)}.logo .b{color:var(--blue)}
.navlinks{display:flex;gap:22px;align-items:center;font-weight:800;font-size:15px;color:var(--muted)}
.navlinks a:hover{color:var(--ink)}
.btn{display:inline-block;background:linear-gradient(180deg,#159f07,var(--green));color:#fff;font-weight:900;padding:14px 28px;border-radius:14px;font-size:16.5px;transition:transform .14s var(--spring),filter .15s}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.btn.small{padding:10px 20px;font-size:14.5px}
/* hero */
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center;padding:52px 0 66px}
@media(max-width:860px){.hero{grid-template-columns:1fr;text-align:center;padding-top:26px}}
.hero h1{font-family:'Fredoka';font-size:clamp(32px,4.6vw,50px);line-height:1.12;letter-spacing:-.5px;margin-bottom:16px}
.hero h1 .r{color:var(--red)}.hero h1 .b{color:var(--blue)}
.hero p{font-size:18px;color:var(--muted);font-weight:700;line-height:1.65;margin-bottom:26px;max-width:480px}
@media(max-width:860px){.hero p{margin-inline:auto}}
.herometa{margin-top:14px;color:var(--muted);font-weight:800;font-size:13.5px}
.playersrow{display:flex;align-items:center;gap:12px;margin-top:22px}
@media(max-width:860px){.playersrow{justify-content:center}}
.avstack{display:flex}
.avstack svg{width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(35,41,70,.18);margin-left:-12px;border:2.5px solid #fff}
.avstack svg:first-child{margin-left:0}
.playersrow .cap{color:var(--muted);font-weight:800;font-size:13.5px;line-height:1.35}
.playersrow .cap b{color:var(--ink)}
/* animated demo board */
.demo{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;max-width:430px;margin-inline:auto;transform:rotate(2deg)}
.t{aspect-ratio:16/11;border-radius:9px;background:#fff;box-shadow:var(--sh);display:flex;align-items:center;justify-content:center;
font-weight:900;font-size:clamp(8px,1.15vw,11.5px);letter-spacing:.3px;color:var(--ink);animation:flip 9s infinite}
.t1{animation-name:flipred}.t3{animation-name:flipblue}.t5{animation-name:flipred}.t6{animation-name:flipblue}
.tk{animation-name:flipblack}
@keyframes flip{0%,100%{background:#fff;color:#111318}}
@keyframes flipred{0%,38%,100%{background:#fff;color:#111318}44%,86%{background:var(--red);color:#fff}}
@keyframes flipblue{0%,52%,100%{background:#fff;color:#111318}58%,90%{background:var(--blue);color:#fff}}
@keyframes flipblack{0%,44%,100%{background:#fff;color:#111318}50%,92%{background:#111318;color:#fff}}
.tk::after{content:'💀';position:absolute;top:2px;right:3px;font-size:9px;opacity:0;animation:skull 9s infinite;animation-delay:inherit}
@keyframes skull{0%,44%,100%{opacity:0}50%,92%{opacity:.9}}
.t{position:relative}
/* sections */

.sec-h{font-family:'Fredoka';font-size:30px;text-align:center;margin-bottom:8px}
.sec-sub{text-align:center;color:var(--muted);font-weight:700;font-size:16px;margin-bottom:36px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:820px){.grid3{grid-template-columns:1fr}}
.card{background:#fff;border-radius:20px;padding:26px;box-shadow:var(--sh)}
.card .ico{font-size:34px;margin-bottom:12px}
.card h3{font-family:'Fredoka';font-size:19px;margin-bottom:8px}
.card p{color:var(--muted);font-weight:700;font-size:15px;line-height:1.6}
/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;counter-reset:step}
@media(max-width:820px){.steps{grid-template-columns:1fr}}
.step{background:#fff;border-radius:20px;padding:26px;box-shadow:var(--sh);position:relative}
.step .n{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--red) 49%,var(--blue) 51%);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Fredoka';font-size:18px;margin-bottom:14px}
.step h3{font-family:'Fredoka';font-size:18px;margin-bottom:6px}
.step p{color:var(--muted);font-weight:700;font-size:15px;line-height:1.6}
/* reviews */
.rev{background:#fff;border-radius:20px;padding:24px;box-shadow:var(--sh)}
.rev p{font-size:15.5px;line-height:1.65;font-weight:700;margin-bottom:16px}
.rev .who{display:flex;align-items:center;gap:12px}
.rev .who b{font-size:15px;display:block}
.rev .who span{color:var(--muted);font-size:13px;font-weight:700}
.disclaim{text-align:center;color:var(--muted);font-size:12.5px;font-weight:700;margin-top:14px}
/* faq */
.faq{max-width:680px;margin:0 auto}
details{background:#fff;border-radius:16px;padding:18px 22px;box-shadow:var(--sh);margin-bottom:12px}
summary{font-weight:900;font-size:16px;cursor:pointer}
details p{padding-top:10px;color:var(--muted);font-weight:700;font-size:15px;line-height:1.65}
/* cta band */
footer{padding:36px 0 44px;text-align:center;color:var(--muted);font-size:13.5px;font-weight:700;line-height:2}
footer a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head>
<body>
<header class="sitehead"><div class="wrap">
  <nav class="nav">
    <a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a>
    <div class="navlinks">
      <a href="/blog">Blog</a>
      <a class="btn small" href="/play">▶ Play free</a>
    </div>
  </nav>
</div></header>

<div class="wrap">
  <div class="hero">
    <div>
      <h1>The free online <span class="r">Codenames-style</span> word game for <span class="b">friends</span></h1>
      <p>Two teams. Twenty-five words. One deadly assassin. Create a room, share a 4-letter code, and play with 4–10+ friends on any phone — no sign-up, no download.</p>
      <a class="btn" href="/play">🎮 Play free — takes 10 seconds</a>
      <div class="herometa">✓ 100% free &nbsp; ✓ No account needed &nbsp; ✓ Works on every phone</div>
      <div class="playersrow">
        <div class="avstack">${avatar('#ff4d6b', '#ffd9b3')}${avatar('#3d7bff', '#f3c39a')}${avatar('#7c3aed', '#ffd9b3')}${avatar('#0f9d58', '#f3c39a')}${avatar('#f59e0b', '#ffe0c2')}</div>
        <div class="cap"><b>Friends & families</b> play WordSpies<br>at game nights and on video calls.</div>
      </div>
    </div>
    <div class="demo" aria-hidden="true">${demoTiles}</div>
  </div>
</div>

<div class="band white"><div class="wrap">
  <h2 class="sec-h">Why groups pick WordSpies</h2>
  <p class="sec-sub">Everything you love about word-guessing party games, minus every bit of friction.</p>
  <div class="grid3">
    <div class="card"><div class="ico">⚡</div><h3>Playing in 10 seconds</h3><p>Type your name, tap New game, share the code. No accounts, no emails, no app store — the game starts before your group chat stops buzzing.</p></div>
    <div class="card"><div class="ico">📱</div><h3>Made for phones</h3><p>Everyone joins from their own device — iPhone, Android, laptop, all mixed in one room. The board syncs live for the whole party.</p></div>
    <div class="card"><div class="ico">🎲</div><h3>Never the same board</h3><p>Every game draws 25 words from a pool of 700+ across animals, food, travel, pop culture and more. Fresh boards, forever.</p></div>
  </div>
</div></div>

<div class="band gray"><div class="wrap">
  <h2 class="sec-h">How it works</h2>
  <p class="sec-sub">If you've played Codenames, you already know. If not — you'll get it in one round.</p>
  <div class="steps">
    <div class="step"><div class="n">1</div><h3>Create &amp; invite</h3><p>Start a room and share the 4-letter code or invite link. Friends join instantly from their phones.</p></div>
    <div class="step"><div class="n">2</div><h3>Clue &amp; guess</h3><p>Spymasters give one-word clues like "OCEAN · 2". Teammates debate, then tap the words they think match.</p></div>
    <div class="step"><div class="n">3</div><h3>Dodge the assassin</h3><p>Find all your team's words first to win — but tap the hidden assassin word and you lose instantly. 💀</p></div>
  </div>
</div></div>

<div class="band greenb"><div class="wrap" style="text-align:center">
  <h2 class="sec-h">Round one starts in 10 seconds</h2>
  <p style="font-weight:700;margin:8px 0 26px">Grab three friends and see who finds the assassin first.</p>
  <a class="btn" href="/play" style="background:#fff;color:var(--green)">🎮 Play WordSpies free</a>
</div></div>

<div class="band white"><div class="wrap">
  <h2 class="sec-h">What our beta players say</h2>
  <p class="sec-sub">Straight from our game nights during the beta.</p>
  <div class="grid3">
    <div class="rev"><p>"We played six rounds back to back on a video call — nobody wanted to stop. The room code thing is so easy my mum joined in."</p>
      <div class="who">${avatar('#2b3350', '#ffd9b3')}<div><b>Ayesha</b><span>Beta player · London</span></div></div></div>
    <div class="rev"><p>"Being spymaster is the best kind of pressure. Gave a 3-word clue that actually worked and felt like a genius all week."</p>
      <div class="who">${avatar('#7c3aed', '#f3c39a')}<div><b>Hamza</b><span>Beta player · Karachi</span></div></div></div>
    <div class="rev"><p>"Works perfectly on our phones, no one had to download anything. It's now the default game when friends come over."</p>
      <div class="who">${avatar('#e63956', '#ffd9b3')}<div><b>Zara</b><span>Beta player · Manchester</span></div></div></div>
  </div>
  <p class="disclaim">Quotes from our beta playtest sessions.</p>
</div></div>

<div class="band gray"><div class="wrap">
  <h2 class="sec-h">Questions, answered</h2>
  <p class="sec-sub"></p>
  <div class="faq">
    <details><summary>Is WordSpies really free?</summary><p>Yes — completely free to play, no sign-up, no downloads, no hidden costs. Open the site, share your room code, play.</p></details>
    <details><summary>How many players do I need?</summary><p>Minimum 4 (one spymaster + one guesser per team). The sweet spot is 6–10 — more guessers means better arguments.</p></details>
    <details><summary>Is it like Codenames?</summary><p>Yes — if you enjoy Codenames-style games, WordSpies plays the same way: spymasters, one-word clues, and a hidden assassin. WordSpies is an independent game, not affiliated with Codenames or Czech Games Edition.</p></details>
    <details><summary>Can we play remotely on a video call?</summary><p>That's where it shines. Keep your Zoom/Meet call running, everyone opens WordSpies on their phone, and the debates happen out loud on the call.</p></details>
    <details><summary>Do you store my data?</summary><p>No accounts, no personal data collected — just a nickname that disappears when your game room closes.</p></details>
  </div>
</div></div>

<div class="wrap"><footer>
  <a href="/play">Play</a> · <a href="/blog">Blog</a> · <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a><br>
  🚧 Beta — we're playing, testing and improving it.<br>
  © 2026 Sibi — all rights reserved.
</footer></div>
</body></html>`;
}

module.exports = { page };
