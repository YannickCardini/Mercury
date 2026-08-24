/**
 * Génère la couche de contenu statique du site dans `www/`, après `ng build`.
 *
 *   www/content/{en,fr,nl,de}/index.html   les 4 pages « jouer », une par marché
 *   www/content/rules/*.html               les 4 pages de règles (URLs inchangées)
 *   www/sitemap.xml                    lastmod réel + grappes hreflang
 *   www/llms.txt                       résumé du site pour les moteurs IA
 *
 * Le routage vers ces fichiers est déclaré dans src/staticwebapp.config.json.
 *
 * Le build échoue si une page est incomplète (titre, description, canonical
 * auto-référencé, grappe hreflang réciproque, JSON-LD) : une régression SEO ne
 * se voit pas à l'œil nu sur la page rendue, elle doit donc casser la CI.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import landings from "./pages/landings.mjs";
import rulesTock from "./pages/rules-tock.mjs";
import rulesKeezen from "./pages/rules-keezen.mjs";
import rulesDog from "./pages/rules-dog.mjs";
import rulesPegs from "./pages/rules-pegs.mjs";

import { SITE_URL, BUILD_DATE, LANDING_PATH, RULES_PATH, url } from "./lib/site.mjs";

const OUT_DIR = fileURLToPath(new URL("../www/", import.meta.url));

const PAGES = [...landings, rulesTock, rulesKeezen, rulesDog, rulesPegs];

/** Limites au-delà desquelles Google tronque presque toujours. */
const MAX_TITLE = 70;
const MAX_DESCRIPTION = 170;

const errors = [];
const fail = (page, message) => errors.push(`${page.path} — ${message}`);

function check(page, html) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  if (!title) fail(page, "titre absent");
  else if (title.length > MAX_TITLE)
    fail(page, `titre trop long (${title.length} > ${MAX_TITLE}) : ${title}`);

  const description =
    html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  if (!description) fail(page, "meta description absente");
  else if (description.length > MAX_DESCRIPTION)
    fail(page, `meta description trop longue (${description.length} > ${MAX_DESCRIPTION})`);

  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
  if (canonical !== url(page.path))
    fail(page, `canonical incorrect : « ${canonical} » au lieu de « ${url(page.path)} »`);

  if (!new RegExp(`<html lang="${page.lang}"`).test(html))
    fail(page, `attribut lang absent ou différent de « ${page.lang} »`);

  // Grappe hreflang : complète, et auto-référencée dans sa propre langue.
  for (const alt of page.cluster) {
    const tag = `<link rel="alternate" hreflang="${alt.lang}" href="${url(alt.path)}" />`;
    if (!html.includes(tag)) fail(page, `hreflang manquant : ${alt.lang} → ${alt.path}`);
  }
  const self = page.cluster.find((a) => a.lang === page.lang);
  if (!self || self.path !== page.path)
    fail(page, "la grappe hreflang ne se référence pas elle-même");

  const jsonLd = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  )?.[1];
  if (!jsonLd) fail(page, "JSON-LD absent");
  else {
    try {
      const parsed = JSON.parse(jsonLd.replace(/<\\\//g, "</"));
      if (!Array.isArray(parsed["@graph"]) || parsed["@graph"].length === 0)
        fail(page, "JSON-LD vide");
    } catch (e) {
      fail(page, `JSON-LD illisible : ${e.message}`);
    }
  }

  if (!html.includes("<h1")) fail(page, "titre H1 absent");
}

/** Réciprocité : tout chemin cité dans une grappe doit être une page générée. */
function checkClusters() {
  const generated = new Set(PAGES.map((p) => p.path));
  for (const page of PAGES) {
    for (const alt of page.cluster) {
      if (!generated.has(alt.path))
        fail(page, `hreflang ${alt.lang} pointe vers ${alt.path}, qui n'est pas généré`);
    }
  }
}

function write(relative, content) {
  const target = join(OUT_DIR, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  return target;
}

function sitemap() {
  const entries = PAGES.map((page) => {
    const alternates = page.cluster
      .map(
        (alt) =>
          `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${url(alt.path)}" />`,
      )
      .join("\n");
    const priority = page.path === "/" ? "1.0" : page.path.length <= 5 ? "0.9" : "0.8";
    return `  <url>
    <loc>${url(page.path)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
${alternates}
  </url>`;
  }).join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

${entries}

</urlset>
`;
}

/**
 * Résumé du site au format llms.txt.
 *
 * Aucun grand fournisseur ne l'honore officiellement à ce jour : c'est un pari
 * à coût nul, pas un levier acquis. Le vrai gain GEO vient du HTML statique
 * généré ci-dessus, que les crawlers IA savent déjà lire.
 */
function llmsTxt() {
  return `# Mercury

> Mercury is a free online multiplayer version of the card-and-marble race game known as Tock in France, Keezen in the Netherlands, Dog in Germany and Switzerland, and Pegs and Jokers in North America. It runs in a web browser and as an Android app.

## Canonical facts

- One game, four regional names: Tock (France, Québec), Keezen (Netherlands), Dog (Germany, Switzerland), Pegs and Jokers (United States, Canada).
- The family descends from the Indian race game Pachisi; unlike Ludo or Parcheesi, marbles are moved with playing cards rather than a die.
- Every game on Mercury seats exactly 4 players, split by default into two teams of 2 (red and blue against green and orange).
- Each player has 4 marbles and is dealt 13 cards, in three deals of 5, 4 and 4, from a 54-card deck (52 cards plus 2 jokers).
- An Ace, a King or a Joker brings a marble into play. The 4 moves backwards, the 7 splits its steps between marbles, the Jack swaps two marbles of different colors, the Joker moves 18 and plays again.
- Mercury is free: no purchase, no subscription, and no account required to play.

## Play

- [Play Pegs and Jokers online (English)](${url(LANDING_PATH.en)}): free 4-player game, 2v2 teams, no download.
- [Jouer au Tock en ligne (français)](${url(LANDING_PATH.fr)}): jeu de société de cartes et de billes, gratuit et sans inscription.
- [Keezen online spelen (Nederlands)](${url(LANDING_PATH.nl)}): gratis Keezenspel met 4 spelers.
- [Dog online spielen (Deutsch)](${url(LANDING_PATH.de)}): kostenloses Karten- und Murmelspiel zu viert.

## Rules

- [Pegs and Jokers rules (English)](${url(RULES_PATH.en)}): setup, card effects, 2v2 team mode, FAQ.
- [Règles du Tock (français)](${url(RULES_PATH.fr)}): mise en place, effet de chaque carte, mode équipes, FAQ.
- [Keezen spelregels (Nederlands)](${url(RULES_PATH.nl)}): opstelling, kaartwaarden, teammodus, FAQ.
- [Dog Spielregeln (Deutsch)](${url(RULES_PATH.de)}): Vorbereitung, Kartenwerte, Team-Modus, FAQ.

## Notes

- Last updated: ${BUILD_DATE}
- Sitemap: ${SITE_URL}/sitemap.xml
`;
}

// ─── Exécution ──────────────────────────────────────────────────────────────

const written = [];

for (const page of PAGES) {
  const html = page.render();
  check(page, html);
  written.push(write(page.outFile, html));
}
checkClusters();

written.push(write("sitemap.xml", sitemap()));
written.push(write("llms.txt", llmsTxt()));

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} problème(s) SEO détecté(s) :\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ SEO : ${PAGES.length} pages + sitemap.xml + llms.txt générés dans www/`);
for (const f of written) console.log(`  ${f.replace(OUT_DIR, "www/")}`);
