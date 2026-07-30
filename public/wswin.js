/* wswin.js — nicer game-over screens across the whole arcade.
 *
 * One shared module: every game page just loads /wswin.js. The moment a game
 * page shows its #overRow / #overTxt / #overSub, wswin decorates it with:
 *   · a big animated medal or sad-emoji "puck" behind the headline
 *   · a burst of soft coloured circles + confetti dots that drift up
 *   · bigger, warmer typography for the winner line
 *   · a subtle glow around the whole card so the eye lands there
 *
 * Nothing about the game logic changes. If a page doesn't have overRow,
 * this module does nothing.
 */
(function () {
  'use strict';

  function css() {
    if (document.getElementById('wswin-css')) return;
    var s = document.createElement('style');
    s.id = 'wswin-css';
    s.textContent = [
      /* Container becomes a stage. Uses padding-top to leave room for the puck. */
      '#overRow{position:relative;padding:74px 20px 22px !important;text-align:center;',
      '  background:linear-gradient(180deg,rgba(255,255,255,.6),rgba(255,255,255,0));',
      '  border-radius:22px;overflow:visible;animation:wswinFade .5s ease}',
      '@keyframes wswinFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',

      /* The trophy / medal puck. Sits above the headline. */
      '.wswin-puck{position:absolute;top:-42px;left:50%;transform:translateX(-50%);',
      '  width:96px;height:96px;border-radius:50%;',
      '  background:radial-gradient(circle at 35% 30%,#fff2c0,#f5b52e 60%,#c8830f);',
      '  box-shadow:0 12px 34px rgba(200,131,15,.42),inset -6px -10px 22px rgba(0,0,0,.16);',
      '  display:flex;align-items:center;justify-content:center;font-size:52px;line-height:1;',
      '  animation:wswinPop .55s cubic-bezier(.2,1.4,.4,1) both}',
      '.wswin-puck.lose{background:radial-gradient(circle at 35% 30%,#f0f2f7,#c9cdda 60%,#8a90a2);',
      '  box-shadow:0 12px 34px rgba(60,68,90,.32),inset -6px -10px 22px rgba(0,0,0,.14)}',
      '.wswin-puck.draw{background:radial-gradient(circle at 35% 30%,#e3e9ff,#9cb0f5 60%,#5a7bff)}',
      '@keyframes wswinPop{0%{transform:translateX(-50%) scale(.2) rotate(-20deg);opacity:0}',
      '  70%{transform:translateX(-50%) scale(1.14) rotate(8deg);opacity:1}',
      '  100%{transform:translateX(-50%) scale(1) rotate(0)}}',

      /* Big headline: was 32/34px 800 — now 40px Fredoka 600 for that toy
         weight-vs-scale balance the rest of the arcade uses. */
      '#overRow #overTxt,#overRow .bigword{font-family:"Fredoka","Nunito",system-ui,sans-serif;',
      '  font-size:40px !important;font-weight:600 !important;line-height:1.05;',
      '  letter-spacing:-.8px;margin:6px 0 12px !important;',
      '  background:linear-gradient(180deg,#16181f 0%,#3a3f52 100%);-webkit-background-clip:text;',
      '  background-clip:text;color:transparent;-webkit-text-fill-color:transparent}',
      '@media(max-width:420px){#overRow #overTxt,#overRow .bigword{font-size:34px !important}}',
      '#overRow #overSub{font-size:14.5px !important;color:#5c6270;line-height:1.55;margin-bottom:20px !important;',
      '  max-width:340px;margin-left:auto !important;margin-right:auto !important}',

      /* Confetti / circle burst layer sitting behind the puck. Pointer-events
         off so nothing here catches a tap meant for the Rematch button. */
      '.wswin-conf{position:absolute;inset:-30px 0 0;pointer-events:none;overflow:visible}',
      '.wswin-conf .cf{position:absolute;top:40px;left:50%;width:8px;height:8px;border-radius:50%;',
      '  transform:translateX(-50%) scale(0);opacity:0;animation:wswinFly 2.6s ease-out forwards}',
      '@keyframes wswinFly{',
      '  0%{transform:translate(calc(-50% + var(--wx,0px)),calc(0px)) scale(.4);opacity:0}',
      '  10%{opacity:1}',
      '  100%{transform:translate(calc(-50% + var(--wx,0px)),var(--wy,-200px)) scale(1) rotate(var(--wr,180deg));opacity:0}',
      '}',
      /* Bigger action button on the overRow (Rematch / Play again). */
      '#overRow .btn,#overRow button{border-radius:16px;min-height:52px;font-size:17px !important;',
      '  font-family:"Fredoka","Nunito",system-ui,sans-serif;font-weight:600;padding:0 28px}'
    ].join('');
    document.head.appendChild(s);
  }

  // Which face does the puck wear? Winners get 🏆, "you" losers get 👑
  // (they still played), draws get 🤝.
  function pickIcon(txt, tone) {
    var t = (txt || '').toLowerCase();
    if (tone === 'draw' || /draw|tie|even/.test(t)) return { icon: '🤝', tone: 'draw' };
    if (/you win|winner|you.re a legend|champion/.test(t)) return { icon: '🏆', tone: 'win' };
    if (/wins|took the|won it/.test(t)) return { icon: '🎉', tone: 'win' };
    return { icon: '🏅', tone: tone || 'win' };
  }

  var COLORS = ['#5a7bff', '#7c5cff', '#22c07a', '#f5b52e', '#e8506b', '#3ec3d9'];
  function launchConfetti(root) {
    var layer = root.querySelector('.wswin-conf');
    if (!layer) { layer = document.createElement('div'); layer.className = 'wswin-conf'; root.prepend(layer); }
    layer.innerHTML = '';
    var count = 26;
    for (var i = 0; i < count; i++) {
      var d = document.createElement('span');
      d.className = 'cf';
      // spread across the width, fly up + slightly outward, tumble as they go
      var x = (Math.random() - 0.5) * 320;              // horizontal drift
      var y = -(140 + Math.random() * 180);              // upward travel
      var r = (Math.random() - 0.5) * 720;               // rotation
      var size = 6 + Math.floor(Math.random() * 8);
      d.style.setProperty('--wx', x + 'px');
      d.style.setProperty('--wy', y + 'px');
      d.style.setProperty('--wr', r + 'deg');
      d.style.width = d.style.height = size + 'px';
      d.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      // some are squares, some circles, some little rectangles — variety
      var shape = Math.random();
      if (shape > 0.66) d.style.borderRadius = '2px';
      else if (shape > 0.33) { d.style.borderRadius = '2px'; d.style.height = (size / 2 + 2) + 'px'; }
      d.style.animationDelay = (Math.random() * 0.35) + 's';
      layer.appendChild(d);
    }
  }

  // Decorate the overRow once it becomes visible. Called on every state
  // change so a rematch → new game-over reshuffles the confetti.
  var lastKey = '';
  function decorate(root) {
    css();
    var txtEl = root.querySelector('#overTxt') || root.querySelector('.bigword');
    var text = txtEl ? (txtEl.textContent || '').trim() : '';
    // Fingerprint so re-decorating the same win doesn't re-fire the burst.
    var key = text + '|' + (root.querySelector('#overSub') && root.querySelector('#overSub').textContent);
    if (key === lastKey) return;
    lastKey = key;

    // Puck: pick or reuse.
    var puck = root.querySelector('.wswin-puck');
    if (!puck) { puck = document.createElement('div'); puck.className = 'wswin-puck'; root.prepend(puck); }
    var pick = pickIcon(text);
    puck.className = 'wswin-puck ' + (pick.tone === 'draw' ? 'draw' : /you win|you.re/i.test(text) ? '' : pick.tone === 'win' ? '' : 'lose');
    puck.textContent = pick.icon;

    launchConfetti(root);
    // A tiny audio cheer if the browser allows it and there's a shared sound
    // helper already present on the page (some pages have one, most don't).
    try { if (typeof window.wsCheer === 'function') window.wsCheer(); } catch (e) {}
  }

  // Watch for the overRow becoming visible (its `hidden` class flips).
  function watch(root) {
    var mo = new MutationObserver(function () {
      var hidden = root.classList.contains('hidden') || root.style.display === 'none';
      if (!hidden) decorate(root);
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    // Also decorate if it's already visible.
    if (!root.classList.contains('hidden') && root.style.display !== 'none') decorate(root);
    // And watch the text inside the overRow, because a rematch will change
    // the winner text without toggling visibility.
    var textMo = new MutationObserver(function () { decorate(root); });
    textMo.observe(root, { childList: true, characterData: true, subtree: true });
  }

  function start() {
    var root = document.getElementById('overRow');
    if (!root) return;
    watch(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
