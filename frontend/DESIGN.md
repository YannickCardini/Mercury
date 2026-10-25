---
name: Mercury
description: Flat warm-charcoal folders pulled from the game box, each named by a colour tab and closed by a cream disc, with chunky keycap buttons, over a flat terraformed-Mars landscape under two moons at night and a double sunrise by day; cream paper with charcoal ink by day.
colors:
  charcoal: "#2a2523"
  charcoal-hi: "#36302d"
  charcoal-lo: "#221e1c"
  charcoal-line: "#3b3430"
  charcoal-mid: "#463d38"
  charcoal-edge: "#544943"
  charcoal-slab-mid: "#3d3531"
  ink-night: "#221e1c"
  ink: "#f3ebdd"
  cream: "#f3ebdd"
  ink-solid: "#241b16"
  perf-line: "#4a413c"
  close: "#f3ebdd"
  close-edge: "#bfb19a"
  day-paper: "#f4eddf"
  day-paper-hi: "#faf5ea"
  day-paper-lo: "#ebe2d0"
  day-paper-mid: "#e1d3b8"
  day-paper-edge: "#c8b28a"
  day-slab-mid: "#dccfb4"
  day-line: "#dccbac"
  day-ink: "#2a2523"
  day-perf-line: "#d3c2a2"
  day-close: "#2a2523"
  day-close-edge: "#0f0d0c"
  night: "#0f172a"
  night-deep: "#05070f"
  night-glow: "#1a2840"
  green: "#00c885"
  green-mid: "#00ab72"
  green-deep: "#008f5f"
  green-ink: "#1b6e50"
  green-light: "#6fd0a9"
  blue: "#0477bd"
  blue-mid: "#086aa4"
  blue-deep: "#0c5d8c"
  blue-ink: "#0b639a"
  blue-light: "#7fc4f0"
  orange: "#f7914e"
  orange-mid: "#e07d3c"
  orange-deep: "#c96a2b"
  orange-ink: "#a8501a"
  orange-light: "#f9a56c"
  red: "#c8452f"
  red-mid: "#b23b28"
  red-deep: "#9c3220"
  red-ink: "#b53a25"
  red-light: "#f08a76"
  gold: "#ffb703"
  gold-mid: "#e3a002"
  gold-deep: "#c78a00"
  gold-ink: "#8a6400"
  gold-light: "#ffc83d"
  cyan: "#22b8cf"
  cyan-mid: "#1c9eb4"
  violet-deep: "#168499"
  violet-ink: "#168499"
  violet-light: "#6fdcec"
  silver: "#cfcac0"
  bronze: "#d39a62"
  mars-sky-zenith: "#c3d2d9"
  mars-sky-horizon: "#eabb9b"
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
  title:
    fontFamily: "Baloo 2, ui-rounded, Segoe UI, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1
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
  folder: "22px"
  xl: "28px"
  btn: "16px"
  pill: "999px"
spacing:
  tab-h: "34px"
  perf-r: "10px"
  btn-lift: "3px"
components:
  button-fill-green:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink-solid}"
    rounded: "{rounded.btn}"
    padding: "11px 18px"
  button-fill-blue:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.cream}"
    rounded: "{rounded.btn}"
    padding: "11px 18px"
  button-paper:
    backgroundColor: "{colors.charcoal-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "11px 18px"
  folder:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.folder}"
  folder-day:
    backgroundColor: "{colors.day-paper}"
    textColor: "{colors.day-ink}"
    rounded: "{rounded.folder}"
  folder-tab-red:
    backgroundColor: "{colors.red}"
    textColor: "{colors.cream}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "2px 18px 0"
  folder-tab-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink-solid}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "2px 18px 0"
  folder-close:
    backgroundColor: "{colors.close}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.pill}"
    size: "40px"
  folder-close-day:
    backgroundColor: "{colors.day-close}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    size: "40px"
---

<!-- Provenance: extracted from frontend/src/app/styles/tokens.css, _tokens.scss and styles.scss. On 2026-10-10 the owner moved from cream paper, to dark glass, to opaque matte lagoon blue (token names --m-paper* and the m-paper class were kept). On 2026-10-14 the day-mode background was replaced by "Matin sur Mars"; the previous day view is archived in resources/orbasphere/. On 2026-10-15 the night background (animated space sky, nebulae, planets, /game Milky Way) was replaced by the same Mars landscape at night. Background sources: tokens.css sections 1 and 3 (--m-sky, --m-horizon), space-background.component.{html,scss,ts}, shared/_mars-palette.scss, resources/mars/generate-mars-landscape.py (both palettes, geometry). The owner validated the day background on 2026-10-15; the night has not been seen on a device yet. On 2026-10-25 the owner approved, from three mockups, the "Folders" change (code word: chemises): warm charcoal replaces lagoon blue as the night material of the whole app (the /game table and board keep their frosted glass, owner correction of the same day), the day ink moves from slate to charcoal, every modal and floating panel becomes a folder (colour tab, close disc, ticket perforation), and the matchmaking and victory cards lose their protected status. That change is built and compiled but has never been seen rendered (no screenshots in-session); its finish review waits for the owner's device captures. The day sky values recorded here (#c3d2d9 to #eabb9b) are those of the generator and tokens.css since 2026-10-16; earlier versions of this file carried the superseded #e2e9eb to #f7ccb2 set. -->

# Design System: Mercury

## Overview

**Creative North Star: "Folders from the Game Box"**

Every window a player opens (modal, overlay, floating panel) is a folder pulled from the game box: a flat, opaque warm-charcoal card (#2a2523) with warm cream text (#f3ebdd). A colour tab standing on its top edge names it, a cream close disc rides its top-right corner, and where the window has actions a ticket perforation (two real semicircle holes and a short dashed line) tears off the stub that carries them. By day the same folders are cream paper (#f4eddf) with charcoal ink, the same tabs and cuts, and a charcoal close disc. Everything sits over the always-visible Mars landscape. The feel is a modern board game: warm, solid, no transparency, no blur, no glow. The primary action is a matte sage-mint green (#00c885). MERCURY and its subtitle stay as they are.

The tone is sober and readable, a real well-drawn object rather than decoration. Baloo 2 gives titles, tabs and numbers a rounded, friendly weight; Plus Jakarta Sans carries everything else. Colour is used as a small set of named accents on buttons, tabs and tints, never as ambient decoration. A player reads which window is open from its tab colour and name, finds the close in the same corner every time, and knows the actions live on the stub below the perforation.

Behind everything is one place, a terraformed Mars seen flat and frontal, built from two primitives only: horizontal bands and concentric rings. The same landscape is drawn in two lights. At night it lies under a near-uniform navy sky with fixed stars, Phobos and Deimos, its colony windows lit in the four seat colours. By day it is a pale morning with a double sunrise. In both modes it stays low in contrast so that the text and folders placed on it read anywhere, and nothing in it competes with the menu.

The previous dark neon look, a "solar system" interface theme, a pulsing-halo "quicksilver" direction, the nebula space sky, and the slate and lagoon-blue surfaces are all discarded and must not return. The generic centred card with a title row and an icon close is refused.

**Key Characteristics:**
- Flat, opaque warm-charcoal folders with cream text at night, cream paper with charcoal ink by day, on a visible Mars landscape
- Every window is named by a colour tab on its top edge and closed by a disc on its top-right corner; actions sit on a stub below a ticket perforation
- Folders are flat (soft drop shadow only, no outline, no ledge); buttons are keycaps whose two-tier ledge is lighter than the face at night (a lit edge)
- Rounded display type for titles, tabs and numbers, geometric sans for text
- Six named accents, each with a fill, a mid and a deep ledge tier, a paper text variant and a sky text variant
- One flat, stacked-plane Mars landscape anchored on one horizon line, with a night palette and a day palette; cream ink on it at night, charcoal ink by day
- Protected, out of scope for restyling: game cards, board and its components, Mars background (night and day), logo and icon, shop purchase coin animation

## Colors

Warm charcoal and cream neutrals with a restrained set of saturated accents, over a Mars landscape that is navy and rust-black at night and pale haze-to-apricot by day.

### Primary
- **Sage Mint** (#00c885): the main action fill (play, confirm), with a dark ink label (`--m-on-green`). Ledge tiers #00ab72 then #008f5f; text on charcoal or sky #6fd0a9. Also the tab of Play Now and Update Required.

### Secondary
- **Harbor Blue** (#0477bd): informational actions and the focus colour (focus ring, field focus), with a cream label. Ledge tiers #086aa4 then #0c5d8c; text on charcoal or sky #7fc4f0. Tab of Sign In, Messages, Game Rules, Privacy Policy and Send message.

### Tertiary
- **Ember Orange** (#f7914e): warm secondary emphasis, dark ink label on the fill. Ledge #c96a2b; text on charcoal or sky #f9a56c. Tab of About and Custom Game.
- **Brick Red** (#c8452f): destructive and error states, cream label. Ledge #9c3220; text on charcoal or sky #f08a76. Tab of Profile, Leaderboard, Delete Account, Resign and a lost game; the player card's avatar ring.
- **Coin Gold** (#ffb703): coins, rewards, the first-place medal, dark ink label. Ledge #c78a00; text on charcoal or sky #ffc83d. Tab of the Shop, the purchase confirmation and a won game.
- **Cyan (boosters)** (#22b8cf): boosters and special items, dark ink label. Ledge #168499; text on charcoal or sky #6fdcec; text on paper #0e6e7f. Tab of Boosters. The token keeps the name `--m-violet`.

### Neutral
- **Warm Charcoal** (#2a2523): the night face of every folder, panel and toast. **Charcoal Lift** (#36302d): secondary buttons, fields and the resting home menu plates. **Charcoal Well** (#221e1c): wells, hovered rows, and `--m-ink-night`. **Charcoal Line** (#3b3430): the outline of secondary buttons, barely lighter than the face. **Lit Edge** (#463d38 then #544943): the two ledge tiers of a charcoal button, lighter than its face. **Capsule Mid** (#3d3531): the first tier under floating capsules.
- **Warm Cream** (#f3ebdd) with 78%, 62% and 40% steps for text on charcoal; the 40% step is placeholders and disabled only. The same value is `--m-cream`, the text placed directly on the night sky.
- **Dark Ink** (#241b16): labels on light fills (green, orange, gold and cyan buttons and tabs, medals).
- **Perforation Line** (#4a413c night, #d3c2a2 day): the dashed perforation and the dotted leaders of info rows.
- **Close Disc** (#f3ebdd with a #bfb19a ledge at night; #2a2523 with a #0f0d0c ledge by day) and its mark (`--m-on-close`, the opposite tone): the close disc and the back tab.
- **Cream Paper (day)** (#f4eddf): the day face of every folder; lift #faf5ea, well #ebe2d0, ledge tiers #e1d3b8 then #c8b28a, line #dccbac.
- **Charcoal Ink (day)** (#2a2523): the day value of `--m-ink`, with 80%, 68% and 45% steps; the day scrim is the same charcoal at 48%, and day shadows are charcoal-tinted.
- **Night** (#0f172a): the default `--m-surface` of the sky context and the base of the MERCURY letter ledge (`--m-brand-ledge`, 70%). **Deep Night** (#05070f): `--m-page`, the html/body fallback at night. **Night Glow** (#1a2840): used only by the static content site under `content/`.
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
- **Banded sky**: nine hard-edged bands from **Pale Haze** at the zenith (#c3d2d9) through #c9d6d9, #d0d9d7, #d8dbd3, #e0dccf, #e5d6c5, #e8cebb, #e9c0a4 to **Apricot Horizon** (#eabb9b). Band edges sit at fixed fractions of the horizon height (16, 32, 46, 58, 69, 79, 87.5, 94.5 and 100%). `--m-page` (#c3d2d9) is the zenith band, used as the html/body fallback.
- **Ground**: **Sand** (#eed2b6) below the horizon in `--m-sky`; the drawn plain is four wavy bands, lightest at the horizon: #f3dbc3, #f0d4b8, #edceaf, #eac8a7.
- **Mesas**: **Powdered Terracotta** (#edcdbb), shadow faces #e4bfac at 55% with a stipple of the same tone, strata lines #f2d6c6.
- **Hills**: **Light Ochre** (#e8c39f), with a lit rim #efd0ae on slopes facing the suns.
- **Suns**: a large pearl sun (#fffaf1, halo rings #fff6e8) and a small pale-gold sun (#ffdca6, core #fff0d6, halo #ffe7c4).
- **Crater lake**: water #d3e2da with ripple rings #e6efe9, a lichen rim #d3d6aa, broken sun reflections #fffaf1 and #ffe9d2.
- **Mists**: nacre pills (#fdf7f1 to #fbeeea to #f4f3ec, bank #fbf2ec), terracotta (#f2bea4) and ochre (#f9e2b8), each fading to transparent at both ends. Layer opacities: far 85%, low 55%, lake 75%.
- **Colony**: four domes (#f8f3ec, shaded #e6dccf, cast shadow #c4936b at 16%) whose windows carry the four seat colours; a mast (#e7dccd) with a steady orange beacon (#f7914e).
- **Charcoal Ink** (#2a2523): the day value of `--m-ink`, the text colour on day paper and on the landscape.

The palettes live in the generator (`resources/mars/generate-mars-landscape.py`, `PALETTES["night"]` and `PALETTES["day"]`). The build values are the system.

### Named Rules
**The Context Alias Rule.** Components use the context aliases (`--m-fg`, `--m-line`, `--m-well`, `--m-*-fg`). Sky and charcoal surfaces share the same light-on-dark aliases; surfaces still carry the `m-paper` class (or paint `--m-paper` through a ticket part) for their fill.

**The One Source Rule.** Values live only in `tokens.css`, shared by the Angular app and the static content site. Never copy a hex into a component. The Mars landscape is the one exception: both its palettes live in its generator, and the sky bands and ground fill (`--m-sky-bands`, `--m-sky-ground`, night and day) must stay in step with the generator's `PALETTES[..]["sky"]` and `PALETTES[..]["ground"]`, verbatim.

**The No color-mix Rule.** Tints use `rgba(var(--m-*-rgb), alpha)`; `color-mix()` is avoided for older Android WebViews.

**The Sky Ink Rule.** Anything placed directly on the background (the MERCURY title, the home footer, the loading screen) carries the `m-sky` class. At night it takes cream ink; in day mode it takes charcoal ink (#2a2523) and the accent `-ink` variants. `m-night` (cream text kept in both modes on a `--m-ink-night` surface) is reserved for elements that stay dark by day, never for text on the day landscape; since the folders change, no template uses it.

**The Lit Edge Rule.** At night a charcoal button's ledge is lighter than its face (#463d38 then #544943 under #36302d), so its thickness reads on charcoal and on the night sky alike. Never darken it back into a shadow tier.

## Typography

**Display Font:** Baloo 2 (ui-rounded, Segoe UI, system-ui, sans-serif)
**Body Font:** Plus Jakarta Sans (system-ui, -apple-system, Segoe UI, Roboto, sans-serif)

**Character:** A rounded, warm display face for headlines, tabs and numerals against a clean geometric text face. Both are self-hosted as woff2 under `src/assets/fonts/` (OFL-1.1); no Google Fonts requests.

### Hierarchy
- **Display** (700, line-height 1.1, letter-spacing 0): titles, scores, counters, call-to-action labels.
- **Title** (Baloo 2 700, 1.15rem, line-height 1): folder tab labels, which carry the page or window title (the tab is often the page's `h1` or `h2`).
- **Body** (Plus Jakarta Sans, regular weight): paragraphs, list rows, descriptions.
- **Label** (700, 0.78rem, letter-spacing 0, normal case): field and section labels in `--m-fg-3`.
- Buttons use Plus Jakarta Sans at weight 700, line-height 1.2.

### Named Rules
**The No Shouting Rule.** No uppercase and no letter-spaced capitals for labels or tabs. Sentence or title case, weight does the emphasis.

**The Game Page Exception.** `/game` keeps its own typography (`font-family: initial` on its host); the global fonts do not apply there until a separate task says so. The folder tabs used in /game (Resign, Game Over) set their own Baloo 2 through the tab recipe.

## Layout

Mobile first, one column, centred folders over the sky; the audience is as much desktop and tablet as phone, so wide layouts are first-class (two-pane profile). On phones, leaderboard and shop keep a side margin rather than going full width so the sky stays visible. Edge-to-edge Android 15+ is handled by the `--sa-top/right/bottom/left` variables (max of `env()` and Capacitor's injected `--safe-area-inset-*`); use those, never `env()` alone. `app-root` already pads the top by `--sa-top`. The game board is laid out separately and is outside this system.

**Folder room.** A folder reserves the tab height (`--m-tab-h`, 34px) above itself (`margin-top`) and subtracts it from its maximum height. Its tab row starts 22px from the left edge and stops 56px from the right, so the close disc's corner stays free.

**Text size.** Text is fixed at 100%: the Android WebView text zoom is set to 100 in `MainActivity`, and `html` carries `text-size-adjust: 100%` for mobile browsers. The system "Display size" setting still scales the whole interface, which the layouts handle as a narrower screen.

**Home on short screens.** The emblem (6 marble diameters tall) shrinks with the height left by the rest of the column (about 510px outside the system bars), from a 24px to a 14px marble, and is hidden below 640px of height. The hero scrolls if its content still overflows, so the play buttons stay reachable.

**Two-pane profile.** From 820 × 520 the profile folder sets the player card and the activity pane (messages, conversation, boosters) side by side, with a vertical perforation between them and one tab per pane; below that they stack, with a horizontal perforation.

### Game screen geometry (/game)
- **Portrait** (aspect ≤ 1): the board keeps its width-limited size (`96vw × 0.95 × 15.4/15 + 2px`), with 40px reserved above it for the team banner; the table, a floating plate with rounded corners, takes all the remaining height and stops 8px above the navigation bar (`max(2vh, --sa-bottom + 8px)` of page padding), gesture bar or 3 buttons. A version anchored to the bottom edge, running under the bar, read as a cut-off table on the owner's device and was removed (2026-10-16). The table never goes below 260px (top button row, a hand with cards at least 46px wide, footer); on screens too short for both, the board shrinks instead. The table has the board's width.
- **Landscape**: board on the left (flex 7), table on the right at the board's height (flex 3); the page padding clears the system bars on each side (`--sa-left/right` + 8px, bottom `max(2vh, --sa-bottom)`).
- **Inside the table**: the footer is `--dashboard-height` (86px) (plus `--table-inset-bottom`, 0 in /game since the page clears the system bars); the hand and the 7 sheet stop exactly at its top edge. The hand's card width is bounded by both the panel width (18cqw) and its height (half of the space above the footer), so cards shrink on short panels instead of sliding under the footer. Under 150px of content height, the 7 sheet switches to a compact mode (about 152px); the dots bar never shrinks, the hint text yields first.

**Landscape anchoring (both modes).** Every element of the Mars landscape is positioned from one horizon line, `--m-horizon`, declared on the base `:root` for both modes: 53% of the viewport height in portrait, 64% in landscape orientation, so the sky takes more room and the relief stays visible on both sides of the home button column. The sky bands, the mesas (bottom 1vh below the horizon), the hills, the colony, the ground and the mists are all offsets from it. In portrait the suns (day) or Phobos (night) sit at 84% of the width beside the home emblem and the colony at 14%; in landscape they move to 74% and 22%. By day the large sun's centre sits about 2.6vh above the horizon, nearly risen. At night Phobos's centre sits 14vh above the horizon, and Deimos 7vh higher and 5vh to its right, clear of the emblem. The crater lake sits under the suns or Phobos, in the free band between the home buttons and the footer (horizon + 30vh in portrait, + 16vh in landscape).

**Landscape scale.** Sizes are in vh (the drawing unit is 0.1vh), so mountains, suns, moons and the colony keep the same scale on every screen. The banded layers are a 3200-unit panorama centred on the screen and cropped (`xMidYMax slice` / `xMidYMin slice`): a phone sees the middle of the panorama, a wide screen sees more of it. Nothing is stretched horizontally.

## Elevation & Depth

Flat folders, lit keycaps. A folder has no ledge and no outline: one soft drop shadow detaches it (nearly invisible on the night scrim, useful by day). Thickness belongs to what you press: buttons keep a two-tier ledge, the close disc a one-tier ledge, and the small floating capsules and toasts keep a tiered base. No blur, no glow.

The Mars landscape conveys depth by stacked flat planes only, back to front: sky bands, then the sky objects (suns by day; stars, twinkles, moons, shooting stars and spaceship at night), mesas, far mist, hills, banded ground, low mist, colony, lake and its mist. Distance is told by tone (paler by day, lighter at night, so far planes always sit closest to the sky's value), never by shadows, blur or perspective gradients. Shadow faces are a flat tone plus stipple, on the side away from the suns or moons.

In `/game` the landscape stays, calmed. By day it sits under a uniform pale nacre veil (rgba(253,248,242,0.34)). At night the game page lays its dark veil over it (a radial rgba(42,53,75,0.55) to rgba(15,23,42,0.7)). The board and the table panel beside it form the /game glass family, the one exception to opaque surfaces (see Cards / Containers).

### Shadow Vocabulary
- **Folder** (`box-shadow: 0 30px 56px -30px rgba(0,0,0,0.85)` at night, `0 26px 44px -24px rgba(42,37,35,0.5)` by day; `--m-shadow-slab`): folders and panels. A soft drop only.
- **Pop** (`inset 0 2px 0 cream 8%, 0 2px 0 -1px <slab-mid>, 0 4px 0 -1px <paper-edge>, 0 14px 24px -14px rgba(0,0,0,0.6)`; by day a 60% paper top light and a charcoal-tinted drop): toasts, tips, floating plates and the small in-game capsules (phase, timer, card help, timeout banner).
- **Keycap** (`inset 0 2px 0 cream 22%, 0 3px 0 -1px <accent>-mid, 0 6px 0 -1px <accent>-deep`): filled and paper buttons. The -1px spread makes the ledge a touch narrower than the face. The step is `--m-btn-lift` (3px, 2px on nav pills); pressed, the face drops one step, the mid tier disappears and the face rests on the deep tier.
- **Close disc** (`0 3px 0 0 <close-edge>, 0 10px 18px -8px rgba(0,0,0,0.55)`): the close disc; pressed, it drops 3px onto its edge.
- **Ledge** (`0 3px 0 0 <paper-edge>`): chips and small icon buttons.
- **Focus** (`0 0 0 3px rgba(4,119,189,0.3)`): field focus.

### Named Rules
**The Matte Rule.** No backdrop blur anywhere in the app UI, except the /game glass family (board and table panel). Scrims are flat: rgba(6,8,16,0.68) at night, rgba(42,37,35,0.48) by day.

**The Flat Folder Rule.** A folder is a flat sheet: no outline, no two-tier base, one soft drop shadow. Relief is for what you press (buttons, the close disc) and for small floating capsules.

**The Stacked Plane Rule.** The landscape is depth by layering flat planes. Add a plane or adjust a tone; never add a drop shadow, a blur or a glow filter to the mesas, hills, ground, colony, lake or mists. Light is drawn as concentric rings (sun and moon halos, lit colony windows). The only soft glows are the small ones on the night sky's kept events (twinkling stars, shooting stars, spaceship), and they stay confined to them.

## Shapes

Soft, generous rounding. Folders use 22px (`--m-r-folder`), the in-game table panel 28px (xl), inner wells 14px (md), small tiles and tab top corners 10px (sm), larger tiles 20px (lg). Buttons are keycaps with a 16px radius (`--m-r-btn`): a firm rounded rectangle that reads as a pill only on small chips, where the radius caps at half the height. The close disc and icon buttons are circles.

A folder's silhouette is a sheet with a tab standing on its top edge (square foot, 10px top corners) and a disc overhanging its top-right corner (-14px top, -12px right). A ticket perforation is two quarter-circle bites of 10px radius (`--m-perf-r`) at the two corners of each part's seam, so two neighbouring parts form two real semicircle holes through which the scrim shows, joined by a short dashed line (5px dash, 5px gap, 2px thick, inset 18px from each hole). Info rows join label and value with a 2px dotted leader.

The Mars landscape has a grammar of two primitives, the same in both modes. **Horizontal bands**: the sky, the wavy ground strata, the mesa strata lines and the mist pills (rounded bars that fade out at both ends). **Concentric rings**: the sun and moon halos, the crater rims, the lake ripples, the dome arcs, the light of the colony windows. Silhouettes (mesas with flat tops, cosine-shaped hills, lumpy Phobos) are the only other forms. Stars are points.

### Named Rules
**The Never Clip Rule.** A folder never clips (`overflow: visible`): its tab and its close disc overflow its edges. A child scrolls instead.

**The Two Primitives Rule.** Any new element of the landscape, in either mode, is a band or a set of rings. If it needs another shape, it does not belong in the background. The shooting stars and the spaceship, kept from the previous night sky, are the only exceptions.

## Components

### Folders (signature, code word: chemise)
Every modal, overlay and floating panel is a folder. Recipes live in `_tokens.scss` ("Chemises"); shared classes in `styles.scss`.
- **Sheet:** flat Warm Charcoal (Cream Paper by day), 22px radius, Folder shadow, no border (`m.slab`, whose default radius is now the folder radius). It is positioned, never clips, and reserves `--m-tab-h` above itself; its own position, width and opening animation stay in the component.
- **Tabs** (`.m-tabs` row, `.m-tab` plus `.m-tab--red|blue|green|orange|gold|violet`): a solid label 34px tall, padding 2px 18px 0, 10px top corners, foot flush with the folder's top edge, Baloo 2 700 at 1.15rem, label colour from `--m-on-<accent>`. The tab names the window and usually carries its heading. Several tabs sit side by side when a folder has several panes (Profile red with Messages blue or Boosters cyan).
- **Back tab** (`.m-tab-back`): the same label in the close-disc colours with a single 18px chevron, at least 42px wide; on press its height drops 4px with its foot kept in place. Used where a page returns rather than closes (Shop: cream back tab then the gold Shop tab).
- **Close disc** (`.m-close`): a 40px disc at -14px top, -12px right, cream with a charcoal cross at night, charcoal with a cream cross by day, 16px icon, a 3px ledge that collapses on press (90ms). Same corner on every window.
- **Ticket** (`.m-ticket-body` above, `.m-ticket-stub` below): the folder that carries them has no fill and no padding of its own; each part paints the paper bitten at its seam corners (`--m-cut-top/bottom/left/right`), so the holes need no measurement in JS. The stub carries the window's actions, with the dashed seam on its top edge. A body without a stub becomes a plain full sheet. On the wide profile the cut runs vertically (`ticket-part(right|left)`, `--m-perf-dash-y`).
- **Leader rows** (`m.leader-row`): label left, value right, joined by a 2px dotted leader in the perforation colour. Used on About.
- **Where, with tab colour:** Sign In (blue); Profile (red) with Messages (blue) or Boosters (cyan); About (orange, leader rows, stub with Privacy policy and Delete account); Play Now matchmaking (green); Custom Game (orange); Game Rules (blue); Update Required (green); Shop page (cream back tab and gold Shop tab, balance above the perforation, catalogue on the stub) and its purchase confirmation (gold); Leaderboard (red); public Profile page (red) and its Send message modal (blue); Delete Account (red); Privacy Policy (blue); in-game Resign dialog (red); victory card (tab "Game Over", gold on a win, red on a defeat, no blur, no glow, no uppercase).
- **Android:** each folder that opens as an overlay keeps the `is-native` `will-change` block at the end of its stylesheet (see the project instructions).

### Buttons
Inspired by a keycap reference (chunky face, firm outline, stacked ledge). A button is a face lying on a solid, two-tier base, so it reads as an object you press, in the same family as the board pieces.
- **Shape:** 16px radius (`--m-r-btn`), padding 11px 18px, 8px gap, weight 700, sentence case. Controls that carry an explicit radius (14px, 20px, circle) keep it.
- **Keycap (fill):** face in the accent, 2px outline in its deep tone, a faint cream top light (inset 2px, 22%), then two ledge tiers, `<accent>-mid` then `<accent>-deep`, each 3px, 1px narrower than the face on each side. Hover brightens 7%. Pressed (90ms), the face moves down 3px, the mid tier vanishes, the deep tier stays; the top light drops to 12%. Callers reserve 6px under the button (the ledge overflows the box).
- **Secondary (paper):** the same keycap in Charcoal Lift (#36302d) with cream text, Charcoal Line outline, and a lit ledge (#463d38 then #544943). By day, the cream paper face with tan tiers and charcoal text. The resting home menu plates use the same values (`--m-plate*` alias the paper family); the active plate is green.
- **Quiet:** flat, no ledge, translucent well background, 1px line border, text follows context. For low emphasis.
- **Tint:** accent at 10% with a 28% accent border and accent `-fg` text, no ledge. For sign-out, delete and informational links.
- **Icon button:** circle, well background, 1.5px line, a single 2px ledge that closes on press. Window close uses the close disc instead.
- **Focus:** 2px blue-fg outline, 2px offset. **Disabled:** 50% opacity.
- **Scope:** every button of the app, /game included, at the owner's request. Round pills there use a 2px lift. Flat list rows (menu items, emoji options) stay flat. The static content site and the Google sign-in button keep their own colours.

### Cards / Containers
- **Folder:** see above; the standard modal and panel.
- **Game table (in /game), glass family:** the table panel is frosted glass like the board, an explicit exception to charcoal surfaces: rgba(255,255,255,0.15) with an 8px backdrop blur, a 1px cream line at 26%, a 30% cream top light and a soft drop (0 8px 32px rgba(0,0,0,0.3)), 28px radius. By day, white at 40% with an ink line at 16% and a 75% white top light. In the Android WebView it is white at 10% without blur. The Resign dialog opened inside it is still a charcoal folder (red tab).
- **Inset:** a faint well (5% ink) with a 1px line border and 14px radius, inside a folder.
- **Tint tile:** accent at 12% with 30% accent border, for status banners and badges.

### Player card (shared, profile window and /profile/:id)
- The avatar sits in a 3px ring in the tab red; the rank is a small stamp tilted -10deg on the ring; points read inline; a "Boosters" heading with a rule and the slot count introduces the equipped boosters.

### Inputs / Fields
- Charcoal Lift background (`--m-field`), 1.5px line border, 14px radius. Focus turns the border blue-fg and adds the Focus shadow. Placeholder in Ink 4.

### Team intro (in /game)
The full-screen backdrop of the team announcement paints `--m-sky-open`, the same banded Mars sky (no ground) as the loading screen, so the hand-off between them has no tint jump in either mode. The coloured team bands, avatars and the VS burst are unchanged.

### Team banner (on the board's top edge, in /game)
A pediment cut from the board's own glass, standing on the board's back edge: same fill, 1px line and top light line as `.board-container`, no ledge, no drop shadow, no blur. Its flat base rests on the board's top border (1px overlap, no bottom border), its sides lean inward through a static `perspective(110px) rotateX(8deg)` on a pseudo-element only (the text stays flat), top corners 12px. Left, always the player's team: their two planet marbles (static), touching, in a cup carved like the board's neutral holes, then "You & Alice" in Plus Jakarta Sans 800, "You" in gold (`--m-gold-fg`). Right, the opposing team mirrored (names then marbles) in `--m-fg-2`; "vs" and "&" in `--m-fg-3`. The board computes its top, scale and max width (the flat part of the board's top edge, board side minus 1.2 squares); long names truncate with an ellipsis. As a spectator, red & blue sit on the left. In portrait the room is reserved above the board; where the board already fills the height, the board may shrink by up to 4% to make room, otherwise the banner is hidden. Its scale never goes below 0.85.

### Joker mark
The Joker is never an emoji. `app-joker-art` shows the jester drawn inside the Joker card (the same `JOKER_ART` path, as a memoized SVG data URI in an `<img>`), in two square crops: `full` (whole figure, for 80px and up) and `bust` (hat, face and sceptre, readable down to about 36px). Its outline is black, so the host always gives it card paper (`--m-cream`) and its shape; the ring takes the context's accent. Used in the "Bonus turn, Joker" banner (112px token with the gold ring and ledge of the replay) and the Joker tile of the rules (2.75rem bust in a cyan ring).

### Active boosters (in /game)
A 40px pill next to the reactions button. On mobile portrait (where the top-centre seconds chip replaces the timer ring), the tokens stack: each slides 4px over the previous one and is cut out by a disc of the pill colour instead of the "in effect" ring; the satellites (star, coin) stay above the stack. Three tokens make a 72px pill, which leaves the centred seconds chip clear on a 360px phone. On desktop and landscape they stay a column under the reactions button, with their rings.

### Move preview on the board
At night: white path rings and a yellow glowing destination. By day (light glass board): path squares in dark ink (fill 30%, 2px ring at 85%), destination in near-solid gold (fill 90%) with a dark gold ring (`--m-gold-ink`) and the same golden halo and pulse as at night, second-marble path dashed in dark gold over a 30% gold fill. The pulse colours are variables read by the shared keyframes, so the native rule that stops the pulse on Android still applies.

### Day/night toggle: sky porthole (home, top left)
`app-sky-toggle` (`shared/sky-toggle.component.*`). A flat 40px disc, with no ledge and no inset shadow (owner request, 2026-10-25: the one button that is not a keycap), in the nav pills' material (`--m-paper-hi`, 1.5px `--m-glass-line` border), pierced by a 31px window ringed by a 1px `--m-paper-edge` line. The window shows the same horizon of the landscape twice: by day on the left (the pearl sun nearly risen, the small pale-gold sun piercing beside the mesa) and at night on the right (Phobos with its night side and Stickney, Deimos, stars), over the same mesa, hill and four sand bands, each half painted in its own palette, each mesa shaded on the side away from its light.
- **Terminator:** a 2px bar in the frame colour, leaning 21.8deg (`/`), separates the two hours; the night scene is clipped to the right of it. The current hour takes 60% of the width at mid-height (`--sp-at`: 60% by day, 40% at night). The bar has no edge line: thicker and outlined, the crossed ring read as a prohibition sign.
- **Motion:** nothing moves at rest. On a switch, the bar and the night clip travel together across the window (1100ms, `cubic-bezier(0.65, 0, 0.35, 1)`) while the landscape plays its dusk or dawn; details such as the small sun or some stars are covered or uncovered as the bar passes. Press: the disc scales to 0.94. Under reduced motion, no transition.
- **Palette:** `--m-porthole-*` in `tokens.css`, mode-independent (`-day` and `-night` pairs), because both hours are always drawn. Same values as the generator palettes and the sky bodies of `space-background`; keep them in step.

### Toast
- Pill, Warm Charcoal (cream paper by day), cream 14px weight 700, Pop shadow, slides in from above in 200ms. Error variant is Brick Red fill with a red ledge.

### Mars landscape, day and night (signature)
The app-wide background (`app-space-background`, rendered once behind the router outlet): a red planet being made habitable, under its two moons at night and at a double sunrise by day.
- **One geometry, two palettes:** the landscape block (mesas, hills, banded ground, colony, crater lake, three mists) is shared by both modes; only its `mx-*` palette changes. The sky changes objects: suns and a sun mist by day; fixed stars, twinkles, Phobos and Deimos, shooting stars and the spaceship at night. Day-only and night-only details inside the shared block are hidden per mode.
- **Source:** generated vector SVG, no raster and no image model. The `mars:day-sky`, `mars:night-sky` and `mars:land` blocks of `space-background.component.html` and the whole of `_mars-palette.scss` are written by `resources/mars/generate-mars-landscape.py --write-template`; change the script, not the output. The stars, twinkles, shooting stars and spaceship are hand-written in the template, SCSS and TS. The script also renders phone and desktop mock-ups in both modes with Inkscape for layout checks.
- **Seat colours:** the colony windows are the only place the landscape carries saturated colour, one window per seat colour, read live from the accent tokens; at night they are lit with ring glows.
- **Motion, day:** only the four mists move, a slow back-and-forth `translateX` drift (70s to 180s per leg, 1.2vh to 6vw amplitude, ease-in-out, alternate, so there is no seam). The beacon is steady.
- **Motion, night:** the three landscape mists drift the same way; the mast beacon blinks (3.2s cycle, dimming to 15% for the last 30%); nine stars twinkle (4 to 9s, opacity 0.35 to 1); three shooting stars cross on long cycles (48s, 67s, 89s, visible for about 4% of each); a spaceship crosses every 1.5 to 5 minutes, at a random height between 8 and 38%, in 9 to 16s.
- **Performance:** the mast beacon is an HTML element laid over the colony drawing, so its blink is a composited opacity animation. The star fields are only created when night is first shown, then kept; a day start computes none.
- **In `/game` (calm mode):** nothing of the landscape is rendered; only the banded sky alone (`--m-sky-open` on `.space-bg.calm`, no ground) shows behind the board and the hand, under the page veils (owner request, 2026-10-15).
- **Theme switch ("Le soir tombe"):** the day/night toggle passes time over the same place. During the switch, `<html data-theme-switch="dusk|dawn">` gives a view-transition name to each sky band, the stars, the sun/moon container, each landscape layer, the routed page and the toast (names exist only during the switch), and `styles.scss` fades the snapshots one by one, opacity and transform only, about 1.5s. Dusk: the suns sink behind the mesas, the sky bands darken from the zenith to the horizon, each passing through the blue of the Martian twilight (`#1f2a44` at the zenith to `#8299b4` at the horizon, shown only during the switch), then the relief from far to near; the moons rise, the stars appear, the colony windows light one by one. Dawn is the reverse. The twilight blues are `--m-twilight-1` to `--m-twilight-9` in `tokens.css`. The page cross-fades in 280ms when the sky behind the title has changed; the day/night toggle (sky porthole, see Components) is named `m-sky-toggle` during the switch and shown live, without a fade, so its terminator bar is seen crossing the window over the landscape. Android system bar icons switch halfway (550ms). In `/game`, the toggle uses one cross-fade of the whole screen in 220ms. Without View Transitions, or under reduced motion, the switch is instant.
- **Reduced motion:** under `prefers-reduced-motion: reduce` no animation runs, and the spaceship is never scheduled.
- **Loading screen:** paints `--m-sky-open`, the same sky bands without the ground, in both modes, so no tint jump shows when one fades into the other.
- **System bars (Android):** once the native splash is hidden, the status and navigation bar icons turn dark in day mode and light at night (ThemeService).

## Color Guidelines & Anti-Patterns

Strict rules for backgrounds, cards and themes, day mode in particular. They target the "generated on the fly" look (crypto-SaaS, 2023). They apply to any CSS, SVG or background asset written for the app.

### Banned: cyber / AI-cliche gradients
- **No** linear gradient from magenta or electric violet (`#8B5CF6`, `#EC4899`) to cyan or neon blue.
- **No** blurred overlays or mesh gradients mixing pink, cyan and pastel violet, least of all centred on the screen.

### Banned: neon over-saturation on dark
- **No** fully saturated cyan or turquoise (`#00FFFF`, `#06B6D4`) placed directly on pure black (`#000000`).
- **No** HSL colour at 100% saturation for any background colour.

### Banned: the milky-violet SaaS day mode
- **No** lavender or very light milky violet as a general background (`#F3E8FF`, `#EDE9FE`).
- **No** dark gradient (indigo, deep night blue) as the background of day mode. A day-mode background stays visibly light and bright, and gives dark text a natural contrast.

### Banned: the synthetic, too-smooth look
- **No** plain two-stop gradient with no nuance. A background needs at least one of: grain, a grid, vector structure, or an authored texture (see the generated vector structure in `resources/mars/`).

### Resolved decisions
- **Day-mode background:** "Matin sur Mars", a nine-band haze-to-apricot sky (`#c3d2d9` at the zenith to `#eabb9b` at the horizon) over a banded sand ground, with the generated vector landscape on top. Text on it is charcoal ink. The previous azure "Orbasphere" day view is archived in `resources/orbasphere/`. Validated by the owner on 2026-10-15.
- **Night background:** the same Mars landscape under a nine-band navy sky (`#05080f` to `#131a2e`) with no horizon glow; its only saturated colours are the four seat windows and the beacon. The content site under `content/` keeps its own radial night gradient. Not yet seen on a device.
- **Cyan accent: kept by decision.** `--m-violet` (`#22b8cf`, boosters) is about 72% saturated, below the 100% the second rule bans, and it only sits on charcoal surfaces or paper, never on pure black.
- **Ground craters: removed (2026-10-15).** Only the crater lake remains.

## Do's and Don'ts

### Do:
- **Do** make every new modal or floating panel a folder: flat `--m-paper` sheet at 22px, a colour tab naming it, the close disc on its top-right corner, actions on a stub below a ticket perforation when it has any.
- **Do** let the tab and close disc overflow the folder; scroll a child, never the folder, and reserve `--m-tab-h` above it.
- **Do** pick the tab colour from the six accents and keep the label in `--m-on-<accent>`.
- **Do** reference `--m-*` tokens and context aliases; add values to `tokens.css` only.
- **Do** build buttons with `m.btn` plus `m.btn-fill`, `m.btn-paper` or `m.keycap(mid, deep)`; show thickness with the two-tier ledge and press it by one step (`--m-btn-lift`), 90ms. Reserve 6px under a button for its ledge.
- **Do** use the `-light` accent variant for text on charcoal and on the night sky, the `-ink` variant on day paper (through `--m-*-fg`).
- **Do** use `--sa-*` variables for any safe-area spacing.
- **Do** give anything placed directly on the background the `m-sky` class, so it reads charcoal on the day landscape and cream at night.
- **Do** position any landscape element, in either mode, from `--m-horizon` and size it in vh.
- **Do** change the Mars landscape (geometry and both palettes) through `resources/mars/generate-mars-landscape.py`, using bands and concentric rings only, and keep the `--m-sky-bands` and `--m-sky-ground` values in step with its `PALETTES["night"]` and `PALETTES["day"]` sky bands and ground.

### Don't:
- **Don't** use violet, purple or any derivative in the UI (the Mars background and /game are outside this rule).
- **Don't** bring back slate or lagoon-blue surfaces, or a dark ledge under a charcoal button.
- **Don't** give a folder an outline, a ledge, `overflow: hidden`, or a title row with an icon close.
- **Don't** use backdrop blur, translucent glass on app surfaces (the board and the table panel in /game are the only glass), glowing borders, or pure white fills or text.
- **Don't** use uppercase spaced labels, on tabs included.
- **Don't** restyle the game cards, the board and its components, the Mars background (night or day), the logo and icon, or the purchase coin animation without an explicit request.
- **Don't** introduce ambient looping animations on surfaces (pulsing halos, breathing thumbnails); they were deliberately removed. The motion of the background is background, not surface, and stays there.
- **Don't** use `color-mix()` or Google Fonts.
- **Don't** turn the landscape into a gradient-and-glow sunrise wallpaper or bring back a nebula space sky, and don't add raster textures, saturated colour (beyond the colony's seat windows and beacon) or high-contrast elements to it. At night, no glow marks the horizon.
- **Don't** hand-edit the generated `mars:` blocks of `space-background.component.html` or `_mars-palette.scss`.
