/* emoji-fly.js — the floating-emoji reactions layer.
 *
 * Game page calls wsEmojiFly.init({socket}) and later wsEmojiFly.send('❤️').
 * A local send is animated instantly (no round-trip); the socket server
 * broadcasts to everyone else in the room and their pages animate one too.
 * Watchers use this to cheer players on when they can't speak.
 */
(function () {
  'use strict';

  var socket = null;
  var layer = null;
  var PALETTE = ['❤️', '😂', '🔥', '👏', '😮', '💯', '🎉', '👍'];

  function css() {
    if (document.getElementById('emojiFlyCss')) return;
    var s = document.createElement('style');
    s.id = 'emojiFlyCss';
    s.textContent = [
      '.emofly-layer{position:fixed;inset:0;pointer-events:none;z-index:80;overflow:hidden}',
      '.emofly-e{position:absolute;bottom:70px;font-size:32px;line-height:1;',
      '  filter:drop-shadow(0 2px 6px rgba(0,0,0,.28));',
      '  animation:emofly 3.2s cubic-bezier(.2,.5,.3,1) forwards;will-change:transform,opacity}',
      '@keyframes emofly{',
      '  0%{transform:translate(0,0) scale(.6) rotate(-4deg);opacity:0}',
      '  10%{transform:translate(0,-10px) scale(1) rotate(0);opacity:1}',
      '  70%{opacity:1}',
      '  100%{transform:translate(var(--emofly-x,20px),-360px) scale(1.05) rotate(6deg);opacity:0}',
      '}',
      '/* dock at the bottom of a game screen */',
      '.emopick{display:flex;gap:6px;flex-wrap:wrap;padding:6px 4px}',
      '.emopick button{background:#fff;border:1px solid #ececef;border-radius:14px;',
      '  padding:6px 10px;font-size:20px;cursor:pointer;line-height:1;',
      '  transition:transform .08s,background .12s}',
      '.emopick button:hover{background:#f4f5f7;transform:scale(1.08)}',
      '.emopick button:active{transform:scale(.95)}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureLayer() {
    if (layer && document.body.contains(layer)) return layer;
    layer = document.createElement('div');
    layer.className = 'emofly-layer';
    document.body.appendChild(layer);
    return layer;
  }

  function fly(emoji) {
    css();
    ensureLayer();
    var el = document.createElement('div');
    el.className = 'emofly-e';
    el.textContent = String(emoji || '❤️');
    // Random horizontal drift + starting X so 30 hearts don't stack on top
    var startX = 20 + Math.random() * (window.innerWidth - 80);
    var drift = (Math.random() - 0.5) * 220;
    el.style.left = startX + 'px';
    el.style.setProperty('--emofly-x', drift + 'px');
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 3400);
  }

  function send(emoji) {
    if (!socket) return;
    var e = String(emoji || '❤️').slice(0, 8);
    fly(e);                               // instant local echo
    try { socket.emit('emoji', { e: e }); } catch (err) {}
  }

  function pickerHTML(palette) {
    css();
    return '<div class="emopick">' +
      (palette || PALETTE).map(function (e) {
        return '<button type="button" data-e="' + e + '">' + e + '</button>';
      }).join('') + '</div>';
  }

  // Turn any node containing data-e buttons into a working picker.
  function wirePicker(node) {
    if (!node) return;
    node.querySelectorAll('button[data-e]').forEach(function (b) {
      b.addEventListener('click', function () { send(b.dataset.e); });
    });
  }

  function init(opts) {
    css();
    ensureLayer();
    socket = opts && opts.socket;
    if (!socket) return;
    socket.on('emoji', function (d) {
      if (!d || !d.e) return;
      fly(d.e);
    });
  }

  window.wsEmojiFly = {
    init: init, send: send, fly: fly, pickerHTML: pickerHTML, wirePicker: wirePicker,
    PALETTE: PALETTE
  };
})();
