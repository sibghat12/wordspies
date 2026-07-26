/* WordSpies — the friends strip on a game lobby.
 *
 * Sharing a link is fine when your friend is on WhatsApp. But most of the
 * people you actually play with are already *here* — you follow them, they
 * follow you, you have chats with them. So the lobby shows those people as a
 * row of faces: tap one and the invite lands straight in your chat with them,
 * they get the push, and the message renders as a big Join button on their
 * side. No copying, no app-switching.
 *
 * Self-contained on purpose: any game page gets the whole feature with two
 * lines — set window.WS_GAME = {slug, label} and load this script. The page
 * only needs an element with id="friendRow" inside its lobby, and its room
 * code visible in #lobbyCode (every lobby already shows one). Logged-out
 * players and players with no friends yet see nothing at all — the strip
 * simply never appears, and the share buttons remain the way in.
 */
(function () {
  var G = window.WS_GAME;
  var row = document.getElementById('friendRow');
  if (!G || !row) return;

  // Styles live here, not in each page, so the strip looks the same everywhere.
  var css = document.createElement('style');
  css.textContent =
    '#friendRow{margin-top:16px;border-top:1px solid #eceaf6;padding-top:14px}' +
    '#friendRow .fr-t{font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#9aa0ab;margin-bottom:10px;text-align:center}' +
    '#friendRow .fr-list{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 6px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#friendRow .fr-list::-webkit-scrollbar{display:none}' +
    '#friendRow .fr{flex:none;width:64px;border:0;background:none;padding:0;cursor:pointer;text-align:center;font-family:inherit}' +
    '#friendRow .fr .av{width:52px;height:52px;border-radius:50%;margin:0 auto;background:#f3f1fe;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;color:#6b5ce8;overflow:hidden;position:relative;border:2px solid transparent;transition:transform .15s,border-color .15s}' +
    '#friendRow .fr .av img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#friendRow .fr:active .av{transform:scale(.92)}' +
    '#friendRow .fr.on .av{border-color:#22c07a}' +
    '#friendRow .fr .dot{position:absolute;right:1px;bottom:1px;width:11px;height:11px;border-radius:50%;background:#22c07a;border:2px solid #fff}' +
    '#friendRow .fr .nm{font-size:11.5px;font-weight:600;color:#16181f;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#friendRow .fr .st{font-size:10px;color:#9aa0ab;margin-top:1px;min-height:12px}' +
    '#friendRow .fr.sent .av{border-color:#6b5ce8}' +
    '#friendRow .fr.sent .st{color:#6b5ce8;font-weight:700}';
  document.head.appendChild(css);

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var code = function () {
    var el = document.getElementById('lobbyCode');
    var c = el ? el.textContent.trim() : '';
    return /^[A-Z0-9]{4}$/.test(c) ? c : null;
  };

  var busy = {};

  function send(id, btn) {
    var c = code();
    if (!c || busy[id]) return;
    busy[id] = true;
    var st = btn.querySelector('.st');
    st.textContent = '…';
    var url = location.origin + '/' + G.slug + '?room=' + c + '&go=1';
    fetch('/api/social/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: id, kind: 'text', text: G.label + ' — I’ve set up a table. Tap to play me: ' + url })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) { btn.classList.add('sent'); st.textContent = 'Sent ✓'; }
      else { busy[id] = false; st.textContent = 'Try again'; }
    }).catch(function () { busy[id] = false; st.textContent = 'Try again'; });
  }

  // Only ask the server who your friends are once we know you're logged in —
  // a guest lobby stays exactly as it was.
  fetch('/api/social/me').then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.me) return;
    return fetch('/api/social/people').then(function (r) { return r.json(); }).then(function (p) {
      var people = (p && p.people) || [];
      if (!people.length) return;
      row.innerHTML =
        '<div class="fr-t">Or tap a friend — the invite lands in your chat</div>' +
        '<div class="fr-list">' + people.slice(0, 20).map(function (u) {
          return '<button class="fr' + (u.online ? ' on' : '') + '" data-id="' + esc(u.id) + '">' +
            '<span class="av">' + (u.photo ? '<img src="' + esc(u.photo) + '" alt="">' : esc((u.name || '?')[0].toUpperCase())) +
            (u.online ? '<span class="dot"></span>' : '') + '</span>' +
            '<span class="nm">' + esc(u.name) + '</span>' +
            '<span class="st">' + (u.online ? 'online' : '') + '</span>' +
          '</button>';
        }).join('') + '</div>';
      row.classList.remove('hidden');
      row.querySelectorAll('.fr').forEach(function (b) {
        b.addEventListener('click', function () { send(b.dataset.id, b); });
      });
    });
  }).catch(function () {});
})();
