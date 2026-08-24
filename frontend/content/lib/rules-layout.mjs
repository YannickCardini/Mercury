/**
 * Ossature commune aux 4 pages de règles.
 *
 * Le corps rédactionnel de chaque page (sections « qu'est-ce que », mise en
 * place, déroulement d'un tour, effet des cartes, règles clés, mode équipes)
 * est repris tel quel des anciens templates Angular ; ne changent que les
 * liens (`routerLink` → `href`) et les ajouts communs assemblés ici : fil
 * d'Ariane, tableau des noms, lien vers la landing de la même langue.
 */

import { renderPage } from "./layout.mjs";
import { RULES_CLUSTER, RULES_PATH, LANDING_PATH, GAME_NAME } from "./site.mjs";
import { UI, namesTable, faqSection, ctaBlock } from "./blocks.mjs";
import { faqPage, howTo, breadcrumb, videoGame } from "./schema.mjs";

export function renderRules({
  lang,
  title,
  description,
  eyebrow,
  h1,
  lede,
  /** HTML des sections rédactionnelles migrées depuis le template Angular. */
  sections,
  namesHeading,
  namesIntro,
  faqHeading,
  faq,
  howToName,
  /** Étapes d'un tour, en texte brut — alimente le JSON-LD HowTo. */
  howToSteps,
  playLink,
  note,
}) {
  const path = RULES_PATH[lang];
  const t = UI[lang];

  const body = `${sections}

      <section class="rp-section">
        <h2>${namesHeading}</h2>
        <p>${namesIntro}</p>
        <div class="rp-table-scroll">${namesTable(lang)}</div>
      </section>

      <section class="rp-section">
        <h2>${faqHeading}</h2>
        ${faqSection(faq)}
      </section>

      ${ctaBlock(lang)}

      <p class="rp-note">${note}</p>
      <p class="rp-note"><a href="${LANDING_PATH[lang]}">${playLink} →</a></p>`;

  return renderPage({
    lang,
    path,
    title,
    description,
    cluster: RULES_CLUSTER,
    ogType: "article",
    crumbs: [
      { name: t.breadcrumbHome, path: LANDING_PATH[lang] },
      { name: `${t.breadcrumbRules} — ${GAME_NAME[lang]}`, path },
    ],
    jsonLd: [
      videoGame(lang),
      faqPage(faq),
      howTo({
        lang,
        name: howToName,
        description,
        steps: howToSteps,
        path,
      }),
      breadcrumb([
        { name: t.breadcrumbHome, path: LANDING_PATH[lang] },
        { name: `${t.breadcrumbRules} — ${GAME_NAME[lang]}`, path },
      ]),
    ],
    eyebrow,
    h1,
    lede,
    body,
  });
}

/** Descripteur commun consommé par build.mjs. */
export function rulesPage(lang, render) {
  return {
    lang,
    path: RULES_PATH[lang],
    outFile: `content/rules${RULES_PATH[lang].replace("/rules", "")}.html`,
    cluster: RULES_CLUSTER,
    render,
  };
}
