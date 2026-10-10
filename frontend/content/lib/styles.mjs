/**
 * Feuille de style inlinée dans les 8 pages statiques.
 *
 * Deux sources, dans cet ordre :
 *   1. src/app/styles/tokens.css — les design tokens (--m-*) et les polices,
 *      le fichier même que charge l'app Angular (voir angular.json). Les
 *      pages statiques et l'app ne peuvent donc pas diverger de palette.
 *   2. content/assets/content.css — la mise en page propre à ces pages, qui
 *      ne référence que ces tokens.
 *
 * Commentaires et indentation sont retirés au passage. Les seules chaînes
 * des deux feuilles (`content: "+ "`, noms de police) ne contiennent que des
 * espaces simples, que ce repliage laisse intactes.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

export const CSS = [read("../../src/app/styles/tokens.css"), read("../assets/content.css")]
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Préchargement des deux polices du premier écran (sous-ensemble latin, le
 * seul utile aux quatre langues des pages). Les @font-face de tokens.css sont
 * en `font-display: swap` : le texte s'affiche tout de suite dans la police
 * de repli, le préchargement ne fait que raccourcir le délai avant l'échange.
 * `crossorigin` est requis pour une police, même servie par la même origine.
 */
export const FONT_PRELOADS = [
  "/assets/fonts/baloo-2-latin-wght-normal.woff2",
  "/assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2",
]
  .map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`)
  .join("\n  ");

/** Logo du jeu (les 4 billes), aussi déclaré en <link rel="icon">. */
export const LOGO_PATH = "/assets/icon/favicon.svg";
