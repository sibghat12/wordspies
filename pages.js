// Static info pages for TalkSibi — About, Privacy Policy, Terms.
// Required for ad-network (AdSense) approval and general trust/SEO.
const { SITE_FOOTER } = require('./landing.js');
const SITE = 'https://talksibi.com';
const GA_ID = 'G-JTH809Z8NH';
// Consent-gated GA. GDPR / UK-GDPR compliant: no analytics or ad
// cookies until the user taps 'Accept all' in the cookie modal.
// Choice is persisted in localStorage.ws_cc_v1 ('accept' | 'reject')
// so we never nag again. Owner ask 10 Aug 2026 v2.
const GA = `<script>
(function(){
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };
  window.wsLoadAnalytics = function(){
    if (window._wsGaLoaded) return; window._wsGaLoaded = true;
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_ID}';
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', '${GA_ID}', { anonymize_ip: true });
  };
  window.wsLoadAds = function(){
    if (window._wsAdsLoaded) return; window._wsAdsLoaded = true;
    // AdSense loader intentionally left as a hook — inject the
    // pagead2 script here once the publisher ID is set.
  };
  try {
    var c = localStorage.getItem('ws_cc_v1');
    if (c === 'accept') { wsLoadAnalytics(); wsLoadAds(); }
  } catch(e){}
})();
</script>`;
// Cookie consent modal — appended into every public layout. Shows
// once, remembers choice, dismisses cleanly. Two buttons: Accept all
// (loads analytics + ads) and Reject all (essential cookies only).
const CONSENT_MODAL = `
<style>
.ws-cc{position:fixed;inset:0;background:rgba(15,17,25,.6);display:none;align-items:center;justify-content:center;z-index:100000;padding:20px;font-family:'Inter',system-ui,sans-serif}
.ws-cc.on{display:flex;animation:wsccFade .2s ease}
@keyframes wsccFade{from{opacity:0}to{opacity:1}}
.ws-cc-card{background:#fff;border-radius:20px;max-width:440px;width:100%;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.32);text-align:left}
.ws-cc-card h3{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:20px;margin:0 0 8px;color:#111318}
.ws-cc-card p{font-size:14px;line-height:1.55;color:#4b5563;margin:0 0 16px}
.ws-cc-card p a{color:#0f7500;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.ws-cc-actions{display:flex;flex-direction:column;gap:8px}
.ws-cc-actions button{border:0;border-radius:12px;padding:12px;font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:15px;cursor:pointer;transition:filter .12s,background .12s}
.ws-cc-actions .ws-cc-accept{background:#0f7500;color:#fff}
.ws-cc-actions .ws-cc-accept:hover{filter:brightness(1.08)}
.ws-cc-actions .ws-cc-reject{background:#f3f4f6;color:#111318}
.ws-cc-actions .ws-cc-reject:hover{background:#e5e7eb}
</style>
<div class="ws-cc" id="wsCcBd" role="dialog" aria-modal="true" aria-labelledby="wsCcTitle">
  <div class="ws-cc-card">
    <h3 id="wsCcTitle">🍪 Cookies on TalkSibi</h3>
    <p>We use essential cookies to sign you in and keep the site working. With your permission we'd also like to use analytics + advertising cookies so we can understand traffic and (soon) show a few relevant ads on the home / blog pages. <a href="/privacy">Read the full policy</a>.</p>
    <div class="ws-cc-actions">
      <button class="ws-cc-accept" onclick="wsCcSet('accept')">Accept all</button>
      <button class="ws-cc-reject" onclick="wsCcSet('reject')">Reject all</button>
    </div>
  </div>
</div>
<script>
(function(){
  function show(){ var el = document.getElementById('wsCcBd'); if (el) el.classList.add('on'); }
  function hide(){ var el = document.getElementById('wsCcBd'); if (el) el.classList.remove('on'); }
  window.wsCcSet = function(choice){
    try { localStorage.setItem('ws_cc_v1', choice); } catch(e){}
    hide();
    if (choice === 'accept') {
      try { window.wsLoadAnalytics && wsLoadAnalytics(); } catch(e){}
      try { window.wsLoadAds && wsLoadAds(); } catch(e){}
    }
  };
  try {
    if (!localStorage.getItem('ws_cc_v1')) setTimeout(show, 350);
  } catch(e){ setTimeout(show, 350); }
})();
</script>`;

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
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" href="/icon-192.png">
<meta property="og:site_name" content="talksibi"><meta property="og:locale" content="en_GB">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og-image.svg"><meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
/* Owner ask v32: same header + footer as the landing page. Body
   zero padding, full-bleed surfaces. Hanken Grotesk brand font. */
body{font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;background:#ffffff;color:#14161f;margin:0;padding:0}
.sitehead{background:#ffffff;border-bottom:1px solid #e4e6ee;position:sticky;top:0;z-index:50;box-shadow:0 2px 8px rgba(15,17,25,.04)}
.hwrap{max-width:1200px;margin:0 auto;padding:0 48px}
@media(max-width:520px){.hwrap{padding:0 20px}}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px 0 32px}
.ts-headbrand{display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.ts-headbrand img{height:30px;width:auto;display:block}
.ts-headbrand .ts-wm{font-family:'Hanken Grotesk',sans-serif;font-weight:500;font-size:22px;letter-spacing:-.4px;color:#14161f}
.navlinks{display:flex;gap:22px;align-items:center;font-weight:600;font-size:14.5px;color:#4a4d59}
.navlinks a{color:#4a4d59;text-decoration:none}.navlinks a:hover{color:#14161f}
.navlinks .open{color:#fff;background:#5b6cff;padding:9px 18px;border-radius:99px;font-weight:700;box-shadow:0 4px 12px rgba(91,108,255,.28)}
.navlinks .open:hover{background:#4353e8}
@media(max-width:600px){.navlinks{gap:14px;font-size:13.5px}.navlinks a.hideSm{display:none}}
.wrap{max-width:760px;margin:0 auto;padding:40px 24px 70px}
h1{font-size:34px;line-height:1.2;letter-spacing:-.6px;margin:0 0 6px;font-weight:700}
.updated{color:#6b7280;font-size:14px;margin-bottom:28px}
h2{font-size:22px;margin:32px 0 10px;font-weight:700;letter-spacing:-.2px}
p,li{font-size:16.5px;line-height:1.75;color:#242628}
ul{padding-left:22px}li{margin-bottom:6px}
a{color:#14161f}
/* Site footer CSS lives inside SITE_FOOTER (landing.js). */
</style></head>
<body>
<header class="sitehead"><div class="hwrap">
<div class="top">
  <a class="ts-headbrand" href="/" aria-label="talksibi home">
    <img src="/logo.svg" alt="talksibi" onerror="this.outerHTML='<span class=&quot;ts-wm&quot;>talksibi</span>'">
  </a>
  <div class="navlinks">
    <a href="/" class="hideSm">Home</a>
    <a href="/blog" class="hideSm">Blog</a>
    <a class="open" href="/app">Open app</a>
  </div>
</div>
</div></header>
<div class="wrap">
${body}
</div>
${SITE_FOOTER}
</body></html>`;
}

function aboutPage() {
  const body = `
<h1>About TalkSibi</h1>
<div class="updated">Get to know the game and the people behind it.</div>
<p>TalkSibi is a free online word game for friends and families, inspired by the much-loved hidden-word party game format. Two teams race to identify their secret words from one-word clues given by their spymasters, while carefully avoiding the hidden assassin word. It plays in any web browser, on any phone or laptop, with no sign-up and no download.</p>
<h2>Why we built it</h2>
<p>We wanted a version of the word-guessing party game that anyone could start in ten seconds and play with friends anywhere — around a table, or spread across a video call. No accounts, no app store, no cost. Just type a name, share a four-letter code, and play.</p>
<h2>How it works</h2>
<p>One player creates a room and shares the code or invite link. Friends join from their own devices and split into two teams. Each team's spymaster gives one-word clues with a number, and teammates discuss and tap the words they think match. The first team to find all of their words wins — unless someone taps the assassin, which ends the game instantly.</p>
<h2>Who makes TalkSibi</h2>
<p>TalkSibi is an independent project built and maintained by a small team. We play, test and improve it continuously, and we genuinely read the feedback players send in.</p>
<h2>Get in touch</h2>
<p>Ideas, bug reports and kind words are all welcome at <a href="mailto:contact@talksibi.com">contact@talksibi.com</a>.</p>
<h2>A note on trademarks</h2>
<p>TalkSibi is an independent game and is not affiliated with, endorsed by, or connected to Codenames or Czech Games Edition. Any references to Codenames on this site are for descriptive comparison only, to help players understand the style of game TalkSibi is.</p>`;
  return layout('About TalkSibi — The Free Online Word Game', 'Learn about TalkSibi, the free online Codenames-style word game for friends and families. How it works, who makes it, and how to get in touch.', '/about', body);
}

function privacyPage() {
  const body = `
<h1>Privacy Policy</h1>
<div class="updated">Last updated: 1 August 2026</div>
<p>This Privacy Policy explains what TalkSibi ("we", "us") collects, why, who processes it on our behalf, and the choices you have. We collect only what we need to run the service.</p>
<h2>Who we are</h2>
<p>TalkSibi is an independent language-exchange community based in the United Kingdom. Contact: <a href="mailto:contact@talksibi.com">contact@talksibi.com</a>.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Account information</strong> — display name, email address, date of birth (used for the 18+ age check — required, we store the date you gave), and a bcrypt hash of your password. If you sign in with Google, we receive your Google name, email and profile photo, and you provide your date of birth to us the first time you sign in.</li>
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
<li><strong>Google AdSense &amp; advertising partners</strong> — if enabled, may display ads on pages such as the homepage and blog. Ad partners (Google and its network) may use cookies to serve ads based on your prior visits and interests. You can opt out of personalised ads at <a href="https://adssettings.google.com" rel="noopener" target="_blank">adssettings.google.com</a>. Ads are never shown on the community, chat, party, or game pages.</li>
</ul>
<h2>Cookies &amp; consent</h2>
<p>We use three kinds of cookies:</p>
<ul>
<li><strong>Essential</strong> — session cookies that keep you signed in and remember which chat / party you were in. These load without asking because the site cannot work without them.</li>
<li><strong>Analytics</strong> — anonymised page-view counts via Google Analytics. Only loaded after you accept cookies.</li>
<li><strong>Advertising</strong> — cookies set by Google AdSense and its partners to serve ads on marketing pages (home, blog). Only loaded after you accept cookies.</li>
</ul>
<p>The first time you visit we ask you to <strong>Accept all</strong> or <strong>Reject all</strong>. If you reject, analytics and advertising cookies never load — you can still use the whole site. You can change your choice any time by clearing site data in your browser settings and reloading.</p>
<h2>Retention</h2>
<p>Account data is kept while your account is active. When you delete your account (Me → Delete account) we remove your profile, photo, messages, follows, and session tokens immediately. Server logs are kept for up to 30 days for abuse investigation.</p>
<h2>Your rights (UK/EU GDPR)</h2>
<p>You may access, correct, export or delete personal data we hold about you. Most is available inside the app; for anything else email <a href="mailto:contact@talksibi.com">contact@talksibi.com</a> and we will respond within 30 days. You may also complain to the UK Information Commissioner's Office at <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>.</p>
<h2>Age</h2>
<p>TalkSibi is <strong>strictly for users aged 18 and over</strong>. We ask for your date of birth at sign-up and refuse to create an account if you are under 18. We do not knowingly collect personal information from anyone under 18. If you believe a person under 18 has an account, email <a href="mailto:safety@talksibi.com">safety@talksibi.com</a> and we will investigate and, where appropriate, remove the account.</p>
<p>To keep our community safe we may, in future, ask you to complete a one-time identity or age verification via a trusted third-party provider (for example a selfie-plus-ID-document check, or an email-verification step). We will not do this without notice, and we will not share any documents you provide with anyone other than the verification provider strictly to complete the check.</p>
<h2>Changes</h2>
<p>We may update this policy. Material changes will be reflected by the "Last updated" date above.</p>`;
  return layout('Privacy Policy — TalkSibi', 'How TalkSibi handles data: accounts, messages, party audio, and the third parties who process data on our behalf.', '/privacy', body);
}

function termsPage() {
  const body = `
<h1>Terms of Use</h1>
<div class="updated">Last updated: 1 August 2026</div>
<p>By creating an account or otherwise using TalkSibi ("we", "us", "the service") you agree to these Terms of Use. If you do not agree, do not use the service.</p>
<h2>Who can use TalkSibi</h2>
<p>You must be <strong>at least 18 years old</strong> to create an account or use TalkSibi. We ask for your date of birth at sign-up and refuse account creation if you are under 18. You agree to give accurate information about yourself, including your true date of birth, and to keep it accurate. Providing a false date of birth to circumvent the age gate is a breach of these Terms and will result in immediate account termination.</p>
<p>We may, at our discretion and to protect the community, ask you to complete a one-time identity or age verification via a trusted third-party provider (for example, verified email, or a selfie-plus-ID-document check). Refusing to complete such a check when we reasonably request it may result in your account being suspended.</p>
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
<p>To report such content immediately, email <a href="mailto:safety@talksibi.com">safety@talksibi.com</a>. We aim to respond within 24 hours.</p>
<h2>Reporting and moderation</h2>
<p>Every user profile and every message includes Report and Block controls. Reports are reviewed by us; we may remove content, warn users, suspend or delete accounts. We may also act without a report where we become aware of a serious violation.</p>
<h2>Your content</h2>
<p>You keep the rights to the content you post. You grant us a limited licence to store and display it so we can operate the service (for example, showing your message to the person you sent it to).</p>
<h2>Suspension and termination</h2>
<p>We may suspend or terminate your account for breach of these Terms. Where possible we will explain the reason. You may delete your account at any time from inside the app (Me → Delete account).</p>
<h2>The service is provided "as is"</h2>
<p>TalkSibi is a free service provided without warranties. We do not guarantee it will always be available or free from bugs. To the maximum extent permitted by law we are not liable for indirect losses arising from your use of the service. Nothing here limits liability that cannot be limited under UK law.</p>
<h2>Contact</h2>
<p>General questions: <a href="mailto:contact@talksibi.com">contact@talksibi.com</a><br>Safety reports: <a href="mailto:safety@talksibi.com">safety@talksibi.com</a></p>
<h2>Changes</h2>
<p>We may update these terms. Continued use after changes means you accept the updated terms.</p>`;
  return layout('Terms of Use — TalkSibi', 'The rules for using TalkSibi: acceptable use, zero-tolerance content, reporting, and account termination.', '/terms', body);
}

// Google Play requires a publicly reachable Child Safety Standards page
// for any app in the Social category — regardless of whether the app
// actually has child users. Must name the app and the developer, and
// list our position and controls.
function childSafetyPage() {
  const body = `
<h1>Child Safety Standards</h1>
<div class="updated">Last updated: 1 August 2026</div>
<p>TalkSibi takes the safety of minors seriously. This page describes the standards we apply and how to reach us.</p>
<h2>Our position</h2>
<p>TalkSibi is <strong>strictly for users aged 18 and over</strong>. Creating an account requires you to enter your date of birth; if it shows you are under 18 we refuse to create the account, do not issue a session, and prevent re-attempts on that email for a period. We do not knowingly permit anyone under 18 to use the service, and we do not knowingly collect personal information from anyone under 18.</p>
<p>Any content depicting, sexualising, grooming or endangering a minor is <strong>strictly and permanently prohibited</strong> and will result in immediate account termination and reporting to the appropriate authorities.</p>
<h2>What we do</h2>
<ul>
<li>18+ age gate at account creation — required date of birth, server-side re-verification, and a short-lived block on the email after any under-18 attempt.</li>
<li>We may in future add third-party identity or age verification (for example a selfie-plus-ID check) if we detect elevated risk on the platform.</li>
<li>A Report button on every message and every user profile.</li>
<li>A Block button on every user profile that hides them in both directions.</li>
<li>Server-side profanity and slur filtering on text messages.</li>
<li>Review of reports within 24 hours of receipt.</li>
<li>Removal of offending content and termination of offending accounts.</li>
<li>Reporting of any suspected child sexual abuse material to the National Center for Missing &amp; Exploited Children (NCMEC) in the United States and the Internet Watch Foundation (IWF) in the United Kingdom.</li>
</ul>
<h2>Reporting child safety concerns</h2>
<p>If you believe a user is under 18, or you become aware of content that endangers a minor, email <a href="mailto:safety@talksibi.com">safety@talksibi.com</a> immediately. Include as much detail as you safely can: the username in question, a link or screenshot if possible, and any context.</p>
<p>Suspected child sexual abuse material can also be reported directly to:</p>
<ul>
<li>United Kingdom: <a href="https://iwf.org.uk" rel="noopener" target="_blank">Internet Watch Foundation</a></li>
<li>United States: <a href="https://report.cybertip.org" rel="noopener" target="_blank">NCMEC CyberTipline</a></li>
</ul>
<h2>CSAM point of contact</h2>
<p>The designated point of contact for child sexual abuse material at TalkSibi is the TalkSibi safety team, reachable at <a href="mailto:safety@talksibi.com">safety@talksibi.com</a>.</p>
<h2>About us</h2>
<p>TalkSibi is an independent language-exchange community, based in the United Kingdom, reachable at <a href="mailto:contact@talksibi.com">contact@talksibi.com</a>.</p>`;
  return layout('Child Safety Standards — TalkSibi', 'Our standards for protecting minors: 13+ age gate, reporting, moderation, and the designated CSAM contact.', '/child-safety', body);
}

// A canonical URL for "how to play". The old shared nav pointed at `/#how`,
// but `/` now serves the community app which has no such anchor — so every
// header link on the marketing / about / blog pages was dead-ending on a
// scroll that never happened. A real page also earns its own SEO.
function howToPlayPage() {
  const body = `
<h1>How to play TalkSibi</h1>
<div class="updated">The free online Codenames-style word game — for 4 to 10+ friends, in about ten minutes.</div>
<p>TalkSibi is a free online word game inspired by the party classic Codenames. Two teams — <b style="color:#ff4d6b">Red</b> and <b style="color:#3d7bff">Blue</b> — race to find their secret words on a five-by-five grid, using one-word clues from their spymasters, while carefully avoiding the assassin. Everyone plays from their own phone or laptop, so it works around a table or over a video call.</p>
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
<p>Keep your Zoom, Meet or FaceTime call running. Everyone opens TalkSibi on their phone. Debates happen live on the call; the tapping happens on the phones. It's the same game — just louder.</p>
<h2>Frequently asked</h2>
<p><b>Is TalkSibi really free?</b> Yes. No sign-up, no download, no ads on the game screen.</p>
<p><b>Can we play with 2 or 3?</b> Technically yes, but 4+ makes the game come alive. With just 2, our <a href="/meld">🧠 Mind Meld</a> is a better fit.</p>
<p><b>What happens if my phone drops the connection?</b> Rejoin from the same link — the game reseats you.</p>
<p><b>Is this Codenames?</b> TalkSibi is inspired by Codenames but is its own independent game, not affiliated with Codenames or Czech Games Edition.</p>
<div style="margin-top:32px;text-align:center">
  <a class="play" href="/play" style="display:inline-block">${'▶'} Start a game — takes ten seconds</a>
</div>`;
  return layout(
    'How to play TalkSibi — A quick guide to the free Codenames-style word game',
    'A short, clear guide to playing TalkSibi: teams, spymasters, clues, and how to win — plus tips for playing over video calls with friends.',
    '/how-to-play',
    body
  );
}

// "Become a Teacher" — public application form. Owner ask 13 Aug 2026:
// first slice of the Teacher role from the full vision doc. Anyone
// (signed in or not) can submit their credentials + rate + bio; the
// application lands in Redis for the owner to review manually. No
// verification / payment / booking yet — this only opens the pipe.
function becomeTeacherPage() {
  const body = `
<style>
.bt-hero{text-align:center;padding:32px 20px 24px;background:linear-gradient(180deg,#fafbff,#eef1ff);border:1px solid #dce1ff;border-radius:22px;margin-bottom:28px}
.bt-hero-emoji{font-size:56px;line-height:1;margin-bottom:12px;filter:drop-shadow(0 4px 12px rgba(90,123,255,.25))}
.bt-hero h1{font-family:'Fredoka','Inter',sans-serif;font-weight:700;font-size:30px;letter-spacing:-.4px;margin:0 0 8px;color:#111318}
.bt-hero p{font-size:15px;line-height:1.6;color:#4b5563;margin:0 auto;max-width:520px;font-weight:500}
.bt-form{background:#fff;border:1px solid #e6e8ec;border-radius:22px;padding:28px;box-shadow:0 2px 12px rgba(20,30,60,.04)}
.bt-row{margin-bottom:20px}
.bt-row.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.bt-row.two{grid-template-columns:1fr}}
.bt-lbl{display:block;font-size:13.5px;font-weight:700;color:#374151;letter-spacing:.1px;margin-bottom:6px}
.bt-lbl .req{color:#ff4d6b;margin-left:2px}
.bt-in,.bt-area{width:100%;padding:12px 14px;border:1.5px solid #e6e8ec;border-radius:12px;font-family:inherit;font-size:14.5px;background:#fff;color:#111318;outline:none;transition:.14s;box-sizing:border-box}
.bt-in:focus,.bt-area:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.14)}
.bt-area{min-height:110px;resize:vertical;line-height:1.5}
.bt-hint{font-size:12px;color:#7b8090;margin-top:4px;font-weight:500;line-height:1.4}
.bt-submit{background:linear-gradient(135deg,#e8506b,#c93257);color:#fff;border:0;padding:15px 32px;border-radius:999px;font-family:'Inter',sans-serif;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 6px 20px rgba(232,80,107,.32);transition:.18s;width:100%;margin-top:8px}
.bt-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 26px rgba(232,80,107,.44)}
.bt-submit:disabled{opacity:.6;cursor:not-allowed}
.bt-note{font-size:12.5px;color:#7b8090;text-align:center;margin-top:14px;line-height:1.55}
.bt-msg{margin-top:16px;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:600;line-height:1.5;display:none}
.bt-msg.ok{display:block;background:#dcfce7;color:#0d6f3a;border:1px solid #bbf7d0}
.bt-msg.err{display:block;background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
.bt-thanks{display:none;text-align:center;padding:36px 24px;background:linear-gradient(180deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:22px}
.bt-thanks.on{display:block;animation:btPop .32s cubic-bezier(.16,1.11,.3,1.02)}
@keyframes btPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.bt-thanks-emoji{font-size:56px;margin-bottom:12px;line-height:1}
.bt-thanks h2{font-family:'Fredoka','Inter',sans-serif;font-weight:700;font-size:24px;color:#0d6f3a;margin:0 0 8px}
.bt-thanks p{color:#166534;font-size:14.5px;margin:0 auto;max-width:400px;line-height:1.6}
.bt-list{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0 32px}
@media(max-width:640px){.bt-list{grid-template-columns:1fr}}
.bt-perk{padding:16px;background:#fff;border:1px solid #e6e8ec;border-radius:14px;text-align:center}
.bt-perk-emoji{font-size:26px;margin-bottom:6px;line-height:1}
.bt-perk-t{font-weight:700;font-size:14px;color:#111318;margin-bottom:4px}
.bt-perk-s{font-size:12.5px;color:#5f6675;line-height:1.45}
</style>

<div class="bt-hero">
  <div class="bt-hero-emoji">🎓</div>
  <h1>Teach on TalkSibi</h1>
  <p>Fill out the form below to apply. We personally review every application. We'll get in touch by email once you're approved.</p>
</div>

<div class="bt-list">
  <div class="bt-perk"><div class="bt-perk-emoji">💰</div><div class="bt-perk-t">Set your own rate</div><div class="bt-perk-s">You choose your hourly price and availability.</div></div>
  <div class="bt-perk"><div class="bt-perk-emoji">🌍</div><div class="bt-perk-t">Global students</div><div class="bt-perk-s">Reach learners in dozens of countries.</div></div>
  <div class="bt-perk"><div class="bt-perk-emoji">🎥</div><div class="bt-perk-t">Built-in video lessons</div><div class="bt-perk-s">Teach live from the browser. No extra apps.</div></div>
</div>

<form class="bt-form" id="btForm" onsubmit="return btSubmit(event)">
  <div class="bt-row two">
    <div>
      <label class="bt-lbl" for="btName">Full name <span class="req">*</span></label>
      <input class="bt-in" id="btName" name="name" maxlength="60" required autocomplete="name">
    </div>
    <div>
      <label class="bt-lbl" for="btEmail">Email <span class="req">*</span></label>
      <input class="bt-in" id="btEmail" name="email" type="email" maxlength="100" required autocomplete="email">
    </div>
  </div>
  <div class="bt-row two">
    <div>
      <label class="bt-lbl" for="btCountry">Country</label>
      <input class="bt-in" id="btCountry" name="country" maxlength="40" placeholder="e.g. Spain" autocomplete="country-name">
    </div>
    <div>
      <label class="bt-lbl" for="btYears">Years teaching</label>
      <input class="bt-in" id="btYears" name="years" maxlength="6" placeholder="e.g. 3" inputmode="numeric">
    </div>
  </div>
  <div class="bt-row">
    <label class="bt-lbl" for="btLangs">Languages you can teach <span class="req">*</span></label>
    <input class="bt-in" id="btLangs" name="langs" maxlength="200" required placeholder="e.g. Spanish, English (up to C1)">
    <div class="bt-hint">Comma-separated. Include the level you're comfortable teaching each to.</div>
  </div>
  <div class="bt-row">
    <label class="bt-lbl" for="btQuals">Qualifications &amp; certifications</label>
    <textarea class="bt-area" id="btQuals" name="quals" maxlength="400" rows="3" placeholder="e.g. CELTA (2022), DELE examiner, MA Applied Linguistics — University of Barcelona"></textarea>
    <div class="bt-hint">Formal certifications, degrees, examiner status. Optional but strengthens your application.</div>
  </div>
  <div class="bt-row">
    <label class="bt-lbl" for="btBio">About you <span class="req">*</span></label>
    <textarea class="bt-area" id="btBio" name="bio" maxlength="1000" rows="4" required placeholder="Tell us about your teaching style, who you love working with, and why you'd be a great fit for TalkSibi."></textarea>
    <div class="bt-hint">150–500 words works well. Write it the way you'd introduce yourself to a first student.</div>
  </div>
  <div class="bt-row two">
    <div>
      <label class="bt-lbl" for="btRate">Hourly rate</label>
      <input class="bt-in" id="btRate" name="rate" maxlength="40" placeholder="e.g. £18 / hour">
    </div>
    <div>
      <label class="bt-lbl" for="btAvail">Availability</label>
      <input class="bt-in" id="btAvail" name="avail" maxlength="200" placeholder="e.g. Evenings CET, weekends">
    </div>
  </div>
  <div class="bt-row">
    <label class="bt-lbl" for="btPortfolio">Portfolio or demo video (URL)</label>
    <input class="bt-in" id="btPortfolio" name="portfolio" maxlength="200" placeholder="https://…" type="url">
    <div class="bt-hint">A YouTube link, personal website, or an intro video works best.</div>
  </div>
  <button class="bt-submit" id="btGo" type="submit">Send my application</button>
  <div class="bt-note">By submitting, you agree we'll email you at the address above about your application. See our <a href="/privacy">privacy policy</a>.</div>
  <div class="bt-msg" id="btMsg"></div>
</form>

<div class="bt-thanks" id="btThanks">
  <div class="bt-thanks-emoji">🎉</div>
  <h2>Application received</h2>
  <p>Thanks — we'll review it and get in touch by email. Meanwhile, join the community and see how TalkSibi works.</p>
  <p style="margin-top:20px"><a href="/social" style="background:#0d6f3a;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">← Back to community</a></p>
</div>

<script>
async function btSubmit(ev){
  ev.preventDefault();
  var btn = document.getElementById('btGo'), msg = document.getElementById('btMsg');
  btn.disabled = true; btn.textContent = 'Sending…'; msg.className = 'bt-msg'; msg.textContent = '';
  var body = {
    name: document.getElementById('btName').value,
    email: document.getElementById('btEmail').value,
    country: document.getElementById('btCountry').value,
    years: document.getElementById('btYears').value,
    langs: document.getElementById('btLangs').value,
    quals: document.getElementById('btQuals').value,
    bio: document.getElementById('btBio').value,
    rate: document.getElementById('btRate').value,
    avail: document.getElementById('btAvail').value,
    portfolio: document.getElementById('btPortfolio').value
  };
  try {
    var r = await fetch('/api/teacher/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var j = await r.json();
    if (!r.ok) throw new Error((j && j.error) || 'Could not send. Please try again.');
    document.getElementById('btForm').style.display = 'none';
    document.getElementById('btThanks').classList.add('on');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(e) {
    msg.className = 'bt-msg err'; msg.textContent = e.message || 'Something went wrong.';
    btn.disabled = false; btn.textContent = 'Send my application';
  }
  return false;
}
</script>`;
  return layout(
    'Teach on TalkSibi — become a language teacher',
    'Apply to teach on TalkSibi. Set your own rate, teach live from the browser, reach students worldwide.',
    '/become-a-teacher', body);
}

module.exports = { aboutPage, privacyPage, termsPage, howToPlayPage, childSafetyPage, becomeTeacherPage };
