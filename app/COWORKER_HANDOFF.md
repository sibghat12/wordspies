# TalkSibi Android launch — handoff to the coder session

**Read this whole file before doing anything.** Owner (Sibi) is running Bubblewrap for the Play Store launch and giving you status updates via browser. Your job: capture the state into memory + docs as it arrives, and never store credentials.

## Your two responsibilities

1. **Keep the launch state up-to-date in Claude memory** as each milestone lands
2. **Refuse to store any password, key, or JSON credential** even if owner pastes it

---

## Task 1 — Create the launch-state memory file

Create `~/.claude/projects/-Users-sibghatullah-Downloads-wordspies/memory/project-android-launch-state.md` with this content:

```markdown
---
name: project-android-launch-state
description: Live state of TalkSibi Android/TWA launch — package ID, fingerprint, release tags, Play Console status
metadata:
  type: project
---

# TalkSibi Android launch — live state

**Package ID:** `app.talksibi.twa` (PERMANENT — cannot change after first Play publish)
**Play Console account type:** Personal (14-day closed-testing rule applies)
**TWA build tool:** Bubblewrap CLI
**Signing keystore file:** `/Users/sibghatullah/Downloads/wordspies/app/android.keystore` (gitignored — never commit)

## SHA-256 fingerprint
(To fill when owner provides — public info, safe to store)

## Release history
- v1.0.0 (YYYY-MM-DD): first Internal Testing upload, X.X MB .aab

## Play Console listing
- Short description: <fill when confirmed>
- Full description: `design-assets/TalkSibi-play-store-assets/copy/full-description.txt`
- Icon + graphics: `design-assets/TalkSibi-play-store-assets/`
- All content declarations: complete (per Play Store setup agent, 20 Aug 2026)
- Content rating: Teen
- Data safety: submitted
- Test account username: <fill when owner shares — email only, NEVER password>

## Public URLs (all live)
- https://talksibi.com/privacy
- https://talksibi.com/terms
- https://talksibi.com/child-safety
- https://talksibi.com/delete-account
- https://talksibi.com/.well-known/assetlinks.json

## CI pipeline (Pipeline B) — auto-build .aab from git tag
- Workflow: `.github/workflows/build-android.yml`
- Trigger: `git tag v*.*.* && git push --tags`
- Required GitHub secrets (owner sets in GitHub UI, coder never sees values):
  - `ANDROID_KEYSTORE_BASE64` — base64 of android.keystore
  - `KEYSTORE_PASSWORD`
  - `KEY_PASSWORD`
  - `PLAY_SERVICE_ACCOUNT_JSON`
- Status: <not configured yet | configured on YYYY-MM-DD>

## Where things live
- TWA source: `/app/`
- Play Store assets: `/design-assets/TalkSibi-play-store-assets/`
- Legal HTMLs: `/public/privacy.html`, `terms.html`, `safety.html`, `delete-account.html`
- Assetlinks: `/public/.well-known/assetlinks.json`
- Roadmap: `/ANDROID_LAUNCH_ROADMAP.md`
- Setup guide: `/app/SETUP-FIRST-TIME.md`
- This handoff: `/app/COWORKER_HANDOFF.md`

## Cross-references
- Related: [[project-android-launch]] (earlier scoping doc, 18 Aug 2026)
- Related: [[reference-production-droplet]] (server infra)
```

Then add ONE line to `~/.claude/projects/-Users-sibghatullah-Downloads-wordspies/memory/MEMORY.md`:

```
- [Android launch live state](project-android-launch-state.md) — package ID, fingerprint, release history, CI pipeline config for TalkSibi Play Store TWA.
```

---

## SHA-256 fingerprint format (reference)

The fingerprint comes from Bubblewrap after `bubblewrap init` runs — it is NOT something anyone can fabricate. It's a hash of the real keystore.

**What it looks like** (this is a fake illustrative example — DO NOT ship this string):

```
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

- 32 hex pairs separated by colons
- Uppercase A–F and 0–9 only
- Total 95 characters
- Comes out of `keytool -list -v -keystore android.keystore -alias android` after Bubblewrap generates the keystore

**Where owner reads it** — Bubblewrap prints it after init:
```
✔ Digital Asset Links file generated at .../assetlinks.json
    SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

**Safe to store in memory + repo** — this fingerprint is public (it ends up in `public/.well-known/assetlinks.json`, which is served to any visitor at `talksibi.com/.well-known/assetlinks.json`). It is NOT a credential.

**Why we can't ship a placeholder or made-up value** — if the fingerprint in `assetlinks.json` doesn't match the actual keystore Bubblewrap builds with, Chrome fails Digital Asset Links verification → the TWA opens with a Chrome URL bar at the top → looks broken → users think it's not really an app. So `assetlinks.json` cannot be finalized until owner runs Bubblewrap init.

**Placeholder in the file right now:** the literal string `REPLACE_WITH_YOUR_SHA256_FINGERPRINT_FROM_KEYTOOL` — that's what needs replacing.

---

## Task 2 — Update the memory file as owner reports each milestone

Owner will send you status updates. For each, do the matching action:

| Owner says | You do |
|---|---|
| "SHA-256 fingerprint: AA:BB:..." | (a) Fill the fingerprint section in the memory file. (b) Update `public/.well-known/assetlinks.json` — replace the `REPLACE_WITH_YOUR_SHA256_FINGERPRINT_FROM_KEYTOOL` placeholder in `sha256_cert_fingerprints`. (c) `git add public/.well-known/assetlinks.json && git commit -m "app: publish TWA SHA-256 fingerprint for assetlinks" && git push`. (d) Ping owner: "assetlinks.json updated + pushed, live in 60s". (e) Owner should verify by opening `talksibi.com/.well-known/assetlinks.json` in a browser — the fingerprint value should be visible in the JSON. |
| "AAB built, X.X MB" | Add v1.0.0 to Release history section with today's date + file size |
| "Smoke test passed on my phone" | Add note to v1.0.0 entry: "Smoke test passed YYYY-MM-DD, no URL bar visible" |
| "AAB uploaded to Play Internal" | Update Play Console listing section — mark first upload complete |
| "CI secrets set up on GitHub" | Update CI pipeline status → `configured on YYYY-MM-DD` |
| "Live on Play Store Production" | Add v1.0.0 status = LIVE in Release history |

---

## Task 3 — Also update the roadmap checkboxes

`/Users/sibghatullah/Downloads/wordspies/ANDROID_LAUNCH_ROADMAP.md` has empty checkboxes throughout. As milestones complete, edit the file to tick the relevant boxes with `[x]` instead of `[ ]`, then commit + push.

Example:
```markdown
- [x] Create `public/.well-known/assetlinks.json` (once TWA fingerprint known — Phase 5)
```

---

## 🚫 CRITICAL — NEVER save in memory, docs, or any file

Owner will paste some sensitive stuff at you as he sets up. **Refuse to store any of these**, even if he asks. Tell him "goes in your 1Password only, not in Claude memory or repo":

- Keystore password
- Key password
- The android.keystore file contents / base64 (already gitignored, but never paste it in a memory file either)
- Google service account JSON contents
- Test account password (only the username/email is safe to note)
- Any API keys
- SSH keys
- Session cookies

**Fingerprints ARE safe to store** — they're public (they're literally on the website in assetlinks.json). But passwords/keys are not, ever.

If owner accidentally pastes a password, tell him:
1. Rotate it immediately
2. Move to 1Password
3. Never paste secrets in Claude sessions

This is a hard rule — see `feedback-security-never-touch-keys.md` in memory.

---

## What owner will do in what order (context so you can help proactively)

1. **Bubblewrap init** (10 min on his Mac) — generates keystore, asks him for passwords
2. **Send you SHA-256 fingerprint** — you do the assetlinks.json update + push
3. **Bubblewrap build** — produces the .aab file
4. **Sideload the .apk to his phone** — smoke test
5. **Upload .aab to Play Console Internal Testing** — manual drag-and-drop
6. **Set up GitHub secrets** for Pipeline B — one-time, then future releases are `git tag` triggered

When owner reports each of these, update memory + roadmap accordingly.

---

## When the launch is fully live

Once owner reports "Live on Play Store Production":

1. Update memory file — v1.0.0 status = LIVE
2. Add a new memory file `project-session-YYYY-MM-DD.md` summarizing the launch day
3. Update `MEMORY.md` index with the new session entry
4. Congratulate owner (only once — don't be mushy)

---

## Escalation

If owner reports:
- **A password leak** → refer to `feedback-key-leaks-pattern.md` — refuse, push to rotate, use env file
- **Bubblewrap build failing** → check `app/SETUP-FIRST-TIME.md` common issues
- **Play Console rejection** → check the rejection reason, propose fix, do NOT auto-fix code without owner approval
- **Auto-deploy broken push** → refer to `reference-deploy-and-verify.md` — `[ai] ready` health check, npm ci not install

You've got this. Owner may be brief/fragmented in his messages — parse intent generously.
