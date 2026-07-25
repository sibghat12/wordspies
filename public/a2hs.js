/* WordSpies — the install wall.
 *
 * Shared by the landing page, the game and the social app, so all three ask the
 * same question in the same words rather than drifting apart.
 *
 * The brief was blunt: on a phone, nobody gets past the front door until they
 * have answered. So this is a full-screen sheet with no way round it — no
 * backdrop to tap, no ×, no Escape. Two answers, and either one lets them
 * through. "Not now" is remembered forever, because a wall you meet twice is a
 * wall you leave through the back.
 *
 * It only ever appears on a phone, only when the browser has actually told us
 * an install is possible, and never once the app is installed. Desktop visitors
 * and anyone already running from their home screen see nothing at all.
 *
 * Android and iPhone are not the same problem. Chrome hands us a real install
 * sheet, so "Add" opens it — and because the tap is a genuine gesture, Chrome
 * never refuses. Safari offers no such thing to any website, so on iPhone the
 * same button turns the card into the three Share → Add to Home Screen steps,
 * which is the whole of what Apple permits.
 */
(function () {
  if (window.__a2hsWall) return;                 // never twice on one page
  window.__a2hsWall = 1;

  var KEY = 'ws_a2hs';
  var said = function () { try { return localStorage.getItem(KEY) === 'no'; } catch (e) { return false; } };
  var sayNo = function () { try { localStorage.setItem(KEY, 'no'); } catch (e) {} };

  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS lies about itself
  var phone = matchMedia('(max-width:820px)').matches
    || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  if (standalone || !phone || said()) return;    // nothing to ask, or already answered

  // A browser that can't install us must never be walled — there would be no
  // way to say yes, only a dead end.
  var prompt = null;
  var open = false, done = false;

  // ---------- the sheet ----------
  var css = ''
    + '#wsWall{position:fixed;inset:0;z-index:2147483000;display:none;align-items:flex-end;justify-content:center;'
    + 'background:rgba(12,14,20,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);'
    + 'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + '#wsWall.on{display:flex}'
    + '#wsWall .ws-card{background:#fff;color:#16181f;width:100%;max-width:440px;border-radius:24px 24px 0 0;'
    + 'padding:26px 22px calc(22px + env(safe-area-inset-bottom));text-align:center;box-sizing:border-box;'
    + 'box-shadow:0 -12px 44px rgba(0,0,0,.3);animation:wsUp .34s cubic-bezier(.2,.8,.3,1) both}'
    + '@media(min-width:560px){#wsWall{align-items:center}#wsWall .ws-card{border-radius:24px;margin:0 18px}}'
    + '@keyframes wsUp{from{transform:translateY(26px);opacity:0}to{transform:none;opacity:1}}'
    + '#wsWall img.ws-ic{width:66px;height:66px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.16)}'
    + '#wsWall h2{font-size:19px;font-weight:800;margin:14px 0 7px;line-height:1.3}'
    + '#wsWall p.ws-sub{font-size:13.4px;line-height:1.6;color:#5b6172;margin:0 0 20px}'
    + '#wsWall .ws-go{display:block;width:100%;background:#0f7500;color:#fff;border:0;border-radius:14px;'
    + 'padding:15px 18px;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
    + '#wsWall .ws-go:active{transform:scale(.985)}'
    + '#wsWall .ws-no{display:block;width:100%;background:none;border:0;color:#8a90a0;font:inherit;'
    + 'font-size:12.8px;font-weight:600;padding:14px 8px 2px;cursor:pointer}'
    + '#wsWall .ws-steps{text-align:left;margin:2px 0 20px}'
    + '#wsWall .ws-steps p{display:flex;gap:11px;align-items:flex-start;font-size:13.6px;line-height:1.55;'
    + 'color:#39404f;margin:0 0 12px}'
    + '#wsWall .ws-steps i{flex:none;width:23px;height:23px;border-radius:50%;background:#eef1f7;color:#16181f;'
    + 'font-style:normal;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var wall = document.createElement('div');
  wall.id = 'wsWall';
  wall.setAttribute('role', 'dialog');
  wall.setAttribute('aria-modal', 'true');
  wall.innerHTML =
    '<div class="ws-card">' +
      '<img class="ws-ic" src="/icon-192.png" alt="">' +
      '<h2 id="wsWallH">Add WordSpies to your apps</h2>' +
      '<p class="ws-sub" id="wsWallP">It opens full-screen like a real app, and it’s how your friends’ ' +
        'messages reach you. One tap — no app store, nothing to download.</p>' +
      '<div id="wsWallSteps" class="ws-steps" style="display:none">' +
        '<p><i>1</i><span>Tap the <b>Share</b> button at the bottom of Safari.</span></p>' +
        '<p><i>2</i><span>Scroll down and tap <b>Add to Home Screen</b>.</span></p>' +
        '<p><i>3</i><span>Tap <b>Add</b> — WordSpies lands on your home screen.</span></p>' +
      '</div>' +
      '<button class="ws-go" id="wsWallGo">Add to my apps</button>' +
      '<button class="ws-no" id="wsWallNo">Not now</button>' +
    '</div>';

  function mount() {
    if (wall.parentNode) return;
    (document.body || document.documentElement).appendChild(wall);
    wireButtons();                                        // wired the moment it exists, never later
  }

  var scrollWas = '';
  function show() {
    if (open || done || said()) return;
    mount();
    open = true;
    scrollWas = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';   // nothing moves behind it
    wall.classList.add('on');
    try { document.getElementById('wsWallGo').focus(); } catch (e) {}
  }

  function close() {
    open = false;
    done = true;
    window.__a2hsDone = true;                             // stop the old slim bar following up
    wall.classList.remove('on');
    document.documentElement.style.overflow = scrollWas;
  }

  // Tapping the backdrop must do nothing — this is the one sheet on the site
  // that is not a suggestion.
  wall.addEventListener('click', function (e) { e.stopPropagation(); });

  // ---------- the two answers ----------
  var el = function (id) { return document.getElementById(id); };

  function wireButtons() {
    el('wsWallNo').onclick = function () { sayNo(); close(); };

    el('wsWallGo').onclick = function () {
      // Android: fire Chrome's own sheet inside the tap, before any await, or
      // the gesture is spent and Chrome declines.
      if (prompt) {
        var p = prompt;
        prompt = null;                                    // the event is single-use
        try { p.prompt(); } catch (e) {}
        close();
        p.userChoice
          .catch(function () { return { outcome: 'dismissed' }; })
          .then(function (r) { if (r && r.outcome !== 'accepted') sayNo(); })
          .then(function () { if (window.enablePushQuietly) window.enablePushQuietly(); });
        return;
      }
      // iPhone: no install API exists, so the card becomes the instructions and
      // the button becomes the way out.
      if (el('wsWallSteps').style.display === 'none') {
        el('wsWallH').textContent = 'Two taps and it’s yours';
        el('wsWallP').style.display = 'none';
        el('wsWallSteps').style.display = 'block';
        el('wsWallGo').textContent = 'Done';
        el('wsWallNo').style.display = 'none';
        if (window.enablePushQuietly) window.enablePushQuietly();
        return;
      }
      sayNo();                                            // they've seen the steps; don't ask again
      close();
    };
  }

  function boot() {
    mount();
    if (isIOS) setTimeout(show, 1500);                    // let the page paint first
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Chrome only fires this once it has decided we're genuinely installable —
  // which is exactly the moment the question becomes worth asking.
  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    prompt = e;
    mount();
    show();
  });

  addEventListener('appinstalled', function () { close(); });
})();
