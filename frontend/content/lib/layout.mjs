/**
 * Fabrique le document HTML complet d'une page statique.
 *
 * Tout ce qui compte pour le référencement est présent dans la réponse HTTP
 * elle-même : titre, description, canonical, grappe hreflang, Open Graph et
 * JSON-LD. Rien n'est injecté par JavaScript, contrairement à l'app Angular
 * où ces balises n'existaient qu'après exécution du bundle.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SITE_NAME, OG_LOCALE, OG_IMAGE_PATH, BUILD_DATE, url } from "./site.mjs";
import { UI, langSwitch, footer } from "./blocks.mjs";
import { graph } from "./schema.mjs";

/**
 * La feuille est inlinée dans les 8 pages : commentaires et indentation sont
 * retirés au passage. Les seules chaînes de la feuille (`content: "+ "`) ne
 * contiennent qu'une espace simple, que ce repliage laisse intacte.
 */
const CSS = readFileSync(
  fileURLToPath(new URL("../assets/content.css", import.meta.url)),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .trim();

/** Échappe une valeur destinée à un attribut ou à du texte. */
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Sérialise le JSON-LD. La séquence `</` est neutralisée : un `</script>` dans
 * une chaîne fermerait la balise et casserait la page.
 */
const jsonLdScript = (nodes) =>
  `<script type="application/ld+json">${JSON.stringify(graph(nodes)).replace(
    /<\//g,
    "<\\/",
  )}</script>`;

/**
 * Révèle le lien « reprendre » quand le navigateur a une partie en cours.
 * Volontairement pas de redirection automatique : les crawlers n'ont pas de
 * localStorage, ils doivent voir exactement la même page que les visiteurs.
 */
const RESUME_SCRIPT = `<script>
    try {
      if (localStorage.getItem('active_game_id')) {
        var r = document.getElementById('rp-resume');
        if (r) r.hidden = false;
      }
    } catch (e) {}
  </script>`;

export function renderPage({
  lang,
  path,
  title,
  description,
  cluster,
  ogType = "website",
  jsonLd = [],
  headScripts = "",
  crumbs = null,
  eyebrow,
  h1,
  lede,
  body,
}) {
  const t = UI[lang];
  const canonical = url(path);

  const hreflangs = cluster
    .map(
      (alt) =>
        `<link rel="alternate" hreflang="${alt.lang}" href="${url(alt.path)}" />`,
    )
    .join("\n    ");

  const ogAlternates = cluster
    .filter((alt) => alt.lang !== "x-default" && alt.lang !== lang)
    .map(
      (alt) =>
        `<meta property="og:locale:alternate" content="${OG_LOCALE[alt.lang]}" />`,
    )
    .join("\n    ");

  const crumbsHtml = crumbs
    ? `<nav class="rp-crumbs" aria-label="${t.breadcrumbHome}">${crumbs
        .map((c, i) =>
          i === crumbs.length - 1
            ? `<span aria-hidden="true">›</span>${esc(c.name)}`
            : `${i > 0 ? '<span aria-hidden="true">›</span>' : ""}<a href="${c.path}">${esc(c.name)}</a>`,
        )
        .join("")}</nav>`
    : "";

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
  <meta property="og:type" content="${ogType}" />
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
  ${headScripts}
  <style>${CSS}</style>
  ${jsonLdScript(jsonLd)}
</head>
<body>
  <div class="rp-wrap">
    <article class="rp-card">

      <div class="rp-topbar">
        <a class="rp-brand" href="/">Mercury</a>
        ${langSwitch(lang, cluster)}
      </div>

      ${crumbsHtml}

      <span class="rp-eyebrow">${eyebrow}</span>
      <h1 class="rp-title">${h1}</h1>
      <p class="rp-lede">${lede}</p>

      ${body}

      <p class="rp-updated">${t.updated} ${BUILD_DATE}</p>

      ${footer(lang)}

    </article>
  </div>
  ${RESUME_SCRIPT}
</body>
</html>
`;
}
