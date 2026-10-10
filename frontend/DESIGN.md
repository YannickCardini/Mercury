---
name: Mercury
description: Opaque matte lagoon-blue panels and buttons over an animated night sky, cream text, sage-mint primary action.
colors:
  lagoon: "#1d4459"
  lagoon-hi: "#265670"
  lagoon-lo: "#16374a"
  lagoon-line: "#2e637e"
  lagoon-edge: "#0f2938"
  ink-night: "#16374a"
  ink: "#f0f8ff"
  ink-solid: "#1d4459"
  night: "#0f172a"
  night-deep: "#05070f"
  night-glow: "#1a2840"
  green: "#00c885"
  green-deep: "#008f5f"
  green-ink: "#1b6e50"
  green-light: "#6fd0a9"
  blue: "#0477bd"
  blue-deep: "#0c5d8c"
  blue-ink: "#0b639a"
  blue-light: "#7fc4f0"
  orange: "#f7914e"
  orange-deep: "#c96a2b"
  orange-ink: "#a8501a"
  orange-light: "#f9a56c"
  red: "#c8452f"
  red-deep: "#9c3220"
  red-ink: "#b53a25"
  red-light: "#f08a76"
  gold: "#ffb703"
  gold-deep: "#c78a00"
  gold-ink: "#8a6400"
  gold-light: "#ffc83d"
  cyan: "#22b8cf"
  violet-deep: "#168499"
  violet-ink: "#168499"
  violet-light: "#6fdcec"
typography:
  display:
    fontFamily: "Baloo 2, ui-rounded, Segoe UI, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0"
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  pill: "999px"
components:
  button-fill-green:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-paper:
    backgroundColor: "{colors.lagoon-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  slab:
    backgroundColor: "{colors.lagoon}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
---

<!-- Provenance: extracted from frontend/src/app/styles/tokens.css. On 2026-10-10 the owner moved from cream paper, to dark glass, to opaque matte lagoon-blue (token names --m-paper* and the m-paper class were kept across all three). Not yet seen rendered on a device. -->

# Design System: Mercury

## Overview

**Creative North Star: "Matte Lagoon Boards on a Night Sky"**

Every surface a player touches (card, modal, panel, toast, secondary button) is an opaque matte lagoon-blue slab (#1d4459, with #16374a ink-night for the matchmaking card), with cream text (#f0f8ff) and a 1px muted muted cyan line (#2e637e), set over the always-visible animated space background. The feel is a modern board game: warm, solid, no transparency, no blur, no glow. The primary action is a matte sage-mint green (#00c885). MERCURY and its subtitle stay as they are.

The tone is sober and readable, a real well-drawn object rather than decoration. Baloo 2 gives titles and numbers a rounded, friendly weight; Plus Jakarta Sans carries everything else. Color is used as a small set of named accents on buttons and tints, never as ambient decoration.

The previous dark neon look, a "solar system" interface theme and a pulsing-halo "quicksilver" direction are all discarded and must not return.

**Key Characteristics:**
- Opaque matte lagoon-blue surfaces with cream text on a visible space background
- 1px muted cyan line, a solid ledge under slabs and buttons, no backdrop blur or translucent glow
- Rounded display type for titles and numbers, geometric sans for text
- Six named accents, each with a fill, a deep ledge, and a light text variant
- Protected, out of scope for restyling: game cards, board and its components, matchmaking overlay, animated space background, logo and icon, shop purchase coin animation

## Colors

Deep lagoon and cream neutrals with a restrained set of saturated accents.

### Primary
- **Sage Mint** (#00c885): the main action fill (play, confirm), with a lagoon-ink label. Ledge #008f5f; text on lagoon or sky #6fd0a9.

### Secondary
- **Harbor Blue** (#0477bd): informational actions and the focus color (focus ring, field focus). Ledge #0c5d8c; text on lagoon or sky #7fc4f0.

### Tertiary
- **Ember Orange** (#f7914e): warm secondary emphasis, with lagoon-ink label on the fill. Ledge #c96a2b; text on lagoon or sky #f9a56c.
- **Brick Red** (#c8452f): destructive and error states. Ledge #9c3220; text on lagoon or sky #f08a76.
- **Coin Gold** (#ffb703): coins, rewards, the first-place medal, with lagoon-ink label on the fill. Ledge #c78a00; text on lagoon or sky #ffc83d.
- **Cyan (boosters)** (#22b8cf): boosters and special items. Ledge #168499; text on lagoon or sky #6fdcec.

### Neutral
- **Dark Lagoon** (#1d4459): card, modal, panel and toast fill. **Lagoon Lift** (#265670): secondary buttons and fields. **Lagoon Well** (#16374a): wells and hovered rows. **Lagoon Edge** (#0f2938): the ledge under slabs and buttons. **Muted Cyan** (#2e637e): the 1px line around surfaces. **Ink Night** (#16374a): the matchmaking card.
- **Cream Ink** (#f0f8ff) with 78%, 62% and 40% steps for text; the 40% step is placeholders and disabled only.
- **Lagoon Ink** (#1d4459): labels on light fills, including the green primary button, medals, and orange and gold buttons.
- **Night** (#0f172a), **Deep Night** (#05070f), **Night Glow** (#1a2840): the sky and the page fallback color.
- Medals: silver #cfcac0, bronze #d39a62, both with ink labels.

### Named Rules
**The Context Alias Rule.** Components use the context aliases (`--m-fg`, `--m-line`, `--m-well`, `--m-*-fg`). Sky and lagoon surfaces share the same light-on-dark aliases; lagoon surfaces still carry the `m-paper` class for their fill.

**The One Source Rule.** Values live only in `tokens.css`, shared by the Angular app and the static content site. Never copy a hex into a component.

**The No color-mix Rule.** Tints use `rgba(var(--m-*-rgb), alpha)`; `color-mix()` is avoided for older Android WebViews.

## Typography

**Display Font:** Baloo 2 (ui-rounded, Segoe UI, system-ui, sans-serif)
**Body Font:** Plus Jakarta Sans (system-ui, -apple-system, Segoe UI, Roboto, sans-serif)

**Character:** A rounded, warm display face for headlines and numerals against a clean geometric text face. Both are self-hosted as woff2 under `src/assets/fonts/` (OFL-1.1); no Google Fonts requests.

### Hierarchy
- **Display** (700, line-height 1.1, letter-spacing 0): titles, scores, counters, call-to-action labels.
- **Body** (Plus Jakarta Sans, regular weight): paragraphs, list rows, descriptions.
- **Label** (700, 0.78rem, letter-spacing 0, normal case): field and section labels in `--m-fg-3`.
- Buttons use Plus Jakarta Sans at weight 700, line-height 1.2.

### Named Rules
**The No Shouting Rule.** No uppercase and no letter-spaced capitals for labels. Sentence case, weight does the emphasis.

**The Game Page Exception.** `/game` keeps its own typography (`font-family: initial` on its host); the global fonts do not apply there until a separate task says so.

## Layout

Mobile first, one column, centered panels over the sky. On phones, leaderboard and shop keep a side margin rather than going full width so the sky stays visible. Edge-to-edge Android 15+ is handled by the `--sa-top/right/bottom/left` variables (max of `env()` and Capacitor's injected `--safe-area-inset-*`); use those, never `env()` alone. `app-root` already pads the top by `--sa-top`. The game board is laid out separately and is outside this system.

## Elevation & Depth

Matte, ledge first. Thickness is a solid dark ledge under each slab and button, with a soft shadow only to lift the sheet off the sky. No blur, no glow.

### Shadow Vocabulary
- **Ledge** (`box-shadow: 0 3px 0 0 #0f2938`): secondary buttons and chips.
- **Slab** (`0 4px 0 0 #0f2938, 0 22px 40px -22px rgba(0,0,0,0.7)`): cards, modals, panels.
- **Pop** (`0 2px 0 0 #0f2938, 0 12px 24px -14px rgba(0,0,0,0.6)`): toasts and small floating items.
- **Accent ledge** (`0 3px 0 0 <accent>-deep`): filled buttons.
- **Focus** (`0 0 0 3px rgba(4,119,189,0.3)`): field focus.

### Named Rules
**The Matte Rule.** No backdrop blur anywhere in the app UI. Scrims are a flat rgba(6,8,16,0.68).

## Shapes

Soft, generous rounding. Surfaces use 28px (xl), inner wells 14px (md), small tiles 10px (sm), larger tiles 20px (lg). Buttons and chips are full pills; icon buttons are circles (32px default). Surfaces get a 1px muted cyan (#2e637e) border.

## Components

### Buttons
- **Shape:** pill (999px), padding 11px 18px, 8px gap, weight 700.
- **Fill:** accent background with its `on-` label color, accent-deep ledge (0 3px 0). Hover brightens 7%. Pressed, the button moves down 2px and the ledge shrinks to 1px.
- **Secondary:** Lagoon Lift (#265670) background, cream text, 1px muted cyan line, Lagoon Edge ledge. For secondary actions on sky or in cards.
- **Quiet:** no ledge, translucent well background, 1px line border, text follows context. For low emphasis.
- **Tint:** accent at 10% with a 28% accent border and accent `-fg` text, no ledge. For sign-out, delete and informational links.
- **Focus:** 2px blue-fg outline, 2px offset. **Disabled:** 50% opacity.

### Cards / Containers
- **Slab:** Dark Lagoon, cream text, 28px radius, Slab shadow, 1px muted cyan line. The standard card, modal and panel.
- **Inset:** a faint well (4% ink) with a 1px line border and 14px radius, inside a slab.
- **Tint tile:** accent at 12% with 30% accent border, for status banners and badges.

### Inputs / Fields
- Lagoon Lift background, 1.5px line border, 14px radius. Focus turns the border blue-fg and adds the Focus shadow. Placeholder in Ink 4.

### Icon buttons
- 32px circle, well background, 1px line border; hover deepens the well; same blue focus ring.

### Toast
- Pill, Dark Lagoon, cream 14px weight 700, Pop shadow, slides in from above in 200ms. Error variant is Brick Red fill with a red ledge.

## Do's and Don'ts

### Do:
- **Do** use opaque lagoon surfaces with cream text over the sky, and add the `m-paper` class to each of them.
- **Do** reference `--m-*` tokens and context aliases; add values to `tokens.css` only.
- **Do** show thickness with a solid ledge and press feedback (tranlagoonY 2px), 90ms.
- **Do** use the `-light` accent variant for text on lagoon and on the sky.
- **Do** use `--sa-*` variables for any safe-area spacing.

### Don't:
- **Don't** use violet, purple or any derivative in the UI (the animated space background and /game are outside this rule).
- **Don't** use backdrop blur, translucent glass, glowing borders or pure white fills or text.
- **Don't** use uppercase spaced labels.
- **Don't** restyle the game cards, the board, the matchmaking overlay, the space background, the logo or the purchase coin animation without an explicit request.
- **Don't** introduce ambient looping animations on surfaces (pulsing halos, breathing thumbnails); they were deliberately removed.
- **Don't** use `color-mix()` or Google Fonts.
