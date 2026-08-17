/* talksibi-chrome.js — shared site chrome (footer today; header later).
   Owner ask 17 Aug 2026 v2: "make the common header and footer for all
   the pages of the app". This is the single source of truth so every
   page gets the same links, brand, social handles and copyright.

   Include with: <script src="/talksibi-chrome.js" defer></script>
   Pages opt out (e.g. persistent-shell iframes) via body.embed or
   the data-ts-no-footer attribute on <body>. */
(function(){
  'use strict';

  var FOOTER_CSS =
    'footer.ts-sitefoot{margin:36px -16px 0;padding:36px 20px 22px calc(20px + env(safe-area-inset-left));background:#14161f;color:#a4a8b1;font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;font-size:13px;line-height:1.5;border-top:0}' +
    '@media(min-width:769px){footer.ts-sitefoot{margin:44px -24px 0;padding:44px 28px 24px}}' +
    '@media(min-width:1200px){footer.ts-sitefoot{margin:44px -32px 0;padding:44px 36px 24px}}' +
    'footer.ts-sitefoot .fwrap{max-width:1200px;margin:0 auto}' +
    'footer.ts-sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 28px;align-items:flex-start}' +
    '@media(max-width:840px){footer.ts-sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}}' +
    '@media(max-width:420px){footer.ts-sitefoot .fmenu{grid-template-columns:1fr;gap:24px}}' +
    'footer.ts-sitefoot .fcol h4{font-weight:600;font-size:14.5px;color:#fff;letter-spacing:-.1px;margin:0 0 12px}' +
    'footer.ts-sitefoot .fcol a{display:block;color:#c9ccd4;text-decoration:none;font-size:13px;font-weight:500;padding:5px 0;transition:color .12s}' +
    'footer.ts-sitefoot .fcol a:hover{color:#fff}' +
    'footer.ts-sitefoot .fsocial-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;max-width:220px}' +
    'footer.ts-sitefoot .fsocial-grid a{padding:0;width:34px;height:34px;border-radius:50%;background:#2b2e36;color:#fff;display:inline-flex;align-items:center;justify-content:center;transition:background .12s;flex:none}' +
    'footer.ts-sitefoot .fsocial-grid a:hover{background:#3b3f4a}' +
    'footer.ts-sitefoot .fsocial-grid svg{width:15px;height:15px;fill:currentColor;display:block}' +
    'footer.ts-sitefoot .fsub{margin-top:28px;padding-top:18px;border-top:1px solid #2a2e42;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}' +
    'footer.ts-sitefoot .fmeta{color:#7b8090;font-size:11.5px;letter-spacing:.02em;line-height:1.55}' +
    'footer.ts-sitefoot .fbrand{display:inline-flex;align-items:center;gap:6px;text-decoration:none}' +
    'footer.ts-sitefoot .fbrand img{height:22px;width:auto;display:block}' +
    'footer.ts-sitefoot .fbrand .fbrand-t{font-weight:500;letter-spacing:-.3px;font-size:17px;color:#fff}' +
    'body.embed footer.ts-sitefoot{display:none !important}';

  var ICONS = {
    ig: '<svg viewBox="0 0 24 24"><path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.5.2 1.9.4a3.4 3.4 0 0 1 1.9 1.9c.2.4.3.9.4 1.9 0 1.1.1 1.4.1 4s0 3-.1 4c0 1-.2 1.5-.4 1.9a3.4 3.4 0 0 1-1.9 1.9c-.4.2-.9.3-1.9.4-1 0-1.3.1-4 .1s-3 0-4-.1c-1 0-1.5-.2-1.9-.4a3.4 3.4 0 0 1-1.9-1.9c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4c0-1 .2-1.5.4-1.9A3.4 3.4 0 0 1 4.6 4.2c.4-.2.9-.3 1.9-.4C7.4 3.7 7.7 3.7 12 3.7zm0-1.5c-2.7 0-3.1 0-4.1.1-1.1 0-1.9.2-2.5.5A4.9 4.9 0 0 0 3.3 5.4c-.3.6-.4 1.4-.5 2.5-.1 1-.1 1.4-.1 4.1s0 3.1.1 4.1c0 1.1.2 1.9.5 2.5a4.9 4.9 0 0 0 2.7 2.7c.6.3 1.4.4 2.5.5 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c1.1 0 1.9-.2 2.5-.5a4.9 4.9 0 0 0 2.7-2.7c.3-.6.4-1.4.5-2.5.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c0-1.1-.2-1.9-.5-2.5a4.9 4.9 0 0 0-2.7-2.7c-.6-.3-1.4-.4-2.5-.5-1-.1-1.4-.1-4.1-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zM18.4 5.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>',
    tw: '<svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>',
    tt: '<svg viewBox="0 0 24 24"><path d="M17.4 3.4c-1.5 0-2.7-1.2-2.7-2.7v-.7h-3.3v14.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V8.6h-.8a6 6 0 1 0 6 6V8.9a6 6 0 0 0 3.8 1.3V7c-.4 0-.7-.1-1.1-.2-.4-.1-.8-.2-1.1-.4a5.4 5.4 0 0 1-2.7-3z"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.6 4 12 4 12 4s-7.6 0-9.4.4A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.1 2.1C4.4 20 12 20 12 20s7.6 0 9.4-.4a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.5.5-5.5s0-3.6-.5-5.5zM9.6 15.6V8.4l6.4 3.6z"/></svg>'
  };

  function footerHTML(){
    var year = new Date().getFullYear();
    return '<footer class="ts-sitefoot"><div class="fwrap">' +
      '<div class="fmenu">' +
        '<div class="fcol">' +
          '<h4>Product</h4>' +
          '<a href="/app">Community</a>' +
          '<a href="/games">Games</a>' +
          '<a href="/blog">Blog</a>' +
          '<a href="/how-to-play">FAQs</a>' +
          '<a href="/about">About us</a>' +
        '</div>' +
        '<div class="fcol">' +
          '<h4>Support</h4>' +
          '<a href="mailto:contact@talksibi.com?subject=talksibi%20—%20Bug%20report">Report a bug</a>' +
          '<a href="mailto:feedback@talksibi.com?subject=Feedback">Send feedback</a>' +
          '<a href="/become-a-teacher" style="color:#ffd166;font-weight:700">🎓 Become a teacher</a>' +
          '<a href="mailto:contact@talksibi.com">Contact us</a>' +
        '</div>' +
        '<div class="fcol">' +
          '<h4>Legal</h4>' +
          '<a href="/terms">Terms of Service</a>' +
          '<a href="/privacy">Privacy Policy</a>' +
          '<a href="/child-safety">Child Safety</a>' +
        '</div>' +
        '<div class="fcol">' +
          '<h4>Social</h4>' +
          '<div class="fsocial-grid">' +
            '<a href="https://instagram.com/talksibi" target="_blank" rel="noopener" aria-label="Instagram">' + ICONS.ig + '</a>' +
            '<a href="https://x.com/talksibi" target="_blank" rel="noopener" aria-label="X">' + ICONS.tw + '</a>' +
            '<a href="https://tiktok.com/@talksibi" target="_blank" rel="noopener" aria-label="TikTok">' + ICONS.tt + '</a>' +
            '<a href="https://youtube.com/@talksibi" target="_blank" rel="noopener" aria-label="YouTube">' + ICONS.yt + '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fsub">' +
        '<div class="fmeta">© ' + year + ' talksibi — Connect · Learn · Play. Practise languages with real people.</div>' +
        '<a class="fbrand" href="/" aria-label="talksibi home">' +
          '<img src="/mark.svg" alt="" onerror="this.style.display=\'none\'">' +
          '<span class="fbrand-t">talksibi</span>' +
        '</a>' +
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
    if (document.querySelector('footer.ts-sitefoot')) return;   // page already has one inline
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
