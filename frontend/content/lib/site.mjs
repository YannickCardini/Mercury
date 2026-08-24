/**
 * Constantes partagées par toutes les pages statiques SEO.
 *
 * Cette couche est volontairement indépendante d'Angular : elle est exécutée
 * par Node après `ng build` (voir content/build.mjs) pour produire du HTML complet,
 * lisible sans JavaScript — condition nécessaire pour être indexé par Bing et
 * surtout pour être lu par les crawlers des moteurs de réponse IA (GPTBot,
 * ClaudeBot, PerplexityBot, OAI-SearchBot), qui n'exécutent pas de JS.
 */

export const SITE_URL = "https://www.mercury-game.online";
export const SITE_NAME = "Mercury";

/** Point d'entrée de l'app Angular (le SPA n'est plus servi sur `/`). */
export const APP_PATH = "/home";

/** Fiche Play Store — doit rester alignée sur src/app/shared/store-url.ts. */
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=online.mercury.game";

/** Visuel de partage (1200×630), copié par le glob assets d'angular.json. */
export const OG_IMAGE_PATH = "/assets/og/cover.png";

/** Date de génération, utilisée pour <lastmod>, dateModified et l'affichage. */
export const BUILD_DATE = new Date().toISOString().slice(0, 10);

/**
 * Grappes hreflang. Chaque page doit lister *toute* sa grappe, elle-même
 * incluse, et chaque membre doit renvoyer vers les autres (réciprocité) —
 * le générateur le vérifie et échoue le build sinon.
 */
export const LANDING_CLUSTER = [
  { lang: "en", path: "/" },
  { lang: "fr", path: "/fr/" },
  { lang: "nl", path: "/nl/" },
  { lang: "de", path: "/de/" },
  { lang: "x-default", path: "/" },
];

export const RULES_CLUSTER = [
  { lang: "fr", path: "/rules/tock" },
  { lang: "nl", path: "/rules/keezen" },
  { lang: "de", path: "/rules/dog" },
  { lang: "en", path: "/rules/pegs-and-jokers" },
  { lang: "x-default", path: "/rules/pegs-and-jokers" },
];

export const OG_LOCALE = {
  en: "en_US",
  fr: "fr_FR",
  nl: "nl_NL",
  de: "de_DE",
};

/** Chemin de la landing correspondant à une langue. */
export const LANDING_PATH = {
  en: "/",
  fr: "/fr/",
  nl: "/nl/",
  de: "/de/",
};

/** Chemin de la page de règles correspondant à une langue. */
export const RULES_PATH = {
  en: "/rules/pegs-and-jokers",
  fr: "/rules/tock",
  nl: "/rules/keezen",
  de: "/rules/dog",
};

/** Nom du jeu dans chaque langue — sert aux libellés de navigation. */
export const GAME_NAME = {
  en: "Pegs and Jokers",
  fr: "Tock",
  nl: "Keezen",
  de: "Dog",
};

/**
 * Définition canonique de l'entité, traduite mais rigoureusement identique sur
 * le fond. Elle ouvre chaque page : c'est la répétition d'une définition stable
 * qui permet à un modèle de langue de résoudre « Mercury » comme une entité et
 * de relier entre eux les quatre noms du jeu.
 */
export const ENTITY_SENTENCE = {
  en: `<strong>Mercury</strong> is a free online multiplayer version of the card-and-marble race game known as <strong>Tock</strong> in France, <strong>Keezen</strong> in the Netherlands, <strong>Dog</strong> in Germany and Switzerland, and <strong>Pegs and Jokers</strong> in North America. Four players, four marbles each, a 54-card deck instead of dice.`,
  fr: `<strong>Mercury</strong> est une version en ligne gratuite et multijoueur du jeu de parcours en cartes et billes connu sous le nom de <strong>Tock</strong> en France, <strong>Keezen</strong> aux Pays-Bas, <strong>Dog</strong> en Allemagne et en Suisse, et <strong>Pegs and Jokers</strong> en Amérique du Nord. Quatre joueurs, quatre billes chacun, un jeu de 54 cartes à la place du dé.`,
  nl: `<strong>Mercury</strong> is een gratis online multiplayerversie van het kaart- en knikkerspel dat <strong>Tock</strong> heet in Frankrijk, <strong>Keezen</strong> in Nederland, <strong>Dog</strong> in Duitsland en Zwitserland, en <strong>Pegs and Jokers</strong> in Noord-Amerika. Vier spelers, vier pionnen elk, 54 speelkaarten in plaats van een dobbelsteen.`,
  de: `<strong>Mercury</strong> ist eine kostenlose Online-Multiplayer-Version des Karten- und Murmelspiels, das in Frankreich <strong>Tock</strong>, in den Niederlanden <strong>Keezen</strong>, in Deutschland und der Schweiz <strong>Dog</strong> und in Nordamerika <strong>Pegs and Jokers</strong> heißt. Vier Spieler, je vier Murmeln, 54 Spielkarten statt eines Würfels.`,
};

/** Version courte et sans balisage de la définition, pour les JSON-LD. */
export const ENTITY_PLAIN = {
  en: "Mercury is a free online multiplayer version of the card-and-marble race game known as Tock in France, Keezen in the Netherlands, Dog in Germany and Switzerland, and Pegs and Jokers in North America. Every game seats exactly 4 players and uses a 54-card deck instead of dice.",
  fr: "Mercury est une version en ligne gratuite et multijoueur du jeu de parcours en cartes et billes connu sous le nom de Tock en France, Keezen aux Pays-Bas, Dog en Allemagne et en Suisse, et Pegs and Jokers en Amérique du Nord. Chaque partie réunit exactement 4 joueurs et se joue avec 54 cartes à la place d'un dé.",
  nl: "Mercury is een gratis online multiplayerversie van het kaart- en knikkerspel dat Tock heet in Frankrijk, Keezen in Nederland, Dog in Duitsland en Zwitserland, en Pegs and Jokers in Noord-Amerika. Elke partij telt precies 4 spelers en wordt gespeeld met 54 kaarten in plaats van een dobbelsteen.",
  de: "Mercury ist eine kostenlose Online-Multiplayer-Version des Karten- und Murmelspiels, das in Frankreich Tock, in den Niederlanden Keezen, in Deutschland und der Schweiz Dog und in Nordamerika Pegs and Jokers heißt. Jede Partie wird zu genau 4 Spielern gespielt und verwendet 54 Karten statt eines Würfels.",
};

/** Tous les noms du jeu — `alternateName` du schema VideoGame. */
export const ALTERNATE_NAMES = [
  "Tock",
  "Toc",
  "Jeu du Toc",
  "Keezen",
  "Keezenspel",
  "Dog",
  "Brändi Dog",
  "Pegs and Jokers",
  "Jokers and Marbles",
];

export const url = (path) => `${SITE_URL}${path}`;
