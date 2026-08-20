// TalkSibi marketing landing page — server-rendered at "/".
// Rebuilt 16 Aug 2026 from design_handoff_talksibi_rebrand 2/landing-standalone.html
// + README.md spec. Design tokens, colors, radii, animations, section order,
// and copy all match the DC handoff. GA, CONSENT_MODAL, and SITE_FOOTER blocks
// are preserved unchanged — they're consumed by blog.js and pages.js.
const SITE = 'https://talksibi.com';
const GA_ID = 'G-JTH809Z8NH';
const ADS_ID = 'AW-638211258';   // Google Ads conversion tag
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
    gtag('config', '${ADS_ID}');
  };
  window.wsLoadAds = function(){ if (window._wsAdsLoaded) return; window._wsAdsLoaded = true; };
  try { var c = localStorage.getItem('ws_cc_v1'); if (c === 'accept') { wsLoadAnalytics(); wsLoadAds(); } } catch(e){}
})();
</script>`;
const CONSENT_MODAL = `
<style>
.ws-cc{position:fixed;inset:0;background:rgba(15,17,25,.6);display:none;align-items:center;justify-content:center;z-index:100000;padding:20px;font-family:'Hanken Grotesk','Inter',system-ui,sans-serif}
.ws-cc.on{display:flex;animation:wsccFade .2s ease}
@keyframes wsccFade{from{opacity:0}to{opacity:1}}
.ws-cc-card{background:#fff;border-radius:20px;max-width:440px;width:100%;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.32)}
.ws-cc-card h3{font-weight:600;font-size:20px;margin:0 0 8px;color:#16181f}
.ws-cc-card p{font-size:14px;line-height:1.55;color:#4a4d59;margin:0 0 16px}
.ws-cc-card p a{color:#5b6cff;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.ws-cc-actions{display:flex;flex-direction:column;gap:8px}
.ws-cc-actions button{border:0;border-radius:12px;padding:12px;font-weight:600;font-size:15px;cursor:pointer;font-family:inherit}
.ws-cc-actions .ws-cc-accept{background:#5b6cff;color:#fff}
.ws-cc-actions .ws-cc-reject{background:#f3f4f6;color:#16181f}
</style>
<div class="ws-cc" id="wsCcBd" role="dialog" aria-modal="true"><div class="ws-cc-card">
  <h3>🍪 Cookies on talksibi</h3>
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
//
// The landing itself uses the design-handoff-native inline footer
// further down (per README §41). Other pages still get this one.
const SITE_FOOTER = `
<style>
/* Footer (v34): mobile 12px sides / desktop 48px sides. White bg. */
footer.sitefoot{margin-top:56px;padding:44px 12px 24px;background:#ffffff;color:#4a4d59;font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;border-top:1px solid #e4e6ee}
@media(min-width:769px){footer.sitefoot{padding:44px 48px 28px}}
footer.sitefoot *{box-sizing:border-box}
footer.sitefoot .fwrap{max-width:1200px;margin:0 auto}
footer.sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:36px 32px;align-items:flex-start}
@media(max-width:840px){footer.sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
@media(max-width:520px){footer.sitefoot .fmenu{grid-template-columns:1fr;gap:28px}}
footer.sitefoot .fcol h4{font-weight:700;font-size:14.5px;color:#14161f;letter-spacing:-.1px;margin:0 0 14px}
footer.sitefoot .fcol a{display:block;color:#4a4d59;text-decoration:none;font-size:13.5px;font-weight:500;padding:6px 0;transition:color .12s}
footer.sitefoot .fcol a:hover{color:#14161f}
footer.sitefoot .fsocial-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px;max-width:220px}
footer.sitefoot .fsocial-grid a{padding:0;width:36px;height:36px;border-radius:50%;background:#f4f5f9;color:#4a4d59;border:1px solid #e4e6ee;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s;flex:none}
footer.sitefoot .fsocial-grid a:hover{background:#eef0f5;color:#14161f}
footer.sitefoot .fsocial-grid svg{width:16px;height:16px;fill:currentColor;display:block}
footer.sitefoot .fstores{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
footer.sitefoot .stbadge{display:inline-flex;align-items:center;gap:10px;background:#14161f;color:#fff;text-decoration:none;padding:9px 14px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #14161f;transition:opacity .12s}
footer.sitefoot .stbadge:hover{opacity:.86}
footer.sitefoot .stbadge span{display:flex;flex-direction:column;line-height:1.1;text-align:left}
footer.sitefoot .stbadge span small{font-size:9.5px;font-weight:500;letter-spacing:.02em;opacity:.75;text-transform:uppercase}
footer.sitefoot .stbadge span b{font-size:14px;font-weight:700;letter-spacing:.01em}
footer.sitefoot .stbadge svg{width:20px;height:20px;fill:#fff;flex:none}
footer.sitefoot .flang{display:inline-flex;align-items:center;gap:8px;background:transparent;border:0;padding:6px 0;font-weight:600;font-size:14px;color:#14161f;cursor:default}
footer.sitefoot .flang .fflag{width:22px;height:22px;border-radius:50%;overflow:hidden;flex:none;font-size:16px;line-height:22px;text-align:center}
footer.sitefoot .flang .fchev{color:#8a8d99;font-weight:400;margin-left:2px}
footer.sitefoot .fsub{margin-top:36px;padding-top:20px;border-top:1px solid #e4e6ee;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
footer.sitefoot .fmeta{color:#8a8d99;font-size:12px;letter-spacing:.02em;line-height:1.6}
footer.sitefoot .fbrand{font-weight:600;font-size:16px;color:#14161f;text-decoration:none;letter-spacing:-.2px}
footer.sitefoot .fbrand em{font-style:normal;color:#5b6cff}
</style>
<footer class="sitefoot"><div class="fwrap">
  <div class="fmenu">
    <div class="fcol">
      <h4>Useful Information</h4>
      <a href="/become-a-teacher" style="color:#ffd166;font-weight:700">🎓 Become a teacher</a>
      <a href="mailto:contact@talksibi.com?subject=talksibi%20—%20Bug%20report">Report a bug</a>
      <a href="mailto:contact@talksibi.com?subject=talksibi%20—%20Feature%20request">Request a feature</a>
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
        <a href="https://instagram.com/talksibi" target="_blank" rel="noopener" aria-label="Instagram">
          <svg viewBox="0 0 24 24"><path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.5.2 1.9.4a3.4 3.4 0 0 1 1.9 1.9c.2.4.3.9.4 1.9 0 1.1.1 1.4.1 4s0 3-.1 4c0 1-.2 1.5-.4 1.9a3.4 3.4 0 0 1-1.9 1.9c-.4.2-.9.3-1.9.4-1 0-1.3.1-4 .1s-3 0-4-.1c-1 0-1.5-.2-1.9-.4a3.4 3.4 0 0 1-1.9-1.9c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4c0-1 .2-1.5.4-1.9A3.4 3.4 0 0 1 4.6 4.2c.4-.2.9-.3 1.9-.4C7.4 3.7 7.7 3.7 12 3.7zm0-1.5c-2.7 0-3.1 0-4.1.1-1.1 0-1.9.2-2.5.5A4.9 4.9 0 0 0 3.3 5.4c-.3.6-.4 1.4-.5 2.5-.1 1-.1 1.4-.1 4.1s0 3.1.1 4.1c0 1.1.2 1.9.5 2.5a4.9 4.9 0 0 0 2.7 2.7c.6.3 1.4.4 2.5.5 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c1.1 0 1.9-.2 2.5-.5a4.9 4.9 0 0 0 2.7-2.7c.3-.6.4-1.4.5-2.5.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c0-1.1-.2-1.9-.5-2.5a4.9 4.9 0 0 0-2.7-2.7c-.6-.3-1.4-.4-2.5-.5-1-.1-1.4-.1-4.1-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zM18.4 5.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>
        </a>
        <a href="https://x.com/talksibi" target="_blank" rel="noopener" aria-label="X">
          <svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>
        </a>
        <a href="https://tiktok.com/@talksibi" target="_blank" rel="noopener" aria-label="TikTok">
          <svg viewBox="0 0 24 24"><path d="M17.4 3.4c-1.5 0-2.7-1.2-2.7-2.7v-.7h-3.3v14.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V8.6h-.8a6 6 0 1 0 6 6V8.9a6 6 0 0 0 3.8 1.3V7c-.4 0-.7-.1-1.1-.2-.4-.1-.8-.2-1.1-.4a5.4 5.4 0 0 1-2.7-3z"/></svg>
        </a>
        <a href="https://facebook.com/talksibi" target="_blank" rel="noopener" aria-label="Facebook">
          <svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8V12h2.4V9.9c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.4h-1.2c-1.2 0-1.5.7-1.5 1.5V12h2.6l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z"/></svg>
        </a>
        <a href="https://youtube.com/@talksibi" target="_blank" rel="noopener" aria-label="YouTube">
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
    <div class="fmeta">© 2026 talksibi — Practise languages with real people.<br>Independent language-exchange community, based in the United Kingdom.</div>
    <a class="fbrand ts-lockup" href="/" style="color:#14161f;text-decoration:none;display:inline-flex;align-items:center;gap:6px">
      <img class="ts-mark" src="/mark.svg?v=22" alt="" style="width:24px;height:24px" onerror="this.style.display='none'">
      <span class="ts-wordmark" style="font-size:18px;color:#14161f">talksibi</span>
    </a>
  </div>
</div></footer>`;
module.exports.SITE_FOOTER = SITE_FOOTER;

// ── Shared TalkSibi chrome (ts-nav + ts-foot) — exported so blog.js,
// static pages etc. can drop the landing's exact header + footer in
// with two template strings + one <style> block. Owner ask 17 Aug 2026:
// "the blog page has not same header as the landing page — copy the
// header and footer into the blog archive and single pages".
// -----------------------------------------------------------------------

// Unified site chrome — same .topnav + .sitefoot the community app
// (social.html) and the standalone game pages use, so landing / blog
// / static / games / app all read as one site. Owner ask 20 Aug 2026.
const TS_CHROME_CSS = `
nav.topnav{position:sticky;top:0;background:#ffffff;z-index:200;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;padding:12px 20px;min-height:60px;width:100%;margin:0;box-sizing:border-box;border-bottom:1px solid #e4e6ee;font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;color:#16181f}
@media(min-width:769px){nav.topnav{padding:12px 48px}}
nav.topnav > *{min-width:0}
nav.topnav .tnlogo{font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;font-weight:600;font-size:22px;text-decoration:none;color:inherit;letter-spacing:-.3px;justify-self:start;display:inline-flex;align-items:center}
nav.topnav .tntabs{display:flex;gap:4px;justify-self:center;min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
nav.topnav .tntabs::-webkit-scrollbar{display:none}
nav.topnav .tntabs .tnt{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;border-radius:99px;padding:8px 16px;font-family:inherit;font-size:14px;font-weight:500;color:#6b6e7a;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s;flex-shrink:0;letter-spacing:-.1px;text-decoration:none}
nav.topnav .tntabs .tnt:hover{color:#16181f;background:#f4f5f7}
nav.topnav .tntabs .tnt.on{color:#4a55c9;background:#f3f4fb}
nav.topnav .tnright{display:flex;gap:8px;align-items:center;justify-self:end}
nav.topnav .tnlink{color:#4a4d59;text-decoration:none;font-weight:600;font-size:13.5px;padding:8px 14px;border-radius:10px;transition:background .12s,color .12s;white-space:nowrap}
nav.topnav .tnlink:hover{background:#f4f5f7;color:#16181f}
nav.topnav .tnjoin{background:#16181f;color:#fff !important;padding:9px 18px;border-radius:99px;font-weight:500;transition:background .15s;text-decoration:none;white-space:nowrap;font-size:13.5px}
nav.topnav .tnjoin:hover{background:#2a2e42}
@media(max-width:720px){
  nav.topnav{grid-template-columns:1fr auto;grid-template-areas:'logo right';padding:calc(12px + env(safe-area-inset-top)) 20px 12px}
  nav.topnav .tnlogo{grid-area:logo;font-size:19px}
  nav.topnav .tnright{grid-area:right}
  nav.topnav .tntabs{display:none}
  nav.topnav .tnlink{padding:6px 10px;font-size:12.5px}
  nav.topnav .tnjoin{padding:7px 14px;font-size:12.5px}
}
footer.sitefoot{margin:36px 0 0;padding:36px 12px 22px;background:#ffffff;color:#4a4d59;font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;border-top:1px solid #e4e6ee;width:100%;box-sizing:border-box}
@media(min-width:769px){footer.sitefoot{padding:44px 48px 28px}}
footer.sitefoot .fwrap{max-width:1200px;margin:0 auto}
footer.sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 28px;align-items:flex-start}
@media(max-width:840px){footer.sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}}
@media(max-width:420px){footer.sitefoot .fmenu{grid-template-columns:1fr;gap:24px}}
footer.sitefoot .fcol h4{font-weight:700;font-size:14.5px;color:#14161f;letter-spacing:-.1px;margin:0 0 12px}
footer.sitefoot .fcol a{display:block;color:#4a4d59;text-decoration:none;font-size:13px;font-weight:500;padding:5px 0;transition:color .12s}
footer.sitefoot .fcol a:hover{color:#14161f}
footer.sitefoot .fsocial-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;max-width:220px}
footer.sitefoot .fsocial-grid a{padding:0;width:34px;height:34px;border-radius:50%;background:#f4f5f9;color:#4a4d59;border:1px solid #e4e6ee;display:inline-flex;align-items:center;justify-content:center;transition:.12s;flex:none}
footer.sitefoot .fsocial-grid a:hover{background:#eef0f5;color:#14161f}
footer.sitefoot .fsocial-grid svg{width:15px;height:15px;fill:currentColor;display:block}
footer.sitefoot .fsub{margin-top:28px;padding-top:18px;border-top:1px solid #e4e6ee;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
footer.sitefoot .fmeta{color:#8a8d99;font-size:11.5px;letter-spacing:.02em;line-height:1.55}
footer.sitefoot .fbrand{display:inline-flex;align-items:center;gap:6px;text-decoration:none}
footer.sitefoot .fbrand img{height:22px;width:auto;display:block}
footer.sitefoot .fbrand .fbrand-t{font-weight:500;letter-spacing:-.3px;font-size:17px;color:#14161f}
/* Shared page padding token — every content area inherits. */
:root{--page-pad-x:20px;--page-pad-y:16px}
@media(min-width:769px){:root{--page-pad-x:48px;--page-pad-y:20px}}
`;

const TS_NAV = `<nav class="topnav">
  <a class="tnlogo" href="/" aria-label="talksibi home">
    <img src="/logo.svg?v=24" alt="talksibi" style="height:30px;width:auto;display:block" onerror="this.outerHTML='<span style=&quot;font-family:Hanken Grotesk,Inter,sans-serif;font-weight:600;font-size:21px;color:#000&quot;>talksibi</span>'">
  </a>
  <div class="tntabs" role="tablist">
    <a class="tnt" href="/app/community">Community</a>
    <a class="tnt" href="/app/chats">Chats</a>
    <a class="tnt" href="/app/parties">Social</a>
    <a class="tnt" href="/app/learn">Learn</a>
    <a class="tnt" href="/app/games">Games</a>
  </div>
  <div class="tnright">
    <a class="tnlink" href="/app">Sign in</a>
    <a class="tnjoin" href="/app">Join app</a>
  </div>
</nav>`;

const TS_FOOTER_TS = `<footer class="sitefoot"><div class="fwrap">
  <div class="fmenu">
    <div class="fcol">
      <h4>Product</h4>
      <a href="/app">Community</a>
      <a href="/games">Games</a>
      <a href="/blog">Blog</a>
      <a href="/how-to-play">FAQs</a>
      <a href="/about">About us</a>
    </div>
    <div class="fcol">
      <h4>Support</h4>
      <a href="mailto:contact@talksibi.com?subject=talksibi%20—%20Bug%20report">Report a bug</a>
      <a href="mailto:feedback@talksibi.com?subject=Feedback">Send feedback</a>
      <a href="/become-a-teacher" style="color:#ffd166;font-weight:700">🎓 Become a teacher</a>
      <a href="mailto:contact@talksibi.com">Contact us</a>
    </div>
    <div class="fcol">
      <h4>Legal</h4>
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/child-safety">Child Safety</a>
    </div>
    <div class="fcol">
      <h4>Social</h4>
      <div class="fsocial-grid">
        <a href="https://instagram.com/talksibi" target="_blank" rel="noopener" aria-label="Instagram">
          <svg viewBox="0 0 24 24"><path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.5.2 1.9.4a3.4 3.4 0 0 1 1.9 1.9c.2.4.3.9.4 1.9 0 1.1.1 1.4.1 4s0 3-.1 4c0 1-.2 1.5-.4 1.9a3.4 3.4 0 0 1-1.9 1.9c-.4.2-.9.3-1.9.4-1 0-1.3.1-4 .1s-3 0-4-.1c-1 0-1.5-.2-1.9-.4a3.4 3.4 0 0 1-1.9-1.9c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4c0-1 .2-1.5.4-1.9A3.4 3.4 0 0 1 4.6 4.2c.4-.2.9-.3 1.9-.4C7.4 3.7 7.7 3.7 12 3.7zm0-1.5c-2.7 0-3.1 0-4.1.1-1.1 0-1.9.2-2.5.5A4.9 4.9 0 0 0 3.3 5.4c-.3.6-.4 1.4-.5 2.5-.1 1-.1 1.4-.1 4.1s0 3.1.1 4.1c0 1.1.2 1.9.5 2.5a4.9 4.9 0 0 0 2.7 2.7c.6.3 1.4.4 2.5.5 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c1.1 0 1.9-.2 2.5-.5a4.9 4.9 0 0 0 2.7-2.7c.3-.6.4-1.4.5-2.5.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c0-1.1-.2-1.9-.5-2.5a4.9 4.9 0 0 0-2.7-2.7c-.6-.3-1.4-.4-2.5-.5-1-.1-1.4-.1-4.1-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zM18.4 5.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>
        </a>
        <a href="https://x.com/talksibi" target="_blank" rel="noopener" aria-label="X">
          <svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>
        </a>
        <a href="https://tiktok.com/@talksibi" target="_blank" rel="noopener" aria-label="TikTok">
          <svg viewBox="0 0 24 24"><path d="M17.4 3.4c-1.5 0-2.7-1.2-2.7-2.7v-.7h-3.3v14.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V8.6h-.8a6 6 0 1 0 6 6V8.9a6 6 0 0 0 3.8 1.3V7c-.4 0-.7-.1-1.1-.2-.4-.1-.8-.2-1.1-.4a5.4 5.4 0 0 1-2.7-3z"/></svg>
        </a>
        <a href="https://youtube.com/@talksibi" target="_blank" rel="noopener" aria-label="YouTube">
          <svg viewBox="0 0 24 24"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.6 4 12 4 12 4s-7.6 0-9.4.4A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.1 2.1C4.4 20 12 20 12 20s7.6 0 9.4-.4a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.5.5-5.5s0-3.6-.5-5.5zM9.6 15.6V8.4l6.4 3.6z"/></svg>
        </a>
      </div>
    </div>
  </div>
  <div class="fsub">
    <div class="fmeta">© ${new Date().getFullYear()} talksibi — Connect · Learn · Play. Practise languages with real people.</div>
    <a class="fbrand" href="/" aria-label="talksibi home">
      <img src="/mark.svg?v=24" alt="" onerror="this.style.display='none'">
      <span class="fbrand-t">talksibi</span>
    </a>
  </div>
</div></footer>`;

module.exports.TS_CHROME_CSS = TS_CHROME_CSS;
module.exports.TS_NAV = TS_NAV;
module.exports.TS_FOOTER_TS = TS_FOOTER_TS;

// ── Landing-only building blocks ─────────────────────────────────────────
// 4-bubble logo mark, sized parametrically. Colors + radii per README §Logo.
// Base spec is 46×46 with an inner 34px cluster; we expose a scale factor
// so we can drop this into the nav (34px), hero (26px), and footer (30px)
// without duplicating markup.
function tsLogoMark(size) {
  // v9c: single periwinkle chat bubble with three white typing dots.
  // Uses the shared /talksibi-mark.svg so every mark surface stays in
  // one place — no drift between inline copies and the SVG asset.
  const s = size;
  return `<img src="/talksibi-mark.svg?v=23" alt="talksibi" width="${s}" height="${s}" style="width:${s}px;height:${s}px;display:block;flex-shrink:0" aria-hidden="true">`;
}

// Flag pill row + full flag list. First 12 render as pills in the hero
// languages strip; the footer flag row mirrors them.
const HERO_FLAGS = [
  ['🇬🇧','English'], ['🇪🇸','Spanish'], ['🇫🇷','French'], ['🇩🇪','German'],
  ['🇧🇷','Portuguese'], ['🇯🇵','Japanese'], ['🇰🇷','Korean'], ['🇸🇦','Arabic'],
  ['🇮🇳','Hindi'], ['🇨🇳','Chinese'], ['🇮🇹','Italian'], ['🇹🇷','Turkish'],
];

// Games band — six cards. Colored top-border per README §1d.
const GAME_CARDS = [
  { icon: '🕵️', name: 'Codenames',      line: 'Two teams, secret words, one wrong guess.', bar: '#5b6cff', href: '/play' },
  { icon: '🎭', name: 'Who is the Spy?', line: 'Find the imposter in the room.',             bar: '#ff7a59', href: '/spy'  },
  { icon: '🔗', name: 'Word Chain',      line: 'Last letter starts the next word.',          bar: '#1fb28a', href: '/wordchain' },
  { icon: '⏱',  name: 'Word Race',       line: '60 seconds. A category. Most words wins.',   bar: '#ffc94d', href: '/wordrace' },
  { icon: '🍋', name: 'Guess the Word',  line: 'Describe it. Everyone races to guess.',      bar: '#9b6cff', href: '/guessword' },
  { icon: '🧠', name: 'Mind Meld',       line: 'Type the same word at the same time.',       bar: '#d9544d', href: '/app' },
];

function page() {
  const flagPills = HERO_FLAGS.map(([f, name]) =>
    `<span class="ts-flagpill">${f} ${name}</span>`
  ).join('');

  const gameCards = GAME_CARDS.map(g => `
    <a class="ts-gamecard" href="${g.href}" style="border-top:4px solid ${g.bar}">
      <div class="ts-gameico">${g.icon}</div>
      <div class="ts-gamename">${g.name}</div>
      <div class="ts-gameline">${g.line}</div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
${GA}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>talksibi — Practise languages with real people</title>
<meta name="description" content="Chat with native speakers, play word games together, and join live language parties. Free forever, in your browser. Connect · Learn · Play.">
<link rel="canonical" href="${SITE}/">
<meta name="theme-color" content="#5b6cff">
<meta name="robots" content="index, follow, max-image-preview:large">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="talksibi">
<meta property="og:title" content="talksibi — Practise languages with real people">
<meta property="og:description" content="Chat with native speakers, play games together, join live parties. Free forever. Connect · Learn · Play.">
<meta property="og:url" content="${SITE}/">
<!-- Owner ask v25: SVG-first for modern crawlers (FB/Slack/WhatsApp/
     iMessage/LinkedIn all support SVG now). Kept .png as a second
     og:image so older scrapers + Twitter fall back cleanly if they
     don't accept SVG. Regenerate og-image.png from og-image.svg
     when you can (any online SVG→PNG at 1200×630 works). -->
<meta property="og:image" content="${SITE}/og-image.svg">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="talksibi — connect, learn, play with real language partners">
<meta property="og:locale" content="en_GB">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="talksibi — Practise languages with real people">
<meta name="twitter:description" content="Chat with native speakers, play games together, join live parties. Free forever.">
<meta name="twitter:image" content="${SITE}/og-image.png">
<meta name="twitter:image:alt" content="talksibi — connect, learn, play">

<!-- Icons / PWA -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=22">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">

<!-- Fonts (Hanken Grotesk per README §12) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">

<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"Organization","@id":"${SITE}/#org","name":"talksibi","url":"${SITE}/","logo":"${SITE}/icon-512.png","slogan":"Connect · Learn · Play","sameAs":["https://instagram.com/talksibi","https://tiktok.com/@talksibi","https://youtube.com/@talksibi","https://x.com/talksibi"]},
{"@type":"WebApplication","name":"talksibi","url":"${SITE}/","applicationCategory":"EducationalApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"GBP"},"description":"Language exchange community: chat with native speakers, play word games, join live voice parties, and build AI lesson plans. 18+, free forever.","publisher":{"@id":"${SITE}/#org"}},
{"@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"Is talksibi free?","acceptedAnswer":{"@type":"Answer","text":"Yes — talksibi is free forever. Inviting 5 friends unlocks a bonus premium year."}},
{"@type":"Question","name":"How does talksibi work?","acceptedAnswer":{"@type":"Answer","text":"Create a free profile, pick the languages you speak and the ones you're learning, then chat with native speakers, play word games together, or join live voice parties. AI experts are available 24/7 when no partner is online."}},
{"@type":"Question","name":"Do I need to install anything?","acceptedAnswer":{"@type":"Answer","text":"No — talksibi runs in your browser on phone and desktop. You can add it to your home screen like an app."}}
]}
]}</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:#ffffff;font-family:'Hanken Grotesk','Inter',system-ui,-apple-system,sans-serif;color:#16181f;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:#5b6cff;text-decoration:none}
a:hover{color:#4353e8}

/* ── Landing keyframes (README §Interactions) ── */
@keyframes ts-float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes ts-float2 { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -6px); } }
@keyframes ts-pop    { 0% { opacity:0; transform: translateY(16px) scale(0.96); } 100% { opacity:1; transform: translateY(0) scale(1); } }
@keyframes ts-dot    { 0%,60%,100% { opacity:.25; transform: translateY(0); } 30% { opacity:1; transform: translateY(-3px); } }
@keyframes ts-wave   { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(16deg); } 40% { transform: rotate(-8deg); } 60% { transform: rotate(12deg); } 80% { transform: rotate(-4deg); } }
@keyframes ts-pulse  { 0%,100% { opacity:1; } 50% { opacity:.4; } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation: none !important; transition: none !important; } }

/* ── Layout helpers ── */
.ts-wrap{max-width:1240px;margin:0 auto;width:100%;padding:0 48px;box-sizing:border-box}
.ts-wordmark{font-weight:500;letter-spacing:-0.3px;color:#000;line-height:1;text-transform:lowercase}
.ts-lockup{display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:inherit}

/* ── Nav ── */
.ts-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 48px;border-bottom:1px solid #f0efec;position:sticky;top:0;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:50}
.ts-navlinks{display:flex;align-items:center;gap:28px;font-size:15px;font-weight:500;color:#4a4d59}
.ts-navlinks a{color:#4a4d59;transition:color .12s}
.ts-navlinks a:hover{color:#16181f}
.ts-navlinks .ts-navlogin{color:#16181f}
.ts-navjoin{background:#16181f !important;color:#fff !important;padding:10px 22px;border-radius:99px;font-weight:500;transition:background .15s}
.ts-navjoin:hover{background:#2a2e42 !important;color:#fff !important}
@media(max-width:900px){
  .ts-nav{padding:14px 20px}
  .ts-navlinks{gap:14px;font-size:14px}
  .ts-navlinks .ts-hide-sm{display:none}
}

/* ── Hero ── */
.ts-hero-band{background:linear-gradient(180deg, #f5f6ff 0%, #ffffff 100%)}
.ts-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:48px;align-items:center;padding:72px 48px 84px;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box}
.ts-hero-txt{display:flex;flex-direction:column;gap:24px}
.ts-livepill{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;background:#f4f5ff;color:#4353e8;font-size:13px;font-weight:500;padding:7px 14px;border-radius:99px;letter-spacing:.3px}
.ts-livepill .ts-livedot{width:8px;height:8px;background:#1fb28a;border-radius:50%}
.ts-h1{margin:0;font-size:62px;font-weight:600;letter-spacing:-2px;line-height:1.03;color:#16181f}
.ts-h1 .ts-accent{color:#5b6cff}
.ts-hero-sub{margin:0;font-size:19px;line-height:1.55;color:#4a4d59;max-width:46ch}
.ts-hero-ctas{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.ts-cta-primary{background:#5b6cff;color:#fff;font-size:17px;font-weight:500;padding:15px 32px;border-radius:99px;box-shadow:0 6px 18px rgba(91,108,255,.3);transition:background .15s,transform .15s}
.ts-cta-primary:hover{background:#4353e8;color:#fff;transform:translateY(-1px)}
.ts-cta-ghost{color:#16181f;font-size:17px;font-weight:500;padding:15px 10px}
.ts-cta-ghost:hover{color:#5b6cff}
.ts-hero-meta{display:flex;align-items:center;gap:18px;font-size:13.5px;color:#8a8d99;font-weight:500;flex-wrap:wrap}
.ts-hero-meta .ts-sep{color:#d8d9de}

.ts-hero-art{position:relative;min-height:520px}
.ts-hero-halo{position:absolute;inset:20px -10px 20px 10px;background:radial-gradient(circle at 55% 45%, #eef0ff 0%, #f8f9ff 45%, transparent 72%);border-radius:50%}
.ts-bubble{position:absolute;padding:10px 16px;font-size:16px;font-weight:500;box-shadow:0 8px 24px rgba(22,24,31,.08)}
.ts-bubble .ts-flg{font-weight:500;font-size:13px;color:#8a8d99}
.ts-bubble.b-hola{top:8px;left:24px;background:#fff;border:1px solid #eceae5;border-radius:16px 16px 16px 4px;animation:ts-float 3s ease-in-out infinite}
.ts-bubble.b-hi  {top:0;right:60px;background:#ffc94d;color:#5c440c;border-radius:16px 16px 4px 16px;box-shadow:0 8px 24px rgba(255,201,77,.35);animation:ts-float 3.6s ease-in-out infinite .5s}
.ts-bubble.b-bon {top:215px;left:-14px;background:#1fb28a;color:#fff;border-radius:16px 16px 4px 16px;box-shadow:0 8px 24px rgba(31,178,138,.35);animation:ts-float 3.3s ease-in-out infinite 1s;z-index:2}
.ts-bubble.b-mar {bottom:96px;left:-4px;background:#ff7a59;color:#fff;border-radius:16px 4px 16px 16px;box-shadow:0 8px 24px rgba(255,122,89,.35);animation:ts-float 3.8s ease-in-out infinite .8s}
.ts-bubble.b-ola {bottom:30px;right:30px;background:#fff;border:1px solid #eceae5;border-radius:4px 16px 16px 16px;animation:ts-float 3s ease-in-out infinite 1.2s}

.ts-chatcard{position:relative;margin:60px auto 0;width:340px;background:#fff;border:1px solid #eceae5;border-radius:22px;box-shadow:0 24px 60px rgba(22,24,31,.12);overflow:hidden;animation:ts-pop .45s ease-out both}
.ts-chatcard-hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #f0efec}
.ts-chatcard-av{width:36px;height:36px;border-radius:50%;background:#ffc94d;display:flex;align-items:center;justify-content:center;font-weight:600;color:#7a5b0e}
.ts-chatcard-name{font-size:14.5px;font-weight:500}
.ts-chatcard-status{font-size:12px;color:#1fb28a;font-weight:500}
.ts-chatcard-wave{margin-left:auto;font-size:20px;animation:ts-wave 1.6s ease-in-out infinite;transform-origin:70% 70%}
.ts-chatcard-body{display:flex;flex-direction:column;gap:10px;padding:16px}
.ts-msg{max-width:85%;font-size:14.5px;padding:10px 14px}
.ts-msg.recv{align-self:flex-start;background:#f5f6f8;border-radius:4px 14px 14px 14px;animation:ts-pop .35s ease-out .3s both}
.ts-msg-hint{align-self:flex-start;font-size:11.5px;color:#8a8d99;margin-top:-4px;animation:ts-pop .35s ease-out .5s both}
.ts-msg.sent{align-self:flex-end;background:#5b6cff;color:#fff;border-radius:14px 4px 14px 14px;animation:ts-pop .35s ease-out .8s both}
.ts-msg.typing{align-self:flex-start;display:flex;gap:4px;background:#f5f6f8;border-radius:4px 14px 14px 14px;padding:12px 14px;animation:ts-pop .3s ease-out 1.15s both}
.ts-msg.typing span{width:7px;height:7px;background:#8a8d99;border-radius:50%;animation:ts-dot .9s infinite}

.ts-partypill{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);background:#16181f;color:#fff;border-radius:99px;padding:11px 20px;display:flex;align-items:center;gap:10px;box-shadow:0 14px 34px rgba(22,24,31,.25);white-space:nowrap;animation:ts-float2 4s ease-in-out infinite;font-size:13.5px;font-weight:500}
.ts-partypill .ts-avstk{display:flex}
.ts-partypill .ts-avstk span{width:26px;height:26px;border-radius:50%;border:2px solid #16181f;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.ts-partypill .ts-avstk span + span{margin-left:-8px}

/* ── Tagline strip (dark: Connect · Learn · Play) ── */
.ts-tagline-band{background:#16181f;color:#fff;padding:20px 48px}
.ts-tagline-inner{max-width:1240px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:56px;flex-wrap:wrap}
.ts-tagline-item{display:flex;align-items:center;gap:12px}
.ts-tagline-icon{width:34px;height:34px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center}
.ts-tagline-label{font-size:15px;font-weight:500;letter-spacing:3px;text-transform:uppercase}
.ts-tagline-sep{width:5px;height:5px;border-radius:50%;background:#3a3d4d}

/* ── 40+ languages strip ── */
.ts-langs-band{padding:36px 48px 0;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box}
.ts-langs-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px}
.ts-langs-label{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#9a9da8;margin-right:6px}
.ts-flagpill{background:#fff;border:1px solid #eceae5;border-radius:99px;padding:7px 14px;font-size:14px;font-weight:500;color:#16181f}
.ts-langs-more{font-size:14px;font-weight:500;color:#5b6cff}

/* ── Section shared ── */
.ts-sec{padding:88px 48px 0;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box}
.ts-sec.pb44{padding-bottom:44px}
.ts-sec.pb88{padding-bottom:88px}
.ts-eyebrow{font-size:13px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase}
.ts-sec-hd{display:flex;flex-direction:column;gap:10px;margin-bottom:36px}
.ts-h2{margin:0;font-size:40px;font-weight:600;letter-spacing:-1.2px;color:#16181f}
.ts-sec-lead{margin:0;font-size:17px;color:#4a4d59;max-width:62ch;line-height:1.55}

/* ── Connect: 3 tinted cards ── */
.ts-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.ts-tintcard{border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:10px}
.ts-tintcard.periwinkle{background:#f4f5ff}
.ts-tintcard.jade{background:#eefaf5}
.ts-tintcard.sun{background:#fff6e8}
.ts-tintbadge{width:44px;height:44px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center}
.ts-tintbadge .ts-b{width:18px;height:18px}
.ts-tintcard h3{font-size:18px;font-weight:500;margin:0;color:#16181f}
.ts-tintcard p{font-size:15px;color:#4a4d59;line-height:1.55;margin:0}

/* ── Always-on: parties / clubs / AI ── */
.ts-alwayscard{border-radius:20px;padding:26px;display:flex;flex-direction:column;gap:16px}
.ts-alwayscard.periwinkle{background:#f4f5ff}
.ts-alwayscard.jade{background:#eefaf5}
.ts-alwayscard.violet{background:#f6f1ff}
.ts-alwayscard .hd{display:flex;align-items:center;justify-content:space-between}
.ts-alwayscard .ttl{font-size:18px;font-weight:500;color:#16181f}
.ts-livepill-red{display:inline-flex;align-items:center;gap:6px;background:#fff;border-radius:99px;padding:5px 12px;font-size:12px;font-weight:600;color:#d9544d}
.ts-livepill-red .dot{width:7px;height:7px;background:#d9544d;border-radius:50%;animation:ts-dot 1s infinite}
.ts-innercard{background:#fff;border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px;box-shadow:0 6px 18px rgba(122,91,255,.12)}
.ts-partyline{font-size:14.5px;font-weight:500}
.ts-partyseats{display:flex;gap:10px}
.ts-seat{display:flex;flex-direction:column;align-items:center;gap:4px}
.ts-seat-av{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600}
.ts-seat-lb{font-size:11px;color:#8a8d99;font-weight:500}
.ts-partymeta{background:#f6f1ff;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:500;color:#6b4fd8}
.ts-clublist{display:flex;flex-direction:column;gap:10px}
.ts-clubrow{background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 14px rgba(31,178,138,.1)}
.ts-clubemj{font-size:22px}
.ts-clubbody{flex:1}
.ts-clubname{font-size:14.5px;font-weight:500}
.ts-clubmeta{font-size:12.5px;color:#8a8d99}
.ts-clubjoin{font-size:12px;font-weight:600;color:#1fb28a}
.ts-aihd{display:flex;align-items:center;gap:10px}
.ts-aiav{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#5b6cff,#9b6cff);display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px}
.ts-247{background:#fff;border-radius:99px;padding:5px 12px;font-size:12px;font-weight:600;color:#5b6cff}
.ts-aimsg{font-size:13.5px;padding:9px 13px}
.ts-aimsg.recv{align-self:flex-start;background:#f5f6f8;border-radius:4px 12px 12px 12px}
.ts-aimsg.sent{align-self:flex-end;background:#5b6cff;color:#fff;border-radius:12px 4px 12px 12px}
.ts-aimsg.ok  {align-self:flex-start;background:#f2f8f5;color:#2d7a62;border-radius:4px 12px 12px 12px;font-size:12.5px;font-weight:500}

/* ── Games band (dark) ── */
.ts-play-band{background:#16181f;margin-top:72px}
.ts-play-inner{padding:80px 48px 88px;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box}
.ts-play-inner .ts-h2{color:#fff}
.ts-play-inner .ts-sec-lead{color:#b8bac4;max-width:60ch}
.ts-gamegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ts-gamecard{background:#1d2130;border:1px solid #2a2e42;border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:6px;transition:transform .15s,border-color .15s;color:#fff;text-decoration:none}
.ts-gamecard:hover{transform:translateY(-3px);border-color:#3a3f5a;color:#fff}
.ts-gameico{font-size:22px}
.ts-gamename{font-size:15.5px;font-weight:500;color:#fff}
.ts-gameline{font-size:13px;color:#9aa0b4;line-height:1.4}

/* ── Learn split ── */
.ts-learn-inner{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.ts-learn-txt{display:flex;flex-direction:column;gap:10px}
.ts-learn-tags{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.ts-learn-tag{background:#f5f6f8;border-radius:99px;padding:8px 16px;font-size:14px;font-weight:500;color:#4a4d59}
.ts-planner{background:linear-gradient(160deg, #eefaf5, #ffffff 70%);border:1px solid #d9efe6;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px;box-shadow:0 14px 34px rgba(31,178,138,.1)}
.ts-planner-hd{font-size:15px;font-weight:500}
.ts-planner-row{display:flex;gap:8px;flex-wrap:wrap}
.ts-planner-row > *{flex:1;min-width:0}
.ts-planner-input{background:#fff;border:1px solid #e4e3df;border-radius:10px;padding:10px 14px;font-size:14px;color:#8a8d99}
.ts-planner-input b{color:#16181f}
.ts-chip{border-radius:10px;padding:10px 14px;font-size:14px;font-weight:500;text-align:center;flex:1;min-width:0}
.ts-chip.act{background:#eefaf5;border:1px solid #1fb28a;color:#14785e}
.ts-chip.off{background:#fff;border:1px solid #e4e3df;color:#8a8d99}
.ts-planner-cta{background:#5b6cff;color:#fff;border-radius:12px;padding:14px;text-align:center;font-size:15px;font-weight:500}

/* ── Teach CTA (dark-gold) ── */
.ts-teach-band{width:100%;margin-bottom:88px;background:linear-gradient(115deg, #2a1e05 0%, #16181f 55%)}
.ts-teach-inner{position:relative;overflow:hidden;padding:72px 48px;max-width:1240px;margin:0 auto;box-sizing:border-box;display:grid;grid-template-columns:1.5fr auto;gap:36px;align-items:center}
.ts-teach-blob1{position:absolute;top:-40px;right:220px;width:130px;height:130px;background:rgba(255,201,77,.14);border-radius:40px 40px 10px 40px;transform:rotate(-12deg)}
.ts-teach-blob2{position:absolute;bottom:-50px;right:40px;width:170px;height:170px;background:rgba(255,122,89,.12);border-radius:50px 12px 50px 50px;transform:rotate(10deg)}
.ts-teach-quote{position:absolute;top:30px;right:60px;animation:ts-float 3.4s ease-in-out infinite;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px 14px 14px 4px;padding:8px 14px;font-size:13.5px;font-weight:500;color:#ffd575}
.ts-teach-txt{position:relative;display:flex;flex-direction:column;gap:12px}
.ts-teach-eb{font-size:13px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#ffc94d}
.ts-teach-h{font-size:34px;font-weight:600;letter-spacing:-1px;color:#fff;line-height:1.15}
.ts-teach-h .hl{color:#ffc94d}
.ts-teach-sub{font-size:16px;color:#b8bac4;line-height:1.55;max-width:58ch}
.ts-teach-facts{display:flex;gap:18px;margin-top:6px;font-size:13.5px;font-weight:500;color:#9aa0b4;flex-wrap:wrap}
.ts-teach-cta{position:relative;background:#ffc94d;color:#3a2c07;font-size:17px;font-weight:600;padding:17px 34px;border-radius:99px;white-space:nowrap;justify-self:end;box-shadow:0 10px 28px rgba(255,201,77,.35);transition:background .15s,transform .15s}
.ts-teach-cta:hover{background:#ffd575;color:#3a2c07;transform:translateY(-1px)}

/* ── Referral + safety ── */
.ts-refsafe{padding:0 48px 88px;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box}
.ts-refsafe-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px}
.ts-refcard{background:#16181f;color:#fff;border-radius:20px;padding:36px;display:flex;flex-direction:column;gap:12px}
.ts-refcard .eb{font-size:13px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#ffc94d}
.ts-refcard .h{font-size:28px;font-weight:600;letter-spacing:-.8px}
.ts-refcard p{font-size:15.5px;color:#b8bac4;line-height:1.55;margin:0}
.ts-safecard{border:1px solid #eceae5;border-radius:20px;padding:36px;display:flex;flex-direction:column;gap:12px;background:#fff}
.ts-safecard .eb{font-size:13px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#1fb28a}
.ts-safecard .h{font-size:20px;font-weight:600;letter-spacing:-.4px}
.ts-safecard p{font-size:15px;color:#4a4d59;line-height:1.55;margin:0}

/* ── Join CTA (full-bleed periwinkle) ── */
.ts-join-band{width:100%;background:#5b6cff;padding:92px 48px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;position:relative;overflow:hidden}
.ts-join-blob1{position:absolute;top:-30px;left:60px;width:90px;height:90px;background:rgba(255,255,255,.12);border-radius:28px 28px 8px 28px;transform:rotate(-10deg)}
.ts-join-blob2{position:absolute;bottom:-24px;right:80px;width:74px;height:74px;background:rgba(255,255,255,.12);border-radius:24px 8px 24px 24px;transform:rotate(12deg)}
.ts-join-h{margin:0;font-size:44px;font-weight:600;letter-spacing:-1.4px;color:#fff;line-height:1.05;position:relative}
.ts-join-sub{margin:0;font-size:18px;color:rgba(255,255,255,.85);max-width:52ch;line-height:1.5;position:relative}
.ts-join-cta{background:#fff;color:#16181f;font-size:17px;font-weight:600;padding:15px 36px;border-radius:99px;margin-top:6px;position:relative;transition:transform .15s}
.ts-join-cta:hover{color:#16181f;transform:translateY(-1px)}
.ts-join-fine{font-size:13.5px;color:rgba(255,255,255,.7);font-weight:500;position:relative}

/* ── Footer (landing-native, per README §41) ── */
.ts-foot{border-top:1px solid #f0efec;background:#fafafa}
.ts-foot-inner{max-width:1240px;margin:0 auto;padding:56px 48px 28px;box-sizing:border-box}
.ts-foot-cols{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:40px;padding-bottom:40px;border-bottom:1px solid #ececea}
.ts-foot-brand{display:flex;flex-direction:column;gap:14px}
.ts-foot-blurb{font-size:14.5px;color:#6b6e7a;line-height:1.55;max-width:34ch}
.ts-foot-socials{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}
.ts-foot-socials a{width:38px;height:38px;border-radius:50%;background:#fff;border:1px solid #e6e5e1;display:flex;align-items:center;justify-content:center;transition:border-color .12s}
.ts-foot-socials a:hover{border-color:#5b6cff}
.ts-foot-col{display:flex;flex-direction:column;gap:12px}
.ts-foot-col-h{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#9a9da8}
.ts-foot-col a{color:#4a4d59;font-size:14.5px;font-weight:500}
.ts-foot-col a:hover{color:#5b6cff}
.ts-foot-sub{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding-top:22px}
.ts-foot-meta{font-size:13.5px;color:#8a8d99}
.ts-foot-flags{display:flex;align-items:center;gap:8px;font-size:17px;flex-wrap:wrap}
.ts-foot-flags .plus{font-size:13px;font-weight:500;color:#5b6cff}

/* ── Responsive collapses ── */
@media(max-width:960px){
  .ts-hero{grid-template-columns:1fr;padding:48px 20px 72px;gap:56px;text-align:left}
  .ts-hero-art{min-height:480px;max-width:420px;margin:0 auto;width:100%}
  .ts-h1{font-size:44px;letter-spacing:-1.2px}
  .ts-hero-sub{font-size:17px;max-width:none}
  .ts-tagline-band{padding:20px}
  .ts-tagline-inner{gap:24px}
  .ts-langs-band,.ts-sec,.ts-refsafe{padding-left:20px;padding-right:20px}
  .ts-sec{padding-top:64px}
  .ts-h2{font-size:32px;letter-spacing:-.8px}
  .ts-grid3,.ts-gamegrid{grid-template-columns:1fr}
  .ts-learn-inner{grid-template-columns:1fr;gap:32px}
  .ts-teach-band{margin-bottom:64px}
  .ts-teach-inner{grid-template-columns:1fr;padding:56px 20px;gap:24px}
  .ts-teach-cta{justify-self:start}
  .ts-teach-h{font-size:28px}
  .ts-teach-quote{display:none}
  .ts-refsafe-grid{grid-template-columns:1fr}
  .ts-join-band{padding:64px 20px}
  .ts-join-h{font-size:32px;letter-spacing:-.8px}
  .ts-play-inner{padding:64px 20px}
  .ts-foot-inner{padding:44px 20px 24px}
  .ts-foot-cols{grid-template-columns:1fr 1fr;gap:28px}
}
@media(max-width:560px){
  .ts-foot-cols{grid-template-columns:1fr}
  .ts-hero-ctas{flex-direction:column;align-items:stretch}
  .ts-cta-primary,.ts-cta-ghost{text-align:center}
  .ts-partypill{font-size:12px;padding:9px 14px}
  .ts-partypill .ts-avstk span{width:22px;height:22px;font-size:10px}
}
/* Shared community topnav + sitefoot CSS — same source as blog + static
   + games so every surface reads as one site. Unified 20 Aug 2026. */
${TS_CHROME_CSS}
</style>
</head>
<body>

<!-- Sticky nav — unified with community topnav 20 Aug 2026. -->
${TS_NAV}

<!-- Hero -->
<section class="ts-hero-band">
  <header class="ts-hero">
    <div class="ts-hero-txt">
      <div class="ts-livepill">
        <span class="ts-livedot"></span>
        Live now — join a language party
      </div>
      <h1 class="ts-h1">Practise languages with <span class="ts-accent">real people</span>.</h1>
      <p class="ts-hero-sub">Create your profile, follow language partners, and chat any time. Play games together, join live parties, and build an AI learning plan — free, in your browser.</p>
      <div class="ts-hero-ctas">
        <a class="ts-cta-primary" href="/app">Start free — 30 seconds</a>
        <a class="ts-cta-ghost" href="/app#wall">Explore Community →</a>
      </div>
      <div class="ts-hero-meta">
        <span>Free forever</span><span class="ts-sep">·</span><span>No install — runs in the browser</span><span class="ts-sep">·</span><span>18+ community</span>
      </div>
    </div>

    <div class="ts-hero-art">
      <div class="ts-hero-halo"></div>
      <div class="ts-bubble b-hola">Hola <span class="ts-flg">🇪🇸</span></div>
      <div class="ts-bubble b-hi">こんにちは <span style="font-size:13px">🇯🇵</span></div>
      <div class="ts-bubble b-bon">Bonjour <span style="font-size:13px">🇫🇷</span></div>
      <div class="ts-bubble b-mar">مرحبا <span style="font-size:13px">🇸🇦</span></div>
      <div class="ts-bubble b-ola">Olá <span class="ts-flg">🇧🇷</span></div>

      <div class="ts-chatcard">
        <div class="ts-chatcard-hd">
          <div class="ts-chatcard-av">M</div>
          <div>
            <div class="ts-chatcard-name">Mariana</div>
            <div class="ts-chatcard-status">● online · speaks Spanish</div>
          </div>
          <div class="ts-chatcard-wave">👋</div>
        </div>
        <div class="ts-chatcard-body">
          <div class="ts-msg recv">¡Hola! ¿Cómo estás? 😊</div>
          <div class="ts-msg-hint">Hi! How are you? — tap to translate</div>
          <div class="ts-msg sent">¡Muy bien! Word Race? 🏁</div>
          <div class="ts-msg typing"><span></span><span style="animation-delay:.15s"></span><span style="animation-delay:.3s"></span></div>
        </div>
      </div>

      <div class="ts-partypill">
        <span class="ts-avstk">
          <span style="background:#ff7a59;color:#fff">K</span>
          <span style="background:#1fb28a;color:#fff">A</span>
          <span style="background:#ffc94d;color:#7a5b0e">+5</span>
        </span>
        <span>🎉 French–English party is live</span>
      </div>
    </div>
  </header>
</section>

<!-- Dark tagline strip: Connect · Learn · Play -->
<section class="ts-tagline-band">
  <div class="ts-tagline-inner">
    <div class="ts-tagline-item">
      <span class="ts-tagline-icon" style="background:rgba(91,108,255,.18)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8f9bff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      </span>
      <span class="ts-tagline-label">Connect</span>
    </div>
    <span class="ts-tagline-sep"></span>
    <div class="ts-tagline-item">
      <span class="ts-tagline-icon" style="background:rgba(31,178,138,.18)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#43cfa5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
      </span>
      <span class="ts-tagline-label">Learn</span>
    </div>
    <span class="ts-tagline-sep"></span>
    <div class="ts-tagline-item">
      <span class="ts-tagline-icon" style="background:rgba(255,201,77,.18)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffd575" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4.5"></rect><circle cx="8.2" cy="8.2" r="1.3" fill="#ffd575" stroke="none"></circle><circle cx="15.8" cy="8.2" r="1.3" fill="#ffd575" stroke="none"></circle><circle cx="8.2" cy="15.8" r="1.3" fill="#ffd575" stroke="none"></circle><circle cx="15.8" cy="15.8" r="1.3" fill="#ffd575" stroke="none"></circle></svg>
      </span>
      <span class="ts-tagline-label">Play</span>
    </div>
  </div>
</section>

<!-- 40+ languages flag pills -->
<section class="ts-langs-band">
  <div class="ts-langs-inner">
    <span class="ts-langs-label">40+ languages</span>
    ${flagPills}
    <span class="ts-langs-more">+ 28 more</span>
  </div>
</section>

<!-- Connect: community 3-card -->
<section id="connect" class="ts-sec pb44">
  <div class="ts-sec-hd">
    <div class="ts-eyebrow" style="color:#5b6cff">Connect</div>
    <h2 class="ts-h2">A community, not a classroom.</h2>
    <p class="ts-sec-lead">Find partners who speak what you're learning — and are learning what you speak. Follow the ones you click with and talk whenever you're both around.</p>
  </div>
  <div class="ts-grid3">
    <div class="ts-tintcard periwinkle">
      <div class="ts-tintbadge" style="box-shadow:0 3px 10px rgba(91,108,255,.18)"><div class="ts-b" style="background:#5b6cff;border-radius:6px 6px 2px 6px"></div></div>
      <h3>Chat with translation built in</h3>
      <p>Text, voice notes, photos, and calls. Tap any message to translate, correct, or hear it spoken.</p>
    </div>
    <div class="ts-tintcard jade">
      <div class="ts-tintbadge" style="box-shadow:0 3px 10px rgba(31,178,138,.18)"><div class="ts-b" style="background:#1fb28a;border-radius:50%"></div></div>
      <h3>Live language parties</h3>
      <p>Group voice rooms around a language or a topic. Public or private — host one or drop into what's live.</p>
    </div>
    <div class="ts-tintcard sun">
      <div class="ts-tintbadge" style="box-shadow:0 3px 10px rgba(255,178,45,.22)"><div class="ts-b" style="background:#ffc94d;border-radius:2px 6px 6px 6px"></div></div>
      <h3>References you can trust</h3>
      <p>Real profiles with photo checks, references from past partners, and Report &amp; Block on every profile.</p>
    </div>
  </div>
</section>

<!-- Always on: parties, clubs, AI experts -->
<section id="rooms" class="ts-sec">
  <div class="ts-sec-hd">
    <div class="ts-eyebrow" style="color:#9b6cff">Always on</div>
    <h2 class="ts-h2">Parties, clubs, and AI experts.</h2>
    <p class="ts-sec-lead">Any hour, there's a voice room live, a club meeting up, or an AI expert ready to practise with you.</p>
  </div>
  <div class="ts-grid3">

    <div class="ts-alwayscard violet">
      <div class="hd">
        <div class="ttl">🎉 Language parties</div>
        <span class="ts-livepill-red"><span class="dot"></span>LIVE</span>
      </div>
      <div class="ts-innercard">
        <div class="ts-partyline">Spanish ↔ English party</div>
        <div class="ts-partyseats">
          <div class="ts-seat"><div class="ts-seat-av" style="background:#ffc94d;color:#7a5b0e;border:2.5px solid #9b6cff">M</div><span class="ts-seat-lb">speaking</span></div>
          <div class="ts-seat"><div class="ts-seat-av" style="background:#5b6cff;color:#fff">J</div><span class="ts-seat-lb">·</span></div>
          <div class="ts-seat"><div class="ts-seat-av" style="background:#1fb28a;color:#fff">A</div><span class="ts-seat-lb">·</span></div>
          <div class="ts-seat"><div class="ts-seat-av" style="background:#eceaf6;color:#9b6cff;border:2px dashed #9b6cff">+</div><span class="ts-seat-lb" style="color:#9b6cff">free seat</span></div>
        </div>
        <div class="ts-partymeta">🎙 12 talking · 34 listening</div>
      </div>
      <div style="font-size:14.5px;color:#4a4d59;line-height:1.55">Group voice rooms around a language or a topic — public or private. Host your own or take a free seat.</div>
    </div>

    <div class="ts-alwayscard jade">
      <div class="ttl">🏛 Language clubs</div>
      <div class="ts-clublist">
        <div class="ts-clubrow">
          <span class="ts-clubemj">🎬</span>
          <div class="ts-clubbody"><div class="ts-clubname">Cinema club · French</div><div class="ts-clubmeta">Fridays · 842 members</div></div>
          <span class="ts-clubjoin">Join</span>
        </div>
        <div class="ts-clubrow">
          <span class="ts-clubemj">✈️</span>
          <div class="ts-clubbody"><div class="ts-clubname">Travel stories · Spanish</div><div class="ts-clubmeta">Daily · 1.2k members</div></div>
          <span class="ts-clubjoin">Join</span>
        </div>
        <div class="ts-clubrow">
          <span class="ts-clubemj">🍜</span>
          <div class="ts-clubbody"><div class="ts-clubname">Food talk · Japanese</div><div class="ts-clubmeta">Weekends · 356 members</div></div>
          <span class="ts-clubjoin">Join</span>
        </div>
      </div>
      <div style="font-size:14.5px;color:#4a4d59;line-height:1.55">Find your people around what you love — every club meets in chat and live rooms.</div>
    </div>

    <div class="ts-alwayscard periwinkle">
      <div class="hd">
        <div class="ttl">✨ AI experts</div>
        <span class="ts-247">24/7</span>
      </div>
      <div class="ts-innercard" style="gap:10px">
        <div class="ts-aihd">
          <div class="ts-aiav">✦</div>
          <div><div class="ts-partyline">Sofía · AI conversation coach</div><div style="font-size:12px;color:#1fb28a;font-weight:500">● always online</div></div>
        </div>
        <div class="ts-aimsg recv">Let's warm up — order a coffee in Spanish ☕</div>
        <div class="ts-aimsg sent">Un café con leche, por favor…</div>
        <div class="ts-aimsg ok">✓ Perfect! Now ask for the bill.</div>
      </div>
      <div style="font-size:14.5px;color:#4a4d59;line-height:1.55">Nobody around? Practise with AI experts — instant corrections, zero judgement, any topic.</div>
    </div>

  </div>
</section>

<!-- Games band (dark) -->
<section class="ts-play-band">
  <div id="play" class="ts-play-inner">
    <div class="ts-sec-hd">
      <div class="ts-eyebrow" style="color:#ff7a59">Play</div>
      <h2 class="ts-h2">The fastest way to talk is to play.</h2>
      <p class="ts-sec-lead">Six games built for language practice. Start a room, challenge a friend, or look in on any live table and take a free seat.</p>
    </div>
    <div class="ts-gamegrid">${gameCards}</div>
  </div>
</section>

<!-- Learn split -->
<section id="learn" class="ts-sec pb88">
  <div class="ts-learn-inner">
    <div class="ts-learn-txt">
      <div class="ts-eyebrow" style="color:#1fb28a">Learn</div>
      <h2 class="ts-h2">Your plan, built in seconds.</h2>
      <p class="ts-sec-lead" style="max-width:none">Tell us what you speak, what you're learning, and the minutes you can spare — the AI builds a personalised lesson plan. Free forever. Prepping for IELTS or TOEFL? There's a dedicated track with hand-picked resources and real test dates.</p>
      <div class="ts-learn-tags">
        <span class="ts-learn-tag">✨ AI lesson plans</span>
        <span class="ts-learn-tag">📝 IELTS &amp; TOEFL prep</span>
        <span class="ts-learn-tag">🗓 Real test dates</span>
      </div>
    </div>
    <div class="ts-planner">
      <div class="ts-planner-hd">Build your plan</div>
      <div class="ts-planner-row">
        <span class="ts-planner-input">You want to learn… <b>Spanish</b></span>
        <span class="ts-planner-input">You speak… <b>English</b></span>
      </div>
      <div class="ts-planner-row">
        <span class="ts-chip act">🌿 Intermediate</span>
        <span class="ts-chip off">✈️ Travel</span>
        <span class="ts-chip off">15 min/day</span>
      </div>
      <div class="ts-planner-cta">✨ Build my plan — about 5 seconds</div>
    </div>
  </div>
</section>

<!-- Become a teacher (dark gold, full-bleed) -->
<section id="teach" class="ts-teach-band">
  <div class="ts-teach-inner">
    <div class="ts-teach-blob1"></div>
    <div class="ts-teach-blob2"></div>
    <div class="ts-teach-quote">"Great teacher!" ★★★★★</div>
    <div class="ts-teach-txt">
      <div class="ts-teach-eb">Teach on talksibi</div>
      <div class="ts-teach-h">Fluent in something? <span class="hl">Get paid to teach it.</span></div>
      <div class="ts-teach-sub">Host lessons and conversation sessions, build your student circle, and earn from the languages you already speak — right inside talksibi.</div>
      <div class="ts-teach-facts">
        <span>💸 Set your own rate</span><span>🗓 Your schedule</span><span>🌍 Students worldwide</span>
      </div>
    </div>
    <a class="ts-teach-cta" href="/become-a-teacher">Become a teacher →</a>
  </div>
</section>

<!-- Referral + safety -->
<section class="ts-refsafe">
  <div class="ts-refsafe-grid">
    <div class="ts-refcard">
      <div class="eb">👑 Invite &amp; win</div>
      <div class="h">Bring 5 friends, unlock 1 year free.</div>
      <p>Everything is free to use — referrals unlock the premium year as a thank-you for growing the community.</p>
    </div>
    <div class="ts-safecard">
      <div class="eb">Safe by design</div>
      <div class="h">18+, verified, moderated.</div>
      <p>Every profile is reviewed within a day. Report and Block sit on every profile — reports are handled within 24 hours.</p>
    </div>
  </div>
</section>

<!-- Full-bleed join CTA -->
<section id="join">
  <div class="ts-join-band">
    <div class="ts-join-blob1"></div>
    <div class="ts-join-blob2"></div>
    <h2 class="ts-join-h">Your first conversation is a game away.</h2>
    <p class="ts-join-sub">Join app, set your languages, and say hi — someone on the other side of the world is waiting to practise with you.</p>
    <a class="ts-join-cta" href="/app">Create my profile — free</a>
    <div class="ts-join-fine">No credit card · No install · 18+</div>
  </div>
</section>

<!-- Landing footer — unified with community sitefoot 20 Aug 2026. -->
${TS_FOOTER_TS}

<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
}
</script>
<script src="/a2hs.js" defer></script>
<!-- Cookie consent modal removed 16 Aug 2026 (owner ask v22). -->
</body></html>`;
}

module.exports = { page, GA, GA_ID, CONSENT_MODAL, SITE_FOOTER, TS_CHROME_CSS, TS_NAV, TS_FOOTER_TS };
