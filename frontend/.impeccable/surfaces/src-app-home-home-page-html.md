---
version: 1
slug: "src-app-home-home-page-html"
primary_target: "src/app/home/home.page.html"
related_targets: ["src/app/shared/player-card.component.html","src/app/profile/profile.page.html"]
---

# Profile (own window and public page)

Scope: the profile modal of the home screen (signed in) and the public `/profile/:id` page. Mode: Operate. Both themes.

Owner decisions (2026-10-25): the profile was a stack of layers (card, then boosters, then messages); it must be rearranged as one harmonious whole, not a booster layer added on top. Structure chosen on the decision page (re-asked in chat after the page closed): "Two panes". One player card serves both the own window (left pane) and the public page (without the private parts). Booster tooltips must work on hover with a mouse.

## Direction contract

THESIS: Who you are on the left, who you talk to on the right. One player card (photo, name, rank and points tiles, equipped boosters side by side) is the same object everywhere; the activity pane hosts messages, a conversation or the booster equipment without ever hiding the card on wide screens. It refuses the stacked column of unrelated blocks.

OWN-WORLD: Incumbent slate slab, cream ink, Baloo 2 numbers. The identity pane is a deeper well (paper-lo) like the booster rack; stat tiles in the same well material as the cups; boosters in carved cups with tooltips; account actions as quiet pills in the pane footer, Sign out in red tint.

STORY: The player opens the profile and reads themself at a glance (rank, points, what plays with them), then their conversations; managing boosters or reading a thread happens in place on the right.

FIRST VIEWPORT: Wide (from 820 x 520): an 800px card, fixed height up to 640px; left 320px pane: 96px photo in a ring, name 28px, Rank and Points tiles, Boosters title with "N of M slots used", cups 54px centred, Manage boosters, then Edit profile and Sign out at the pane foot. Right pane: Messages title and unread pill, the conversation list filling the height. Phone: the same card on top, Messages below a rule; a conversation or the equipment takes the whole window with a back button.

FORM: surface structure "Two panes", position 4 of 7 on the ordered list, dealt second; seed key 86fb044c.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
