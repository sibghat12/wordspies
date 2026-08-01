/* game-session.js — stamps localStorage['wsActiveGame'] so /social's
 * bottom "Resume game" pill can find its way back.
 *
 * Each game page can set window.WS_GAME = { slug, label } before
 * loading this script; we then figure out the ROOM CODE from the URL
 * (?room=XXXX) and write:
 *   { game, path, code, title, t }
 * to localStorage. Timestamp is refreshed every 45s while the tab is
 * open, so a stale stamp (page closed 6+ hours ago) naturally times
 * out on the /social side.
 *
 * We DON'T clear the stamp on unload — that would defeat the point
 * (the pill exists to lure users back after they've left the tab).
 * The game's own "End" / "Leave" action can explicitly call
 * window.wsClearGameSession() to remove the stamp when the room truly
 * ends.
 *
 * Owner ask 1 Aug 2026: 'if he left the tab he can back with the
 * black stripe' + 'if I go back to social I can back to the game
 * anytime'.
 */
(function () {
  'use strict';
  var G = window.WS_GAME || {};
  var slug = String(G.slug || '').toLowerCase();
  if (!slug) return;
  function code() {
    try {
      var u = new URL(location.href);
      return String(u.searchParams.get('room') || '').toUpperCase().slice(0, 6);
    } catch (e) { return ''; }
  }
  function path() {
    // Preserve the current room+go query so a resume opens the
    // exact same room the user was in.
    try {
      var u = new URL(location.href);
      var qs = [];
      var r = u.searchParams.get('room');
      if (r) qs.push('room=' + encodeURIComponent(r));
      // Auto-join on resume for all games except party
      if (slug !== 'party' && r) qs.push('go=1');
      return u.pathname + (qs.length ? '?' + qs.join('&') : '');
    } catch (e) { return location.pathname; }
  }
  function stamp() {
    var c = code();
    if (!c) {
      // No room yet (still on the game's landing screen) — don't
      // stamp; there's nothing meaningful to resume.
      return;
    }
    var rec = {
      game: slug,
      path: path(),
      code: c,
      title: (G.label || 'In a game'),
      t: Date.now()
    };
    try { localStorage.setItem('wsActiveGame', JSON.stringify(rec)); } catch (e) {}
  }
  window.wsClearGameSession = function () {
    try { localStorage.removeItem('wsActiveGame'); } catch (e) {}
  };

  /* wsGameCountdown(cb) — snappy full-screen 3 · 2 · 1 · Let's go
   * overlay before a new game starts. Owner ask 1 Aug 2026: 'if
   * someone starts a new game show a sweet alert like 3 2 1 and
   * let's go, make it fast'. Total ~1.6s. Then fires the callback.
   * Reuses SweetAlert2 if it's loaded on the page (it is on
   * /codenames /spy /pool via their bundled CDN); otherwise falls
   * back to a plain overlay div.
   */
  window.wsGameCountdown = function (cb) {
    var steps = ['3', '2', '1', "Let's go!"];
    var i = 0;
    // Try SweetAlert2 first — matches the app's visual language and
    // handles animation for us.
    var useSwal = typeof window.Swal === 'object' && typeof window.Swal.fire === 'function';
    var tick = function () {
      if (i >= steps.length) {
        if (useSwal) { try { window.Swal.close(); } catch (e) {} }
        else {
          var el = document.getElementById('_wsCountdown');
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        if (typeof cb === 'function') try { cb(); } catch (e) {}
        return;
      }
      var text = steps[i++];
      var isGo = text.indexOf('!') > -1;
      if (useSwal) {
        window.Swal.fire({
          html: '<div style="font-family:Fredoka,Nunito,system-ui,sans-serif;font-weight:700;font-size:' + (isGo ? '48px' : '96px') + ';letter-spacing:-1.5px;color:#16181f;line-height:1;padding:22px 8px;animation:wsCdIn .28s cubic-bezier(.34,1.56,.64,1) both">' + text + '</div>',
          showConfirmButton: false, timer: isGo ? 500 : 400, timerProgressBar: false,
          allowOutsideClick: false, allowEscapeKey: false,
          backdrop: 'rgba(255,255,255,.92)', width: 320
        });
      } else {
        var el = document.getElementById('_wsCountdown');
        if (!el) {
          el = document.createElement('div');
          el.id = '_wsCountdown';
          el.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.94);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Fredoka,Nunito,system-ui,sans-serif;font-weight:700;color:#16181f;letter-spacing:-1.5px;line-height:1';
          document.body.appendChild(el);
        }
        el.style.fontSize = isGo ? '48px' : '96px';
        el.textContent = text;
        el.style.animation = 'none'; void el.offsetHeight;
        el.style.animation = 'wsCdIn .28s cubic-bezier(.34,1.56,.64,1) both';
      }
      setTimeout(tick, isGo ? 500 : 400);
    };
    // Inject the pop animation keyframes once.
    if (!document.getElementById('_wsCdCss')) {
      var css = document.createElement('style');
      css.id = '_wsCdCss';
      css.textContent = '@keyframes wsCdIn{from{opacity:0;transform:scale(.5)}70%{transform:scale(1.15)}to{opacity:1;transform:scale(1)}}';
      document.head.appendChild(css);
    }
    tick();
  };
  stamp();
  // Refresh the timestamp every 45s while the page is open so the
  // stale-clear on /social (6h) only fires after real inactivity.
  setInterval(stamp, 45000);
  // Also re-stamp when the URL changes (SPAs / games that push new
  // room codes without a full reload).
  var lastHref = location.href;
  setInterval(function () {
    if (location.href !== lastHref) { lastHref = location.href; stamp(); }
  }, 1500);
})();
