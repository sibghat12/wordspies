/* talksibi-chrome.js — shared site chrome (footer today; header later).
   Owner ask 17 Aug 2026 v5: game/blog/app pages should use the SAME
   footer the landing uses (light .ts-foot, 4-col). This file is the
   single source of truth for it.

   Include with: <script src="/talksibi-chrome.js" defer></script>
   Pages opt out (persistent-shell iframes) via body.embed. */
(function(){
  'use strict';

  var FOOTER_CSS =
    'footer.ts-foot{border-top:1px solid #f0efec;background:#fafafa;font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;color:#16181f;margin:36px 0 0}' +
    'footer.ts-foot .ts-foot-inner{max-width:1240px;margin:0 auto;padding:56px 48px 28px;box-sizing:border-box}' +
    'footer.ts-foot .ts-foot-cols{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:40px;padding-bottom:40px;border-bottom:1px solid #ececea}' +
    'footer.ts-foot .ts-foot-brand{display:flex;flex-direction:column;gap:14px}' +
    'footer.ts-foot .ts-foot-blurb{font-size:14.5px;color:#6b6e7a;line-height:1.55;max-width:34ch}' +
    'footer.ts-foot .ts-foot-socials{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}' +
    'footer.ts-foot .ts-foot-socials a{width:38px;height:38px;border-radius:50%;background:#fff;border:1px solid #e6e5e1;display:flex;align-items:center;justify-content:center;transition:border-color .12s;text-decoration:none}' +
    'footer.ts-foot .ts-foot-socials a:hover{border-color:#5b6cff}' +
    'footer.ts-foot .ts-foot-col{display:flex;flex-direction:column;gap:12px}' +
    'footer.ts-foot .ts-foot-col-h{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#9a9da8}' +
    'footer.ts-foot .ts-foot-col a{color:#4a4d59;font-size:14.5px;font-weight:500;text-decoration:none}' +
    'footer.ts-foot .ts-foot-col a:hover{color:#5b6cff}' +
    'footer.ts-foot .ts-foot-sub{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding-top:22px}' +
    'footer.ts-foot .ts-foot-meta{font-size:13.5px;color:#8a8d99}' +
    'footer.ts-foot .ts-foot-flags{display:flex;align-items:center;gap:8px;font-size:17px;flex-wrap:wrap}' +
    'footer.ts-foot .ts-foot-flags .plus{font-size:13px;font-weight:500;color:#5b6cff}' +
    'footer.ts-foot .ts-lockup{display:inline-flex;align-items:center;gap:8px;text-decoration:none}' +
    'footer.ts-foot .ts-wordmark{font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;font-weight:600;letter-spacing:-.3px;color:#16181f}' +
    '@media(max-width:960px){footer.ts-foot .ts-foot-inner{padding:44px 20px 24px}footer.ts-foot .ts-foot-cols{grid-template-columns:1fr 1fr;gap:28px}}' +
    '@media(max-width:560px){footer.ts-foot .ts-foot-cols{grid-template-columns:1fr}}' +
    'body.embed footer.ts-foot,body.embed footer.ts-sitefoot{display:none !important}';

  var IG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4a4d59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="0.5" fill="#4a4d59"></circle></svg>';
  var TT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#4a4d59"><path d="M16.6 5.82C15.9 5.03 15.5 4 15.5 2.9h-3.1v12.4c0 1.4-1.14 2.54-2.55 2.54a2.55 2.55 0 0 1 0-5.1c.26 0 .52.04.76.12V9.7a5.7 5.7 0 0 0-.76-.05 5.66 5.66 0 1 0 5.66 5.66V9.64a7.2 7.2 0 0 0 4.19 1.34V7.9c-1.24 0-2.37-.5-3.1-2.08z"></path></svg>';
  var YT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#4a4d59"><path d="M23 7.5s-.23-1.63-.94-2.35c-.9-.94-1.9-.95-2.36-1C16.4 3.9 12 3.9 12 3.9h-.01s-4.4 0-7.7.25c-.46.05-1.46.06-2.36 1C1.22 5.87 1 7.5 1 7.5S.76 9.42.76 11.33v1.8C.76 15.05 1 16.96 1 16.96s.23 1.63.93 2.35c.9.94 2.08.9 2.6 1 1.89.18 7.47.24 7.47.24s4.4-.01 7.7-.25c.46-.06 1.46-.07 2.36-1.01.7-.72.94-2.35.94-2.35s.24-1.9.24-3.82v-1.8C23.24 9.42 23 7.5 23 7.5zM9.7 14.85V8.66l6.22 3.1-6.22 3.09z"></path></svg>';
  var XI = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#4a4d59"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"></path></svg>';

  function footerHTML(){
    var y = new Date().getFullYear();
    return '<footer class="ts-foot"><div class="ts-foot-inner">' +
      '<div class="ts-foot-cols">' +
        '<div class="ts-foot-brand">' +
          '<a class="ts-lockup" href="/" style="text-decoration:none">' +
            '<img src="/logo.svg" alt="talksibi" style="height:30px;width:auto;display:block" onerror="this.outerHTML=\'&lt;span class=&quot;ts-wordmark&quot; style=&quot;font-size:21px&quot;&gt;talksibi&lt;/span&gt;\'">' +
          '</a>' +
          '<div class="ts-foot-blurb">Practise languages with real people — chat, play games, and learn together. Free, in your browser.</div>' +
          '<div class="ts-foot-socials">' +
            '<a href="https://instagram.com/talksibi" target="_blank" rel="noopener" aria-label="Instagram">' + IG + '</a>' +
            '<a href="https://tiktok.com/@talksibi" target="_blank" rel="noopener" aria-label="TikTok">' + TT + '</a>' +
            '<a href="https://youtube.com/@talksibi" target="_blank" rel="noopener" aria-label="YouTube">' + YT + '</a>' +
            '<a href="https://x.com/talksibi" target="_blank" rel="noopener" aria-label="X">' + XI + '</a>' +
          '</div>' +
        '</div>' +
        '<div class="ts-foot-col">' +
          '<div class="ts-foot-col-h">Product</div>' +
          '<a href="/app">Community</a>' +
          '<a href="/games">Games</a>' +
          '<a href="/app/learn">AI lesson plans</a>' +
          '<a href="/app/learn">IELTS &amp; TOEFL prep</a>' +
          '<a href="/become-a-teacher">Become a teacher</a>' +
        '</div>' +
        '<div class="ts-foot-col">' +
          '<div class="ts-foot-col-h">Support</div>' +
          '<a href="/how-to-play">Safety centre</a>' +
          '<a href="/how-to-play">Community guidelines</a>' +
          '<a href="mailto:feedback@talksibi.com?subject=talksibi%20—%20Report%20a%20problem">Report a problem</a>' +
          '<a href="mailto:contact@talksibi.com">Contact us</a>' +
        '</div>' +
        '<div class="ts-foot-col">' +
          '<div class="ts-foot-col-h">Legal</div>' +
          '<a href="/terms">Terms &amp; conditions</a>' +
          '<a href="/privacy">Privacy policy</a>' +
          '<a href="/privacy">Cookie policy</a>' +
          '<a href="/child-safety">18+ policy</a>' +
        '</div>' +
      '</div>' +
      '<div class="ts-foot-sub">' +
        '<div class="ts-foot-meta">© ' + y + ' talksibi · Connect, Learn, Play</div>' +
        '<div class="ts-foot-flags">' +
          '<span>🇬🇧</span><span>🇪🇸</span><span>🇫🇷</span><span>🇩🇪</span><span>🇧🇷</span><span>🇯🇵</span><span>🇰🇷</span><span>🇸🇦</span><span>🇮🇳</span><span>🇨🇳</span><span>🇮🇹</span><span>🇹🇷</span>' +
          '<span class="plus">+ 28 more</span>' +
        '</div>' +
      '</div>' +
    '</div></footer>';
  }

  function injectStyles(){
    if (document.getElementById('ts-chrome-css')) return;
    var s = document.createElement('style');
    s.id = 'ts-chrome-css';
    s.textContent = FOOTER_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function mountFooter(){
    if (document.body.hasAttribute('data-ts-no-footer')) return;
    if (document.querySelector('footer.ts-foot')) return;      // page already has one inline
    if (document.querySelector('footer.ts-sitefoot')) return;  // legacy inline dark footer
    var el = document.createElement('div');
    el.innerHTML = footerHTML();
    document.body.appendChild(el.firstChild);
  }

  function boot(){
    injectStyles();
    mountFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.tsChrome = { footerHTML: footerHTML, mountFooter: mountFooter };
})();
