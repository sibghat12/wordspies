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
  /* wsGameCountdown was retired 1 Aug 2026 per owner ask 'remove the
   * 3-2-1'. Stubbed as pass-through so any existing caller still runs
   * the callback immediately without breaking. */
  window.wsGameCountdown = function (cb) { if (typeof cb === 'function') try { cb(); } catch (e) {} };
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
