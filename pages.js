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
<div class="updated">Last updated: 31 July 2026</div>
<p>This Privacy Policy explains what WordSpies ("we", "us") collects, why, who processes it on our behalf, and the choices you have. We collect only what we need to run the service.</p>
<h2>Who we are</h2>
<p>WordSpies is a solo-developer project run from the United Kingdom. The data controller is Sibghatullah Khan. Contact: <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Account information</strong> — display name, email address, an optional birthdate (used for the 13+ age check), and a bcrypt hash of your password. If you sign in with Google, we receive your Google name, email and profile photo.</li>
<li><strong>Profile content</strong> — the profile photo, city, and short bio you choose to add.</li>
<li><strong>Messages, voice messages and party audio</strong> — direct messages (text, GIF selections, voice notes) are stored on our servers to deliver them. Live party audio is relayed in real time and is not recorded by us.</li>
<li><strong>Follows and social graph</strong> — who you follow and who follows you.</li>
<li><strong>Approximate location</strong> — derived from your IP address at sign-up to suggest your city. We do not collect precise GPS location.</li>
<li><strong>Technical logs</strong> — IP address, browser type, device type, and page requests for security and abuse prevention. Session cookies keep you signed in.</li>
<li><strong>Push notification identifiers</strong> — if you opt in to push notifications, we store the endpoint your browser gives us so we can deliver them.</li>
</ul>
<h2>How we use it</h2>
<ul>
<li>To let you sign in, message others, join parties, and play games.</li>
<li>To send you invite, message and follower notifications (email, push) that you have not disabled.</li>
<li>To keep the service secure and abuse-free (rate limits, block/report enforcement).</li>
<li>To understand aggregate usage via anonymised analytics.</li>
</ul>
<p>We do not sell your personal information. We do not use your messages or photos to train AI models.</p>
<h2>Who processes data on our behalf</h2>
<ul>
<li><strong>Google Sign-In</strong> (Google LLC) — authentication if you use "Sign in with Google".</li>
<li><strong>Cloudflare Realtime SFU</strong> (Cloudflare Inc.) — relays live party audio in real time. No recordings.</li>
<li><strong>Brevo</strong> (Sendinblue SAS) — transactional email (invites, password resets, notifications).</li>
<li><strong>DigitalOcean</strong> — server hosting (London, UK).</li>
<li><strong>Google Analytics</strong> — anonymised usage statistics.</li>
</ul>
<h2>Retention</h2>
<p>Account data is kept while your account is active. When you delete your account (Me → Delete account) we remove your profile, photo, messages, follows, and session tokens immediately. Server logs are kept for up to 30 days for abuse investigation.</p>
<h2>Your rights (UK/EU GDPR)</h2>
<p>You may access, correct, export or delete personal data we hold about you. Most is available inside the app; for anything else email <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a> and we will respond within 30 days. You may also complain to the UK Information Commissioner's Office at <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>.</p>
<h2>Age</h2>
<p>WordSpies is for users aged 13 and over. We do not knowingly collect personal information from children under 13. If you believe a child has an account, email us and we will remove it.</p>
<h2>Changes</h2>
<p>We may update this policy. Material changes will be reflected by the "Last updated" date above.</p>`;
  return layout('Privacy Policy — WordSpies', 'How WordSpies handles data: accounts, messages, party audio, and the third parties who process data on our behalf.', '/privacy', body);
}

function termsPage() {
  const body = `
<h1>Terms of Use</h1>
<div class="updated">Last updated: 31 July 2026</div>
<p>By creating an account or otherwise using WordSpies ("we", "us", "the service") you agree to these Terms of Use. If you do not agree, do not use the service.</p>
<h2>Who can use WordSpies</h2>
<p>You must be at least 13 years old to create an account. You agree to provide accurate information about yourself and to keep it accurate.</p>
<h2>Acceptable use</h2>
<p>You agree not to:</p>
<ul>
<li>Post, send or share content that is unlawful, abusive, hateful, harassing, sexually explicit, defamatory, or that infringes anyone else's rights.</li>
<li>Impersonate others, use fake profiles, use another person's photo without their permission, or misrepresent your identity.</li>
<li>Send unsolicited advertising, spam, malware or phishing.</li>
<li>Attempt to access, disrupt or overload the service, or reverse-engineer or scrape it.</li>
<li>Use the service to solicit money, sexual services, or personal information from other users.</li>
<li>Use the service in any way that endangers or exploits minors.</li>
</ul>
<h2>Zero-tolerance content</h2>
<p>The following are strictly prohibited and will result in immediate account termination and referral to law enforcement where required:</p>
<ul>
<li>Child sexual abuse material (CSAM) of any kind.</li>
<li>Content that grooms, sexualises or endangers minors.</li>
<li>Non-consensual intimate imagery.</li>
<li>Threats of violence, terrorism, or self-harm encouragement.</li>
</ul>
<p>To report such content immediately, email <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a>. We aim to respond within 24 hours.</p>
<h2>Reporting and moderation</h2>
<p>Every user profile and every message includes Report and Block controls. Reports are reviewed by us; we may remove content, warn users, suspend or delete accounts. We may also act without a report where we become aware of a serious violation.</p>
<h2>Your content</h2>
<p>You keep the rights to the content you post. You grant us a limited licence to store and display it so we can operate the service (for example, showing your message to the person you sent it to).</p>
<h2>Suspension and termination</h2>
<p>We may suspend or terminate your account for breach of these Terms. Where possible we will explain the reason. You may delete your account at any time from inside the app (Me → Delete account).</p>
<h2>The service is provided "as is"</h2>
<p>WordSpies is a free service provided without warranties. We do not guarantee it will always be available or free from bugs. To the maximum extent permitted by law we are not liable for indirect losses arising from your use of the service. Nothing here limits liability that cannot be limited under UK law.</p>
<h2>Contact</h2>
<p>General questions: <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a><br>Safety reports: <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a></p>
<h2>Changes</h2>
<p>We may update these terms. Continued use after changes means you accept the updated terms.</p>`;
  return layout('Terms of Use — WordSpies', 'The rules for using WordSpies: acceptable use, zero-tolerance content, reporting, and account termination.', '/terms', body);
}

// Google Play requires a publicly reachable Child Safety Standards page
// for any app in the Social category — regardless of whether the app
// actually has child users. Must name the app and the developer, and
// list our position and controls.
function childSafetyPage() {
  const body = `
<h1>Child Safety Standards</h1>
<div class="updated">Last updated: 31 July 2026</div>
<p>WordSpies takes the safety of minors seriously. This page describes the standards we apply and how to reach us.</p>
<h2>Our position</h2>
<p>WordSpies is intended for users aged 13 and over. Creating an account requires that you are at least 13. We do not knowingly permit anyone under 13 to use the service, and we do not knowingly collect personal information from children under 13.</p>
<p>Any content depicting, sexualising, grooming or endangering a minor is <strong>strictly and permanently prohibited</strong> and will result in immediate account termination and reporting to the appropriate authorities.</p>
<h2>What we do</h2>
<ul>
<li>13+ age gate at account creation.</li>
<li>A Report button on every message and every user profile.</li>
<li>A Block button on every user profile that hides them in both directions.</li>
<li>Server-side profanity and slur filtering on text messages.</li>
<li>Review of reports within 24 hours of receipt.</li>
<li>Removal of offending content and termination of offending accounts.</li>
<li>Reporting of any suspected child sexual abuse material to the National Center for Missing &amp; Exploited Children (NCMEC) in the United States and the Internet Watch Foundation (IWF) in the United Kingdom.</li>
</ul>
<h2>Reporting child safety concerns</h2>
<p>If you believe a user is under 13, or you become aware of content that endangers a minor, email <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a> immediately. Include as much detail as you safely can: the username in question, a link or screenshot if possible, and any context.</p>
<p>Suspected child sexual abuse material can also be reported directly to:</p>
<ul>
<li>United Kingdom: <a href="https://iwf.org.uk" rel="noopener" target="_blank">Internet Watch Foundation</a></li>
<li>United States: <a href="https://report.cybertip.org" rel="noopener" target="_blank">NCMEC CyberTipline</a></li>
</ul>
<h2>CSAM point of contact</h2>
<p>The designated point of contact for child sexual abuse material at WordSpies is Sibghatullah Khan, reachable at <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a>.</p>
<h2>About us</h2>
<p>WordSpies is a solo-developer project run from the United Kingdom by Sibghatullah Khan.</p>`;
  return layout('Child Safety Standards — WordSpies', 'Our standards for protecting minors: 13+ age gate, reporting, moderation, and the designated CSAM contact.', '/child-safety', body);
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

module.exports = { aboutPage, privacyPage, termsPage, howToPlayPage, childSafetyPage };
