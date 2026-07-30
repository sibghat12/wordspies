# WordSpies — Cloudflare Realtime voice setup

**Who this is for:** the person doing the one-time Cloudflare signup + droplet
env-var setup for WordSpies voice chat. Follow every step. Should take **10
minutes end-to-end**. No coding required.

**Result when you're done:** the in-game microphone in WordSpies runs on
Cloudflare's SFU instead of peer-to-peer STUN — better reliability across
mobile carrier networks, and scales cleanly to future group calls.

**Cost:** Cloudflare Realtime is $0.05 per GB egressed, with a 1,000 GB / month
free tier shared across SFU + TURN. Two-person voice = ~430 MB / hour, so the
free tier covers ~2,300 hours of voice per month. For a small group of friends
you will almost certainly never pay.

---

## Step 1 — Cloudflare account (skip if you have one)

1. Go to <https://dash.cloudflare.com/sign-up>
2. Sign up with the WordSpies owner email. Verify it.
3. **You do NOT need to add a domain, a payment method, or a plan.** The
   free tier of Realtime works on a fresh account with no billing set up.

---

## Step 2 — Create the Realtime app

1. Log in at <https://dash.cloudflare.com/>
2. In the left sidebar, scroll to find **Realtime**. (If you don't see it,
   click "More" or "Compute" — Cloudflare re-organises the sidebar
   occasionally.)
3. Click **Realtime → SFU** (Selective Forwarding Unit).
4. Click **Create App**.
5. Name it: `wordspies-voice`
6. Click **Create**.

Cloudflare shows you two values on the app page:

- **App ID** — a long hex string, ~32 characters. Looks like:
  `a1b2c3d4e5f6...`
- **App Token** — a **secret**. Click "Reveal" or "Generate Token" if it's
  hidden. Looks similar to the App ID but is treated like a password.

**Copy both values into a safe spot** (a password manager is ideal — do NOT
paste them into Slack, email, or a chat). You'll need them in Step 3.

---

## Step 3 — Add the credentials to the WordSpies droplet

1. SSH into the WordSpies production droplet. (The owner has these creds; if
   you don't, ask them for the SSH key or password.)

2. WordSpies runs from `/opt/wordspies` and is managed by systemd. Its
   environment variables live in a file the systemd unit reads. To find it:

   ```bash
   systemctl cat wordspies | grep -i EnvironmentFile
   ```

   That prints a line like `EnvironmentFile=/etc/wordspies.env`. That path
   (whatever `systemctl` prints) is the file to edit.

3. Open the file with `sudo`:

   ```bash
   sudo nano /etc/wordspies.env      # or whatever path Step 2 gave you
   ```

4. Add these two lines to the bottom (paste your real values, no quotes):

   ```
   CF_REALTIME_APP_ID=paste_app_id_here
   CF_REALTIME_APP_TOKEN=paste_app_token_here
   ```

5. Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

6. Restart the WordSpies service:

   ```bash
   sudo systemctl restart wordspies
   ```

7. Confirm it came back up:

   ```bash
   sudo systemctl status wordspies
   ```

   Should show `active (running)`. Also check the log:

   ```bash
   sudo journalctl -u wordspies -n 30 --no-pager
   ```

   Look for a line that says:

   ```
   voice: mode=cloudflare (SFU)
   ```

   If it says `mode=p2p (STUN only — fallback)`, the env vars aren't being
   picked up — go back to step 2 and check the file path + variable names.

---

## Step 4 — Verify from outside

1. Open <https://wordspies.co.uk/api/voice/config> in a browser.
2. Response should include `"mode":"cloudflare"`.

If it says `"mode":"p2p"`, credentials aren't loaded — recheck Step 3.

---

## Step 5 — Message the owner

Message the WordSpies owner with **only this**:

> Cloudflare voice is set up. `/api/voice/config` reports `mode:cloudflare`.

Do **not** send them the App ID or Token — those already live on the droplet.

---

## Troubleshooting

**`/api/voice/config` returns `mode:p2p`:**
- Env vars aren't loading. Check `sudo systemctl show wordspies -p Environment`
  — it should list the two `CF_REALTIME_*` names.

**502 errors from `/api/voice/cf/session`:**
- Cloudflare token likely wrong or expired. Regenerate the token in the
  Cloudflare dashboard and repeat Step 3.

**Voice works locally but not on 4G:**
- Cloudflare Realtime should handle this. If it doesn't, that's a bug in
  the WordSpies client — flag it to the owner.

**You need to rotate the App Token:**
- Delete the old one in the Cloudflare dashboard, generate a new one,
  update `/etc/wordspies.env`, `sudo systemctl restart wordspies`.

---

## What NOT to touch

- Do not create additional Cloudflare apps unless the owner asks — one app
  covers all games.
- Do not add a payment method unless the owner asks. If usage exceeds the
  1,000 GB free tier, Cloudflare will email a warning before charging.
- Do not commit the App ID or Token to the repo. They belong only in the
  droplet's env file.
