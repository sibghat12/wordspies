// ─────────────────────────────────────────────────────────────────────────────
// Per-user "you're already in a game" guard.
//
// Owner ask 4 Aug 2026: 'no new game until someone playing one game already —
// he should not be able to start a new game and ask him to close that game
// first'. This module is the single source of truth for that check.
//
// Model:
//   key   →  user:activegame:<uid>
//   value →  { game, code, url, joinedAt }
//   ttl   →  4 hours (a user who just closes a tab is auto-forgotten)
//
// Redis-backed when REDIS_URL is set, in-memory Map otherwise. Both paths
// implement the same interface. Callers only touch { get, set, clear } and
// never care which backend is live.
//
// Deliberately NOT applied to voice parties — parties are ambient and people
// idle in them. Blocking a Word Chain match because someone left a party open
// hours ago would be worse than the problem we're solving.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 4 * 60 * 60 * 1000;
const KEY = uid => 'user:activegame:' + uid;

function make(redis) {
  const mem = new Map();       // uid → { record, expiresAt }
  const verifiers = new Map(); // game name → (code) => bool

  // Each game module registers its rooms.has(code) check on mount so we
  // can drop stale keys transparently the moment we notice them. Without
  // this, a user who leaves a game would stay 'locked out' from starting
  // another one for the full 4h TTL, which turns the guard from a helpful
  // 'close current first' nudge into a bug.
  function registerVerifier(game, fn) {
    if (game && typeof fn === 'function') verifiers.set(game, fn);
  }

  async function get(uid) {
    if (!uid) return null;
    if (redis) {
      try {
        const raw = await redis.get(KEY(uid));
        return raw ? JSON.parse(raw) : null;
      } catch (e) { /* fall through to memory */ }
    }
    const e = mem.get(uid);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { mem.delete(uid); return null; }
    return e.record;
  }

  // Verified read: returns the record only if the referenced room still
  // exists. If not, clears the key + returns null. This is the version
  // every caller should prefer — get() is kept for the rare case where
  // you want the raw record without side-effects.
  async function getVerified(uid) {
    const rec = await get(uid);
    if (!rec) return null;
    const v = verifiers.get(rec.game);
    // No verifier registered yet (module still loading, or unknown game)
    // → trust the record. Better to falsely block once than falsely allow
    // during startup.
    if (!v) return rec;
    try { if (v(rec.code)) return rec; } catch (e) { return rec; }
    await clear(uid);
    return null;
  }

  async function set(uid, rec) {
    if (!uid) return;
    const payload = { game: rec.game, code: rec.code, url: rec.url, joinedAt: Date.now() };
    if (redis) {
      try { await redis.set(KEY(uid), JSON.stringify(payload), 'PX', TTL_MS); return; }
      catch (e) { /* fall through */ }
    }
    mem.set(uid, { record: payload, expiresAt: Date.now() + TTL_MS });
  }

  async function clear(uid) {
    if (!uid) return;
    if (redis) { try { await redis.del(KEY(uid)); } catch (e) {} }
    mem.delete(uid);
  }

  // Shared handler for the POST /api/{game}/new endpoints. Returns true if
  // the create should proceed, false if it already responded with 409. The
  // module-side then does its own room-creation on `true`.
  async function guardCreate(req, res, uidFromReq, next) {
    let uid = null;
    try { uid = await uidFromReq(req); } catch (e) {}
    if (!uid) return next();                 // guests can always start
    const active = await getVerified(uid);
    if (!active) return next();
    res.status(409).json({ error: 'active-game', activeGame: active });
    return null;
  }

  return { get, getVerified, set, clear, guardCreate, registerVerifier };
}

module.exports = { make, TTL_MS };
