# TalkSibi — Play Console handoff for coworker

Paste this whole file (or share the GitHub link) to the coworker who's filling out Play Console. Every file they need is listed at the top with an exact location. The walkthrough that follows is the paste-in-order Console guide.

---

## Where every file lives

| What they need | Where it is |
|---|---|
| **App icon** (`icon-1024.png`, adaptive fg + bg) | Designer's Figma export → `TalkSibi-play-store-assets/icon/` — Sibi shares the Figma link privately |
| **Feature graphic** (`feature-graphic-1024x500.png`) | Same folder → root |
| **8 phone screenshots** (`01-hero.png` … `08-community.png`) | Same folder → `screenshots/` |
| **Short + full description** (`.txt`) | Same folder → `copy/` — but also pasted inline below so you don't need it |
| **App bundle (`.aab`)** | Sibi will DM you the file once Bubblewrap has built it. Do NOT commit `.aab` to the repo. |
| **Privacy policy URL** | Already live at https://talksibi.com/privacy — no upload needed, just the link |
| **Reviewer login (test account)** | Sibi will DM you email + password — do NOT screenshot or paste anywhere |
| **This handoff doc** | GitHub: https://github.com/sibghat12/wordspies/blob/main/PLAY_CONSOLE_HANDOFF.md |
| **Related brief (design side)** | https://github.com/sibghat12/wordspies/blob/main/PLAY_STORE_ASSETS_BRIEF.md |
| **TWA package + assetlinks** | https://github.com/sibghat12/wordspies/blob/main/app/twa-manifest.json and https://talksibi.com/.well-known/assetlinks.json |

**Play Console:** https://play.google.com/console — log in with the TalkSibi developer account (Sibi DMs the creds; do not screenshot).

---

## 1. Dashboard → Create app

- **App name:** `TalkSibi`
- **Default language:** English (United Kingdom) — en-GB
- **App or game:** App
- **Free or paid:** Free
- **Declarations:** tick both boxes (Developer Program Policies + US export laws)

---

## 2. Main store listing (left nav → Grow → Store presence → Main store listing)

### App name
`TalkSibi`

### Short description (pick one — all under the 80-char limit)
```
Practise real languages with real people. Free forever.
```
```
Chat, call, and play your way fluent. Free.
```
```
Language exchange with native speakers + AI corrections. Free.
```

### Full description (paste as-is)
```
Practise real languages with real people — free.

TalkSibi is a language-exchange community. Match with native speakers of the language you're learning, chat by text or voice, drop into live voice parties, and play word games in your target language. AI grammar correction is built in, one tap, no premium tier.

🌍 Chat with native speakers — English, Spanish, French, German, Italian, Japanese, Korean, Portuguese, and 30+ more
🎙️ Live voice parties — audio rooms where you lurk first, take the mic when ready
✨ AI grammar corrections — tap the wand under any message, learn from every mistake
🎮 6 language games — Codenames, Word Race, Word Chain, Guess Word, Mind Meld, Who Is The Spy
🎓 AI Learn plans — personalised 5-lesson plans with progress tracking
🎯 IELTS / TOEFL practice — real conversation with native English speakers, free

Who it's for: adults (18+) learning a new language who want real practice with real people, not just flashcard drills. Whether you're prepping for IELTS, moving abroad, or just want to speak your K-drama fluently — TalkSibi is where you actually talk.

Free forever. No ads. No premium tier. 18+ verified community.

Sign up in 60 seconds — pick the languages you speak and the languages you're learning, then start chatting with people from around the world.

Keywords: learn English, learn Spanish, learn French, learn Japanese, learn Korean, learn German, language exchange, practise speaking, native speakers, voice chat, language partner, AI language tutor, IELTS speaking practice, TOEFL prep, tandem alternative, hellotalk alternative.
```

### App icon
Upload `icon/icon-1024.png` from the Figma delivery folder.

### Feature graphic
Upload `feature-graphic-1024x500.png` from the Figma folder root.

### Phone screenshots (upload 8, in this exact order)
1. `screenshots/01-hero.png`
2. `screenshots/02-ai-experts.png`
3. `screenshots/03-parties.png`
4. `screenshots/04-games.png`
5. `screenshots/05-translate.png`
6. `screenshots/06-native.png`
7. `screenshots/07-learn.png`
8. `screenshots/08-community.png`

### Tablet screenshots (7-inch, 10-inch)
SKIP — leave blank.

---

## 3. Store settings (left nav → Grow → Store presence → Store settings)

- **App category:** Education
- **Tags:** language learning, education, communication
- **Store listing contact details:**
  - Email: `contact@talksibi.com`
  - Phone: SKIP
  - Website: `https://talksibi.com`
- **External marketing:** ON (allow Play Store to feature us)

---

## 4. App content (left nav → Policy → App content)

### Privacy policy
- URL: `https://talksibi.com/privacy`

### App access
- Are all app functionality available without restrictions? → **No, some restrictions**
- Instructions: "Reviewer must create an account to access the community. Sign up flow is 60 seconds — name + date of birth (must be 18+) + languages. Test account: **ASK SIBI for reviewer credentials**"

### Ads
- Does your app contain ads? → **No**

### Content rating (questionnaire)
Category: **Social**

Answers:
- Violence: No
- Sexual content: No
- Profanity: **User-generated content can contain mild language** — Yes, users can chat freely
- Controlled substances: No
- Gambling: No
- User-generated content: **Yes** — text chat, voice chat, voice parties
- Users can interact with other users: **Yes**
- Users can share their location: **No** (we only ask for city as text, no GPS)
- Users can share personal info: **Yes** — profile bio, photos
- Digital purchases: No
- Unrestricted internet: **Yes**

Expected rating: **Teen** or **Mature 17+** — accept whatever Google assigns.

### Target audience
- Target age group: **18+ only**
- Appeals to children: **No**
- Google Families / Designed for Families: **No**

### News app
No

### COVID-19 contact tracing
No

### Data safety
**Data collected:**
- Personal info → Name (yes, required, for chat), Email address (yes, required, for login), User IDs (yes, required)
- Location → **No** (we only store user-typed city as text — that's Personal info, not Location)
- Photos and videos → Photos (yes, optional, user profile picture + gallery)
- Audio files → Voice recordings (yes, optional, voice notes + voice parties)
- Messages → In-app messages (yes, required, that's the core feature)
- Web browsing → No
- Contacts → No
- Financial info → No
- Health and fitness → No

**Data shared with third parties:**
- **None** — we don't share user data with third parties. Analytics (Google Analytics) is aggregate + opt-in, not per-user data sharing.

**Security practices:**
- Data encrypted in transit → **Yes** (HTTPS everywhere)
- User can request data deletion → **Yes** (Delete account button in Settings)
- Follows Play Store families policy → **No** (we're 18+)
- Independent security review → **No**

**Purpose:** Account management, App functionality, Analytics, Fraud prevention.

### Government apps
No

### Financial features
No

### Health
No

---

## 5. Pricing & distribution

- Countries: **All countries available**
- Contains ads: No
- In-app purchases: No
- Available on Wear OS / Android TV / Auto / ChromeOS: No — Phone only

---

## 6. App bundles (Release → Testing → Internal testing)

Sibi will DM you the `.aab` file. Upload it under **Internal testing** first, NOT Production. Play requires 14 days of closed testing before Production.

- Track: **Internal testing**
- Countries: All
- Rollout: 100%
- Release name: `1.0.0 — closed test`
- Release notes:
```
First release. Chat with native speakers, drop into voice parties, play language games, get AI grammar corrections. Free forever.
```

---

## What to skip / ignore

- Wear OS, Android TV, Auto, ChromeOS listings — SKIP all
- Advertising ID — declare **not used** (we have no ad SDKs)
- Financial features, News, COVID — all NO
- Government / medical / crypto flags — all NO

---

## Before you hit "Send for review"

Ping Sibi on Slack with:
1. Screenshot of the finished Main store listing
2. Screenshot of the Data safety summary
3. Screenshot of Content rating result

Sibi eyeballs those 3 before submission. Once he says go, hit **Send for review**. Google's turnaround is 2–7 days.

---

*Last updated: 2026-08-20 by Sibi via Claude Code.*
