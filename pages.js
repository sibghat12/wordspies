// Static info pages for WordSpies — About, Privacy Policy, Terms.
// Required for ad-network (AdSense) approval and general trust/SEO.
const SITE = 'https://wordspies.co.uk';
const GA_ID = 'G-JTH809Z8NH';
const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;

function layout(title, desc, path, body) {
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
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#fafafa;color:#1c1e21;margin:0}
.sitehead{background:#fff;border-bottom:1.5px solid #e6e8ef;position:sticky;top:0;z-index:50}
.hwrap{max-width:1080px;margin:0 auto;padding:0 20px}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.logo{font-family:'Fredoka',sans-serif;font-weight:600;font-size:23px;text-decoration:none;cursor:pointer}
.logo .r{color:#ff4d6b}.logo .b{color:#3d7bff}
.navlinks{display:flex;gap:34px;align-items:center;font-weight:500;font-size:14.5px;color:#5f6675}
.navlinks a{color:#5f6675;text-decoration:none}.navlinks a:hover{color:#1c1e21}
.play{background:#0f7500;color:#fff!important;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:12px;font-size:14px;white-space:nowrap}
@media(max-width:600px){.navlinks{gap:16px;font-size:14px}.navlinks .hideSm{display:none}.play{padding:9px 15px;font-size:13.5px}}
.play:hover{background:#0b5a00}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 70px}
h1{font-size:32px;line-height:1.2;letter-spacing:-.5px;margin:0 0 6px;font-weight:800}
.updated{color:#6b7280;font-size:14px;margin-bottom:28px}
h2{font-size:21px;margin:32px 0 10px;font-weight:700}
p,li{font-size:16.5px;line-height:1.75;color:#242628}
ul{padding-left:22px}li{margin-bottom:6px}
a{color:#0f7500}
footer{margin-top:44px;padding:36px 0 44px;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13.5px;font-weight:700;line-height:2;font-family:'Inter',sans-serif}
footer a{color:#1c1e21;text-decoration:underline;text-underline-offset:3px}
</style></head>
<body>
<header class="sitehead"><div class="hwrap">
<div class="top"><a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a><div class="navlinks"><a class="hideSm" href="/how-to-play">How to play</a><a class="hideSm" href="/about">About</a><a href="/blog">Blog</a><a class="play" href="/play">&#9654; Play Codenames</a></div></div>
</div></header>
<div class="wrap">
${body}
<footer>
<a href="/">Home</a> · <a href="/play">Play</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a><br>
© 2026 WordSpies. All rights reserved.
</footer>
</div></body></html>`;
}

function aboutPage() {
  const body = `
<h1>About WordSpies</h1>
<div class="updated">Get to know the game and the people behind it.</div>
<p>WordSpies is a free online word game for friends and families, inspired by the much-loved hidden-word party game format. Two teams race to identify their secret words from one-word clues given by their spymasters, while carefully avoiding the hidden assassin word. It plays in any web browser, on any phone or laptop, with no sign-up and no download.</p>
<h2>Why we built it</h2>
<p>We wanted a version of the word-guessing party game that anyone could start in ten seconds and play with friends anywhere — around a table, or spread across a video call. No accounts, no app store, no cost. Just type a name, share a four-letter code, and play.</p>
<h2>How it works</h2>
<p>One player creates a room and shares the code or invite link. Friends join from their own devices and split into two teams. Each team's spymaster gives one-word clues with a number, and teammates discuss and tap the words they think match. The first team to find all of their words wins — unless someone taps the assassin, which ends the game instantly.</p>
<h2>Who makes WordSpies</h2>
<p>WordSpies is an independent project built and maintained by a small team. We play, test and improve it continuously, and we genuinely read the feedback players send in.</p>
<h2>Get in touch</h2>
<p>Ideas, bug reports and kind words are all welcome at <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>
<h2>A note on trademarks</h2>
<p>WordSpies is an independent game and is not affiliated with, endorsed by, or connected to Codenames or Czech Games Edition. Any references to Codenames on this site are for descriptive comparison only, to help players understand the style of game WordSpies is.</p>`;
  return layout('About WordSpies — The Free Online Word Game', 'Learn about WordSpies, the free online Codenames-style word game for friends and families. How it works, who makes it, and how to get in touch.', '/about', body);
}

function privacyPage() {
  const body = `
<h1>Privacy Policy</h1>
<div class="updated">Last updated: 22 July 2026</div>
<p>This Privacy Policy explains what information WordSpies ("we", "us") collects when you use <a href="/">wordspies.co.uk</a> (the "Site"), how it is used, and the choices you have. We keep data collection to the minimum needed to run the game and understand how it is used.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Game information you provide:</strong> the display name you type when you create or join a game. This is stored only in your browser and in the temporary game room memory while you play, and is not linked to your real identity.</li>
<li><strong>No account data:</strong> WordSpies has no sign-up and no accounts. We do not collect your email address, password, or payment details, and we never ask for them to play.</li>
<li><strong>Local storage:</strong> we store a short session token and your chosen name in your browser's local storage so that refreshing the page returns you to your game. You can clear this at any time from your browser settings.</li>
<li><strong>Usage and analytics data:</strong> like most websites, we use analytics to understand how the Site is used (see below).</li>
</ul>
<h2>Cookies and analytics</h2>
<p>We use <strong>Google Analytics</strong> to understand aggregate, anonymised usage — for example how many games are played, how long they last, and which pages are popular. Google Analytics sets cookies and collects information such as your approximate location (country/region), device type, browser, and the pages you visit. This helps us improve the game. You can learn more at <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">Google's Privacy Policy</a>, and you can opt out using the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google Analytics Opt-out Browser Add-on</a>.</p>
<h2>Advertising</h2>
<p>We may in future display advertising on the Site, including through Google and its partners. When we do, third-party vendors, including Google, may use cookies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to the Site and/or other sites on the internet. You may opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">Google Ads Settings</a>, or opt out of some third-party vendors' use of cookies for personalised advertising at <a href="https://www.aboutads.info" rel="noopener" target="_blank">aboutads.info</a>. This section will be updated with specific ad-network details once advertising is enabled.</p>
<h2>How we use information</h2>
<ul>
<li>To run games and return you to your room after a refresh.</li>
<li>To understand and improve how the game and website are used.</li>
<li>To keep the Site secure and working correctly.</li>
</ul>
<p>We do not sell your personal information.</p>
<h2>Data retention</h2>
<p>Game rooms and the names in them exist only while a game is active and are cleared when rooms expire or the server restarts. Analytics data is retained by Google according to our configured retention settings and Google's policies.</p>
<h2>Children's privacy</h2>
<p>WordSpies is a family-friendly game, but it is not directed at children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will remove it.</p>
<h2>Your rights</h2>
<p>Depending on where you live, you may have rights to access, correct or delete personal data we hold about you. Because we hold almost no personal data, most requests can be satisfied simply by clearing your browser storage. For anything else, contact us below.</p>
<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. Material changes will be reflected by the "Last updated" date above.</p>
<h2>Contact</h2>
<p>Questions about this policy? Email <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>`;
  return layout('Privacy Policy — WordSpies', 'How WordSpies handles data: no accounts, minimal collection, Google Analytics for anonymised usage, and how cookies and advertising work.', '/privacy', body);
}

function termsPage() {
  const body = `
<h1>Terms of Use</h1>
<div class="updated">Last updated: 22 July 2026</div>
<p>By using <a href="/">wordspies.co.uk</a> (the "Site") you agree to these Terms of Use. If you do not agree, please do not use the Site.</p>
<h2>The service</h2>
<p>WordSpies is a free online word game provided "as is" and "as available". Features may change, and the Site may occasionally be unavailable or lose in-progress games (for example when the server restarts).</p>
<h2>Acceptable use</h2>
<ul>
<li>Play fairly and be respectful to other players.</li>
<li>Do not use names, clues or messages that are abusive, hateful, harassing, or unlawful.</li>
<li>Do not attempt to disrupt, overload, hack, or reverse-engineer the Site or its servers.</li>
<li>Do not use the Site for any unlawful purpose.</li>
</ul>
<p>We may block access or end games that breach these terms.</p>
<h2>Content and conduct</h2>
<p>You are responsible for the names and text you enter. WordSpies does not pre-moderate player-entered text and is not responsible for content created by players. Play with people you trust.</p>
<h2>Intellectual property</h2>
<p>The WordSpies name, design, code and content are owned by their creator. WordSpies is an independent game and is not affiliated with Codenames or Czech Games Edition; comparisons are descriptive only.</p>
<h2>Disclaimer and liability</h2>
<p>To the maximum extent permitted by law, WordSpies is provided without warranties of any kind, and we are not liable for any loss arising from your use of the Site, including lost games or unavailability. Nothing in these terms limits liability that cannot be limited under applicable law.</p>
<h2>Changes</h2>
<p>We may update these terms from time to time. Continued use of the Site after changes means you accept the updated terms.</p>
<h2>Contact</h2>
<p>Questions? Email <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>`;
  return layout('Terms of Use — WordSpies', 'The terms for using WordSpies, the free online word game: acceptable use, content, intellectual property and disclaimers.', '/terms', body);
}

// A canonical URL for "how to play". The old shared nav pointed at `/#how`,
// but `/` now serves the community app which has no such anchor — so every
// header link on the marketing / about / blog pages was dead-ending on a
// scroll that never happened. A real page also earns its own SEO.
function howToPlayPage() {
  const body = `
<h1>How to play WordSpies</h1>
<div class="updated">The free online Codenames-style word game — for 4 to 10+ friends, in about ten minutes.</div>
<p>WordSpies is a free online word game inspired by the party classic Codenames. Two teams — <b style="color:#ff4d6b">Red</b> and <b style="color:#3d7bff">Blue</b> — race to find their secret words on a five-by-five grid, using one-word clues from their spymasters, while carefully avoiding the assassin. Everyone plays from their own phone or laptop, so it works around a table or over a video call.</p>
<h2>What you need</h2>
<ul>
  <li>At least 4 players (2 per team). The sweet spot is 6–10.</li>
  <li>Each player on their own device — phone, tablet or laptop.</li>
  <li>No accounts, no downloads. Open the site and share a 4-letter code.</li>
</ul>
<h2>The five-step round</h2>
<ol>
  <li><b>Create a room.</b> Tap <a href="/play">▶ Play Codenames</a>, enter your name, and you'll get a four-letter code and shareable link. Send it to your friends.</li>
  <li><b>Split into teams.</b> Everyone joins Red or Blue. Each team picks one <b>Spymaster</b> — they see which words on the grid belong to which team. Everyone else is a <b>Guesser</b> and sees only the words.</li>
  <li><b>Spymaster gives a clue.</b> One word plus a number, like <b>OCEAN · 2</b>, linking two of your team's words. Clues must be single words unrelated to any word on the board.</li>
  <li><b>Guessers discuss and tap.</b> Guessers tap the words they think match the clue. Right answer? Keep going, up to the number given plus one. Wrong answer? Your turn ends — worse if you hit the other team's word, or a neutral one.</li>
  <li><b>First team to find all their words wins.</b> But watch out for the <b>assassin</b> — tap it by accident and your team loses instantly.</li>
</ol>
<h2>Tips for great clues</h2>
<ul>
  <li>Numbers matter. "OCEAN · 3" is bold; "OCEAN · 1" is safe. Bigger risks turn tighter games.</li>
  <li>Themes usually beat single connections. "SPORT · 2" for TENNIS and BASEBALL is stronger than a fragile pun.</li>
  <li>Avoid words that touch the assassin — a great clue that lands on it costs you the game.</li>
  <li>Guessers should think out loud. Half the fun is the arguments before the tap.</li>
</ul>
<h2>Playing remotely on a video call</h2>
<p>Keep your Zoom, Meet or FaceTime call running. Everyone opens WordSpies on their phone. Debates happen live on the call; the tapping happens on the phones. It's the same game — just louder.</p>
<h2>Frequently asked</h2>
<p><b>Is WordSpies really free?</b> Yes. No sign-up, no download, no ads on the game screen.</p>
<p><b>Can we play with 2 or 3?</b> Technically yes, but 4+ makes the game come alive. With just 2, our <a href="/meld">🧠 Mind Meld</a> or <a href="/four">🔴 Connect 4</a> are better fits.</p>
<p><b>What happens if my phone drops the connection?</b> Rejoin from the same link — the game reseats you.</p>
<p><b>Is this Codenames?</b> WordSpies is inspired by Codenames but is its own independent game, not affiliated with Codenames or Czech Games Edition.</p>
<div style="margin-top:32px;text-align:center">
  <a class="play" href="/play" style="display:inline-block">${'▶'} Start a game — takes ten seconds</a>
</div>`;
  return layout(
    'How to play WordSpies — A quick guide to the free Codenames-style word game',
    'A short, clear guide to playing WordSpies: teams, spymasters, clues, and how to win — plus tips for playing over video calls with friends.',
    '/how-to-play',
    body
  );
}

module.exports = { aboutPage, privacyPage, termsPage, howToPlayPage };
