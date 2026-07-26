// Watching a game you are not playing.
//
// One file for all four side games, because the whole feature is the same
// sentence in each of them: you arrived with ?watch=CODE, so you get the board
// and none of the buttons. The page-side lock here is manners, not security —
// the server never gives a watcher a seat, and every action handler it has
// refuses to run for a socket that isn't sitting down. So even a page that
// lied about all of this could not move a piece.
//
// The other half of the job is making sure nobody is ever watched secretly.
// Every game shows a live eye count to the people playing it, and a watcher
// who wants in taps once and the players see it. Being able to look at a
// stranger's game is only fair if the stranger can see you looking.

(function () {
  var q = new URLSearchParams(location.search);
  var CODE = (q.get('watch') || '').trim().toUpperCase();

  window.WATCH_CODE = CODE;
  var on = false;
  window.isWatching = function () { return on; };

  if (!document.getElementById('watchCss')) {
    var st = document.createElement('style');
    st.id = 'watchCss';
    st.textContent = [
      '.wbar{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;gap:10px;',
      '  padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#16181f;color:#fff;',
      '  font:500 13.5px/1.35 Inter,system-ui,sans-serif;box-shadow:0 -6px 20px rgba(0,0,0,.22)}',
      '.wbar .we{font-size:16px}',
      '.wbar .wt{flex:1;min-width:0}',
      '.wbar .wt b{font-weight:600}',
      '.wbar .wt small{display:block;opacity:.62;font-weight:400;font-size:12px}',
      '.wbar button,.wbar a{border:0;border-radius:99px;padding:8px 14px;font:600 13px Inter,system-ui,sans-serif;',
      '  cursor:pointer;text-decoration:none;white-space:nowrap}',
      '.wbar button{background:#fff;color:#16181f}',
      '.wbar button[disabled]{opacity:.5;cursor:default}',
      '.wbar a{background:rgba(255,255,255,.14);color:#fff}',
      'body.watching{padding-bottom:64px}',
      // Belt and braces on top of the server refusing to act: if you can't do
      // it, you shouldn't be invited to try it and then be told no.
      'body.watching .tok,body.watching #rollBtn,body.watching #startBtn,body.watching #againBtn,',
      'body.watching #addBotBtn,body.watching #shareBtn,body.watching #dropRow,body.watching #cols,',
      'body.watching canvas,body.watching #wordIn,body.watching #sendBtn,body.watching #unpickBtn',
      '  {pointer-events:none !important}',
      '.weyes{position:fixed;top:calc(10px + env(safe-area-inset-top));right:12px;z-index:60;',
      '  background:#16181f;color:#fff;border-radius:99px;padding:5px 11px;',
      '  font:600 12.5px Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.18)}',
      '.wknock{position:fixed;left:50%;transform:translateX(-50%);top:calc(12px + env(safe-area-inset-top));',
      '  z-index:80;background:#16181f;color:#fff;border-radius:14px;padding:10px 16px;max-width:88vw;',
      '  font:500 13.5px Inter,system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.3)}'
    ].join('');
    document.head.appendChild(st);
  }

  function bar() {
    var b = document.getElementById('wbar');
    if (b) return b;
    b = document.createElement('div');
    b.className = 'wbar';
    b.id = 'wbar';
    b.innerHTML =
      '<span class="we">👁</span>' +
      '<span class="wt"><b id="wbarT">You\'re watching</b>' +
      '<small id="wbarS">Look all you like — you can\'t touch the board from here.</small></span>' +
      '<button id="wknockBtn">Ask for a seat</button>' +
      '<a href="/social#live">Live</a>';
    document.body.appendChild(b);
    return b;
  }

  // Tapping the players on the shoulder. Deliberately not a request they have
  // to answer — there is no accept button, no queue, nothing to manage. It
  // just tells them somebody is out here and would play if a seat opened.
  function wireKnock(socket) {
    var btn = document.getElementById('wknockBtn');
    if (!btn) return;
    btn.onclick = function () {
      socket.emit('knock');
      btn.disabled = true;
      btn.textContent = 'They know 👍';
      var s = document.getElementById('wbarS');
      if (s) s.textContent = 'The players have been told you\'d like a seat.';
      setTimeout(function () { btn.disabled = false; btn.textContent = 'Ask for a seat'; }, 20000);
    };
  }

  function toast(html) {
    var t = document.createElement('div');
    t.className = 'wknock';
    t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 5200);
  }

  // Call this the moment the page has a socket. Safe to call on a page nobody
  // is watching: it still listens for knocks, which is the half that matters
  // to the people actually playing.
  window.watchWire = function (socket, rerender) {
    socket.on('knock', function (d) {
      var who = (d && d.name) || 'Someone';
      toast('<b>' + who.replace(/[<>&]/g, '') + '</b> is watching and would like a seat.');
    });
    if (!CODE) return;
    document.body.classList.add('watching');
    socket.on('watching', function () {
      on = true;
      bar();
      wireKnock(socket);
      if (typeof rerender === 'function') rerender();
    });
    socket.emit('watch', { code: CODE });
  };

  // The eye count the players see. Nobody gets watched quietly.
  window.watchEyes = function (n) {
    n = n || 0;
    var el = document.getElementById('weyes');
    if (!n || on) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'weyes';
      el.id = 'weyes';
      document.body.appendChild(el);
    }
    el.textContent = '👁 ' + n + ' watching';
  };
})();
