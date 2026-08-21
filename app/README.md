# TalkSibi — Android app (TWA) build folder

**What this folder does:** wraps `talksibi.com` as a native Android app using
Bubblewrap CLI + a Trusted Web Activity. The site is the app — every push to
`main` updates the app content in ~60s with no APK rebuild.

## The two flows

### Flow A — Web content (99% of updates)
```
edit code → git push origin main → droplet auto-deploys → app users see it in 60s
```
Nothing here needs to touch the Play Store. That's the whole magic of TWA.

### Flow B — App shell (icon, name, target SDK bump — maybe 4x/year)
```
edit twa-manifest.json (or icon) → git commit → git tag v1.0.1 → git push --tags
→ GitHub Actions builds signed AAB → auto-uploads to Play Store Internal track
→ open Play Console → 1-click "Promote to Production"
```

## Files in this folder

| File | Purpose |
|---|---|
| `twa-manifest.json` | Bubblewrap config — package ID, name, colors, shortcuts. Editing this triggers Flow B. |
| `.gitignore` | Protects the keystore + build outputs from being committed. |
| `README.md` | This file. |
| `SETUP-FIRST-TIME.md` | One-time setup — you run this ONCE before the CI works. |
| `android.keystore` | **GENERATED LOCALLY on first setup — NEVER COMMITTED.** The signing key for every future update. Losing it = permanent lockout. Back up separately. |

## Files elsewhere in the repo

| File | Purpose |
|---|---|
| `.github/workflows/build-android.yml` | CI/CD — auto-build + auto-upload on `git tag v*` |
| `public/.well-known/assetlinks.json` | Digital handshake proving talksibi.com owns the app package ID. Deployed with the site. |
| `public/manifest.webmanifest` | PWA manifest — what TWA reads to decide the shell. |

## First-time setup (once)

Read `SETUP-FIRST-TIME.md` — 6 steps, ~30 minutes.

## After setup — daily usage

**Change website:** `git push origin main` — done. No commands here.

**Change app shell:**
```bash
# 1. Edit twa-manifest.json (or replace an icon)
# 2. Bump appVersion + appVersionName in twa-manifest.json
# 3. Commit + tag + push
git add app/twa-manifest.json
git commit -m "app: bump icon"
git tag v1.0.1
git push origin main --tags
```
Then watch GitHub → Actions → build completes in ~5 min → AAB is on Play Internal track.
Open Play Console → Testing → Internal → "Promote to Production".

## Local testing (optional but recommended)

Before tagging a release, build + sideload to your own phone to smoke-test:
```bash
cd app
bubblewrap build
# Copy app-release-signed.apk to your phone (Drive, adb push, whatever)
# Install → verify no URL bar → smoke-test flows
```

## When you'd need to change the keystore

Never, ideally. Play Store treats the keystore as the app's identity. If you
regenerate one, Google sees it as a "different app" and users can't update
from the old one — they'd have to uninstall + reinstall. So:

- Back up `android.keystore` + password to 3+ places
- If you lose it, contact Google Play support for a Key Reset (they'll do
  it once, users must reinstall)

## Package ID quirks

`packageId: app.talksibi.twa` is permanent. Renaming the brand later means:
- App name (`name`, `launcherName`) — free to change, rebuild + upload
- Icon — free to change, rebuild + upload
- Package ID — **CANNOT change** after Play Store publish. If you rebrand
  hard, you'd have to publish a new app + prompt users to migrate.

So if you're going to rename TalkSibi, decide FIRST, then set the packageId,
then never touch it again.
