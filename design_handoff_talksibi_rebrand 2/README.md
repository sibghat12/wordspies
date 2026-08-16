# Handoff: talksibi rebrand (WordSpies → talksibi)

## Overview
Full rebrand of the WordSpies app (wordspies.co.uk → **talksibi.com**). New name, logo, palette, type, landing page, and every core app screen (community, chats, party voice rooms, games hub, learn, login, profile), desktop + mobile. Tagline: **Connect · Learn · Play**.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs inside the existing codebase** (Express + Socket.IO server with single-file HTML clients: `public/index.html`, `public/social.html`, `public/party.html`, `public/games.html`, per-game HTML files, and server-rendered pages in `landing.js`, `pages.js`, `blog.js`, `auth.js`). Keep the app's existing JS logic, socket events, and IDs — this is a reskin + IA change, not a rewrite.

## Fidelity
**High-fidelity.** Recreate pixel-perfectly: exact hexes, weights, radii, and copy below. Where a screen isn't mocked (e.g. individual game boards), apply the design tokens and patterns to the existing layout.

## Design Tokens
Colors:
- Ink / dark surface: `#16181f` (cards on dark: `#1d2130`, borders `#2a2e42`)
- Periwinkle (primary): `#5b6cff` (hover `#4353e8`, light tint `#f3f4fb`, on-dark text `#9aa3ff` / `#8f9bff`)
- Green (success/native): `#1fb28a` (on-dark `#43cfa5`, tint `#f2f8f5`, text-on-tint `#2d7a62`)
- Coral: `#ff7a59` · Gold: `#ffc94d` (dark-gold text `#7a5b0e`)
- Purple (AI): gradient `#5b6cff → #9b6cff`, tint `#f6f1ff`, text `#6b4fd8`
- Live red: `#d9544d` · Body text: `#16181f` / secondary `#4a4d59` / muted `#8a8d99` / `#9a9db8`
- Page bg: `#ffffff`, app bg `#fbfbfd`, hero tint `linear-gradient(180deg,#f5f6ff,#ffffff)`
- Neutral chips: bg `#fafafa`, border `#e8e6e0`, text `#6b6e7a`

Typography: **Hanken Grotesk** (Google Fonts, weights 400/500/600/700). Wordmark = lowercase `talksibi`, weight 500, letter-spacing -0.3px. Max weight anywhere: 700 (h1/h2 only). Body 400-500, labels 600. UPPERCASE section labels: 13px / 600 / letter-spacing 2.5px.

Radii: cards 16-20px, pills/buttons 99px, inputs 10-12px, phone bottom-sheet 34px.
Shadows: cards `0 18px 50px rgba(22,24,31,0.12)`; primary CTA `0 6px 18px rgba(91,108,255,0.3)`.

## Logo
4-bubble cluster (46×46 base): periwinkle `#5b6cff` top-left (radius 9 9 2 9), coral `#ff7a59` top-right (9 9 9 2), green `#1fb28a` bottom-right (9 2 9 9), gold `#ffc94d` bottom-left (2 9 9 9) — see exact offsets in the DC files. Wordmark sits 5-9px right of the mark. Favicon = 2 bubbles only (periwinkle + green). App icon: cluster centered on `#14161f`, radius 22-28%. PNG export: `talksibi-logo` snapshots from `TalkSibi Logo Directions.dc.html` (#logo-export element).

## Screens / Views
(Each mocked in `TalkSibi App Screens.dc.html` with id badges; landing in `TalkSibi Landing.dc.html`.)

- **1a Community wall** (`social.html` tabWall): white top bar (logo, tabs, invite pill, avatar) → visitors stripe (periwinkle tint `#f0f1ff`, avatar stack, "See who →") → Happening-now strip → search + filter chips (All / 🟢 Online / 📍 Nearby / ✦ Chat Experts) → 3-col member cards (photo+online dot, name+age, language chips native/learning, bio, "💬 Say hola" primary + 🎲 challenge) → right rail: You card (dark, streak), This week's kings 👑 leaderboard, invite progress card.
- **1b Chats** (tabChats/tabChat): 280px list + conversation. Received bubble white/border, radius 4 14 14 14; sent `#5b6cff` white text, radius 14 4 14 14; translation hint line under received ("tap to translate"), green correction line under sent ("✓ corrected: …"); game-invite card centered with "Take your seat"; composer with 😊 🎙 📷 + pill input.
- **1c Party voice room** (`party.html`): dark `#16181f`; LIVE pill (pulsing dot), title "Spanish ↔ English party", listener count; speaker grid (58px avatars, speaking = green ring `box-shadow 0 0 0 3px rgba(31,178,138,0.25)`, host 👑, dashed "+ Free seat"); Topic card block (`#1d2130`); chat lines + typing dots; bottom: green "🎙 Take the mic" + 💬 🎉 round buttons.
- **1d Games hub** (tabGames/`games.html`): header + "+ Start a table" dark pill; LIVE TABLES strip; 3-col game cards with 4px colored top border — Codenames 🕵️ periwinkle, Who is the Spy? 🎭 coral, Word Chain 🔗 green, Word Race ⏱ gold, Guess the Word 🍋 purple, Mind Meld 🧠 red. Each: players chip + live/quiet chip. (Ludo, Hoop, Pool, Connect 4 dropped from the lineup.)
- **1e Login/onboarding** (`auth.js`): centered logo, "Say hi to the world 👋", I speak… / I'm learning… chip pickers, 18+ photo-check trust note (green tint), full-width periwinkle CTA, log-in link.
- **1f Profile Me** (tabMe): purple gradient header, avatar overlapping -32px, ✓ verified, language chips, 4 stat tiles (🔥 streak / chats / games won / points), References card, Share + Invite buttons.
- **Landing** (`landing.js` + `public/index.html` marketing): sticky white nav; tinted hero (headline "Practise languages with real people.", floating greeting bubbles Hola/こんにちは/Bonjour/مرحبا/Olá, animated chat card with translate hint + typing dots, live-party pill); dark Connect·Learn·Play icon strip; 40+ languages flag pills; Community 3 tinted cards; "Always on" (parties room mock, clubs list, AI expert chat mock); dark Games band; Learn split w/ mint plan-builder card; full-bleed dark-gold Become-a-teacher CTA (`/become-a-teacher`); full-bleed periwinkle join CTA; 4-col footer (social icons Instagram/TikTok/YouTube/X/Discord, Product/Support/Legal, flag row).

## Mobile (under 720px)
- **4 main bottom tabs**: 🌍 Community · 🎲 Play · 💬 Talk · 🎓 Learn (active = periwinkle label + 16×3px underline dot). ➕ Create = 56px FAB floating bottom-right above the nav (`bottom: 92px; right: 18px`, shadow `0 10px 26px rgba(91,108,255,0.45)`).
- **Sub-tabs at top** per main (segmented pill, active = white pill on `#eef0f5` track): Community → People | Live · Play → Games | Parties · Talk → Chats | AI Experts · Learn → My plan | IELTS & TOEFL. Me = avatar in top bar.
- Member cards become single-column rows (52px photo left, one CTA right). Chips scroll horizontally, never wrap. Chat is full-screen with back arrow. Hit targets ≥ 44px. Landing hero stacks; games grid 3→2; footer stacks.

## Interactions & Behavior
- Landing animations (CSS keyframes, see helmet of `TalkSibi Landing.dc.html`): ts-float (bubbles, 3-3.8s), ts-pop (chat messages stagger 0.3/0.5/0.8/1.15s), ts-dot (typing), ts-wave (👋), ts-pulse (live dots). Respect `prefers-reduced-motion`.
- Keep existing behaviors: visitors stripe dismiss, challenge sheet, refer modal, tab switching — restyle only.
- Buttons hover: primary → `#4353e8`; cards hover: lift shadow.

## Growth & SEO layer (per owner request)
- Meta per page: `<title>` pattern "talksibi — practise languages with real people" / "<Page> · talksibi"; meta description ≤155 chars leading with real people + games + free; canonical to talksibi.com; OG + Twitter cards (rebuild og-image with new logo/palette, 1200×630); theme-color `#5b6cff`.
- JSON-LD: WebApplication + Organization on landing; keep blog (`blog.js`) posts with Article schema; update `sitemap.xml`, `robots.txt`, `llms.txt`, PWA manifest name/icons (`icon-192/512` from new app icon), and `wsbrand.js` brand constants.
- Growth surfaces already designed: invite & win (👑 1yr free) pill + progress, visitors stripe, live nudges, "free seat" everywhere, referral link `talksibi.com/i/<user>`.
- Rename strings WordSpies → talksibi site-wide EXCEPT the Codenames-style game which is titled "Codenames" in the hub (verify trademark comfort; "WordSpies" can stay as that game's name if preferred).

## State Management
No new state beyond existing app. Sub-tab nav on mobile = same tab-switch functions, grouped; remember last sub-tab per main in localStorage.

## Assets
- Fonts: Hanken Grotesk via Google Fonts.
- Logo/favicon/app icon: rebuild from CSS spec above (no binary assets needed); export PNGs from the DC file if preferred.
- Social icons: inline SVGs included in `TalkSibi Landing.dc.html` footer.

## Files
**Read these two first — they are plain standalone HTML (open in any browser, no tooling):**
- `landing-standalone.html` — full landing page (desktop). View the rendered page for layout; the source contains all markup, inline styles, and keyframes.
- `app-screens-standalone.html` — app screens 1a-1f + mobile 2a/2b, each labeled with an id badge.

Design-tool sources (same content; need the design runtime, skip unless curious):
- `TalkSibi Landing.dc.html`, `TalkSibi App Screens.dc.html`, `TalkSibi Logo Directions.dc.html` (final logo = 7e)

**Implementation note for the agent:** the standalone HTML files use a custom `<x-dc>` template wrapper — ignore the wrapper and runtime scripts; every visual element is ordinary HTML with inline `style="…"` attributes you can lift values from. Treat this README as the spec of record where the two disagree.
