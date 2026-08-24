# Static content layer (SEO / GEO)

Generates 8 complete HTML pages in `www/`, served directly by Azure Static
Web Apps, **outside of the Angular application**.

## Why outside of Angular

The app is a client-side rendered SPA: the served HTML only contains
`<app-root></app-root>`. Googlebot can execute JS, but Bing, DuckDuckGo and
all the AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot,
OAI-SearchBot) don't — for them the site was empty. These 8 pages are
complete HTML, readable without JavaScript.

## Pages produced

| URL | File | Language |
|---|---|---|
| `/` | `www/content/en/index.html` | en |
| `/fr/` `/nl/` `/de/` | `www/content/{fr,nl,de}/index.html` | fr, nl, de |
| `/rules/tock` | `www/content/rules/tock.html` | fr |
| `/rules/keezen` | `www/content/rules/keezen.html` | nl |
| `/rules/dog` | `www/content/rules/dog.html` | de |
| `/rules/pegs-and-jokers` | `www/content/rules/pegs-and-jokers.html` | en |

Plus `www/sitemap.xml` and `www/llms.txt`. Routing of clean URLs to these
files is declared in `src/staticwebapp.config.json`.

## Run

```bash
npm run build          # ng build, then the generation
npm run build:content  # generation only (www/ must already exist)
```

The build **fails** if a page loses its title, its meta description, its
self-referencing canonical, its reciprocal hreflang cluster or its JSON-LD:
an SEO regression doesn't show up on the rendered page, it must break CI.

## Structure

- `lib/site.mjs` — site URL, hreflang clusters, canonical entity definition
- `lib/layout.mjs` — the full document: head, Open Graph, JSON-LD, inlined CSS
- `lib/schema.mjs` — schema.org constructors
- `lib/blocks.mjs` — UI labels and shared blocks (tables, FAQ, footer)
- `lib/rules-layout.mjs` — common skeleton for the 4 rules pages
- `pages/` — editorial content, one entry per page
- `assets/content.css` — stylesheet inlined into each page

## Points of attention

- **FAQ text is shared** between the display and the JSON-LD (same `{ q, a }`
  objects). Google requires that markup match the visible text.
- **No `aggregateRating`** until real collected reviews exist: it's a direct
  cause of manual penalty.
- The `/` landing page carries a script that **redirects the Google OAuth
  return to `/home`**: the plugin returns the token in the fragment at the
  root, but `/` no longer serves the SPA (see
  `src/app/services/auth.service.ts`).
- `PLAY_STORE_URL` in `lib/site.mjs` must stay aligned with
  `src/app/shared/store-url.ts`.

## Share image

`src/assets/og/cover.png` — 1200×630, referenced as `og:image` and
`twitter:image` by all 8 pages. It is a hand-maintained committed asset: edit
it with whatever tool you like, keep the dimensions, and no rebuild of this
generator is needed (the pages only reference its path).
