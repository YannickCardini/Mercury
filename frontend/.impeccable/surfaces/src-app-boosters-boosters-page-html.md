---
version: 1
slug: "src-app-boosters-boosters-page-html"
primary_target: "src/app/boosters/boosters.page.html"
related_targets: ["src/app/boosters/boosters.page.scss","src/app/boosters/boosters.page.ts"]
---

# Boosters screen

Scope: the `/boosters` route (storefront), the equipment view in the home profile modal (`app-booster-loadout`), the Boosters row of that modal, the equipped boosters on `/profile/:id`, and the shop Boosters entry. Mode: Operate. Both themes (night slate, day cream paper).

Owner decisions (2026-10-23): boosters are bought once and kept for good; equipped boosters apply to every game; one dedicated Boosters screen holds collection, equipment and purchase; the home shows only a compact entry; the shop keeps reactions and points to this screen. Mechanics and UI ship together. The catalog will grow to 10-30 boosters.

Owner decisions, second pass (2026-10-23): 2 slots are free, each further slot costs 100 coins, up to as many slots as there are boosters, so every surface must hold an unbounded number of slots and equipped boosters. The first equip animation read as laggy and step by step on the device: the flight must be one continuous gesture and land without waiting for the network.

Audience and job: a signed-in player between games, mostly on a phone, sometimes on desktop. They check what is equipped, swap a booster, or spend coins on a new one. Guests see the catalog and are told to sign in.

Protected: the booster token (`app-boost-token`, its accent per effect), the coin and the shop purchase coin flight, the in-game dock.

Owner decisions, third pass (2026-10-25): boosters are equipped from the profile, not from the home screen (the home entry is gone) nor from `/boosters`, which becomes the storefront. A purchase no longer equips by itself: the purchase card turns into a "yours" card that shows the player's slots and the one the booster would take, and offers "Equip in profile", which opens the profile modal on the equipment view with the booster in hand (dropped into the free slot, or waiting for a swap). Other players' equipped boosters show on their profile; AI agents show (and play) a fixed loadout derived from their id, so nothing tells them apart from humans.

Owner decisions, fourth pass (2026-10-25): each booster gets its own illustration in the "board objects" style (two stars, two coins, one struck marble, two struck marbles, two marbles in the arrival lane), flat and matte on the accent disc, the amount as an edge tag hidden below 36px. Profiles show equipped boosters side by side, wrapping, each with a tooltip (name and effect) on hover or tap. In the equipment view a booster is removed only by its cross; tapping a cup opens its tooltip; Equip is greyed when every slot is used (storefront too); no swap mode.

## Direction contract

THESIS: Buy in the storefront, equip in the profile. The profile's equipment view is a rack of carved cups (one per owned slot, wrapping, then the next slot to buy) pinned above the owned boosters; equipping moves the token from its row into a cup in one continuous arc. The purchase card is one object from confirmation to ownership: the coins fall into its cup, the ghosted token materializes, and the card shows where it would go. It refuses the shop's tile grid (a collection to complete) and the settings-toggle list (a wall of switches).

OWN-WORLD: The incumbent slate slab (`m-paper`), cream ink, Baloo 2 numbers, Plus Jakarta Sans text. Cups are carved like the board's neutral holes and the team banner's marble cup: an inset well with a lip. Tokens keep their accent (cyan points, gold coins, brick bounty). State colour: green tint for Equipped, gold fill for a price within reach, a quiet well for one out of reach.

STORY: The player sees at once what plays with them every game (2 of 3), scans the list for what else exists and what it costs, and equips or buys in one tap; the token visibly travels into the rack.

FIRST VIEWPORT: Phone portrait: header (Back, Boosters, coin balance). Rack panel: caption "Equipped for every game" with "2 of 3 slots", 56px cups wrapping in rows (no names under them; names live in the list and in tooltips), then a dashed locked cup with a gold "100" tag. Segmented filter All / Owned / To buy with counts. List rows: token 40px, name, one-line effect, action at the right (Equip / Equipped toggle, gold price button, muted price). Owned rows first, then a "To buy" subheading. Home and shop entries and the in-game dock show at most 3 items (tokens, then "+N").

FORM: surface structure "Rack over the list", position 1 of 7 on the ordered list, dealt second; seed key 21ee4632.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
