---
name: Mercury
description: Opaque matte lagoon-blue panels and chunky keycap buttons over a flat terraformed-Mars landscape, under two moons at night and a double sunrise by day, cream text, sage-mint primary action.
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
  day-ink: "#133246"
  mars-sky-zenith: "#e2e9eb"
  mars-sky-horizon: "#f7ccb2"
  mars-ground: "#eed2b6"
  mars-mesa: "#edcdbb"
  mars-mesa-shade: "#e4bfac"
  mars-hill: "#e8c39f"
  mars-crater-bowl: "#c4936b"
  mars-night-sky-zenith: "#05080f"
  mars-night-sky-horizon: "#131a2e"
  mars-night-ground: "#1d161a"
  mars-night-mesa: "#272027"
  mars-night-mesa-shade: "#19141a"
  mars-night-hill: "#1f181c"
  mars-night-water: "#121c2e"
  mars-phobos: "#cdc6bb"
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
  btn: "16px"
  pill: "999px"
components:
  button-fill-green:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "11px 18px"
  button-paper:
    backgroundColor: "{colors.lagoon-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "11px 18px"
  slab:
    backgroundColor: "{colors.lagoon}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
---

<!-- Provenance: extracted from frontend/src/app/styles/tokens.css. On 2026-10-10 the owner moved from cream paper, to dark glass, to opaque matte lagoon-blue (token names --m-paper* and the m-paper class were kept across all three). Not yet seen rendered on a device. On 2026-10-14 the day-mode background was replaced by "Matin sur Mars"; the previous day view is archived in resources/orbasphere/ and is no longer part of the system. On 2026-10-15 the night background (the animated space sky with nebulae, planets, drifting star fields and a Milky Way in /game) was replaced by the same Mars landscape at night. Background sources: tokens.css sections 1 and 3 (--m-sky, --m-horizon), space-background.component.{html,scss,ts}, shared/_mars-palette.scss, resources/mars/generate-mars-landscape.py (both palettes, geometry). The owner validated the day background on 2026-10-15; the night has not been seen on a device yet. -->

# Design System: Mercury

## Overview

**Creative North Star: "Matte Lagoon Boards on a Night Sky"**

Every surface a player touches (card, modal, panel, toast, secondary button) is an opaque matte lagoon-blue slab (#1d4459, with #16374a ink-night for the matchmaking card at night; by day the matchmaking card is a cream paper card like the other modals), with cream text (#f0f8ff) and a 1px muted cyan line (#2e637e), set over the always-visible Mars landscape background. The feel is a modern board game: warm, solid, no transparency, no blur, no glow. The primary action is a matte sage-mint green (#00c885). MERCURY and its subtitle stay as they are.

The tone is sober and readable, a real well-drawn object rather than decoration. Baloo 2 gives titles and numbers a rounded, friendly weight; Plus Jakarta Sans carries everything else. Color is used as a small set of named accents on buttons and tints, never as ambient decoration.

Behind everything is one place, a terraformed Mars seen flat and frontal, built from two primitives only: horizontal bands and concentric rings. The same landscape is drawn in two lights. At night it lies under a near-uniform navy sky with fixed stars, Phobos and Deimos, its colony windows lit in the four seat colours. By day it is a pale morning with a double sunrise. In both modes it stays low in contrast so that the text and plates placed on it read anywhere, and nothing in it competes with the menu.

The previous dark neon look, a "solar system" interface theme, a pulsing-halo "quicksilver" direction and the nebula space sky are all discarded and must not return.

**Key Characteristics:**
- Opaque matte lagoon-blue surfaces with cream text on a visible Mars landscape
- 1px muted cyan line and a solid ledge under slabs; buttons are keycaps (2px outline, two-tier solid ledge); no backdrop blur or translucent glow
- Rounded display type for titles and numbers, geometric sans for text
- Six named accents, each with a fill, a deep ledge, and a light text variant
- One flat, stacked-plane Mars landscape anchored on one horizon line, with a night palette and a day palette; cream ink on it at night, slate ink by day
- Protected, out of scope for restyling: game cards, board and its components, matchmaking overlay, Mars background (night and day), logo and icon, shop purchase coin animation

## Colors

Deep lagoon and cream neutrals with a restrained set of saturated accents, over a Mars landscape that is navy and rust-black at night and pale pearl-to-apricot by day.

### Primary
- **Sage Mint** (#00c885): the main action fill (play, confirm), with a lagoon-ink label. Ledge #008f5f; text on lagoon or sky #6fd0a9.

### Secondary
- **Harbor Blue** (#0477bd): informational actions and the focus color (focus ring, field focus). Ledge #0c5d8c; text on lagoon or sky #7fc4f0.

### Tertiary
- **Ember Orange** (#f7914e): warm secondary emphasis, with lagoon-ink label on the fill. Ledge #c96a2b; text on lagoon or sky #f9a56c.
- **Brick Red** (#c8452f): destructive and error states. Ledge #9c3220; text on lagoon or sky #f08a76.
- **Coin Gold** (#ffb703): coins, rewards, the first-place medal, with lagoon-ink label on the fill. Ledge #c78a00; text on lagoon or sky #ffc83d.
- **Cyan (boosters)** (#22b8cf): boosters and special items. Ledge #168499; text on lagoon or sky #6fdcec; text on paper #0e6e7f. The token keeps the name `--m-violet`.

### Neutral
- **Dark Lagoon** (#1d4459): card, modal, panel and toast fill. **Lagoon Lift** (#265670): secondary buttons and fields. **Lagoon Well** (#16374a): wells and hovered rows. **Lagoon Edge** (#0f2938): the ledge under slabs and buttons. **Muted Cyan** (#2e637e): the 1px line around surfaces. **Ink Night** (#16374a): the matchmaking card.
- **Cream Ink** (#f0f8ff) with 78%, 62% and 40% steps for text; the 40% step is placeholders and disabled only.
- **Lagoon Ink** (#1d4459): labels on light fills, including the green primary button, medals, and orange and gold buttons.
- **Night** (#0f172a): the default `--m-surface` of the sky context, dark shop panels, and the base of the MERCURY letter ledge (`--m-brand-ledge`, 70%). **Deep Night** (#05070f): `--m-page`, the html/body fallback colour at night. **Night Glow** (#1a2840): used only by the static content site under `content/`, which keeps its own radial night gradient (Night Glow to Night to Deep Night); the app's night sky no longer uses it.
- Medals: silver #cfcac0, bronze #d39a62, both with ink labels.

### Mars landscape palettes (night and day)
One drawing, two palettes. The landscape colours are `mx-*` classes written by the generator into `src/app/shared/_mars-palette.scss`: the night palette is the default (under `.space-bg`), the day palette overrides it (under `.space-bg.day`). The sky bands and the ground fill are also mirrored into `tokens.css` as `--m-sky-bands` and `--m-sky-ground` (night on the base `:root`, day under `data-theme="day"`), which compose two gradients: `--m-sky` (sky over ground, only under the full landscape, where the relief covers the join) and `--m-sky-open` (the sky alone, its horizon band running to the bottom, for every surface without the relief).

**Night.** Dark everywhere, near planes darker than far ones, cold moonlight from the right (the same side as the morning suns, so shadows never change side). No glow marks the horizon; the mesas, a little lighter than the sky, do.
- **Banded sky**: nine near-uniform navy bands, #05080f at the zenith through #070a13, #080c17, #0a0e1a, #0b101e, #0d1222, #0f1426, #11172a to #131a2e at the horizon, at the same fractions of the horizon height as by day.
- **Ground**: #1d161a below the horizon in `--m-sky`; the drawn plain is four wavy bands, lightest at the horizon: #22191c, #1e161a, #1b1417, #171114.
- **Mesas**: #272027, shadow faces #19141a at 60% opacity with a stipple of #19141a, strata lines #322a32.
- **Hills**: #1f181c, with a moonlit rim #3a2f36.
- **Mists**: nacre pills #5a667c to #625f72 to #586a6e (bank #5a667c), dusty rose #6e4a52 on the plain, dim ochre #6f6050 at the lake. Layer opacities: far nacre 12%, low rose 35%, lake ochre 35%.
- **Crater lake**: water #121c2e, ripples #24324a, lichen rim #262a1f, bank #000 at 30%, lit rim #c8d2e6 at 8%, and the broken reflection of Phobos in #d9dfea at 75%.
- **Colony**: domes #2d2b34, shaded #1e1c24, cast shadow #000 at 30%, mast #3a3842, base line #2e2529. Each window carries a seat colour (`--m-red`, `--m-blue`, `--m-green`, `--m-orange`) with two rings of its light on the hull (32% and 18%). The mast beacon (#f7914e) blinks.
- **Moons**: Phobos, lumpy, body #cdc6bb, night side #8e887f at 60%, Stickney crater #a59e94 with a lit arc #dcd6cc, two small craters #b8b0a5, halo rings #c9d6f0 at 9%, 5% and 3%. Deimos, a bright dot #f1eee8 with halo rings #dfe6f5 at 12% and 6%.
- **Stars and the kept sky events**: three fixed star fields of white points (700, 200 and 70 stars, 45 to 100% alpha) drawn as `box-shadow` lists, nine slowly twinkling white stars, three rare shooting stars (white streaks), and an occasional distant spaceship (hull #8fa6cf, cockpit #bfe3ff, trail #bfe3ff at 70%). Everything in the sky is drawn before the landscape, so whatever falls below the horizon passes behind the mesas and the ground.

**Day ("Matin sur Mars").** The whole palette is light and dusty; every value is a pale tint, so dark text holds contrast everywhere.
- **Banded sky**: nine hard-edged bands from **Cool Pearl** at the zenith (#e2e9eb) through #e6ebea, #eaece8, #eeebe4, #f2e8de, #f4e3d6, #f6dccc, #f7d4bf to **Apricot Horizon** (#f7ccb2). Band edges sit at fixed fractions of the horizon height (16, 32, 46, 58, 69, 79, 87.5, 94.5 and 100%). `--m-page` (#e2e9eb) is the zenith band, used as the html/body fallback.
- **Ground**: **Sand** (#eed2b6) below the horizon in `--m-sky`; the drawn plain is four wavy bands, lightest at the horizon: #f3dbc3, #f0d4b8, #edceaf, #eac8a7.
- **Mesas**: **Powdered Terracotta** (#edcdbb), shadow faces #e4bfac at 55% with a stipple of the same tone, strata lines #f2d6c6.
- **Hills**: **Light Ochre** (#e8c39f), with a lit rim #efd0ae on slopes facing the suns.
- **Suns**: a large pearl sun (#fffaf1, halo rings #fff6e8) and a small pale-gold sun (#ffdca6, core #fff0d6, halo #ffe7c4).
- **Crater lake**: water #d3e2da with ripple rings #e6efe9, a lichen rim #d3d6aa, broken sun reflections #fffaf1 and #ffe9d2.
- **Mists**: nacre pills (#fdf7f1 to #fbeeea to #f4f3ec, bank #fbf2ec), terracotta (#f2bea4) and ochre (#f9e2b8), each fading to transparent at both ends. Layer opacities: far 85%, low 55%, lake 75%.
- **Colony**: four domes (#f8f3ec, shaded #e6dccf, cast shadow #c4936b at 16%) whose windows carry the four seat colours; a mast (#e7dccd) with a steady orange beacon (#f7914e).
- **Slate Ink** (#133246): the day value of `--m-ink`, the text colour on day paper and on the landscape.

The palettes live in the generator (`resources/mars/generate-mars-landscape.py`, `PALETTES["night"]` and `PALETTES["day"]`). The direction contract named #e3eaec for the day zenith and #e9c3ad for the day mesas; the build settled on #e2e9eb and #edcdbb, and the build values are the system.

### Named Rules
**The Context Alias Rule.** Components use the context aliases (`--m-fg`, `--m-line`, `--m-well`, `--m-*-fg`). Sky and lagoon surfaces share the same light-on-dark aliases; lagoon surfaces still carry the `m-paper` class for their fill.

**The One Source Rule.** Values live only in `tokens.css`, shared by the Angular app and the static content site. Never copy a hex into a component. The Mars landscape is the one exception: both its palettes live in its generator, and the sky bands and ground fill (`--m-sky-bands`, `--m-sky-ground`, night and day) must stay in step with the generator's `PALETTES[..]["sky"]` and `PALETTES[..]["ground"]`, verbatim.

**The No color-mix Rule.** Tints use `rgba(var(--m-*-rgb), alpha)`; `color-mix()` is avoided for older Android WebViews.

**The Sky Ink Rule.** Anything placed directly on the background (the MERCURY title, the home footer, the loading screen) carries the `m-sky` class. At night it takes cream ink; in day mode it takes slate ink (#133246) and the accent `-ink` variants. `m-night` is reserved for dark elements kept dark in both modes (matchmaking card, victory overlay), never for text on the day landscape.

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

**Text size.** Text is fixed at 100%: the Android WebView text zoom is set to 100 in `MainActivity` (the system "Font size" setting no longer scales text inside boxes sized in px), and `html` carries `text-size-adjust: 100%` for mobile browsers. The system "Display size" setting still scales the whole interface, which the layouts handle as a narrower screen.

**Home on short screens.** The emblem (6 marble diameters tall) shrinks with the height left by the rest of the column (about 510px outside the system bars), from a 24px to a 14px marble, and is hidden below 640px of height. The hero scrolls if its content still overflows, so the play buttons stay reachable.

### Game screen geometry (/game)
- **Portrait** (aspect ≤ 1): the board keeps its width-limited size (`96vw × 0.95 × 15.4/15 + 2px`), with 40px reserved above it for the team banner; the table, a floating plate with rounded corners, takes all the remaining height and stops 8px above the navigation bar (`max(2vh, --sa-bottom + 8px)` of page padding), gesture bar or 3 buttons. A version anchored to the bottom edge, running under the bar, read as a cut-off table on the owner's device and was removed (2026-10-16). The table never goes below 260px (top button row, a hand with cards at least 46px wide, footer); on screens too short for both, the board shrinks instead. The table has the board's width.
- **Landscape**: board on the left (flex 7), table on the right at the board's height (flex 3); the page padding clears the system bars on each side (`--sa-left/right` + 8px, bottom `max(2vh, --sa-bottom)`).
- **Inside the table**: the footer is `--dashboard-height` (86px) (plus `--table-inset-bottom`, 0 in /game since the page clears the system bars); the hand and the 7 sheet stop exactly at its top edge. The hand's card width is bounded by both the panel width (18cqw) and its height (half of the space above the footer), so cards shrink on short panels instead of sliding under the footer. Under 150px of content height, the 7 sheet switches to a compact mode (about 152px); the dots bar never shrinks, the hint text yields first.

**Landscape anchoring (both modes).** Every element of the Mars landscape is positioned from one horizon line, `--m-horizon`, declared on the base `:root` for both modes: 53% of the viewport height in portrait, 64% in landscape orientation, so the sky takes more room and the relief stays visible on both sides of the home button column. The sky bands, the mesas (bottom 1vh below the horizon), the hills, the colony, the ground and the mists are all offsets from it. In portrait the suns (day) or Phobos (night) sit at 84% of the width beside the home emblem and the colony at 14%; in landscape they move to 74% and 22%. By day the large sun's center sits about 2.6vh above the horizon, nearly risen. At night Phobos's center sits 14vh above the horizon, and Deimos 7vh higher and 5vh to its right, clear of the emblem. The crater lake sits under the suns or Phobos, in the free band between the home buttons and the footer (horizon + 30vh in portrait, + 16vh in landscape).

**Landscape scale.** Sizes are in vh (the drawing unit is 0.1vh), so mountains, suns, moons and the colony keep the same scale on every screen. The banded layers are a 3200-unit panorama centered on the screen and cropped (`xMidYMax slice` / `xMidYMin slice`): a phone sees the middle of the panorama, a wide screen sees more of it. Nothing is stretched horizontally.

## Elevation & Depth

Matte, ledge first. Thickness is a solid dark ledge under each slab, and a two-tier ledge under each button (the keycap), with a soft shadow only to lift the sheet off the sky. No blur, no glow.

The Mars landscape conveys depth by stacked flat planes only, back to front: sky bands, then the sky objects (suns by day; stars, twinkles, moons, shooting stars and spaceship at night), mesas, far mist, hills, banded ground with craters, low mist, colony, lake and its mist. Distance is told by tone (paler by day, lighter at night, so far planes always sit closest to the sky's value) and by crater flattening (craters are squashed more the nearer they are to the horizon), never by shadows, blur or perspective gradients. Shadow faces are a flat tone plus stipple, on the side away from the suns or moons.

In `/game` the landscape stays, calmed. By day it sits under a uniform pale nacre veil (rgba(253,248,242,0.34)), and the suns and the sun mist drop to 50% opacity. At night the game page lays its dark veil over it (a radial rgba(42,53,75,0.55) to rgba(15,23,42,0.7)); Phobos drops to 50% and is lowered 13vh so it rises half behind the mesas, in the gap between board and hand; Deimos is not rendered.

### Shadow Vocabulary
- **Ledge** (`box-shadow: 0 3px 0 0 #0f2938`): secondary buttons and chips.
- **Slab** (`0 4px 0 0 #0f2938, 0 22px 40px -22px rgba(0,0,0,0.7)`): cards, modals, panels.
- **Pop** (`0 2px 0 0 #0f2938, 0 12px 24px -14px rgba(0,0,0,0.6)`): toasts and small floating items.
- **Keycap** (`inset 0 2px 0 cream 22%, 0 3px 0 -1px <accent>-mid, 0 6px 0 -1px <accent>-deep`): filled and paper buttons. The -1px spread makes the ledge a touch narrower than the face. The step is `--m-btn-lift` (3px, 2px on nav pills); pressed, the face drops one step, the mid tier disappears and the face rests on the deep tier.
- **Focus** (`0 0 0 3px rgba(4,119,189,0.3)`): field focus.

### Named Rules
**The Matte Rule.** No backdrop blur anywhere in the app UI. Scrims are a flat rgba(6,8,16,0.68).

**The Stacked Plane Rule.** The landscape is depth by layering flat planes. Add a plane or adjust a tone; never add a drop shadow, a blur or a glow filter to the mesas, hills, ground, colony, lake or mists. Light is drawn as concentric rings (sun and moon halos, lit colony windows). The only soft glows are the small ones on the night sky's kept events (twinkling stars, shooting stars, spaceship), and they stay confined to them.

## Shapes

Soft, generous rounding. Surfaces use 28px (xl), inner wells 14px (md), small tiles 10px (sm), larger tiles 20px (lg). Buttons are keycaps with a 16px radius (`--m-r-btn`): a firm rounded rectangle that reads as a pill only on small chips, where the radius caps at half the height. Icon buttons are circles (32px default) with a one-tier 2px ledge. Surfaces get a 1px muted cyan (#2e637e) border.

The Mars landscape has a grammar of two primitives, the same in both modes. **Horizontal bands**: the sky, the wavy ground strata, the mesa strata lines and the mist pills (rounded bars that fade out at both ends). **Concentric rings**: the sun and moon halos, the crater rims and ejecta rings, the lake ripples, the dome arcs, the light of the colony windows. Silhouettes (mesas with flat tops, cosine-shaped hills, lumpy Phobos) are the only other forms; the landforms read as bands seen edge-on. Stars are points.

### Named Rules
**The Two Primitives Rule.** Any new element of the landscape, in either mode, is a band or a set of rings. If it needs another shape, it does not belong in the background. The shooting stars and the spaceship, kept from the previous night sky, are the only exceptions.

## Components

### Buttons
Inspired by a keycap reference (chunky face, firm outline, stacked ledge); the colour of that reference was not kept. A button is a face lying on a solid, two-tier base, so it reads as an object you press, in the same family as the slabs and the board pieces.
- **Shape:** 16px radius (`--m-r-btn`), padding 11px 18px, 8px gap, weight 700, sentence case. Controls that carry an explicit radius (14px, 20px, circle) keep it.
- **Keycap (fill and paper):** face in the accent (or Lagoon Lift for paper), 2px outline in the ledge colour (accent-deep, or the steel line for paper), a faint cream top light (inset 2px, 22%), then two ledge tiers underneath, `<accent>-mid` then `<accent>-deep`, each 3px, 1px narrower than the face on each side. Hover brightens 7%. Pressed (90ms), the face moves down 3px, the mid tier vanishes, the deep tier stays; the top light drops to 12%. Callers reserve 6px under the button (the ledge overflows the box).
- **Secondary (paper):** the same keycap in Lagoon Lift with cream text, steel outline, `--m-paper-mid` then Lagoon Edge. On sky or in cards. At day, the cream paper face with tan tiers.
- **Quiet:** flat, no ledge, translucent well background, 1px line border, text follows context. For low emphasis.
- **Tint:** accent at 10% with a 28% accent border and accent `-fg` text, no ledge. For sign-out, delete and informational links.
- **Icon button:** circle, well background, 1.5px line, a single 2px ledge that closes on press.
- **Focus:** 2px blue-fg outline, 2px offset. **Disabled:** 50% opacity.
- **Scope:** every button of the app, /game included (menu, action and discard buttons, emoji and boosters pills, back arrow of the 7 sheet, resign dialog, victory back button), at the owner's request. Round pills there use a 2px lift. Flat list rows (menu items, emoji options) stay flat. The static content site and the Google sign-in button (white face, grey tiers) keep their own colours.

### Cards / Containers
- **Slab:** Dark Lagoon, cream text, 28px radius, Slab shadow, 1px muted cyan line. The standard card, modal and panel.
- **Inset:** a faint well (4% ink) with a 1px line border and 14px radius, inside a slab.
- **Tint tile:** accent at 12% with 30% accent border, for status banners and badges.

### Inputs / Fields
- Lagoon Lift background, 1.5px line border, 14px radius. Focus turns the border blue-fg and adds the Focus shadow. Placeholder in Ink 4.

### Icon buttons
- 32px circle, well background, 1px line border; hover deepens the well; same blue focus ring.

### Matchmaking card
At night, a dark ink-night card (`m-night`, #16374a family, cream text), as before. By day it carries `m-paper` and is a cream paper card like the other modals (slate text, paper ledge). Its search panel is the same one the custom-game card shows on paper.

### Team intro (in /game)
The full-screen backdrop of the team announcement paints `--m-sky-open`, the same banded Mars sky (no ground) as the loading screen, so the hand-off between them has no tint jump in either mode. The coloured team bands, avatars and the VS burst are unchanged.

### Team banner (on the board's top edge, in /game)
A pediment cut from the board's own glass, standing on the board's back edge: same fill, 1px line and top light line as `.board-container` (night: white 15%, cream line 26%; day: white 40%, slate line 16%), no ledge, no drop shadow, no blur. Its flat base rests on the board's top border (1px overlap, no bottom border), its sides lean inward through a static `perspective(110px) rotateX(8deg)` on a pseudo-element only (the text stays flat), top corners 12px. Left, always the player's team: their two planet marbles (static), touching, in a cup carved like the board's neutral holes, then "You & Alice" in Plus Jakarta Sans 800, "You" in gold (`--m-gold-fg`). Right, the opposing team mirrored (names then marbles) in `--m-fg-2`; "vs" and "&" in `--m-fg-3`. The board computes its top (base on the border), scale and max width (the flat part of the board's top edge, board side minus 1.2 squares); long names truncate with an ellipsis. As a spectator, red & blue sit on the left. It is shown on every screen where it costs the board little: in portrait the room is reserved above the board; where the board already fills the height (landscape, computers, tablets, or a table at its minimum), the board may shrink by up to 4% to make room, otherwise the banner is hidden (as on landscape phones, where it would cost about 8%). Its scale never goes below 0.85, where the names stop being legible.

### Joker mark
The Joker is never an emoji. `app-joker-art` shows the jester drawn inside the Joker card (the same `JOKER_ART` path, as a memoized SVG data URI in an `<img>`), in two square crops: `full` (whole figure, for 80px and up) and `bust` (hat, face and sceptre, readable down to about 36px). Its outline is black, so the host always gives it card paper (`--m-cream`) and its shape (`border-radius`, inherited by the image); the ring takes the context's accent. Used in the "Bonus turn, Joker" banner (112px token with the gold ring and ledge of the replay, like the avatar) and the Joker tile of the rules (2.75rem bust in a cyan ring).

### Active boosters (in /game)
A 40px pill next to the reactions button. On mobile portrait (where the top-centre seconds chip replaces the timer ring), the tokens stack: each slides 4px over the previous one and is cut out by a disc of the pill colour instead of the "in effect" ring; the satellites (star, coin) stay above the stack. Three tokens make a 72px pill, which leaves the centred seconds chip clear on a 360px phone. On desktop and landscape they stay a column under the reactions button, with their rings.

### Move preview on the board
At night: white path rings and a yellow glowing destination, unchanged. By day (light glass board): path squares in slate (fill 30%, 2px ring at 85%), destination in near-solid gold (fill 90%) with a dark gold ring (`--m-gold-ink`) and the same golden halo and pulse as at night, second-marble path dashed in dark gold over a 30% gold fill. The pulse colours are variables read by the shared keyframes, so the native rule that stops the pulse on Android still applies.

### Toast
- Pill, Dark Lagoon, cream 14px weight 700, Pop shadow, slides in from above in 200ms. Error variant is Brick Red fill with a red ledge.

### Mars landscape, day and night (signature)
The app-wide background (`app-space-background`, rendered once behind the router outlet): a red planet being made habitable, under its two moons at night and at a double sunrise by day.
- **One geometry, two palettes:** the landscape block (mesas, hills, banded ground, colony, crater lake, three mists) is shared by both modes; only its `mx-*` palette changes. The sky changes objects: suns and a sun mist by day; fixed stars, twinkles, Phobos and Deimos, shooting stars and the spaceship at night. Day-only and night-only details inside the shared block (sun reflections, lit windows, Phobos reflection) are hidden per mode.
- **Source:** generated vector SVG, no raster and no image model. The `mars:day-sky`, `mars:night-sky` and `mars:land` blocks of `space-background.component.html` and the whole of `_mars-palette.scss` are written by `resources/mars/generate-mars-landscape.py --write-template`; change the script, not the output. The stars, twinkles, shooting stars and spaceship are hand-written in the template, SCSS and TS. The script also renders phone and desktop mock-ups in both modes with Inkscape for layout checks.
- **Seat colours:** the colony windows are the only place the landscape carries saturated colour, one window per seat colour, read live from the accent tokens; at night they are lit with ring glows.
- **Motion, day:** only the four mists move, a slow back-and-forth `translateX` drift (70s to 180s per leg, 1.2vh to 6vw amplitude, ease-in-out, alternate, so there is no seam). The beacon is steady.
- **Motion, night:** the three landscape mists drift the same way; the mast beacon blinks (3.2s cycle, dimming to 15% for the last 30%); nine stars twinkle (4 to 9s, opacity 0.35 to 1); three shooting stars cross on long cycles (48s, 67s, 89s, visible for about 4% of each); a spaceship crosses every 1.5 to 5 minutes, at a random height between 8 and 38%, in 9 to 16s.
- **Performance:** the mast beacon is an HTML element laid over the colony drawing, so its blink is a composited opacity animation (an animation on an SVG child would be recomputed on the main thread every frame, all night). The star fields are only created when night is first shown, then kept; a day start computes none.
- **In `/game` (calm mode):** nothing of the landscape is rendered (no bands, stars, sun or moons, relief, mists or colony, hence no animation); only the banded sky alone (`--m-sky-open` on `.space-bg.calm`, no ground) shows behind the board and the hand, under the page veils. The board hides the landscape anyway, and the game must not carry its cost on Android (owner request, 2026-10-15).
- **Theme switch ("Le soir tombe"):** the day/night toggle does not wipe the screen; it passes time over the same place. During the switch, `<html data-theme-switch="dusk|dawn">` gives a view-transition name to each sky band, the stars, the sun/moon container, each landscape layer, the routed page and the toast (names exist only during the switch, since a permanent name on the page would cut the board's backdrop blur), and `styles.scss` fades the snapshots one by one, opacity and transform only, about 1.5s. Dusk: the suns sink behind the mesas, the sky bands darken from the zenith to the horizon, each passing through the blue of the Martian twilight (one tint per band, `#1f2a44` at the zenith to `#8299b4` at the horizon, shown only during the switch), then the relief from far to near; the moons rise, the stars appear, the colony windows light one by one. Dawn: stars fade, moons set, the bands lighten from the horizon up through the same blue, then the relief, and the suns rise. The page cross-fades in 280ms when the sky behind the title has changed. Android system bar icons switch halfway (550ms). In `/game`, the toggle uses a quick variant instead: one cross-fade of the whole screen in 220ms, no named layers (the scene would be hidden by the board and looked like a freeze on Android). Without View Transitions, or under reduced motion, the switch is instant.
- **Reduced motion:** under `prefers-reduced-motion: reduce` no animation runs, and the spaceship is never scheduled.
- **Loading screen:** paints `--m-sky-open`, the same sky bands without the ground, in both modes. Without the relief, the bare join between sky and ground read as a background cut in half (seen on the owner's device at night, 2026-10-16); the upper sky stays identical to the landscape, so no tint jump shows at the top when one fades into the other.
- **System bars (Android):** once the native splash is hidden, the status and navigation bar icons turn dark in day mode and light at night (ThemeService). Before that they keep the light style set in `capacitor.config.ts`, which reads on the dark splash.

## Color Guidelines & Anti-Patterns

Strict rules for backgrounds, cards and themes, day mode in particular. They target the "generated on the fly" look (crypto-SaaS, 2023). They apply to any CSS, SVG or background asset written for the app.

### Banned: cyber / AI-cliche gradients
- **No** linear gradient from magenta or electric violet (`#8B5CF6`, `#EC4899`) to cyan or neon blue.
- **No** blurred overlays or mesh gradients mixing pink, cyan and pastel violet, least of all centered on the screen.

### Banned: neon over-saturation on dark
- **No** fully saturated cyan or turquoise (`#00FFFF`, `#06B6D4`) placed directly on pure black (`#000000`).
- **No** HSL color at 100% saturation for any background color.

### Banned: the milky-violet SaaS day mode
- **No** lavender or very light milky violet as a general background (`#F3E8FF`, `#EDE9FE`).
- **No** dark gradient (indigo, deep night blue) as the background of day mode. A day-mode background stays visibly light and bright, and gives dark text a natural contrast.

### Banned: the synthetic, too-smooth look
- **No** plain two-stop gradient with no nuance. A background needs at least one of: grain, a grid, vector structure, or an authored texture (see the generated vector structure in `resources/mars/`).

### Resolved and remaining gaps (2026-10-15)
- **Day-mode background: replaced.** The day background is "Matin sur Mars": a nine-band pearl-to-apricot sky (`#e2e9eb` at the zenith to `#f7ccb2` at the horizon) over a banded sand ground, with the generated vector landscape on top. Text on it is slate ink: `.m-sky` takes the day ink aliases, and `--m-brand` (the MERCURY letters) is slate with a paper ledge. The home footer sits on the sand ground and uses `m-sky` (slate ink in day, cream at night). There is no frame shade any more; the Android system bar icons switch to dark in day mode instead. The previous azure "Orbasphere" day view, its Earth cloud texture and its frame shades are archived out of the bundle in `resources/orbasphere/` and are not part of the system. Validated by the owner on 2026-10-15.
- **Night background: replaced.** The nebula space sky (nebulae, planets, drifting star fields, the /game Milky Way, the radial Night Glow sky) is gone from the app. The night is the same Mars landscape under a nine-band navy sky (`#05080f` to `#131a2e`) with no horizon glow; its palette carries no pink, magenta or saturated cyan, and its only saturated colours are the four seat windows and the beacon. The content site under `content/` keeps its own radial night gradient. Not yet seen on a device.
- **Cyan accent: kept by decision.** `--m-violet` (`#22b8cf`, boosters) is about 72% saturated, below the 100% the second rule bans, and it only sits on lagoon-blue surfaces or paper, never on pure black. A rose quartz replacement was tried on 2026-10-14 and reverted: it matched nothing else in the palette.
- **Legacy SCSS palette: fixed.** `$p-nebula` and `$c-purple` (`#8b5cf6`) had no reference and were deleted.

- **Ground craters: removed (2026-10-15).** On the owner's device they read as black holes in both modes, and the largest sat under the footer's version (About) button; the ground has no craters at all now, only the crater lake remains.

## Do's and Don'ts

### Do:
- **Do** use opaque lagoon surfaces with cream text over the sky, and add the `m-paper` class to each of them.
- **Do** reference `--m-*` tokens and context aliases; add values to `tokens.css` only.
- **Do** build buttons with `m.btn` plus `m.btn-fill`, `m.btn-paper` or `m.keycap(mid, deep)`; show thickness with the two-tier ledge and press it by one step (`--m-btn-lift`), 90ms. Reserve 6px under a button for its ledge.
- **Do** use the `-light` accent variant for text on lagoon and on the sky.
- **Do** use `--sa-*` variables for any safe-area spacing.
- **Do** give anything placed directly on the background the `m-sky` class, so it reads slate on the day landscape and cream at night.
- **Do** position any landscape element, in either mode, from `--m-horizon` and size it in vh.
- **Do** change the Mars landscape (geometry and both palettes) through `resources/mars/generate-mars-landscape.py`, using bands and concentric rings only, and keep the `--m-sky-bands` and `--m-sky-ground` values in step with its `PALETTES["night"]` and `PALETTES["day"]` sky bands and ground.

### Don't:
- **Don't** use violet, purple or any derivative in the UI (the Mars background and /game are outside this rule).
- **Don't** use backdrop blur, translucent glass, glowing borders or pure white fills or text.
- **Don't** use uppercase spaced labels.
- **Don't** restyle the game cards, the board, the matchmaking overlay, the Mars background (night or day), the logo or the purchase coin animation without an explicit request.
- **Don't** introduce ambient looping animations on surfaces (pulsing halos, breathing thumbnails); they were deliberately removed. The motion of the background (mist drift; at night also the beacon, twinkles, shooting stars and spaceship) is background, not surface, and stays there.
- **Don't** use `color-mix()` or Google Fonts.
- **Don't** turn the landscape into a gradient-and-glow sunrise wallpaper or bring back a nebula space sky, and don't add raster textures, saturated colour (beyond the colony's seat windows and beacon) or high-contrast elements to it. At night, no glow marks the horizon.
- **Don't** hand-edit the generated `mars:` blocks of `space-background.component.html` or `_mars-palette.scss`.
