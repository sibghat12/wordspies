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

// Hero illustration — the killer Correct feature in action. Learner's imperfect
// Spanish, then a green correction bubble underneath. Chosen as hero because it's
// the single most valuable thing the app does that Duolingo/Tandem don't do well.
const CHAT_MOCK = `<svg viewBox="0 0 380 320" width="100%" height="auto" aria-hidden="true">
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f7f8fb"/></linearGradient>
    <filter id="sh1" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#1a2247" flood-opacity=".12"/></filter>
  </defs>
  <rect x="10" y="10" width="360" height="300" rx="24" fill="url(#bg1)" filter="url(#sh1)"/>
  <rect x="10" y="10" width="360" height="46" rx="24" fill="#fff"/>
  <circle cx="42" cy="34" r="14" fill="#ffd9b3"/>
  <circle cx="42" cy="30" r="9" fill="#ffe6cc"/>
  <text x="66" y="30" font-family="Plus Jakarta Sans,sans-serif" font-size="13" font-weight="700" fill="#111318">Maria</text>
  <text x="66" y="45" font-family="Plus Jakarta Sans,sans-serif" font-size="11" font-weight="500" fill="#5f6675">learning English · online</text>
  <circle cx="340" cy="34" r="4" fill="#22c55e"/>
  <rect x="30" y="78" width="220" height="42" rx="16" fill="#e8f0ff"/>
  <text x="46" y="104" font-family="Plus Jakarta Sans,sans-serif" font-size="14" font-weight="500" fill="#111318">I go to store yesterday</text>
  <text x="30" y="134" font-family="Plus Jakarta Sans,sans-serif" font-size="10" font-weight="600" fill="#5f6675">MARIA · 2:14 PM</text>
  <rect x="30" y="148" width="320" height="62" rx="14" fill="#e7fbe9" stroke="#7cd58a" stroke-width="1.4"/>
  <text x="46" y="170" font-family="Plus Jakarta Sans,sans-serif" font-size="10" font-weight="700" fill="#0f7500" letter-spacing=".5">✓ CORRECTION</text>
  <text x="46" y="192" font-family="Plus Jakarta Sans,sans-serif" font-size="14" font-weight="600" fill="#0f7500">I <tspan text-decoration="underline">went</tspan> to <tspan text-decoration="underline">the</tspan> store yesterday</text>
  <text x="46" y="204" font-family="Plus Jakarta Sans,sans-serif" font-size="10" font-weight="500" fill="#3a7040">past tense · missing article</text>
  <rect x="130" y="228" width="220" height="42" rx="16" fill="#111318"/>
  <text x="146" y="254" font-family="Plus Jakarta Sans,sans-serif" font-size="14" font-weight="500" fill="#fff">Thanks! Que compraste?</text>
  <text x="330" y="284" text-anchor="end" font-family="Plus Jakarta Sans,sans-serif" font-size="10" font-weight="600" fill="#5f6675">YOU · 2:15 PM</text>
</svg>`;

// Four small pillar illustrations — inline SVG so no image requests, no layout shift.
const ILLUS_CHAT = `<svg viewBox="0 0 160 120" width="100%" height="auto" aria-hidden="true">
  <rect x="12" y="20" width="98" height="32" rx="14" fill="#e8f0ff"/>
  <text x="26" y="40" font-family="Plus Jakarta Sans" font-size="12" font-weight="600" fill="#111318">Hola amigo!</text>
  <rect x="52" y="60" width="96" height="32" rx="14" fill="#111318"/>
  <text x="66" y="80" font-family="Plus Jakarta Sans" font-size="12" font-weight="600" fill="#fff">¿Cómo estás?</text>
  <circle cx="20" cy="94" r="8" fill="#22c55e"/>
  <text x="34" y="98" font-family="Plus Jakarta Sans" font-size="10" font-weight="700" fill="#0f7500">Tap to correct</text>
</svg>`;

const ILLUS_GAMES = `<svg viewBox="0 0 160 120" width="100%" height="auto" aria-hidden="true">
  <rect x="10" y="14" width="42" height="42" rx="10" fill="#ffe7ed"/><text x="31" y="42" text-anchor="middle" font-size="22">🎲</text>
  <rect x="58" y="14" width="42" height="42" rx="10" fill="#e8f0ff"/><text x="79" y="42" text-anchor="middle" font-size="22">🎱</text>
  <rect x="106" y="14" width="42" height="42" rx="10" fill="#f5efde"/><text x="127" y="42" text-anchor="middle" font-size="22">🔴</text>
  <rect x="10" y="62" width="42" height="42" rx="10" fill="#e7fbe9"/><text x="31" y="90" text-anchor="middle" font-size="22">🧠</text>
  <rect x="58" y="62" width="42" height="42" rx="10" fill="#fef3c7"/><text x="79" y="90" text-anchor="middle" font-size="22">⚡</text>
  <rect x="106" y="62" width="42" height="42" rx="10" fill="#ede9fe"/><text x="127" y="90" text-anchor="middle" font-size="22">🕵</text>
</svg>`;

const ILLUS_PARTY = `<svg viewBox="0 0 160 120" width="100%" height="auto" aria-hidden="true">
  <circle cx="80" cy="60" r="42" fill="none" stroke="#e6e8ef" stroke-width="1.5" stroke-dasharray="3 4"/>
  <g><circle cx="80" cy="18" r="14" fill="#ffd9b3"/><circle cx="80" cy="15" r="9" fill="#ff4d6b"/></g>
  <g><circle cx="122" cy="60" r="14" fill="#f3c39a"/><circle cx="122" cy="57" r="9" fill="#3d7bff"/></g>
  <g><circle cx="80" cy="102" r="14" fill="#ffd9b3"/><circle cx="80" cy="99" r="9" fill="#7c3aed"/></g>
  <g><circle cx="38" cy="60" r="14" fill="#f3c39a"/><circle cx="38" cy="57" r="9" fill="#0f9d58"/></g>
  <text x="80" y="66" text-anchor="middle" font-size="18" font-family="Plus Jakarta Sans" font-weight="700" fill="#0f7500">🎤</text>
</svg>`;

const ILLUS_AI = `<svg viewBox="0 0 160 120" width="100%" height="auto" aria-hidden="true">
  <rect x="14" y="20" width="132" height="80" rx="16" fill="#f7f8fb" stroke="#e6e8ef"/>
  <rect x="26" y="34" width="70" height="8" rx="4" fill="#111318"/>
  <rect x="26" y="48" width="46" height="6" rx="3" fill="#5f6675"/>
  <rect x="26" y="60" width="60" height="6" rx="3" fill="#5f6675"/>
  <circle cx="130" cy="34" r="14" fill="#ede9fe"/>
  <text x="130" y="39" text-anchor="middle" font-size="14">🤖</text>
  <rect x="26" y="76" width="80" height="14" rx="7" fill="#e7fbe9"/>
  <text x="66" y="86" text-anchor="middle" font-family="Plus Jakarta Sans" font-size="10" font-weight="700" fill="#0f7500">Muy bien! 🎉</text>
</svg>`;

const PAD = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align:-4px;margin-right:7px" aria-hidden="true"><path d="M7.5 7A6.5 6.5 0 0 0 1 13.5v.6a4.4 4.4 0 0 0 8 2.4h6a4.4 4.4 0 0 0 8-2.4v-.6A6.5 6.5 0 0 0 16.5 7h-9zM7 11h1.4v1.1H9.5v1.4H8.4v1.1H7v-1.1H5.9v-1.4H7V11zm8.6.4a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zm2.3-2.3a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1z"/></svg>';

// Every game gets a shelf card. Order = frequency we want to surface. Each card
// links straight to its game page.
const GAMES = [
  { href: '/play',      icon: '🕵', name: 'WordSpies',     line: 'Codenames-style · 4–10+ players' },
  { href: '/wordrace',  icon: '⚡', name: 'Word Race',     line: '60-second vocab sprint · solo or party' },
  { href: '/wordchain', icon: '🔗', name: 'Word Chain',    line: 'Last letter starts the next · 2+ players' },
  { href: '/guessword', icon: '❓', name: 'Guess the Word', line: 'One player knows · the rest ask · 3+' },
  { href: '/spy',       icon: '🕶', name: 'Spy',           line: 'Find the fake · social deduction · 4+' },
  { href: '/ludo',      icon: '🎲', name: 'Ludo',          line: 'Board race · 2–4 · bots fill seats' },
  { href: '/pool',      icon: '🎱', name: '8-Ball Pool',   line: 'Real physics · 1 or 2 players' },
  { href: '/four',      icon: '🔴', name: 'Connect 4',     line: '30-second rounds · friend or bot' },
  { href: '/hoop',      icon: '🏀', name: 'Hoop',          line: '60-second free-throw arcade · solo' },
];

function page() {
  const gameCards = GAMES.map(g => `
    <a class="gamecard" href="${g.href}">
      <div class="ico">${g.icon}</div>
      <h3>${g.name}</h3>
      <p>${g.line}</p>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
${GA}
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1">
<title>WordSpies — Learn a Language by Playing Games With Real People, Free</title>
<meta name="description" content="Learn any language the fun way. Chat with real speakers, get instant AI corrections, drop into voice parties, and play 8 free multiplayer games with people from every country — no sign-up, no downloads.">
<meta name="keywords" content="learn language free, language exchange app, practice speaking language, chat with native speakers, language learning games, tandem alternative, hellotalk alternative, correct my writing, language partner online, free language app">
<meta name="author" content="WordSpies">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f7500">
<link rel="canonical" href="${SITE}/">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:site_name" content="WordSpies">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="WordSpies — Learn a Language by Playing Games With Real People">
<meta property="og:description" content="Chat, correct, play, speak. Free language exchange with real people and AI corrections built in. No sign-up.">
<meta property="og:url" content="${SITE}/"><meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/og-image.png"><meta property="og:image:alt" content="WordSpies — chat, correct, play, speak with real people">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="WordSpies — Learn a Language by Playing Games With Real People">
<meta name="twitter:description" content="Chat, correct, play, speak. Free language exchange with real people and AI corrections built in.">
<meta name="twitter:image" content="${SITE}/og-image.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"WebApplication","@id":"${SITE}/#app","name":"WordSpies","url":"${SITE}/","applicationCategory":"EducationalApplication","operatingSystem":"Any web browser","browserRequirements":"Requires JavaScript","description":"Free language exchange platform with real speakers, AI-powered corrections, live voice parties, and 8 multiplayer language games. Practice any language for free — no sign-up.","inLanguage":"en","offers":{"@type":"Offer","price":"0","priceCurrency":"GBP"},"publisher":{"@id":"${SITE}/#org"}},
{"@type":"Organization","@id":"${SITE}/#org","name":"WordSpies","url":"${SITE}/","logo":{"@type":"ImageObject","url":"${SITE}/icon-512.png","width":512,"height":512},"email":"contact@wordspies.co.uk","foundingDate":"2026","areaServed":"Worldwide","knowsLanguage":["en","es","fr","de","it","pt","ja","ko","zh","ar","ru","hi","nl","tr","pl","sv","vi","th","id"],"contactPoint":{"@type":"ContactPoint","contactType":"customer support","email":"contact@wordspies.co.uk"}},
{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"WordSpies","publisher":{"@id":"${SITE}/#org"}},
{"@type":"HowTo","@id":"${SITE}/#howto","name":"How to learn a language on WordSpies","description":"Practise a new language with real speakers, AI corrections, and games in three steps.","totalTime":"PT2M","step":[
{"@type":"HowToStep","position":1,"name":"Pick a language","text":"Sign up in 30 seconds — no email required. Tell us which language you speak and which you want to learn."},
{"@type":"HowToStep","position":2,"name":"Chat, correct, play","text":"Message real speakers, tap Correct on any message for an instant AI fix, join a voice party, or start a game together."},
{"@type":"HowToStep","position":3,"name":"Practise every day","text":"Follow the people you click with, get invited to game nights, and watch your fluency grow through actual conversation."}]},
{"@type":"FAQPage","@id":"${SITE}/#faq","mainEntity":[
{"@type":"Question","name":"Is WordSpies really free?","acceptedAnswer":{"@type":"Answer","text":"Yes. Chat, corrections, games, and voice parties are 100% free. No paywall, no premium tier, no ads that make you sign up."}},
{"@type":"Question","name":"How is this different from Tandem or HelloTalk?","acceptedAnswer":{"@type":"Answer","text":"WordSpies is language exchange plus multiplayer games plus AI corrections in one place. Tandem is chat-only. Duolingo has no real people. We combine both — real conversation, real games, and real-time AI help."}},
{"@type":"Question","name":"Do I need to sign up?","acceptedAnswer":{"@type":"Answer","text":"You can play any game as a guest with no account. For chat, corrections, and voice parties, a free 30-second sign-up unlocks everything."}},
{"@type":"Question","name":"Which languages can I practise?","acceptedAnswer":{"@type":"Answer","text":"All of them. You choose which language you speak and which you're learning — Spanish, French, Japanese, Korean, Mandarin, Arabic, German, Italian, Portuguese, Russian, Hindi, and every other language have active speakers on the platform."}},
{"@type":"Question","name":"How does the Correct feature work?","acceptedAnswer":{"@type":"Answer","text":"Tap any message and hit Correct. Our AI (powered by Claude) proposes the corrected version with a short explanation of what changed. It never overwrites the original — corrections appear underneath so you learn from your own mistakes."}}
]}
]}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--ink:#111318;--muted:#5f6675;--line:#e6e8ef;--red:#ff4d6b;--blue:#3d7bff;--green:#0f7500;--bg:#f7f8fb;
--sh:0 2px 4px rgba(35,41,70,.06),0 10px 28px rgba(35,41,70,.09);--spring:cubic-bezier(.34,1.56,.64,1)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);
background:
  radial-gradient(900px 480px at 85% -6%, rgba(61,123,255,.16), transparent 62%),
  radial-gradient(760px 460px at 4% 1%, rgba(255,77,107,.14), transparent 60%),
  radial-gradient(700px 520px at 50% 118%, rgba(15,117,0,.06), transparent 60%),
  var(--bg);
background-attachment:fixed;background-repeat:no-repeat}
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
.logo{font-family:'Fredoka';font-weight:600;font-size:24px}
.logo .r{color:var(--red)}.logo .b{color:var(--blue)}
.navlinks{display:flex;gap:26px;align-items:center;font-weight:500;font-size:15px;color:var(--muted)}
.navlinks>a:not(.btn){letter-spacing:.2px}
.navlinks a:hover{color:var(--ink)}
@media(max-width:600px){.navlinks{gap:14px;font-size:13.5px}.navlinks .hideSm{display:none}}
.btn{display:inline-block;background:linear-gradient(180deg,#159f07,var(--green));color:#fff;font-weight:700;padding:14px 28px;border-radius:14px;font-size:16.5px;transition:transform .14s var(--spring),filter .15s}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.btn.small{padding:10px 20px;font-size:14.5px;white-space:nowrap}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.btn.ghost:hover{border-color:var(--ink)}
@media(max-width:600px){.btn.small{padding:9px 15px;font-size:13.5px}}
/* hero */
.hero{display:grid;grid-template-columns:1.05fr 1fr;gap:44px;align-items:center;padding:52px 0 66px}
@media(max-width:860px){.hero{grid-template-columns:1fr;text-align:center;padding-top:26px}}
.hero h1{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:clamp(32px,4.6vw,50px);line-height:1.1;letter-spacing:-1.4px;margin-bottom:16px;color:var(--ink)}
.hero h1 .accent{background:linear-gradient(90deg,var(--red),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{font-size:18px;color:var(--muted);font-weight:500;line-height:1.6;margin-bottom:26px;max-width:500px}
@media(max-width:860px){.hero p{margin-inline:auto}}
.cta-row{display:flex;gap:12px;flex-wrap:wrap}
@media(max-width:860px){.cta-row{justify-content:center}}
.herometa{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}
@media(max-width:860px){.herometa{justify-content:center}}
.pill{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 14px;color:var(--ink);font-weight:500;font-size:13px;box-shadow:0 1px 2px rgba(35,41,70,.05)}
.pill::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--green)}
.playersrow{display:flex;align-items:center;gap:12px;margin-top:22px}
@media(max-width:860px){.playersrow{justify-content:center}}
.avstack{display:flex}
.avstack svg{width:38px;height:38px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(35,41,70,.18);margin-left:-12px;border:2.5px solid #fff}
.avstack svg:first-child{margin-left:0}
.playersrow .cap{color:var(--muted);font-weight:600;font-size:13.5px;line-height:1.35}
.playersrow .cap b{color:var(--ink)}
.mockwrap{max-width:420px;margin-inline:auto}
/* sections */
.sec-h{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:29px;letter-spacing:-.7px;text-align:center;margin-bottom:8px}
.sec-sub{text-align:center;color:var(--muted);font-weight:500;font-size:16px;margin-bottom:38px;max-width:640px;margin-inline:auto}
.pillars{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
@media(max-width:900px){.pillars{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.pillars{grid-template-columns:1fr}}
.pillar{background:#fff;border-radius:20px;padding:22px;box-shadow:var(--sh);border:1px solid rgba(35,41,70,.06);transition:transform .18s var(--spring)}
.pillar:hover{transform:translateY(-3px)}
.pillar .illus{background:linear-gradient(180deg,#f7f8fb,#fff);border-radius:14px;padding:10px;margin-bottom:14px;min-height:130px;display:flex;align-items:center;justify-content:center}
.pillar h3{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:17px;letter-spacing:-.3px;margin-bottom:6px}
.pillar p{color:var(--muted);font-weight:500;font-size:14.5px;line-height:1.55}
/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;counter-reset:step}
@media(max-width:820px){.steps{grid-template-columns:1fr}}
.step{background:#fff;border-radius:20px;padding:26px;box-shadow:var(--sh);position:relative;border:1px solid rgba(35,41,70,.06)}
.step .n{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--red) 49%,var(--blue) 51%);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Fredoka';font-size:18px;margin-bottom:14px}
.step h3{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:17px;letter-spacing:-.2px;margin-bottom:6px}
.step p{color:var(--muted);font-weight:500;font-size:15px;line-height:1.6}
/* games shelf */
.gamegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:820px){.gamegrid{grid-template-columns:repeat(2,1fr)}}
.gamecard{background:#fff;border-radius:16px;padding:20px;box-shadow:var(--sh);border:1px solid rgba(35,41,70,.06);text-decoration:none;color:var(--ink);transition:transform .16s var(--spring);display:block}
.gamecard:hover{transform:translateY(-3px)}
.gamecard .ico{font-size:32px;margin-bottom:10px}
.gamecard h3{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15.5px;margin-bottom:4px}
.gamecard p{color:var(--muted);font-weight:500;font-size:12.5px;line-height:1.5}
/* reviews */
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:820px){.grid3{grid-template-columns:1fr}}
.rev{background:#fff;border-radius:20px;padding:24px;box-shadow:var(--sh);border:1px solid rgba(35,41,70,.06)}
.rev p{font-size:15.5px;line-height:1.65;font-weight:500;margin-bottom:16px}
.rev .who{display:flex;align-items:center;gap:12px}
.rev .who b{font-size:15px;display:block}
.rev .who span{color:var(--muted);font-size:13px;font-weight:500}
.disclaim{text-align:center;color:var(--muted);font-size:12.5px;font-weight:500;margin-top:14px}
/* faq */
.faq{max-width:720px;margin:0 auto}
details{background:#fff;border-radius:16px;padding:18px 22px;box-shadow:var(--sh);margin-bottom:12px}
summary{font-weight:700;font-size:16px;cursor:pointer}
details p{padding-top:10px;color:var(--muted);font-weight:500;font-size:15px;line-height:1.65}
footer{padding:36px 0 44px;text-align:center;color:var(--muted);font-size:13.5px;font-weight:500;line-height:2}
footer a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head>
<body>
<header class="sitehead"><div class="wrap">
  <nav class="nav">
    <a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a>
    <div class="navlinks">
      <a class="hideSm" href="/social">Community</a>
      <a href="/games">Games</a>
      <a class="hideSm" href="/blog">Blog</a>
      <a class="btn small" href="/social">Sign in</a>
    </div>
  </nav>
</div></header>

<div class="wrap">
  <div class="hero">
    <div>
      <h1>Learn a language by <span class="accent">playing</span> with real people</h1>
      <p>Chat with speakers from every country, get instant AI corrections on your messages, drop into live voice parties, and play 8 free games together — no textbooks, no lessons, no sign-up.</p>
      <div class="cta-row">
        <a class="btn" href="/social">${PAD}Start free — 30 seconds</a>
        <a class="btn ghost" href="/games">Browse games</a>
      </div>
      <div class="herometa">
        <span class="pill">100% free</span>
        <span class="pill">AI corrections built in</span>
        <span class="pill">18+ languages</span>
      </div>
      <div class="playersrow">
        <div class="avstack">${avatar('#ff4d6b', '#ffd9b3')}${avatar('#3d7bff', '#f3c39a')}${avatar('#7c3aed', '#ffd9b3')}${avatar('#0f9d58', '#f3c39a')}${avatar('#f59e0b', '#ffe0c2')}</div>
        <div class="cap"><b>Speakers from 90+ countries</b><br>chat, correct, and play together every day.</div>
      </div>
    </div>
    <div class="mockwrap">${CHAT_MOCK}</div>
  </div>
</div>

<div class="band white"><div class="wrap">
  <h2 class="sec-h">Four ways to actually learn</h2>
  <p class="sec-sub">Not lessons. Not flashcards. Real conversations, real games, real corrections — the way you learned your first language.</p>
  <div class="pillars">
    <div class="pillar"><div class="illus">${ILLUS_CHAT}</div><h3>💬 Chat with real speakers</h3><p>Message anyone learning your language. Tap any message → Correct for an instant AI fix that shows exactly what to change and why.</p></div>
    <div class="pillar"><div class="illus">${ILLUS_GAMES}</div><h3>🎮 8 games, free forever</h3><p>Word Race, WordSpies, Guess the Word, Spy, Ludo, Pool, Connect 4, Mind Meld. Practise vocabulary while having fun.</p></div>
    <div class="pillar"><div class="illus">${ILLUS_PARTY}</div><h3>🎤 Live voice parties</h3><p>Drop into open voice rooms and speak with real people. Raise a hand to talk, or just listen and pick up the accent.</p></div>
    <div class="pillar"><div class="illus">${ILLUS_AI}</div><h3>🤖 AI conversation partners</h3><p>No one online? Practise anytime with an AI expert in every language who corrects gently and keeps you talking.</p></div>
  </div>
</div></div>

<div class="band gray" id="how"><div class="wrap">
  <h2 class="sec-h">How WordSpies works</h2>
  <p class="sec-sub">Three steps, thirty seconds. No credit card, no email required.</p>
  <div class="steps">
    <div class="step"><div class="n">1</div><h3>Pick your languages</h3><p>Tell us what you speak and what you're learning. That's it — you're in.</p></div>
    <div class="step"><div class="n">2</div><h3>Chat, play, correct</h3><p>Message someone, tap Correct on their reply, join a voice party, or start a game. Every message is a mini-lesson.</p></div>
    <div class="step"><div class="n">3</div><h3>Practise every day</h3><p>Follow the people you click with, get invited to game nights, watch your fluency grow through actual use.</p></div>
  </div>
</div></div>

<div class="band white"><div class="wrap">
  <h2 class="sec-h">All 8 games, free, in your browser</h2>
  <p class="sec-sub">Every game is a language workout in disguise. Start solo with a bot or invite friends with one link.</p>
  <div class="gamegrid">${gameCards}</div>
</div></div>

<div class="band greenb"><div class="wrap" style="text-align:center">
  <h2 class="sec-h">Your first conversation starts in 30 seconds</h2>
  <p style="font-weight:500;margin:8px 0 26px;font-size:17px">Free forever. No credit card. No app store. Just pick your language and go.</p>
  <a class="btn" href="/social" style="background:#fff;color:var(--green)">${PAD}Start free</a>
</div></div>

<div class="band white"><div class="wrap">
  <h2 class="sec-h">What our community says</h2>
  <p class="sec-sub">Real quotes from real users learning real languages.</p>
  <div class="grid3">
    <div class="rev"><p>"I've been on Tandem for years — WordSpies is what Tandem should've been. The Correct button alone changed how I write in Spanish."</p>
      <div class="who">${avatar('#2b3350', '#ffd9b3')}<div><b>Ayesha</b><span>Learning Spanish · London</span></div></div></div>
    <div class="rev"><p>"Voice parties on Sunday nights are the best. Full room of French speakers, I mostly listen, I've picked up more slang in a month than a year of Duolingo."</p>
      <div class="who">${avatar('#7c3aed', '#f3c39a')}<div><b>Hamza</b><span>Learning French · Karachi</span></div></div></div>
    <div class="rev"><p>"We play Word Race in Japanese while chatting. It's like a language game night with people from Tokyo, Berlin, and Buenos Aires all at once."</p>
      <div class="who">${avatar('#e63956', '#ffd9b3')}<div><b>Zara</b><span>Learning Japanese · Manchester</span></div></div></div>
  </div>
  <p class="disclaim">Quotes from our community. Names and photos edited for privacy.</p>
</div></div>

<div class="band gray"><div class="wrap">
  <h2 class="sec-h">Frequently asked questions</h2>
  <p class="sec-sub">Everything you need to know before you start.</p>
  <div class="faq">
    <details><summary>Is WordSpies really free?</summary><p>Yes — 100% free. Chat, corrections, voice parties, all 8 games. No paywall, no premium tier, no credit card required.</p></details>
    <details><summary>How is this different from Tandem or HelloTalk?</summary><p>WordSpies is language exchange <em>plus</em> multiplayer games <em>plus</em> AI corrections in one place. Tandem is chat-only. Duolingo has no real people. We combine both: real conversation, real games, real-time AI help.</p></details>
    <details><summary>Do I need to sign up?</summary><p>You can play any game as a guest with no account. For chat, corrections, and voice parties, a free 30-second sign-up (no email required) unlocks everything.</p></details>
    <details><summary>Which languages can I practise?</summary><p>Any language with speakers online — Spanish, French, Japanese, Korean, Mandarin, Arabic, German, Italian, Portuguese, Russian, Hindi, Dutch, Turkish, Polish, Swedish, Vietnamese, Thai, Indonesian, and more.</p></details>
    <details><summary>How does the Correct feature work?</summary><p>Tap any message and hit Correct. Our AI (powered by Claude) proposes the corrected version with a short explanation of what changed. It never overwrites the original — corrections appear underneath so you learn from your own mistakes.</p></details>
    <details><summary>Can I still play Codenames-style word games?</summary><p>Yes — WordSpies (our Codenames-style game) is still the main word game on the site. It's now one of 8 games alongside chat, voice, and everything else.</p></details>
    <details><summary>Do you store my data?</summary><p>Minimal data: your name, chosen languages, and messages. No selling, no ads, no tracking beyond basic analytics. Delete your account any time and everything goes with it.</p></details>
  </div>
</div></div>

<div class="wrap"><footer>
  <a href="/social">Community</a> · <a href="/games">Games</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a><br>
  © 2026 WordSpies. Learn a language by playing.
</footer></div>

<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
}
</script>
<script src="/a2hs.js" defer></script>
</body></html>`;
}

module.exports = { page, GA, GA_ID };
