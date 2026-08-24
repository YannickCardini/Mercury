/**
 * Mise en page dédiée aux 4 landings « jouer » (/ /fr/ /nl/ /de/).
 *
 * Layout à part de `renderPage()` (utilisé par les 4 pages de règles) : à
 * partir de ~960px, tout le contenu essentiel tient dans la hauteur d'écran
 * sans scroll — colonne de texte à gauche (3/4), CTA + widget à droite (1/4)
 * — et le footer n'apparaît qu'en scrollant, sous les tableaux et la FAQ
 * complète. En dessous de ce seuil (mobile, l'entrée la plus fréquente vu que
 * Mercury a une appli Android), tout repasse en une colonne empilée avec
 * scroll normal : « au-dessus du pli » ne veut rien dire sur un écran étroit.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SITE_NAME, OG_LOCALE, OG_IMAGE_PATH, BUILD_DATE, url } from "./site.mjs";
import { UI, langSwitch, footer, namesTable, vsTable, faqSection } from "./blocks.mjs";
import { graph } from "./schema.mjs";

const CSS = readFileSync(
  fileURLToPath(new URL("../assets/content.css", import.meta.url)),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .trim();

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const jsonLdScript = (nodes) =>
  `<script type="application/ld+json">${JSON.stringify(graph(nodes)).replace(
    /<\//g,
    "<\\/",
  )}</script>`;

/**
 * Renvoie le visiteur revenant de Google OAuth vers l'app, et bascule le
 * libellé du CTA sur « reprendre la partie » quand une partie est en cours.
 * Un seul script, exécuté avant tout paint : les crawlers n'ont pas de
 * localStorage, ils voient toujours le libellé « jouer », jamais une
 * redirection ni un texte qui dépend d'un état côté client.
 */
const boot = (appPath, resumeCta) => `<script>
    (function () {
      var h = location.hash;
      if (h && h.indexOf('id_token') !== -1) { location.replace('${appPath}' + h); return; }
      try {
        if (localStorage.getItem('active_game_id')) {
          var subs = document.querySelectorAll('.hp-play-sub');
          for (var i = 0; i < subs.length; i++) subs[i].textContent = ${JSON.stringify(resumeCta)};
        }
      } catch (e) {}
    })();
  </script>`;

export function renderLandingPage({
  lang,
  path,
  title,
  description,
  cluster,
  jsonLd = [],
  appPath,
  eyebrow,
  h1,
  lede,
  /** [{ icon, text }] — 4 points clés affichés au-dessus du pli. */
  highlights,
  playCta,
  moreLink,
  /** { heading, intro } pour la section "un seul jeu, quatre noms". */
  names,
  /** { heading, intro } pour la section comparative. */
  compare,
  /** { heading, items } pour la FAQ complète. */
  faq,
  /** { heading, items, factPlayers, factFree, factPlatform } pour "gratuit, sans inscription" + le widget latéral. */
  free,
  resumeCta,
}) {
  const t = UI[lang];
  const canonical = url(path);

  const hreflangs = cluster
    .map((alt) => `<link rel="alternate" hreflang="${alt.lang}" href="${url(alt.path)}" />`)
    .join("\n    ");

  const ogAlternates = cluster
    .filter((alt) => alt.lang !== "x-default" && alt.lang !== lang)
    .map((alt) => `<meta property="og:locale:alternate" content="${OG_LOCALE[alt.lang]}" />`)
    .join("\n    ");

  const highlightsHtml = highlights
    .map(
      (h) => `<li class="hp-highlight"><span class="hp-hl-icon" aria-hidden="true">${h.icon}</span><span>${h.text}</span></li>`,
    )
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />
  ${hreflangs}
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="${OG_LOCALE[lang]}" />
  ${ogAlternates}
  <meta property="og:image" content="${url(OG_IMAGE_PATH)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Mercury — Tock, Keezen, Dog, Pegs and Jokers" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${url(OG_IMAGE_PATH)}" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" type="image/svg+xml" href="/assets/icon/favicon.svg" />
  ${boot(appPath, resumeCta)}
  <style>${CSS}</style>
  ${jsonLdScript(jsonLd)}
</head>
<body class="hp-body">

  <div class="hp-fold">
    <div class="hp-inner">

      <header class="hp-topbar">
        <a class="rp-brand" href="${path}">Mercury</a>
        ${langSwitch(lang, cluster)}
      </header>

      <div class="hp-grid">
        <section class="hp-main">
          <span class="rp-eyebrow">${eyebrow}</span>
          <h1 class="hp-title">${h1}</h1>
          <p class="hp-lede">${lede}</p>

          <ul class="hp-highlights">
          ${highlightsHtml}
          </ul>

          <p class="hp-more"><a href="${moreLink.path}">${moreLink.text} →</a></p>
        </section>

        <aside class="hp-side">
          <a class="hp-play-card" href="${appPath}">
            <span class="hp-play-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </span>
            <span class="hp-play-text">${playCta}</span>
            <span class="hp-play-sub">${free.factFree}</span>
          </a>

          <div class="hp-facts">
            <div class="hp-marbles" aria-hidden="true">
              <span class="hp-marble hp-marble--red"></span>
              <span class="hp-marble hp-marble--blue"></span>
              <span class="hp-marble hp-marble--green"></span>
              <span class="hp-marble hp-marble--orange"></span>
            </div>
            <ul class="hp-facts-list">
              <li>${free.factPlayers}</li>
              <li>${free.factPlatform}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>

    <div class="hp-scroll-hint" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </div>
  </div>

  <div class="hp-below">
    <div class="hp-below-inner">

      <section class="rp-section">
        <h2>${free.heading}</h2>
        <ul>
          ${free.items.map((li) => `<li>${li}</li>`).join("\n          ")}
        </ul>
      </section>

      <section class="rp-section">
        <h2>${names.heading}</h2>
        <p>${names.intro}</p>
        <div class="rp-table-scroll">${namesTable(lang)}</div>
      </section>

      <section class="rp-section">
        <h2>${compare.heading}</h2>
        <p>${compare.intro}</p>
        <div class="rp-table-scroll">${vsTable(lang)}</div>
      </section>

      <section class="rp-section">
        <h2>${faq.heading}</h2>
        ${faqSection(faq.items)}
      </section>

      <p class="rp-actions">
        <a class="rp-cta" href="${appPath}">${playCta}</a>
      </p>

      <p class="rp-updated">${t.updated} ${BUILD_DATE}</p>

      ${footer(lang)}

    </div>
  </div>

</body>
</html>
`;
}
