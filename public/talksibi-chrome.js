/* talksibi-chrome.js — inject the community app's topnav + sitefoot
   into every standalone page (games, blog, marketing) so they read as
   part of the same site.

   Owner ask 18 Aug 2026: "make the topnav (Community · Chats · Social
   · Learn · Games) the header for all the game pages on desktop AND
   mobile as it was — and the footer as well".

   Include with: <script src="/talksibi-chrome.js" defer></script>
   Pages opt out via body.embed (persistent-shell iframes) or the
   data-ts-no-header / data-ts-no-footer attributes on <body>. */
(function(){
  'use strict';

  // ── Slug for the "active" tab pill. Standalone pages can override by
  // setting document.body.dataset.tsTab = 'games' (or games / chats / etc.)
  function activeTab(){
    var d = document.body && document.body.dataset;
    if (d && d.tsTab) return d.tsTab;
    var p = (location.pathname || '').toLowerCase();
    if (p.startsWith('/blog')) return 'blog';
    if (p.startsWith('/games') || p === '/codenames' || p === '/spy' ||
        p === '/wordrace' || p === '/wordchain' || p === '/guessword' ||
        p === '/meld') return 'games';
    return '';
  }

  // ── Styles — mirror the community topnav + sitefoot exactly. ────────
  var CHROME_CSS =
    /* topnav */
    'nav.topnav{position:sticky;top:0;background:#ffffff;z-index:200;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;padding:12px 20px;min-height:60px;width:100%;margin:0;box-sizing:border-box;border-bottom:1px solid #e4e6ee;box-shadow:0 2px 8px rgba(15,17,25,.04);font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;color:#16181f}' +
    '@media(min-width:769px){nav.topnav{padding:12px 48px}}' +
    'nav.topnav > *{min-width:0}' +
    'nav.topnav .tnlogo{font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;font-weight:600;font-size:22px;text-decoration:none;color:inherit;letter-spacing:-.3px;justify-self:start;display:inline-flex;align-items:center}' +
    'nav.topnav .tntabs{display:flex;gap:4px;justify-self:center;min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    'nav.topnav .tntabs::-webkit-scrollbar{display:none}' +
    'nav.topnav .tntabs .tnt{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;border-radius:99px;padding:8px 16px;font-family:inherit;font-size:14px;font-weight:500;color:#6b6e7a;cursor:pointer;position:relative;white-space:nowrap;transition:background .12s,color .12s;flex-shrink:0;letter-spacing:-.1px;text-decoration:none}' +
    'nav.topnav .tntabs .tnt:hover{color:#16181f;background:#f4f5f7}' +
    'nav.topnav .tntabs .tnt.on{color:#4a55c9;background:#f3f4fb}' +
    'nav.topnav .tnright{display:flex;gap:8px;align-items:center;justify-self:end}' +
    'nav.topnav .tnlink{color:#4a4d59;text-decoration:none;font-weight:600;font-size:13.5px;padding:8px 14px;border-radius:10px;transition:background .12s,color .12s;white-space:nowrap}' +
    'nav.topnav .tnlink:hover{background:#f4f5f7;color:#16181f}' +
    'nav.topnav .tnjoin{background:#16181f;color:#fff !important;padding:9px 18px;border-radius:99px;font-weight:500;transition:background .15s;text-decoration:none;white-space:nowrap;font-size:13.5px}' +
    'nav.topnav .tnjoin:hover{background:#2a2e42}' +
    /* mobile — hide the topnav tab row (msnav owns primary nav) */
    '@media(max-width:720px){' +
      'nav.topnav{grid-template-columns:1fr auto !important;grid-template-areas:\'logo right\' !important;padding:calc(12px + env(safe-area-inset-top)) 20px 12px !important}' +
      'nav.topnav .tnlogo{grid-area:logo;font-size:19px}' +
      'nav.topnav .tnright{grid-area:right}' +
      'nav.topnav .tntabs{display:none !important}' +
      'nav.topnav .tnlink{padding:6px 10px;font-size:12.5px}' +
      'nav.topnav .tnjoin{padding:7px 14px;font-size:12.5px}' +
    '}' +
    /* mobile bottom nav — mirror social.html msnav, per §2a design mock */
    'nav.msnav{display:none}' +
    '@media(max-width:720px){' +
      'nav.msnav{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);background:#f4f5f9;border-top:1px solid #e4e6ee;padding:6px 4px calc(6px + env(safe-area-inset-bottom));z-index:80;box-shadow:0 -8px 24px rgba(15,17,25,.08);font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif}' +
      'nav.msnav a{-webkit-appearance:none;background:transparent;border:0;padding:6px 4px 4px;display:flex;flex-direction:column;align-items:center;gap:2px;font-weight:600;font-size:11px;color:#6b6e7a;text-decoration:none;line-height:1.1;-webkit-tap-highlight-color:transparent}' +
      'nav.msnav a .msnav-ico{font-size:20px;line-height:1}' +
      'nav.msnav a::after{content:\"\";display:block;width:16px;height:3px;border-radius:99px;background:transparent;margin-top:3px;transition:background .12s}' +
      'nav.msnav a.on{color:#5b6cff}' +
      'nav.msnav a.on::after{background:#5b6cff}' +
      /* leave breathing room under the sticky game so it doesn\'t sit under the bottom bar */
      'body{padding-bottom:calc(72px + env(safe-area-inset-bottom)) !important}' +
    '}' +
    /* Hide the duplicated inner <header> some games ship (logo + community/all-games links)
       — the topnav already provides all of that. Scoped to UNCLASSED
       <header> only so pages with real classed headers (party.phead
       etc.) keep theirs. */
    '.wrap > header:not([class]){display:none !important}' +
    /* footer — community sitefoot (white, 4-col) */
    'footer.sitefoot{margin:36px 0 0;padding:36px 12px 22px;background:#ffffff;color:#4a4d59;font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;font-size:13px;line-height:1.5;border-top:1px solid #e4e6ee;width:100%;box-sizing:border-box}' +
    '@media(min-width:769px){footer.sitefoot{padding:44px 48px 28px}}' +
    'footer.sitefoot .fwrap{max-width:1200px;margin:0 auto}' +
    'footer.sitefoot .fmenu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 28px;align-items:flex-start}' +
    '@media(max-width:840px){footer.sitefoot .fmenu{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}}' +
    '@media(max-width:420px){footer.sitefoot .fmenu{grid-template-columns:1fr;gap:24px}}' +
    'footer.sitefoot .fcol h4{font-weight:700;font-size:14.5px;color:#14161f;letter-spacing:-.1px;margin:0 0 12px}' +
    'footer.sitefoot .fcol a{display:block;color:#4a4d59;text-decoration:none;font-size:13px;font-weight:500;padding:5px 0;transition:color .12s}' +
    'footer.sitefoot .fcol a:hover{color:#14161f}' +
    'footer.sitefoot .fsocial-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;max-width:220px}' +
    'footer.sitefoot .fsocial-grid a{padding:0;width:34px;height:34px;border-radius:50%;background:#f4f5f9;color:#4a4d59;border:1px solid #e4e6ee;display:inline-flex;align-items:center;justify-content:center;transition:.12s;flex:none}' +
    'footer.sitefoot .fsocial-grid a:hover{background:#eef0f5;color:#14161f}' +
    'footer.sitefoot .fsocial-grid svg{width:15px;height:15px;fill:currentColor;display:block}' +
    'footer.sitefoot .fsub{margin-top:28px;padding-top:18px;border-top:1px solid #e4e6ee;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}' +
    'footer.sitefoot .fmeta{color:#8a8d99;font-size:11.5px;letter-spacing:.02em;line-height:1.55}' +
    'footer.sitefoot .fbrand{display:inline-flex;align-items:center;gap:6px;text-decoration:none}' +
    'footer.sitefoot .fbrand img{height:22px;width:auto;display:block}' +
    'footer.sitefoot .fbrand .fbrand-t{font-weight:500;letter-spacing:-.3px;font-size:17px;color:#14161f}' +
    /* Resume-game strip — persistent black pill lets the user jump
       back to a game they left running (localStorage wsActiveGame). */
    'a.ts-resume{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom));background:#16181f;color:#fff !important;text-decoration:none;padding:12px 22px;border-radius:99px;font-family:\'Hanken Grotesk\',\'Inter\',system-ui,sans-serif;font-weight:600;font-size:13.5px;z-index:150;display:flex;align-items:center;gap:10px;transition:background .12s;letter-spacing:-.1px;max-width:calc(100% - 32px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    'a.ts-resume:hover{background:#2a2e42}' +
    'a.ts-resume .ts-resume-dot{width:8px;height:8px;border-radius:50%;background:#ff3d5b;flex-shrink:0;animation:tsResumePulse 1.4s ease-in-out infinite}' +
    'a.ts-resume .ts-resume-x{margin-left:6px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.14);font-size:14px;line-height:1;color:#fff;flex-shrink:0}' +
    'a.ts-resume .ts-resume-x:hover{background:rgba(255,255,255,.26)}' +
    '@keyframes tsResumePulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '@media(max-width:720px){a.ts-resume{bottom:calc(84px + env(safe-area-inset-bottom))}}' +
    /* opt-outs */
    'body.embed nav.topnav,body.embed nav.msnav,body.embed footer.sitefoot,body.embed footer.ts-foot,body.embed footer.ts-sitefoot,body.embed a.ts-resume{display:none !important}';

  var IG = '<svg viewBox="0 0 24 24"><path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.5.2 1.9.4a3.4 3.4 0 0 1 1.9 1.9c.2.4.3.9.4 1.9 0 1.1.1 1.4.1 4s0 3-.1 4c0 1-.2 1.5-.4 1.9a3.4 3.4 0 0 1-1.9 1.9c-.4.2-.9.3-1.9.4-1 0-1.3.1-4 .1s-3 0-4-.1c-1 0-1.5-.2-1.9-.4a3.4 3.4 0 0 1-1.9-1.9c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4c0-1 .2-1.5.4-1.9A3.4 3.4 0 0 1 4.6 4.2c.4-.2.9-.3 1.9-.4C7.4 3.7 7.7 3.7 12 3.7zm0-1.5c-2.7 0-3.1 0-4.1.1-1.1 0-1.9.2-2.5.5A4.9 4.9 0 0 0 3.3 5.4c-.3.6-.4 1.4-.5 2.5-.1 1-.1 1.4-.1 4.1s0 3.1.1 4.1c0 1.1.2 1.9.5 2.5a4.9 4.9 0 0 0 2.7 2.7c.6.3 1.4.4 2.5.5 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c1.1 0 1.9-.2 2.5-.5a4.9 4.9 0 0 0 2.7-2.7c.3-.6.4-1.4.5-2.5.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c0-1.1-.2-1.9-.5-2.5a4.9 4.9 0 0 0-2.7-2.7c-.6-.3-1.4-.4-2.5-.5-1-.1-1.4-.1-4.1-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zM18.4 5.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>';
  var XI = '<svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>';
  var TT = '<svg viewBox="0 0 24 24"><path d="M17.4 3.4c-1.5 0-2.7-1.2-2.7-2.7v-.7h-3.3v14.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V8.6h-.8a6 6 0 1 0 6 6V8.9a6 6 0 0 0 3.8 1.3V7c-.4 0-.7-.1-1.1-.2-.4-.1-.8-.2-1.1-.4a5.4 5.4 0 0 1-2.7-3z"/></svg>';
  var YT = '<svg viewBox="0 0 24 24"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.6 4 12 4 12 4s-7.6 0-9.4.4A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.1 2.1C4.4 20 12 20 12 20s7.6 0 9.4-.4a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.5.5-5.5s0-3.6-.5-5.5zM9.6 15.6V8.4l6.4 3.6z"/></svg>';

  function headerHTML(){
    var t = activeTab();
    var on = function(slug){ return slug === t ? ' on' : ''; };
    return '<nav class="topnav">' +
      '<a class="tnlogo" href="/" aria-label="talksibi home">' +
        '<img src="/logo.svg?v=22" alt="talksibi" style="height:30px;width:auto;display:block" onerror="this.outerHTML=\'&lt;span style=&quot;font-family:Hanken Grotesk,Inter,sans-serif;font-weight:600;font-size:21px;color:#000&quot;&gt;talksibi&lt;/span&gt;\'">' +
      '</a>' +
      '<div class="tntabs" role="tablist">' +
        '<a class="tnt' + on('community') + '" href="/app/community">Community</a>' +
        '<a class="tnt' + on('chats')     + '" href="/app/chats">Chats</a>' +
        '<a class="tnt' + on('parties')   + '" href="/app/parties">Social</a>' +
        '<a class="tnt' + on('learn')     + '" href="/app/learn">Learn</a>' +
        '<a class="tnt' + on('games')     + '" href="/app/games">Games</a>' +
      '</div>' +
      '<div class="tnright">' +
        '<a class="tnlink" href="/app">Sign in</a>' +
        '<a class="tnjoin" href="/app">Join app</a>' +
      '</div>' +
    '</nav>';
  }

  function mobileNavHTML(){
    var t = activeTab();
    var on = function(slug){ return slug === t ? ' on' : ''; };
    return '<nav class="msnav" role="navigation" aria-label="Primary">' +
      '<a class="' + on('community').trim() + '" href="/app/community"><span class="msnav-ico" aria-hidden="true">🌍</span><span>Community</span></a>' +
      '<a class="' + on('games').trim()     + '" href="/app/games"><span class="msnav-ico" aria-hidden="true">🎮</span><span>Play</span></a>' +
      '<a class="' + on('chats').trim()     + '" href="/app/chats"><span class="msnav-ico" aria-hidden="true">💬</span><span>Chat</span></a>' +
      '<a class="' + on('learn').trim()     + '" href="/app/learn"><span class="msnav-ico" aria-hidden="true">🎓</span><span>Learn</span></a>' +
    '</nav>';
  }

  function footerHTML(){
    return '<footer class="sitefoot"><div class="fwrap">' +
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
            '<a href="https://instagram.com/talksibi" target="_blank" rel="noopener" aria-label="Instagram">' + IG + '</a>' +
            '<a href="https://x.com/talksibi" target="_blank" rel="noopener" aria-label="X">' + XI + '</a>' +
            '<a href="https://tiktok.com/@talksibi" target="_blank" rel="noopener" aria-label="TikTok">' + TT + '</a>' +
            '<a href="https://youtube.com/@talksibi" target="_blank" rel="noopener" aria-label="YouTube">' + YT + '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fsub">' +
        '<div class="fmeta">© ' + new Date().getFullYear() + ' talksibi — Connect · Learn · Play. Practise languages with real people.</div>' +
        '<a class="fbrand" href="/" aria-label="talksibi home">' +
          '<img src="/mark.svg?v=22" alt="" onerror="this.style.display=\'none\'">' +
          '<span class="fbrand-t">talksibi</span>' +
        '</a>' +
      '</div>' +
    '</div></footer>';
  }

  function injectStyles(){
    if (document.getElementById('ts-chrome-css')) return;
    var s = document.createElement('style');
    s.id = 'ts-chrome-css';
    s.textContent = CHROME_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function mountHeader(){
    if (document.body.hasAttribute('data-ts-no-header')) return;
    if (document.querySelector('nav.topnav')) return;   // page already has one
    // Replace the older slim .ts-gametop bar if present, or the
    // interim ts-nav from the previous chrome build.
    var old = document.querySelector('.ts-gametop') || document.querySelector('nav.ts-nav');
    var wrap = document.createElement('div');
    wrap.innerHTML = headerHTML();
    var nav = wrap.firstChild;
    if (old && old.parentNode) old.parentNode.replaceChild(nav, old);
    else document.body.insertBefore(nav, document.body.firstChild);
  }

  function mountFooter(){
    if (document.body.hasAttribute('data-ts-no-footer')) return;
    if (document.querySelector('footer.sitefoot')) return;   // page already has one
    // Replace the interim ts-foot / dark ts-sitefoot from earlier
    // chrome builds if present, then drop the community sitefoot in.
    var old = document.querySelector('footer.ts-foot') || document.querySelector('footer.ts-sitefoot');
    var wrap = document.createElement('div');
    wrap.innerHTML = footerHTML();
    var foot = wrap.firstChild;
    if (old && old.parentNode) old.parentNode.replaceChild(foot, old);
    else document.body.appendChild(foot);
  }

  function mountMobileNav(){
    if (document.body.hasAttribute('data-ts-no-header')) return;
    if (document.querySelector('nav.msnav')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = mobileNavHTML();
    document.body.appendChild(wrap.firstChild);
  }

  // ── Resume-game strip: read wsActiveGame from localStorage and, if
  // the user has an active game they're NOT currently on, drop a
  // bottom-center pill that jumps them back. Owner ask 18 Aug 2026:
  // "black stripe so people can join back the game while navigating".
  function mountResumeStrip(){
    try {
      var raw = localStorage.getItem('wsActiveGame');
      if (!raw) return;
      var rec = JSON.parse(raw);
      if (!rec || !rec.path || !rec.code) return;
      var age = Date.now() - (rec.t || 0);
      // Age cap tightened 22 Aug 2026: was 6h, now 30min. Owner ask:
      // "it said 1 game happening but there is no game — banner keeps
      // showing after rooms end". 30min matches the typical party /
      // game session length.
      if (age > 30 * 60 * 1000) {
        try { localStorage.removeItem('wsActiveGame'); } catch(e){}
        return;
      }
      // If we're already on the game page itself, don't show the pill.
      var hereGame = (location.pathname.split('/')[1] || '').toLowerCase();
      if (hereGame === String(rec.game).toLowerCase()) return;
      // Server-verify: only surface the pill if the server confirms
      // the user is still ACTUALLY in a room / game. If not, clear
      // the stale localStorage entry silently and don't show the
      // pill. Prevents the "1 game happening but there is no game"
      // false positive owner reported 22 Aug 2026.
      fetch('/api/user/active-game', { credentials: 'same-origin' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if (!j || !j.active) {
            try { localStorage.removeItem('wsActiveGame'); } catch(e){}
            return;
          }
          if (document.querySelector('a.ts-resume')) return;
          var a = document.createElement('a');
          a.className = 'ts-resume';
          a.href = rec.path;
          a.setAttribute('aria-label', 'Resume ' + (rec.title || 'game'));
          a.innerHTML = '<span class="ts-resume-dot" aria-hidden="true"></span>' +
            '<span>▶ Resume ' + String(rec.title || 'game').replace(/[<>]/g, '') + ' · ' + String(rec.code).replace(/[^A-Z0-9]/gi, '') + '</span>' +
            '<span class="ts-resume-x" role="button" aria-label="Dismiss">×</span>';
          a.querySelector('.ts-resume-x').addEventListener('click', function(ev){
            ev.preventDefault(); ev.stopPropagation();
            var host = ev.currentTarget.parentNode;
            if (host && host.parentNode) host.parentNode.removeChild(host);
          });
          document.body.appendChild(a);
        })
        .catch(function(){ /* network hiccup: fail quiet, don't show */ });
    } catch (e) {}
  }

  function boot(){
    injectStyles();
    mountHeader();
    mountMobileNav();
    mountResumeStrip();
    mountFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.tsChrome = {
    headerHTML: headerHTML, footerHTML: footerHTML,
    mountHeader: mountHeader, mountFooter: mountFooter
  };
})();
