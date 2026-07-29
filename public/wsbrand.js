/* wsbrand.js — the shared bottom-of-every-page footer, the Install app
   button, and a couple of consistency touches. Load once with:
   <script src="/wsbrand.js" defer></script>
   Pages that mark themselves as "chat mode" (body.chatlock, body.chatfull
   or a document element with data-nochrome) get no chrome — the chat view
   asked for that. Everything else gets the same footer everywhere. */
(function(){
  'use strict';

  // Pages that opt out of shared chrome: standalone chat / minimal game
  // shells that fill the screen edge-to-edge and can't afford a footer.
  const NOCHROME = /(^|\s)(chatlock|chatfull)(\s|$)/;
  function chromeless() {
    if (document.documentElement.hasAttribute('data-nochrome')) return true;
    return NOCHROME.test(document.body ? document.body.className : '');
  }

  // Capture the PWA install prompt for the download button. Chrome/Edge on
  // Android and desktop will fire this; iOS Safari won't (there we fall
  // back to written steps from /a2hs.js).
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Reveal any hidden install CTAs on the page.
    document.querySelectorAll('.wsinstall').forEach(el => el.classList.remove('wsinstall-hide'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.querySelectorAll('.wsinstall').forEach(el => el.classList.add('wsinstall-done'));
  });

  async function doInstall() {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (e) {}
      deferredPrompt = null;
      return;
    }
    // No native prompt available — show the platform-specific written steps.
    const steps = (typeof window.wsInstallSteps === 'function') ? window.wsInstallSteps() : null;
    const one = (steps && steps.one) || 'Open your browser menu (⋮ or Share).';
    const two = (steps && steps.two) || 'Choose "Install app" or "Add to Home Screen".';
    // Prefer a modal that already exists on the community app; otherwise
    // a plain alert is fine and works everywhere.
    const modal = document.getElementById('a2hs');
    if (modal) modal.classList.remove('hidden');
    else alert('Install WordSpies\n\n1. ' + one.replace(/<[^>]+>/g,'') + '\n2. ' + two.replace(/<[^>]+>/g,''));
  }
  window.wsDoInstall = doInstall;

  // Inject the shared styles once, at head, so the footer picks them up
  // before it paints.
  function injectStyles() {
    if (document.getElementById('wsbrand-css')) return;
    const s = document.createElement('style');
    s.id = 'wsbrand-css';
    s.textContent = `
      .wsfoot{background:#1a1c22;color:#c9ccd4;font-family:'Nunito','Inter',system-ui,-apple-system,sans-serif;padding:44px 20px 0;margin-top:36px;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
      .wsfoot a{color:#c9ccd4;text-decoration:none;transition:color .12s}
      .wsfoot a:hover{color:#fff}
      .wsfoot-inner{max-width:1180px;margin:0 auto}
      .wsfoot-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:36px;padding-bottom:32px}
      .wsfoot-col h4{font-family:'Fredoka','Nunito',system-ui,sans-serif;font-size:15.5px;color:#fff;font-weight:600;margin:0 0 14px;letter-spacing:-.2px}
      .wsfoot-col a{display:block;padding:5px 0;font-size:13.5px;font-weight:500}
      .wsfoot-col .row{display:flex;gap:9px;flex-wrap:wrap;margin-top:2px}
      .wsfoot-sicon{width:34px;height:34px;border-radius:50%;background:#2b2e36;display:inline-flex;align-items:center;justify-content:center;color:#c9ccd4;transition:background .12s,color .12s}
      .wsfoot-sicon:hover{background:#3b3f4a;color:#fff}
      .wsfoot-sicon svg{width:15px;height:15px;fill:currentColor}
      .wsinstall{display:inline-flex;align-items:center;gap:8px;background:#5a7bff;background-image:linear-gradient(135deg,#5a7bff,#7c5cff);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-family:'Fredoka','Nunito',system-ui,sans-serif;font-weight:600;font-size:14.5px;cursor:pointer;text-decoration:none;box-shadow:0 6px 18px rgba(96,88,255,.32);transition:transform .12s,box-shadow .12s;white-space:nowrap}
      .wsinstall:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(96,88,255,.42)}
      .wsinstall:active{transform:translateY(0)}
      .wsinstall .wsi-ico{font-size:16px;line-height:1}
      .wsinstall-done{opacity:.55;pointer-events:none}
      .wsinstall-done::after{content:' ✓ installed'}
      .wsfoot-note{font-size:12px;color:#8b8f99;line-height:1.55;margin-top:10px;max-width:220px}
      .wsfoot-bar{border-top:1px solid #2a2d34;padding:20px 0 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;color:#7f838d;font-size:12.5px;font-weight:500}
      .wsfoot-bar .wsfoot-brand{font-family:'Fredoka','Nunito',system-ui,sans-serif;font-weight:600;font-size:16px;letter-spacing:-.3px;color:#e6e8ee}
      .wsfoot-bar .wsfoot-brand em{font-style:normal;color:#e8506b}
      @media(max-width:800px){
        .wsfoot{padding:34px 18px 0;margin-top:24px}
        .wsfoot-cols{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px}
      }
      @media(max-width:420px){
        .wsfoot-cols{grid-template-columns:1fr;gap:22px}
        .wsfoot-note{max-width:none}
      }
      /* Pages that opt out of chrome — chat surfaces, some game shells. */
      body.chatlock .wsfoot,body.chatfull .wsfoot{display:none !important}
      html[data-nochrome] .wsfoot{display:none !important}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // Small SVG icons for the social row. Kept inline so the footer needs
  // no image assets and stays crisp on any DPI.
  const ICONS = {
    ig: '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2 0 1.8.3 2.3.5.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.5 2.3 0 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.3 1.8-.5 2.3-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.3.5-1.3 0-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.3-2.3-.5-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.5-2.3 0-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c0-1.2.3-1.8.5-2.3.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.3-.5 1.3 0 1.7-.1 4.9-.1zM12 5.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 10.2A4 4 0 118 12a4 4 0 014 4zm6.4-10.5a1.5 1.5 0 11-1.5-1.4 1.4 1.4 0 011.5 1.4z"/></svg>',
    tw: '<svg viewBox="0 0 24 24"><path d="M18.9 3H22l-7.1 8.1L23 21h-6.6l-5.2-6.6L5 21H2l7.5-8.6L1.6 3h6.7l4.7 6zm-1.2 16.1h1.7L7 4.8H5.1z"/></svg>',
    fb: '<svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.6 9.9v-7H8v-3h2.4V9.4c0-2.4 1.4-3.7 3.5-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.5V12h2.6l-.4 3h-2.2v6.9A10 10 0 0022 12z"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M23.5 6.5a3 3 0 00-2.1-2.1C19.5 4 12 4 12 4s-7.5 0-9.4.4A3 3 0 00.5 6.5C.1 8.4.1 12 .1 12s0 3.6.4 5.5a3 3 0 002.1 2.1C4.5 20 12 20 12 20s7.5 0 9.4-.4a3 3 0 002.1-2.1c.4-1.9.4-5.5.4-5.5s0-3.6-.4-5.5zM9.6 15.6V8.4L15.8 12z"/></svg>',
    dc: '<svg viewBox="0 0 24 24"><path d="M20.3 4.4A19.7 19.7 0 0016 3l-.2.4a17.9 17.9 0 00-3.8-.4 17.9 17.9 0 00-3.8.4L8 3a19.7 19.7 0 00-4.3 1.4A20.4 20.4 0 00.5 18a20 20 0 006 3l1.3-1.8a13 13 0 01-2-1l.4-.3a14.4 14.4 0 0011.6 0l.4.3a13 13 0 01-2 1L17.5 21a20 20 0 006-3 20.5 20.5 0 00-3.2-13.6zM8.4 15c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2S10.3 11.6 10.3 12.8 9.5 15 8.4 15zm7.2 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2S16.6 15 15.6 15z"/></svg>'
  };

  function footerHTML() {
    const y = new Date().getFullYear();
    return `<footer class="wsfoot" role="contentinfo">
      <div class="wsfoot-inner">
        <div class="wsfoot-cols">
          <div class="wsfoot-col">
            <h4>WordSpies</h4>
            <a href="/">Community</a>
            <a href="/games">All games</a>
            <a href="/how-to-play">How to play</a>
            <a href="/blog">Blog</a>
            <a href="/about">About</a>
          </div>
          <div class="wsfoot-col">
            <h4>Play now</h4>
            <a href="/codenames">🕵️ WordSpies</a>
            <a href="/spy">🎭 Who is the Spy?</a>
            <a href="/ludo">🎲 Ludo</a>
            <a href="/pool">🎱 8-Ball Pool</a>
            <a href="/four">🔴 Connect 4</a>
            <a href="/meld">🧠 Mind Meld</a>
          </div>
          <div class="wsfoot-col">
            <h4>Legal</h4>
            <a href="/terms">Terms of Service</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="mailto:contact@wordspies.co.uk">Contact us</a>
            <h4 style="margin-top:22px">Follow</h4>
            <div class="row">
              <a class="wsfoot-sicon" href="https://instagram.com/wordspies" target="_blank" rel="noopener" aria-label="Instagram">${ICONS.ig}</a>
              <a class="wsfoot-sicon" href="https://x.com/wordspies" target="_blank" rel="noopener" aria-label="X">${ICONS.tw}</a>
              <a class="wsfoot-sicon" href="https://facebook.com/wordspies" target="_blank" rel="noopener" aria-label="Facebook">${ICONS.fb}</a>
              <a class="wsfoot-sicon" href="https://youtube.com/@wordspies" target="_blank" rel="noopener" aria-label="YouTube">${ICONS.yt}</a>
            </div>
          </div>
          <div class="wsfoot-col">
            <h4>Get the app</h4>
            <button class="wsinstall" type="button" onclick="wsDoInstall()"><span class="wsi-ico">📲</span>Install WordSpies</button>
            <div class="wsfoot-note">Works in every browser — no download needed. Install for a full-screen, offline-ready experience on your phone or desktop.</div>
          </div>
        </div>
        <div class="wsfoot-bar">
          <div>© ${y} WordSpies. Free forever. Not affiliated with Codenames or Czech Games Edition.</div>
          <div class="wsfoot-brand">Word<em>Spies</em></div>
        </div>
      </div>
    </footer>`;
  }

  function mount() {
    injectStyles();
    if (chromeless()) return;
    if (document.getElementById('wsFooterMount')) return;
    const w = document.createElement('div');
    w.id = 'wsFooterMount';
    w.innerHTML = footerHTML();
    document.body.appendChild(w);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // The community app toggles body.chatfull when someone opens a chat.
  // Watch for that so entering a chat hides the footer and leaving shows it.
  if ('MutationObserver' in window) {
    const mo = new MutationObserver(() => {
      const m = document.getElementById('wsFooterMount');
      if (!m) return;
      m.style.display = chromeless() ? 'none' : '';
    });
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
  }
})();
