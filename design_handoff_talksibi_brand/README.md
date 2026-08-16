# Handoff: TalkSibi Brand (Logo + Tagline)

## Overview
Rebrand of WordSpies (wordspies.co.uk) / TalkFellow to **talksibi** (talksibi.com) — a language-exchange app (Tandem/HelloTalk space) built on real conversations, games, and a worldwide community. "Sibi" is the founder's nickname. This package contains the final approved logo system and brand tokens.

## About the Design Files
These files are **design references created in HTML/SVG** — they show intended look, not production code. Recreate in the target codebase's environment (React, Vue, native, etc.) using its patterns. If no environment exists yet, choose an appropriate framework and implement there. The SVGs in `assets/` ARE production-usable.

## Fidelity
**High-fidelity.** Colors, type, spacing, and proportions are final. Implement pixel-perfectly.

## The Logo System
Four rounded chat bubbles (tails pointing outward in four directions = a global crowd talking) + lowercase wordmark.

- **Mark**: 4 bubbles in a 46×46 unit grid. Exact geometry is in `assets/talksibi-mark.svg` — never redraw by hand, scale this file.
- **Wordmark**: "talksibi" — Hanken Grotesk, weight 600, all lowercase, letter-spacing -0.5px (at 38px), color #000000 on light / #FFFFFF on dark.
- **Gap between mark and wordmark**: 5px when wordmark is 38px (≈0.13× the mark width). Mark and wordmark vertically centered.
- **Tagline**: "CONNECT · LEARN · PLAY" — Hanken Grotesk 600, uppercase, 12.5px at reference size, letter-spacing 3px, color #6B7280; the two dot separators are #5B6CFF and #1FB28A.

## Assets (in assets/)
- `talksibi-mark.svg` — mark only, transparent bg (masters the geometry)
- `talksibi-logo-light.svg` — horizontal lockup, black text (light backgrounds)
- `talksibi-logo-dark.svg` — horizontal lockup, white text (dark backgrounds)
- `talksibi-logo-tagline.svg` — lockup + tagline, centered (hero/splash/store)
- `talksibi-logo-stacked.svg` — mark over wordmark (square placements, avatars)
- `talksibi-app-icon-dark.svg` — 96×96, radius 24, ink #14161F bg (primary app icon)
- `talksibi-app-icon-light.svg` — white version with #E8E6E0 border
- `favicon.svg` — mark full-bleed (browsers add their own padding)

⚠️ **Font note**: the wordmark SVGs use live `<text>` with a Google Fonts @import. That works when the SVG is inlined in a page; when used via `<img>` or as a static asset, load Hanken Grotesk on the page OR convert the text to outlines once in any vector tool. The mark/app-icon/favicon SVGs are pure paths and safe everywhere.

## Design Tokens
Colors:
- Periwinkle `#5B6CFF` (primary accent)
- Coral `#FF7A59`
- Jade `#1FB28A`
- Sun `#FFC94D`
- Ink `#14161F` (dark surfaces)
- Text/dark `#000000`, tagline gray `#6B7280`, light border `#E8E6E0`

Typography:
- Brand font: **Hanken Grotesk** (Google Fonts), weights 500/600
- Wordmark: 600, lowercase, tracking -0.5px @ 38px (scale proportionally)
- Tagline: 600, uppercase, tracking 3px @ 12.5px

Radii: app icon = 25% of edge (24px @ 96px). Mark bubble radii are baked into the SVG.

## Usage Rules
- Min wordmark lockup width: ~120px; below that use the mark alone.
- Clear space around lockup: at least the height of one large bubble (26/46 of mark height).
- Don't recolor the bubbles, add gradients, or change wordmark case/weight.
- Dark mode: same mark (colors work on ink), swap wordmark to white.

## Files
- `TalkSibi Logo Directions.dc.html` — full exploration history; **section "Final · 7e locked in" (8a–8e)** is the approved set. Card 7e in "Round 7" is the source lockup.
