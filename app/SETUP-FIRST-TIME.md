# First-time setup — 30 minutes, once ever

Everything after this is `git push` / `git tag`. But this one setup MUST run
locally on your machine because it generates a signing keystore that only
you own.

## Prerequisites

- **macOS or Linux** (Windows works but commands below use bash)
- **Node.js 20+** — you already have this
- **Java 17 JDK** — `brew install --cask temurin` if on Mac
- **Google Play Console account** — you already have this (Personal)
- **A Google Cloud project** — free, needed for the Play Publisher API

## Step 1 — Install Bubblewrap CLI

```bash
npm install -g @bubblewrap/cli
bubblewrap doctor
```
`doctor` will yell if Java or Android SDK is missing — follow its instructions.
Bubblewrap will auto-download the Android SDK on first `build`.

## Step 2 — Initialize the TWA (generates keystore)

From the repo root:
```bash
cd app
bubblewrap init --manifest ../public/manifest.webmanifest
```

Bubblewrap will ask a bunch of questions. **Most defaults are fine**, but
verify these:
- Application ID → `app.talksibi.twa` (or whatever you set — MUST match
  the packageId in `twa-manifest.json`)
- Launcher name → `TalkSibi`
- Signing key info → let it generate a new key
- Key password → **PICK A STRONG PASSWORD, WRITE IT DOWN IN A PASSWORD MANAGER**
- Keystore password → same story

When done you'll have `android.keystore` in this folder. `.gitignore` already
excludes it — but double-check `git status` shows it as untracked.

## Step 3 — Get the SHA-256 fingerprint

```bash
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

**Example output** (fake — yours will be different):
```
SHA256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

**Format spec** (so you know what a real one looks like):
- 32 hex pairs (bytes) separated by colons
- Uppercase A–F, 0–9 only
- 95 characters total including the colons
- Public info — safe to share, commit, paste in chat, ping to Claude Code

Copy just the value after `SHA256:` (no leading `SHA256:` prefix). You can ping this value directly to any Claude session — it belongs in `public/.well-known/assetlinks.json`, not in a password manager.

## Step 4 — Deploy assetlinks.json

Edit `public/.well-known/assetlinks.json` and paste your SHA-256 into the
`sha256_cert_fingerprints` array. Commit + push:
```bash
git add public/.well-known/assetlinks.json
git commit -m "app: publish assetlinks fingerprint"
git push
```
Verify it's live: open `https://talksibi.com/.well-known/assetlinks.json` in
a browser. Should show your fingerprint as JSON.

**Without this file, the TWA falls back to showing a Chrome URL bar at the
top of the app.** So this step matters.

## Step 5 — Build + sideload for the first smoke test

```bash
cd app
bubblewrap build
```
This produces `app-release-signed.apk`. Copy to your Android phone
(AirDrop-like — Drive works fine), install, open, verify:
- App icon appears in launcher
- Opens fullscreen (no URL bar visible)
- Every screen loads
- Chat / party / games all work

If URL bar shows up → assetlinks.json isn't live yet, or fingerprint mismatch.

## Step 6 — Set up GitHub Actions secrets

For the CI pipeline to auto-build and auto-upload, GitHub needs three
secrets. Go to:

`GitHub repo → Settings → Secrets and variables → Actions → New repository secret`

Create these three:

### Secret 1: `ANDROID_KEYSTORE_BASE64`
```bash
# Run in the app/ folder:
base64 -i android.keystore | pbcopy   # Mac
# or: base64 android.keystore | xclip -selection clipboard    # Linux
```
Paste the base64 blob as the secret value.

### Secret 2: `KEYSTORE_PASSWORD`
The password you chose in step 2 for the keystore.

### Secret 3: `KEY_PASSWORD`
The password you chose in step 2 for the key alias.

### Secret 4: `PLAY_SERVICE_ACCOUNT_JSON` (for auto-upload)

This is a Google Cloud service account JSON that lets GitHub Actions upload
AABs on your behalf. Steps:

1. `console.cloud.google.com` → create a new project (or reuse one) →
   enable "Google Play Android Developer API"
2. `IAM & Admin → Service Accounts → Create Service Account` → name it
   `play-store-uploader` → give it "Service Account User" role
3. Click the new account → Keys → Add Key → JSON → downloads a `.json` file
4. Play Console → `Setup → API access → Link a Cloud project` → link the
   Cloud project from step 1
5. Play Console → same page → grant the `play-store-uploader` service
   account "Release manager" permission
6. Open the JSON file → copy the ENTIRE contents → paste as GitHub secret
   value

## Step 7 — First manual upload to Play Console

**Play Store requires the FIRST version to be uploaded manually** so the
listing gets set up. After that, GitHub Actions can push updates.

- Play Console → Create app → fill listing (name, icon 512, feature graphic
  1024x500, 4-8 screenshots, short + long description, category, content
  rating, data safety form, Privacy Policy URL)
- Testing → Internal testing → Create new release → upload
  `app-release-bundle.aab` from step 5 → Save + Review + Rollout
- Copy the Internal test opt-in URL → send to yourself + friends

Once approved (~1 hour), Internal Testing is live. From now on, `git tag v*`
is all you need.

## Step 8 — Commit the setup

```bash
# From repo root:
git add app/twa-manifest.json app/.gitignore app/README.md app/SETUP-FIRST-TIME.md
git add .github/workflows/build-android.yml
git add public/.well-known/assetlinks.json
git commit -m "app: TWA build folder + CI pipeline"
git push
```

**Do NOT commit `android.keystore` — `.gitignore` blocks it, but always
double-check `git status` before pushing.**

## From now on

- Change website → `git push` → live in 60s (unchanged)
- Change app shell → bump `appVersion` in `twa-manifest.json`, `git tag v1.0.1`,
  `git push --tags` → GitHub Actions handles everything → open Play Console →
  promote from Internal to Production in 1 click

## Emergency notes

- **Lost the keystore?** Contact Google Play support for a Key Reset (they'll
  do it once — users need to reinstall the app).
- **Forgot the password?** Same as above — no recovery without Google's help.
- **Want to rebrand?** Rename is fine (name, icon, colors). Package ID
  (`app.talksibi.twa`) CANNOT change without publishing a new app.
