# WordSpies 🕵️ (beta)

**Play now → https://wordspies.onrender.com**

An online, real-time word-spy party game (Codenames-style) you can play with friends in any browser. No accounts, no database — create a room, share the 4-letter code or invite link, and play.

> 🚧 **Beta** — play it, test it, and help improve it before the full launch. Thanks to Sibi 💛

## Features

Online rooms with 4-letter codes and one-click invite links, red vs blue teams with spymaster and operative roles, a 25-word board where only spymasters see the key, clue giving with guess limits, the assassin word, pass/turn logic, a live game log + chat, optional turn timers (60s–3min), 5 curated word packs (Easy/Family, Pop Culture, Animals & Nature, Food & Drink, Travel & Places — 780+ words), running score across rematches, reconnect grace (a refresh won't kick you for 60 seconds), an in-game How-to-play guide, and a clean mobile-friendly light UI. Everything is in memory — no database needed. Idle rooms clean themselves up after 6 hours.

## Run it locally

```bash
npm install
npm start
```

Open http://localhost:3000. Friends on the same Wi-Fi can join at `http://YOUR-LOCAL-IP:3000` (find it with `ipconfig` / `ifconfig`).

Run the automated game test (server must be running): `npm test`

## Put it on the internet (free)

Any Node host works. The two easiest:

**Render (free tier):**
1. Push this folder to a GitHub repo.
2. On https://render.com → New → Web Service → connect the repo.
3. Build command: `npm install` · Start command: `npm start`. Done — you get a `https://yourname.onrender.com` URL to share.

**Railway / Fly.io** work the same way (they detect Node automatically). The server already reads `process.env.PORT`, so no changes are needed.

Note: free tiers sleep when idle — the first visitor may wait ~30s while it wakes. Since state is in memory, a restart clears open rooms (players just make a new room).

## Custom domain

Buy a domain at Namecheap, Cloudflare, or Porkbun (~$10/yr) and point it at your host — Render/Railway both have an "Add custom domain" setting that walks you through the DNS records and gives you free HTTPS.

**Naming tip:** "Codenames" is a trademark of Czech Games Edition, so don't use that name or its artwork for a public/commercial site. The game *mechanics* are fine to use. This project ships branded as **WordSpies** — to rename it, search-and-replace "WordSpies" in `public/index.html` and `README.md`.

## Ads / monetization later

`public/index.html` contains two placeholder containers (`id="ad-landing"`, `id="ad-side"`) — paste your ad network tag (e.g. Google AdSense) inside them when you're ready. Keep ads off the game board itself; misclicks during play will drive players away.

## Project layout

```
server.js          # Express + Socket.IO server, all game rules, in-memory rooms
words.js           # word packs
public/index.html  # the entire client (HTML + CSS + JS in one file)
test/e2e.js        # scripted 4-player full-game test
```

## House rules implemented

The starting team gets 9 words, the other 8, plus 7 neutrals and 1 assassin. A clue is one word + a number; the team may guess up to number + 1 times (a "0" clue allows unlimited guesses). Guessing your own word lets you keep going, anything else ends the turn, and the assassin ends the game instantly. Clues can't be words visible on the board.
