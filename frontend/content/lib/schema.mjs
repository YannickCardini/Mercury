/**
 * Constructeurs JSON-LD (schema.org).
 *
 * Deux usages : les résultats enrichis Google (FAQ, fil d'Ariane) et
 * l'ancrage des moteurs de réponse IA, qui s'appuient largement sur les
 * données structurées pour identifier une entité et ses attributs factuels.
 *
 * Règle absolue : aucun `aggregateRating` tant qu'il n'existe pas de vrais
 * avis collectés — c'est une cause directe de pénalité manuelle Google.
 */

import {
  SITE_URL,
  SITE_NAME,
  PLAY_STORE_URL,
  OG_IMAGE_PATH,
  ALTERNATE_NAMES,
  ENTITY_PLAIN,
  BUILD_DATE,
  url,
} from "./site.mjs";

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const GAME_ID = `${SITE_URL}/#game`;

export function organization() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: url(OG_IMAGE_PATH),
  };
}

export function webSite() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ["en", "fr", "nl", "de"],
    publisher: { "@id": ORG_ID },
  };
}

/**
 * Le jeu lui-même. Un `@id` unique et stable partagé par les 4 landings :
 * les quatre pages décrivent la même entité dans quatre langues, pas quatre
 * jeux différents.
 */
export function videoGame(lang) {
  return {
    "@type": "VideoGame",
    "@id": GAME_ID,
    name: SITE_NAME,
    alternateName: ALTERNATE_NAMES,
    url: SITE_URL,
    description: ENTITY_PLAIN[lang],
    inLanguage: lang,
    image: url(OG_IMAGE_PATH),
    applicationCategory: "GameApplication",
    genre: ["Board game", "Card game", "Race game"],
    gamePlatform: ["Web browser", "Android"],
    operatingSystem: "Any modern web browser, Android",
    playMode: "MultiPlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", value: 4 },
    publisher: { "@id": ORG_ID },
    sameAs: [PLAY_STORE_URL],
    // price "0" : signal machine-lisible de gratuité — « free », « gratuit »,
    // « gratis » et « kostenlos » font partie des requêtes visées.
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    },
  };
}

/** `items` : [{ q, a }] — le texte de `a` doit être autoportant (citable seul). */
export function faqPage(items) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** `steps` : [string] — les étapes d'un tour de jeu. */
export function howTo({ lang, name, description, steps, path }) {
  return {
    "@type": "HowTo",
    name,
    description,
    inLanguage: lang,
    url: url(path),
    dateModified: BUILD_DATE,
    step: steps.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    })),
  };
}

/** `items` : [{ name, path }] — le dernier élément est la page courante. */
export function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: url(item.path),
    })),
  };
}

/** Enveloppe une liste de nœuds dans un unique @graph @context. */
export function graph(nodes) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
