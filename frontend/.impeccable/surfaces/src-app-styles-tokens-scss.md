---
version: 1
slug: "src-app-styles-tokens-scss"
primary_target: "src/app/styles/_tokens.scss"
related_targets: ["src/app/home/home.page.html","src/app/shared/game-rules-modal.component.html","src/app/shop/shop.page.html","src/app/game/components/victory-overlay/victory-overlay.component.html"]
---

# Folders (every modal, overlay and floating panel)

Scope: every modal and floating panel of the app: home (sign in, profile and messages, about, matchmaking, custom game), game rules, update required, shop (page and purchase confirmation), leaderboard, public profile and its message modal, delete account, privacy, the in-game resign dialog and the victory card. Mode: Operate. Both themes.

Owner decisions (2026-10-25), from three mockups (Profile + Messages two panes, About on a phone, Shop): warm charcoal replaces slate blue as the material of the whole app at night (every surface, /game included); by day the folders are the existing cream paper with the same tabs and cuts, the close disc turns charcoal; the matchmaking card and the victory card, protected until now, become folders too.

## Direction contract

THESIS: Every window is a folder pulled from the game box: a flat warm-charcoal card with a colour tab on its top edge naming it, a cream close disc riding the top-right corner, and a ticket perforation that tears off the stub carrying the actions. It refuses the generic centred card with a title row and an icon close.

OWN-WORLD: Charcoal #2a2523 face, warm cream ink #f3ebdd, buttons in #36302d with a lighter lit ledge; tabs in the seat colours (red, blue, green, orange) and gold, Baloo 2 700, 12px top corners; perforation = two real semicircle holes and a short dashed line; info rows with dotted leaders. By day: cream paper, charcoal ink, charcoal close disc.

STORY: The player reads at once which window is open from its tab colour and name, finds the close in the same corner every time, and knows the actions live on the stub below the perforation.

FIRST VIEWPORT: Each window centred over the scrim; tab 34px tall at 20px from the left edge; close 40px disc at -14px/-12px on the top-right corner; content padding 24px; stub below a perforation at 10px radius holes. Wide profile: two panes side by side, a vertical perforation between them, one tab per pane (Profile red, Messages blue).

FORM: brief-pinned direction from the owner's mockups (no concept roll), code-led on an Operate surface; seed key: none (pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
