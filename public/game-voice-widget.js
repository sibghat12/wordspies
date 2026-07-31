/* game-voice-widget.js — drop-in voice + emoji for any WordSpies game.
 *
 * A game page just does:
 *   <script src="/voice.js"></script>
 *   <script src="/emoji-fly.js"></script>
 *   <script src="/game-voice-widget.js"></script>
 *   …then after `conn()` establishes its socket:
 *     wsGameVoice.attach({ socket, myId, canPublish });
 *
 * The widget injects a compact floating pair (bottom-right): a mic pill
 * for seated players + an emoji burst for everyone. Voice runs through
 * the shared Cloudflare Realtime SFU (128kbps stereo Opus). Emoji uses
 * the shared floating-heart layer. Watchers see the emoji button only.
 * If a game has its own mic UI it just doesn't load this file — no
 * conflict.
 */
(function () {
  'use strict';

  var mounted = false;
  var socket = null;
  var canPublish = false;

  function css() {
    if (document.getElementById('gvw-css')) return;
    var s = document.createElement('style');
    s.id = 'gvw-css';
    s.textContent = [
      '.gvw{position:fixed;right:14px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:70;display:flex;flex-direction:column;align-items:flex-end;gap:8px}',
      '.gvw .gvw-btn{width:48px;height:48px;border-radius:50%;border:1.5px solid #e6e6ef;background:#fff;color:#16181f;font-size:19px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.12);transition:transform .1s,background .12s,border-color .12s}',
      '.gvw .gvw-btn:hover{transform:translateY(-2px)}',
      '.gvw .gvw-btn:active{transform:scale(.94)}',
      '.gvw .gvw-mic.on{background:linear-gradient(135deg,#22c07a,#159f5d);color:#fff;border-color:transparent;animation:gvw-pulse 1.3s ease-in-out infinite}',
      '.gvw .gvw-mic.deny{background:#fff2f2;color:#c33;border-color:#f2c9c9}',
      '.gvw .gvw-mic[disabled]{opacity:.5;cursor:default}',
      '@keyframes gvw-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,192,122,.55)}70%{box-shadow:0 0 0 12px rgba(34,192,122,0)}}',
      '.gvw .gvw-emo-menu{display:none;position:absolute;bottom:60px;right:0;background:#fff;border:1px solid #e6e6ef;border-radius:14px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.14);width:230px;grid-template-columns:repeat(6,1fr);gap:2px}',
      '.gvw .gvw-emo-menu.show{display:grid}',
      '.gvw .gvw-emo-menu button{background:transparent;border:0;font-size:22px;padding:6px 4px;border-radius:8px;cursor:pointer;line-height:1}',
      '.gvw .gvw-emo-menu button:hover{background:#f4f5f7;transform:scale(1.14)}',
      '@media(max-width:520px){ .gvw{right:10px;bottom:calc(14px + env(safe-area-inset-bottom))} .gvw .gvw-btn{width:44px;height:44px;font-size:17px} }'
    ].join('');
    document.head.appendChild(s);
  }

  function mountDom() {
    if (document.getElementById('gvwRoot')) return;
    var root = document.createElement('div');
    root.className = 'gvw';
    root.id = 'gvwRoot';
    root.innerHTML =
      '<div class="gvw-emo-menu" id="gvwEmoMenu">' +
        ['❤️','😂','🔥','👏','😮','🎉','💯','🙌','👍','🤔','🎮','🏆']
          .map(function(e){ return '<button data-e="'+e+'">'+e+'</button>'; }).join('') +
      '</div>' +
      '<button class="gvw-btn gvw-emo" id="gvwEmoBtn" title="React">🎉</button>' +
      '<button class="gvw-btn gvw-mic" id="gvwMicBtn" title="Talk">🎤</button>';
    document.body.appendChild(root);

    // Emoji burst — reuses the shared wsEmojiFly module.
    var menu = document.getElementById('gvwEmoMenu');
    document.getElementById('gvwEmoBtn').addEventListener('click', function (ev) {
      ev.stopPropagation();
      menu.classList.toggle('show');
    });
    menu.querySelectorAll('button[data-e]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.wsEmojiFly) wsEmojiFly.send(b.dataset.e);
        menu.classList.remove('show');
      });
    });
    document.addEventListener('click', function (ev) {
      if (!menu.classList.contains('show')) return;
      if (ev.target.closest('.gvw')) return;
      menu.classList.remove('show');
    });

    // Mic toggle — only clickable for seated players; toasts otherwise.
    document.getElementById('gvwMicBtn').addEventListener('click', function () {
      if (!canPublish) {
        toast('Only players can talk — watchers listen only.');
        return;
      }
      if (!window.wsVoice) return;
      wsVoice.setMic(!wsVoice.micOn)
        .then(function () { paintMic(); })
        .catch(function (e) { toast(e.message || 'Mic failed.'); paintMic(); });
    });
    paintMic();
  }

  function paintMic() {
    var btn = document.getElementById('gvwMicBtn');
    if (!btn) return;
    btn.classList.toggle('on', !!(window.wsVoice && wsVoice.micOn));
    if (!canPublish) { btn.setAttribute('disabled', 'disabled'); btn.title = 'Watchers listen only'; }
    else { btn.removeAttribute('disabled'); btn.title = window.wsVoice && wsVoice.micOn ? 'Mute' : 'Talk'; }
  }

  var toastEl = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;bottom:calc(84px + env(safe-area-inset-bottom));right:14px;background:#16181f;color:#fff;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:99px;z-index:80;opacity:0;transition:.18s;pointer-events:none;max-width:260px';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 2400);
  }

  // Public API: called from the game page once its socket is connected
  // and it knows whether the caller is seated. Safe to call repeatedly —
  // seat state can flip after the socket seats us or someone leaves.
  window.wsGameVoice = {
    attach: function (opts) {
      css();
      mountDom();
      socket = opts && opts.socket;
      canPublish = !!(opts && opts.canPublish);
      if (!socket) return;
      if (window.wsVoice) {
        wsVoice.setMyId((opts && opts.myId) || socket.id);
        wsVoice.setCanPublish(canPublish);
        wsVoice.init({ socket: socket, myId: (opts && opts.myId) || socket.id, canPublish: canPublish });
        wsVoice.on('mic', paintMic);
      }
      if (window.wsEmojiFly) wsEmojiFly.init({ socket: socket });
      paintMic();
      mounted = true;
    },
    setCanPublish: function (v) { canPublish = !!v; if (window.wsVoice) wsVoice.setCanPublish(canPublish); paintMic(); },
    get mounted() { return mounted; }
  };
})();
