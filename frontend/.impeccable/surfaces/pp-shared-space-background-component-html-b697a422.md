---
version: 1
slug: "pp-shared-space-background-component-html-b697a422"
primary_target: "frontend/src/app/shared/space-background.component.html"
related_targets: ["frontend/src/app/shared/space-background.component.scss","frontend/src/app/shared/_mars-palette.scss"]
---

# App background (day and night)

Scope: `app-space-background`, behind every route (home, profile, leaderboard, shop, loading screen, /game in calm mode), in both themes. Mode: Operate (it sits behind working screens).

Owner brief, day (2026-10-14): a minimalist terraforming landscape, Mars or Moon ground, flat or soft isometric, a double sun on the horizon, distant craters, coloured morning mists in light terracotta, ochre or pearly white. It must stay light and stay a background. Confirmed answers: flat in stacked planes, terraformed Mars, slowly drifting mists. Day validated by the owner on 2026-10-15 ("magnifique").

Owner brief, night (2026-10-15): replace the space theme of night mode with the same Mars view, at night; dark, since it is the dark mode. UI (buttons, overlays) is validated and stays; only small touch-ups if the new background causes a visual problem. Confirmed answers: two moons and stars; black night with no horizon glow (the mesas, a little lighter than the sky, mark the horizon); keep the rare shooting stars and the spaceship.

## Direction contract

THESIS: One terraformed-Mars place seen flat and frontal in two lights, built from two primitives only, horizontal bands and concentric rings. Day: a double sunrise. Night: the same place under Phobos and Deimos. It refuses the gradient-and-glow sunrise wallpaper and the nebula space sky.

OWN-WORLD: Day: banded sky from cool pearl (#e2e9eb) to apricot (#f7ccb2); hazy terracotta mesas (#edcdbb) with stippled shadow faces and strata lines; light ochre hills; sand ground in four wavy bands; craters as translucent dents with faint ejecta rings; nacre, terracotta and ochre mist pills that fade at both ends. Night: near-uniform navy bands (#05080f to #131a2e), no glow; mesas a little lighter than the sky (#272027), darker hills and rust-black ground; cold moonlit crater rims; silver, dusty rose and dim ochre mists at low opacity; lumpy Phobos with Stickney and a bright Deimos dot, with ring halos; colony windows lit in the four seat colours, mast light blinking; Phobos's broken reflection in a navy lake.

STORY: The player opens Mercury and sees a red planet being made habitable, at sunrise by day and under its two moons by night; nothing competes with the menu.

FIRST VIEWPORT: Phone portrait: horizon at 53%; day, the pearl sun and the smaller gold sun rising at 84% beside the emblem; night, Phobos at 84% and 14vh above the horizon beside the emblem, Deimos higher to its right, clear of the emblem; the four-dome colony at 14%; the crater lake under the sun/moon in the free band below the buttons. Landscape: horizon at 64%, sun/moon at 74%. /game: everything frozen except a few twinkling stars, sun/moon dimmed to 50%, moons lowered 13vh so Phobos rises half behind the mesas in the gap between board and hand, Deimos hidden.

FORM: brief-pinned by the owner; no roll was run (no seed key).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Theme switch (2026-10-15)

Owner asked for a transition richer than the circle reveal now that day and night show the same place; he chose "Le soir tombe" among three proposals (the others: a Phobos eclipse, a rotating sky). The toggle passes time over the landscape instead of wiping the screen: dusk darkens the sky band by band from the zenith through the blue of the Martian twilight, the suns set and the moons rise, the relief darkens from far to near, the colony windows light one by one; dawn runs the sky from the horizon up. View Transitions, names only during the switch (`data-theme-switch`), about 1.5s, instant under reduced motion. Preview without the app: `resources/mars/simulate-theme-switch.py`.
