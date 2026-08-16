// TalkSibi marketing landing page — server-rendered at "/"
const SITE = 'https://talksibi.com';
const GA_ID = 'G-JTH809Z8NH';
// Consent-gated GA — mirrors pages.js. No analytics/ads cookies until
// the user taps 'Accept all' in the cookie modal (localStorage.ws_cc_v1).
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
  window.wsLoadAds = function(){ if (window._wsAdsLoaded) return; window._wsAdsLoaded = true; };
  try { var c = localStorage.getItem('ws_cc_v1'); if (c === 'accept') { wsLoadAnalytics(); wsLoadAds(); } } catch(e){}
})();
</script>`;
const CONSENT_MODAL = `
<style>
.ws-cc{position:fixed;inset:0;background:rgba(15,17,25,.6);display:none;align-items:center;justify-content:center;z-index:100000;padding:20px;font-family:'Inter',system-ui,sans-serif}
.ws-cc.on{display:flex;animation:wsccFade .2s ease}
@keyframes wsccFade{from{opacity:0}to{opacity:1}}
.ws-cc-card{background:#fff;border-radius:20px;max-width:440px;width:100%;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.32)}
.ws-cc-card h3{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:20px;margin:0 0 8px;color:#111318}
.ws-cc-card p{font-size:14px;line-height:1.55;color:#4b5563;margin:0 0 16px}
.ws-cc-card p a{color:#0f7500;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.ws-cc-actions{display:flex;flex-direction:column;gap:8px}
.ws-cc-actions button{border:0;border-radius:12px;padding:12px;font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:15px;cursor:pointer}
.ws-cc-actions .ws-cc-accept{background:#0f7500;color:#fff}
.ws-cc-actions .ws-cc-reject{background:#f3f4f6;color:#111318}
</style>
<div class="ws-cc" id="wsCcBd" role="dialog" aria-modal="true"><div class="ws-cc-card">
  <h3>🍪 Cookies on TalkSibi</h3>
  <p>We use essential cookies to sign you in. With your permission we'd also use analytics + advertising cookies on the home / blog pages. <a href="/privacy">Read the full policy</a>.</p>
  <div class="ws-cc-actions">
    <button class="ws-cc-accept" onclick="wsCcSet('accept')">Accept all</button>
    <button class="ws-cc-reject" onclick="wsCcSet('reject')">Reject all</button>
  </div>
</div></div>
<script>
(function(){
  window.wsCcSet = function(c){
    try { localStorage.setItem('ws_cc_v1', c); } catch(e){}
    var el = document.getElementById('wsCcBd'); if (el) el.classList.remove('on');
    if (c === 'accept') { try { wsLoadAnalytics(); wsLoadAds(); } catch(e){} }
  };
  try { if (!localStorage.getItem('ws_cc_v1')) setTimeout(function(){ var e=document.getElementById('wsCcBd'); if(e)e.classList.add('on'); }, 350); } catch(e){}
})();
</script>`;
module.exports.GA = GA;
module.exports.GA_ID = GA_ID;
module.exports.CONSENT_MODAL = CONSENT_MODAL;

// SITE_FOOTER — the single rich footer used on every public marketing
// / info page (home, about, privacy, terms, blog list, blog posts,
// become-a-teacher, etc.). Owner ask 13 Aug 2026: 'make footer same
// across all the pages please, everywhere.' Self-contained: includes
// its own <style> block + HTML so consumers just drop it in with
// ${SITE_FOOTER}. Classes are already namespaced (sitefoot, fwrap,
// fmenu, fcol, fsocial-grid, fstores, stbadge, flang, fsub, fmeta,
// fbrand) so collisions are unlikely.
const SITE_FOOTER = `
<style>
footer.sitefoot{margin-top:56px;padding:44px 24px 24px;background:#1a1d23;color:#a4a8b1;font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;border-top:0}
footer.sitefoot *{box-sizing:border-box}
footer.sitefoot .fwrap{max-width:1200px;margin:0 auto}
footer.sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:36px 32px;align-items:flex-start}
@media(max-width:840px){footer.sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
@media(max-width:520px){footer.sitefoot .fmenu{grid-template-columns:1fr;gap:28px}}
footer.sitefoot .fcol h4{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:15px;color:#fff;letter-spacing:-.1px;margin:0 0 14px}
footer.sitefoot .fcol a{display:block;color:#c9ccd4;text-decoration:none;font-size:13.5px;font-weight:500;padding:6px 0;transition:color .12s}
footer.sitefoot .fcol a:hover{color:#fff}
footer.sitefoot .fsocial-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px;max-width:220px}
footer.sitefoot .fsocial-grid a{padding:0;width:36px;height:36px;border-radius:50%;background:#2b2e36;color:#fff;display:inline-flex;align-items:center;justify-content:center;transition:background .12s;flex:none}
footer.sitefoot .fsocial-grid a:hover{background:#3b3f4a}
footer.sitefoot .fsocial-grid svg{width:16px;height:16px;fill:currentColor;display:block}
footer.sitefoot .fstores{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
footer.sitefoot .stbadge{display:inline-flex;align-items:center;gap:10px;background:#000;color:#fff;text-decoration:none;padding:9px 14px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #3b3f4a;transition:border-color .12s}
footer.sitefoot .stbadge:hover{border-color:#5b6070}
footer.sitefoot .stbadge span{display:flex;flex-direction:column;line-height:1.1;text-align:left}
footer.sitefoot .stbadge span small{font-size:9.5px;font-weight:500;letter-spacing:.02em;opacity:.75;text-transform:uppercase}
footer.sitefoot .stbadge span b{font-size:14px;font-weight:700;letter-spacing:.01em}
footer.sitefoot .stbadge svg{width:20px;height:20px;fill:#fff;flex:none}
footer.sitefoot .flang{display:inline-flex;align-items:center;gap:8px;background:transparent;border:0;padding:6px 0;font-weight:600;font-size:14px;color:#fff;cursor:default}
footer.sitefoot .flang .fflag{width:22px;height:22px;border-radius:50%;overflow:hidden;flex:none;font-size:16px;line-height:22px;text-align:center}
footer.sitefoot .flang .fchev{color:#a4a8b1;font-weight:400;margin-left:2px}
footer.sitefoot .fsub{margin-top:36px;padding-top:20px;border-top:1px solid #2b2e36;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
footer.sitefoot .fmeta{color:#7b8090;font-size:12px;letter-spacing:.02em;line-height:1.6}
footer.sitefoot .fbrand{font-family:'Fredoka','Inter',sans-serif;font-weight:600;font-size:16px;color:#fff;text-decoration:none;letter-spacing:-.2px}
footer.sitefoot .fbrand em{font-style:normal;color:#ff5a72}
</style>
<footer class="sitefoot"><div class="fwrap">
  <div class="fmenu">
    <div class="fcol">
      <h4>Useful Information</h4>
      <a href="/become-a-teacher" style="color:#ffd166;font-weight:700">🎓 Become a teacher</a>
      <a href="mailto:contact@talksibi.com?subject=TalkSibi%20—%20Bug%20report">Report a bug</a>
      <a href="mailto:contact@talksibi.com?subject=TalkSibi%20—%20Feature%20request">Request a feature</a>
      <a href="/how-to-play">FAQs</a>
      <a href="mailto:contact@talksibi.com">Contact us</a>
      <a href="/about">About us</a>
      <a href="/blog">Blog</a>
    </div>
    <div class="fcol">
      <h4>Legal</h4>
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/child-safety">Child Safety</a>
    </div>
    <div class="fcol">
      <h4>Social Media</h4>
      <div class="fsocial-grid">
        <a href="https://instagram.com/wordspies" target="_blank" rel="noopener" aria-label="Instagram">
          <svg viewBox="0 0 24 24"><path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.5.2 1.9.4a3.4 3.4 0 0 1 1.9 1.9c.2.4.3.9.4 1.9 0 1.1.1 1.4.1 4s0 3-.1 4c0 1-.2 1.5-.4 1.9a3.4 3.4 0 0 1-1.9 1.9c-.4.2-.9.3-1.9.4-1 0-1.3.1-4 .1s-3 0-4-.1c-1 0-1.5-.2-1.9-.4a3.4 3.4 0 0 1-1.9-1.9c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4c0-1 .2-1.5.4-1.9A3.4 3.4 0 0 1 4.6 4.2c.4-.2.9-.3 1.9-.4C7.4 3.7 7.7 3.7 12 3.7zm0-1.5c-2.7 0-3.1 0-4.1.1-1.1 0-1.9.2-2.5.5A4.9 4.9 0 0 0 3.3 5.4c-.3.6-.4 1.4-.5 2.5-.1 1-.1 1.4-.1 4.1s0 3.1.1 4.1c0 1.1.2 1.9.5 2.5a4.9 4.9 0 0 0 2.7 2.7c.6.3 1.4.4 2.5.5 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c1.1 0 1.9-.2 2.5-.5a4.9 4.9 0 0 0 2.7-2.7c.3-.6.4-1.4.5-2.5.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c0-1.1-.2-1.9-.5-2.5a4.9 4.9 0 0 0-2.7-2.7c-.6-.3-1.4-.4-2.5-.5-1-.1-1.4-.1-4.1-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zM18.4 5.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>
        </a>
        <a href="https://x.com/wordspies" target="_blank" rel="noopener" aria-label="X">
          <svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>
        </a>
        <a href="https://tiktok.com/@wordspies" target="_blank" rel="noopener" aria-label="TikTok">
          <svg viewBox="0 0 24 24"><path d="M17.4 3.4c-1.5 0-2.7-1.2-2.7-2.7v-.7h-3.3v14.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V8.6h-.8a6 6 0 1 0 6 6V8.9a6 6 0 0 0 3.8 1.3V7c-.4 0-.7-.1-1.1-.2-.4-.1-.8-.2-1.1-.4a5.4 5.4 0 0 1-2.7-3z"/></svg>
        </a>
        <a href="https://facebook.com/wordspies" target="_blank" rel="noopener" aria-label="Facebook">
          <svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8V12h2.4V9.9c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.4h-1.2c-1.2 0-1.5.7-1.5 1.5V12h2.6l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z"/></svg>
        </a>
        <a href="https://youtube.com/@wordspies" target="_blank" rel="noopener" aria-label="YouTube">
          <svg viewBox="0 0 24 24"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.6 4 12 4 12 4s-7.6 0-9.4.4A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.1 2.1C4.4 20 12 20 12 20s7.6 0 9.4-.4a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.5.5-5.5s0-3.6-.5-5.5zM9.6 15.6V8.4l6.4 3.6z"/></svg>
        </a>
        <a href="mailto:contact@talksibi.com" aria-label="Email">
          <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>
        </a>
      </div>
    </div>
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
        <span class="fflag">🇬🇧</span> English <span class="fchev">▾</span>
      </div>
    </div>
  </div>
  <div class="fsub">
    <div class="fmeta">© 2026 TalkSibi — Practise languages with real people.<br>Independent language-exchange community, based in the United Kingdom.</div>
    <a class="fbrand" href="/">Word<em>Spies</em></a>
  </div>
</div></footer>`;
module.exports.SITE_FOOTER = SITE_FOOTER;

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
// the single most valuable thing the app does that lesson apps don't do well.
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
  { href: '/play',      icon: '🕵', name: 'TalkSibi',     line: 'Codenames-style · 4–10+ players' },
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
<title>TalkSibi — Learn Any Language Free: Real People, Voice Chat & AI Corrections</title>
<meta name="description" content="Free language exchange with real speakers, one-tap AI grammar correction on every message, live voice parties, and 9 multiplayer games — Spanish, French, Japanese, and 20+ more. No sign-up, no downloads, no paywall.">
<meta name="keywords" content="learn language free, language exchange app, practice speaking language, chat with native speakers, language learning games, ai grammar correction, correct my writing, language partner online, free language app, voice chat language practice">
<meta name="author" content="TalkSibi">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f7500">
<link rel="canonical" href="${SITE}/">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:site_name" content="TalkSibi">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="TalkSibi — Learn Any Language Free: Real People, Voice & AI Corrections">
<meta property="og:description" content="Free language exchange with real speakers, AI grammar corrections on every message, live voice parties, and 9 free games. Spanish, French, Japanese, 20+ more.">
<meta property="og:url" content="${SITE}/"><meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/og-image.png"><meta property="og:image:alt" content="TalkSibi — chat, correct, play, speak with real people">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="TalkSibi — Learn Any Language Free: Real People, Voice & AI Corrections">
<meta name="twitter:description" content="Free language exchange with real speakers, AI grammar corrections, voice parties, and 9 free games. 20+ languages.">
<meta name="twitter:image" content="${SITE}/og-image.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"WebApplication","@id":"${SITE}/#app","name":"TalkSibi","url":"${SITE}/","applicationCategory":"EducationalApplication","operatingSystem":"Any web browser","browserRequirements":"Requires JavaScript","description":"Free language exchange platform with real speakers, AI-powered corrections, live voice parties, and 8 multiplayer language games. Practice any language for free — no sign-up.","inLanguage":"en","offers":{"@type":"Offer","price":"0","priceCurrency":"GBP"},"publisher":{"@id":"${SITE}/#org"}},
{"@type":"Organization","@id":"${SITE}/#org","name":"TalkSibi","url":"${SITE}/","logo":{"@type":"ImageObject","url":"${SITE}/icon-512.png","width":512,"height":512},"email":"contact@talksibi.com","foundingDate":"2026","areaServed":"Worldwide","knowsLanguage":["en","es","fr","de","it","pt","ja","ko","zh","ar","ru","hi","nl","tr","pl","sv","vi","th","id"],"contactPoint":{"@type":"ContactPoint","contactType":"customer support","email":"contact@talksibi.com"}},
{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"TalkSibi","publisher":{"@id":"${SITE}/#org"}},
{"@type":"HowTo","@id":"${SITE}/#howto","name":"How to learn a language on TalkSibi","description":"Practise a new language with real speakers, AI corrections, and games in three steps.","totalTime":"PT2M","step":[
{"@type":"HowToStep","position":1,"name":"Pick a language","text":"Sign up in 30 seconds — no email required. Tell us which language you speak and which you want to learn."},
{"@type":"HowToStep","position":2,"name":"Chat, correct, play","text":"Message real speakers, tap Correct on any message for an instant AI fix, join a voice party, or start a game together."},
{"@type":"HowToStep","position":3,"name":"Practise every day","text":"Follow the people you click with, get invited to game nights, and watch your fluency grow through actual conversation."}]},
{"@type":"FAQPage","@id":"${SITE}/#faq","mainEntity":[
{"@type":"Question","name":"Is TalkSibi really free?","acceptedAnswer":{"@type":"Answer","text":"Yes. Chat, corrections, games, and voice parties are 100% free. No paywall, no premium tier, no ads that make you sign up."}},
{"@type":"Question","name":"How is TalkSibi different from other language apps?","acceptedAnswer":{"@type":"Answer","text":"TalkSibi is language exchange plus multiplayer games plus AI corrections in one place — real conversations with real speakers, plus games you play together, plus one-tap grammar corrections powered by AI. Free forever."}},
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
/* Flag grid — Lingopie-style language shelf. Big, bright, tappable. */
.flaggrid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
@media(max-width:900px){.flaggrid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:520px){.flaggrid{grid-template-columns:repeat(3,1fr);gap:10px}}
.flagcard{background:#fff;border-radius:16px;padding:18px 12px;text-align:center;text-decoration:none;color:var(--ink);border:1.5px solid var(--line);transition:transform .16s var(--spring),border-color .12s,box-shadow .16s;display:flex;flex-direction:column;align-items:center;gap:8px}
.flagcard:hover{transform:translateY(-4px);border-color:var(--green);box-shadow:0 12px 28px rgba(15,117,0,.12)}
.flagcard .fl{font-size:36px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.1))}
.flagcard b{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:14.5px;letter-spacing:-.2px}
@media(max-width:520px){.flagcard{padding:14px 8px}.flagcard .fl{font-size:30px}.flagcard b{font-size:13px}}
.flagfoot{text-align:center;color:var(--muted);font-weight:500;font-size:14.5px;margin-top:24px}
/* Alternating feature strips (image ⇄ text). */
.strip{display:grid;grid-template-columns:1fr 1.15fr;gap:44px;align-items:center;padding:36px 0}
.strip + .strip{border-top:1px dashed rgba(35,41,70,.1)}
.strip-rev{grid-template-columns:1.15fr 1fr}
.strip-rev .strip-art{order:2}
.strip-rev .strip-txt{order:1}
@media(max-width:820px){.strip,.strip-rev{grid-template-columns:1fr;gap:20px;padding:28px 0;text-align:center}.strip-rev .strip-art{order:1}.strip-rev .strip-txt{order:2}}
.strip-art{background:linear-gradient(160deg,#fff,#f7f8fb);border-radius:20px;padding:24px;box-shadow:var(--sh);max-width:420px;justify-self:center;width:100%}
.strip-txt .strip-tag{display:inline-block;background:var(--caccent-soft,#eef1ff);color:var(--green);font-weight:800;font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;padding:5px 11px;border-radius:99px;margin-bottom:12px}
.strip-txt h3{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:24px;letter-spacing:-.6px;line-height:1.2;margin-bottom:12px;color:var(--ink)}
.strip-txt p{color:var(--muted);font-weight:500;font-size:16px;line-height:1.55}
@media(max-width:820px){.strip-txt h3{font-size:22px}.strip-txt p{font-size:15px}}
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
/* footer{} rules removed — SITE_FOOTER carries its own styles. */
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
        <span class="pill">100% free forever</span>
        <span class="pill">AI corrections built in</span>
        <span class="pill">Real people from 90+ countries</span>
        <span class="pill">👑 Founders program — invite 5 friends, get 1 year free</span>
      </div>
      <div class="playersrow">
        <div class="avstack">${avatar('#ff4d6b', '#ffd9b3')}${avatar('#3d7bff', '#f3c39a')}${avatar('#7c3aed', '#ffd9b3')}${avatar('#0f9d58', '#f3c39a')}${avatar('#f59e0b', '#ffe0c2')}</div>
        <div class="cap"><b>Speakers from 90+ countries</b><br>chat, correct, and play together every day.</div>
      </div>
    </div>
    <div class="mockwrap">${CHAT_MOCK}</div>
  </div>
</div>

<!-- Language flag grid — Lingopie-style 'pick your language' shelf. -->
<div class="band white"><div class="wrap">
  <h2 class="sec-h">Learn any of these 24 languages, free</h2>
  <p class="sec-sub">Tap a language to sign up and start chatting with real speakers in seconds. Every language, every level — beginner to fluent.</p>
  <div class="flaggrid">
    <a href="/social" class="flagcard"><span class="fl">🇪🇸</span><b>Spanish</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇫🇷</span><b>French</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇩🇪</span><b>German</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇮🇹</span><b>Italian</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇵🇹</span><b>Portuguese</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇳🇱</span><b>Dutch</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇸🇪</span><b>Swedish</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇵🇱</span><b>Polish</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇬🇷</span><b>Greek</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇹🇷</span><b>Turkish</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇷🇺</span><b>Russian</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇺🇦</span><b>Ukrainian</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇸🇦</span><b>Arabic</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇮🇷</span><b>Persian</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇮🇱</span><b>Hebrew</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇮🇳</span><b>Hindi</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇧🇩</span><b>Bengali</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇵🇰</span><b>Urdu</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇯🇵</span><b>Japanese</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇰🇷</span><b>Korean</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇨🇳</span><b>Mandarin</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇻🇳</span><b>Vietnamese</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇹🇭</span><b>Thai</b></a>
    <a href="/social" class="flagcard"><span class="fl">🇮🇩</span><b>Indonesian</b></a>
  </div>
  <p class="flagfoot">Learning something else? Pick 'Other' at signup — every language works.</p>
</div></div>

<!-- Alternating feature strips (Lingopie-style). Image ⇄ text on
     each row so the eye tracks down the page naturally. -->
<div class="band gray"><div class="wrap">
  <div class="strip">
    <div class="strip-art">${ILLUS_CHAT}</div>
    <div class="strip-txt">
      <div class="strip-tag">💬 Chat</div>
      <h3>Text real speakers. Get instant AI corrections.</h3>
      <p>Message anyone learning your language. Tap "Correct" on any message and our AI proposes the fixed version underneath — plus a short line explaining what changed ("past tense · missing article"). Your original stays visible so you learn from the mistake, not around it.</p>
    </div>
  </div>
  <div class="strip strip-rev">
    <div class="strip-art">${ILLUS_GAMES}</div>
    <div class="strip-txt">
      <div class="strip-tag">🎮 9 games</div>
      <h3>Learn by playing — vocabulary that actually sticks.</h3>
      <p>Word Race, Word Chain, TalkSibi, Guess the Word, Spy, Ludo, 8-Ball Pool, Connect 4, Hoop. Play in your target language and every round builds real vocabulary in real context. Solo or with a friend — one shared link, no downloads.</p>
    </div>
  </div>
  <div class="strip">
    <div class="strip-art">${ILLUS_PARTY}</div>
    <div class="strip-txt">
      <div class="strip-tag">🎤 Voice</div>
      <h3>Drop into live voice parties. Listen first, speak when ready.</h3>
      <p>Open audio rooms with speakers from around the world. Join as a listener — hear the rhythm, pick up slang, no pressure to talk. Raise your hand when you're ready and speak with the room. This is the fastest way to break the speaking wall.</p>
    </div>
  </div>
  <div class="strip strip-rev">
    <div class="strip-art">${ILLUS_AI}</div>
    <div class="strip-txt">
      <div class="strip-tag">🤖 AI partners</div>
      <h3>No one online? Practise with an AI conversation partner.</h3>
      <p>Three built-in AI experts (British, American, Australian) with real voices — always available, patient, and honest with corrections. Perfect for warm-ups before a real conversation, or late-night practice when nobody's awake.</p>
    </div>
  </div>
</div></div>

<div class="band gray" id="how"><div class="wrap">
  <h2 class="sec-h">How TalkSibi works</h2>
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
    <div class="rev"><p>"I've tried loads of language apps — TalkSibi is the first one that mixes real people with proper AI corrections. The Correct button alone changed how I write in Spanish."</p>
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
    <details><summary>Is TalkSibi really free?</summary><p>Yes — 100% free. Chat, corrections, voice parties, all 8 games. No paywall, no premium tier, no credit card required.</p></details>
    <details><summary>How is TalkSibi different from other language apps?</summary><p>TalkSibi is language exchange <em>plus</em> multiplayer games <em>plus</em> AI corrections in one place — real conversations with real speakers, games you play together, and one-tap grammar corrections powered by AI. Free forever.</p></details>
    <details><summary>Do I need to sign up?</summary><p>You can play any game as a guest with no account. For chat, corrections, and voice parties, a free 30-second sign-up (no email required) unlocks everything.</p></details>
    <details><summary>Which languages can I practise?</summary><p>Any language with speakers online — Spanish, French, Japanese, Korean, Mandarin, Arabic, German, Italian, Portuguese, Russian, Hindi, Dutch, Turkish, Polish, Swedish, Vietnamese, Thai, Indonesian, and more.</p></details>
    <details><summary>How does the Correct feature work?</summary><p>Tap any message and hit Correct. Our AI (powered by Claude) proposes the corrected version with a short explanation of what changed. It never overwrites the original — corrections appear underneath so you learn from your own mistakes.</p></details>
    <details><summary>Can I still play Codenames-style word games?</summary><p>Yes — TalkSibi (our Codenames-style game) is still the main word game on the site. It's now one of 8 games alongside chat, voice, and everything else.</p></details>
    <details><summary>Do you store my data?</summary><p>Minimal data: your name, chosen languages, and messages. No selling, no ads, no tracking beyond basic analytics. Delete your account any time and everything goes with it.</p></details>
  </div>
</div></div>

${SITE_FOOTER}

<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
}
</script>
<script src="/a2hs.js" defer></script>
${CONSENT_MODAL}
</body></html>`;
}

module.exports = { page, GA, GA_ID, CONSENT_MODAL, SITE_FOOTER };
