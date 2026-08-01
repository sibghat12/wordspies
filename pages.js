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
body{font-family:'Inter',system-ui,sans-serif;background:#fafafa;color:#1c1e21;margin:0;padding-left:4%;padding-right:4%}
@media(min-width:769px){body{padding-left:10%;padding-right:10%}}
.sitehead{background:#fff;border-bottom:1.5px solid #e6e8ef;position:sticky;top:0;z-index:50}
.hwrap{max-width:1080px;margin:0 auto;padding:0 20px}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.logo{font-family:'Fredoka',sans-serif;font-weight:600;font-size:23px;text-decoration:none;cursor:pointer}
.logo .r{color:#ff4d6b}.logo .b{color:#3d7bff}
.navlinks{display:flex;gap:22px;align-items:center;font-weight:600;font-size:14.5px;color:#5f6675}
.navlinks a{color:#5f6675;text-decoration:none}.navlinks a:hover{color:#1c1e21}
.navlinks .open{color:#1c1e21;background:#f2f4f7;padding:8px 16px;border-radius:99px}
.navlinks .open:hover{background:#e6e9ee}
@media(max-width:600px){.navlinks{gap:12px;font-size:14px}}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 70px}
h1{font-size:32px;line-height:1.2;letter-spacing:-.5px;margin:0 0 6px;font-weight:800}
.updated{color:#6b7280;font-size:14px;margin-bottom:28px}
h2{font-size:21px;margin:32px 0 10px;font-weight:700}
p,li{font-size:16.5px;line-height:1.75;color:#242628}
ul{padding-left:22px}li{margin-bottom:6px}
a{color:#1c1e21}
/* Tandem-style four-column footer. Owner shared Tandem HTML on 1 Aug
   2026 as the reference; we mirror the same information architecture
   (Useful Info / Legal / Social / Site language + store badges) but
   in our own visual language. Content is centred within each column,
   columns collapse to two on tablet, one on phone. */
footer.sitefoot{margin-top:56px;padding:40px 20px 28px;border-top:1px solid #e5e7eb;background:#fff;font-family:'Inter',sans-serif;color:#5f6675;font-size:13px;line-height:1.5}
footer.sitefoot .fwrap{max-width:1080px;margin:0 auto}
footer.sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:36px 32px}
@media(max-width:840px){footer.sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
@media(max-width:520px){footer.sitefoot .fmenu{grid-template-columns:1fr;gap:28px}}
footer.sitefoot .fcol h4{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:14px;color:#1c1e21;letter-spacing:-.1px;margin:0 0 12px;text-transform:none}
footer.sitefoot .fcol a{display:block;color:#5f6675;text-decoration:none;font-size:13px;font-weight:500;padding:5px 0;transition:color .12s}
footer.sitefoot .fcol a:hover{color:#1c1e21}
/* Social icons row — clean SVG monochromes in a grid, matching the
   quiet greyscale palette Tandem uses. */
footer.sitefoot .fsocial-grid{display:grid;grid-template-columns:repeat(4,32px);gap:12px 12px;margin-top:2px}
footer.sitefoot .fsocial-grid a{padding:0;width:32px;height:32px;border-radius:50%;background:#f2f4f7;color:#5f6675;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
footer.sitefoot .fsocial-grid a:hover{background:#e5e8ee;color:#1c1e21}
footer.sitefoot .fsocial-grid svg{width:15px;height:15px;fill:currentColor}
/* App-store badges — solid black pills as before, stacked vertically
   inside the last column above the Site Language selector. */
footer.sitefoot .fstores{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
footer.sitefoot .stbadge{display:inline-flex;align-items:center;gap:10px;background:#000;color:#fff;text-decoration:none;padding:9px 14px;border-radius:12px;font-weight:600;font-size:13px;transition:transform .12s,background .12s;justify-content:flex-start}
footer.sitefoot .stbadge:hover{transform:translateY(-1px);background:#1a1a1a}
footer.sitefoot .stbadge span{display:flex;flex-direction:column;line-height:1.1;text-align:left}
footer.sitefoot .stbadge span small{font-size:9.5px;font-weight:500;letter-spacing:.02em;opacity:.75;text-transform:uppercase}
footer.sitefoot .stbadge span b{font-size:14px;font-weight:700;letter-spacing:.01em}
footer.sitefoot .stbadge svg{width:20px;height:20px;fill:#fff;flex:none}
/* Site-language selector (English only for now; dropdown a follow-up). */
footer.sitefoot .flang{display:inline-flex;align-items:center;gap:8px;background:#f2f4f7;border:1px solid #e5e8ee;border-radius:10px;padding:8px 12px;font-weight:600;font-size:13px;color:#1c1e21;cursor:default}
footer.sitefoot .flang .fflag{width:18px;height:18px;border-radius:50%;overflow:hidden;flex:none;font-size:14px;line-height:18px;text-align:center}
/* Sub-footer: copyright left, brand right. */
footer.sitefoot .fsub{margin-top:32px;padding-top:20px;border-top:1px solid #eef0f4;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
footer.sitefoot .fmeta{color:#8a8f99;font-size:12px;letter-spacing:.02em;line-height:1.6}
footer.sitefoot .fbrand{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:15px;color:#1c1e21;text-decoration:none;letter-spacing:-.2px}
footer.sitefoot .fbrand em{font-style:normal;color:#e8506b}
</style></head>
<body>
<header class="sitehead"><div class="hwrap">
<div class="top">
  <a class="logo" href="/"><span class="r">Word</span><span class="b">Spies</span></a>
  <div class="navlinks">
    <a href="/home" class="hideSm">Home</a>
    <a href="/about" class="hideSm">About</a>
    <a href="/blog" class="hideSm">Blog</a>
    <a class="open" href="/">Open app</a>
  </div>
</div>
</div></header>
<div class="wrap">
${body}
</div>
<footer class="sitefoot"><div class="fwrap">
  <div class="fmenu">
    <!-- Column 1 · Useful Information -->
    <div class="fcol">
      <h4>Useful Information</h4>
      <a href="/home">Home</a>
      <a href="/about">About us</a>
      <a href="/blog">Blog</a>
      <a href="/how-to-play">How it works</a>
      <a href="mailto:contact@wordspies.co.uk?subject=WordSpies%20—%20Bug%20report">Report a bug</a>
      <a href="mailto:contact@wordspies.co.uk?subject=WordSpies%20—%20Feature%20request">Request a feature</a>
      <a href="mailto:contact@wordspies.co.uk">Contact us</a>
    </div>
    <!-- Column 2 · Legal -->
    <div class="fcol">
      <h4>Legal</h4>
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/child-safety">Child Safety</a>
    </div>
    <!-- Column 3 · Social -->
    <div class="fcol">
      <h4>Social Media</h4>
      <div class="fsocial-grid">
        <a href="https://instagram.com/wordspies" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.64.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95C.27 21.31 2.69 23.73 7.05 23.93c1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95C23.73 2.69 21.31.27 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zm0 10.16a4 4 0 110-8 4 4 0 010 8zm6.4-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/></svg></a>
        <a href="https://x.com/wordspies" target="_blank" rel="noopener" aria-label="X"><svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
        <a href="https://tiktok.com/@wordspies" target="_blank" rel="noopener" aria-label="TikTok"><svg viewBox="0 0 24 24"><path d="M19.32 6.68a5.34 5.34 0 01-3.13-1.01 5.4 5.4 0 01-2.13-3.14V2.5h-3.3v11.68a3 3 0 11-2.05-2.83V8.02a6.3 6.3 0 105.35 6.24V8.83a8.6 8.6 0 005.26 1.78z"/></svg></a>
        <a href="https://facebook.com/wordspies" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.56 9.87v-6.98H7.9V12h2.54V9.8c0-2.5 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.98A10 10 0 0022 12z"/></svg></a>
        <a href="https://youtube.com/@wordspies" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.5 6.19a3 3 0 00-2.11-2.11C19.51 3.6 12 3.6 12 3.6s-7.51 0-9.39.48A3 3 0 00.5 6.19 31.6 31.6 0 000 12a31.6 31.6 0 00.5 5.81 3 3 0 002.11 2.11c1.88.48 9.39.48 9.39.48s7.51 0 9.39-.48a3 3 0 002.11-2.11A31.6 31.6 0 0024 12a31.6 31.6 0 00-.5-5.81zM9.6 15.6V8.4l6.24 3.6z"/></svg></a>
        <a href="mailto:contact@wordspies.co.uk" aria-label="Email"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></a>
      </div>
    </div>
    <!-- Column 4 · Store badges + language -->
    <div class="fcol">
      <div class="fstores">
        <a class="stbadge" href="#" title="Coming soon on the App Store">
          <svg viewBox="0 0 24 24"><path d="M17.72 12.71c-.02-2.36 1.93-3.5 2.02-3.55-1.1-1.6-2.81-1.82-3.42-1.85-1.45-.15-2.85.86-3.59.86-.75 0-1.89-.84-3.11-.82-1.6.02-3.07.93-3.9 2.36-1.66 2.87-.42 7.12 1.2 9.44.79 1.14 1.72 2.41 2.94 2.37 1.19-.05 1.63-.77 3.07-.77 1.43 0 1.83.77 3.08.75 1.28-.02 2.08-1.15 2.87-2.3.9-1.32 1.27-2.6 1.29-2.67-.03-.01-2.47-.95-2.49-3.77zM15.34 5.65c.65-.79 1.09-1.9.97-3-.94.04-2.07.63-2.75 1.42-.61.7-1.14 1.82-.99 2.9 1.05.08 2.12-.53 2.77-1.32z"/></svg>
          <span><small>Download on the</small><b>App Store</b></span>
        </a>
        <a class="stbadge" href="#" title="Coming soon on Google Play">
          <svg viewBox="0 0 24 24"><path d="M4.05 3.5C3.72 3.72 3.5 4.11 3.5 4.61v14.78c0 .5.22.89.55 1.11l8.35-8.5-8.35-8.5zM17.34 10.5l-2.62-1.51-8.15 8.13 10.77-6.62zM17.34 13.5l-10.77-6.63 8.15 8.13 2.62-1.5zM19.11 11.4l-2.32-1.34-2.7 1.94 2.7 1.94 2.32-1.34c.53-.31.53-1.09 0-1.4z"/></svg>
          <span><small>Get it on</small><b>Google Play</b></span>
        </a>
      </div>
      <h4>Site Language</h4>
      <div class="flang" title="More languages coming soon">
        <span class="fflag">🇬🇧</span> English
      </div>
    </div>
  </div>
  <div class="fsub">
    <div class="fmeta">© 2026 WordSpies — Practise languages with real people.<br>Independent language-exchange community, based in the United Kingdom.</div>
    <a class="fbrand" href="/">Word<em>Spies</em></a>
  </div>
</div></footer>
</body></html>`;
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
<div class="updated">Last updated: 1 August 2026</div>
<p>This Privacy Policy explains what WordSpies ("we", "us") collects, why, who processes it on our behalf, and the choices you have. We collect only what we need to run the service.</p>
<h2>Who we are</h2>
<p>WordSpies is an independent language-exchange community based in the United Kingdom. Contact: <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>
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
</ul>
<h2>Retention</h2>
<p>Account data is kept while your account is active. When you delete your account (Me → Delete account) we remove your profile, photo, messages, follows, and session tokens immediately. Server logs are kept for up to 30 days for abuse investigation.</p>
<h2>Your rights (UK/EU GDPR)</h2>
<p>You may access, correct, export or delete personal data we hold about you. Most is available inside the app; for anything else email <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a> and we will respond within 30 days. You may also complain to the UK Information Commissioner's Office at <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>.</p>
<h2>Age</h2>
<p>WordSpies is <strong>strictly for users aged 18 and over</strong>. We ask for your date of birth at sign-up and refuse to create an account if you are under 18. We do not knowingly collect personal information from anyone under 18. If you believe a person under 18 has an account, email <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a> and we will investigate and, where appropriate, remove the account.</p>
<p>To keep our community safe we may, in future, ask you to complete a one-time identity or age verification via a trusted third-party provider (for example a selfie-plus-ID-document check, or an email-verification step). We will not do this without notice, and we will not share any documents you provide with anyone other than the verification provider strictly to complete the check.</p>
<h2>Changes</h2>
<p>We may update this policy. Material changes will be reflected by the "Last updated" date above.</p>`;
  return layout('Privacy Policy — WordSpies', 'How WordSpies handles data: accounts, messages, party audio, and the third parties who process data on our behalf.', '/privacy', body);
}

function termsPage() {
  const body = `
<h1>Terms of Use</h1>
<div class="updated">Last updated: 1 August 2026</div>
<p>By creating an account or otherwise using WordSpies ("we", "us", "the service") you agree to these Terms of Use. If you do not agree, do not use the service.</p>
<h2>Who can use WordSpies</h2>
<p>You must be <strong>at least 18 years old</strong> to create an account or use WordSpies. We ask for your date of birth at sign-up and refuse account creation if you are under 18. You agree to give accurate information about yourself, including your true date of birth, and to keep it accurate. Providing a false date of birth to circumvent the age gate is a breach of these Terms and will result in immediate account termination.</p>
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
<div class="updated">Last updated: 1 August 2026</div>
<p>WordSpies takes the safety of minors seriously. This page describes the standards we apply and how to reach us.</p>
<h2>Our position</h2>
<p>WordSpies is <strong>strictly for users aged 18 and over</strong>. Creating an account requires you to enter your date of birth; if it shows you are under 18 we refuse to create the account, do not issue a session, and prevent re-attempts on that email for a period. We do not knowingly permit anyone under 18 to use the service, and we do not knowingly collect personal information from anyone under 18.</p>
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
<p>If you believe a user is under 18, or you become aware of content that endangers a minor, email <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a> immediately. Include as much detail as you safely can: the username in question, a link or screenshot if possible, and any context.</p>
<p>Suspected child sexual abuse material can also be reported directly to:</p>
<ul>
<li>United Kingdom: <a href="https://iwf.org.uk" rel="noopener" target="_blank">Internet Watch Foundation</a></li>
<li>United States: <a href="https://report.cybertip.org" rel="noopener" target="_blank">NCMEC CyberTipline</a></li>
</ul>
<h2>CSAM point of contact</h2>
<p>The designated point of contact for child sexual abuse material at WordSpies is the WordSpies safety team, reachable at <a href="mailto:safety@wordspies.co.uk">safety@wordspies.co.uk</a>.</p>
<h2>About us</h2>
<p>WordSpies is an independent language-exchange community, based in the United Kingdom, reachable at <a href="mailto:contact@wordspies.co.uk">contact@wordspies.co.uk</a>.</p>`;
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
