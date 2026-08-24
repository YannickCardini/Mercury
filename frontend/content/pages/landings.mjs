/**
 * Les 4 pages d'atterrissage « jouer » — une par marché.
 *
 * Elles répondent à une intention transactionnelle ("toc en ligne", "play DOG
 * online", "Keezen online spelen", "Dog kostenlos spielen"), là où les pages
 * /rules/* répondent à une intention informationnelle. Les deux séries se
 * renvoient l'une vers l'autre dans chaque langue.
 *
 * Mise en page : à partir de ~960px, l'essentiel (titre, accroche, 4 points
 * clés, CTA) tient dans la hauteur d'écran sans scroll — voir
 * lib/landing-layout.mjs. Les tableaux et la FAQ complète restent sous le pli,
 * inchangés : rien n'est retiré, seule la répartition change.
 */

import { renderLandingPage } from "../lib/landing-layout.mjs";
import {
  LANDING_CLUSTER,
  LANDING_PATH,
  RULES_PATH,
  ENTITY_SENTENCE,
  APP_PATH,
  PLAY_STORE_URL,
} from "../lib/site.mjs";
import { organization, webSite, videoGame, faqPage } from "../lib/schema.mjs";

const CONTENT = {
  en: {
    title: "Play Pegs and Jokers Online Free — Tock, Keezen & Dog | Mercury",
    description:
      "Play Pegs and Jokers online free: the card and marble race game also called Tock, Keezen and Dog. 4 players, 2v2 teams, no download, no sign-up.",
    eyebrow: "Play online — free",
    h1: "Play Pegs and Jokers Online — Free, 4 Players, No Download",
    playCta: "Play now",
    resumeCta: "Resume your game →",
    facts: {
      players: "4 players, 2v2 teams by default",
      free: "100% free, no sign-up",
      platform: "Browser or Android",
    },
    highlights: [
      { icon: "🃏", text: "Ace, King or Joker brings a marble into play" },
      { icon: "🎯", text: "Land on a marble to send it back to start" },
      { icon: "🤝", text: "2v2 teams: help your partner once you're home" },
      { icon: "⚡", text: "No account needed — play as a guest right away" },
    ],
    headings: {
      names: "One game, four names",
      cards: "Cards instead of dice",
      free: "Free, no sign-up, browser or Android",
      faq: "Frequently asked questions",
    },
    moreLink: { path: RULES_PATH.en, text: "Read the full Pegs and Jokers rules" },
    namesIntro:
      "Tock, Keezen, Dog and Pegs and Jokers are four names for one and the same game. The board, the 54-card deck and the card effects are identical; only the name changes with the country. Mercury plays the same whichever name you know it by.",
    cardsIntro:
      "The whole family descends from the Indian race game Pachisi. What sets this branch apart is that a deck of playing cards replaces the die: you always choose both which card to play and which marble to move, so a bad draw is a problem to solve rather than a turn lost.",
    free: [
      "<strong>Free in full.</strong> No purchase, no subscription, nothing to unlock.",
      "<strong>No account required.</strong> You can start playing as a guest; signing in with Google only keeps your profile, stats and leaderboard place between sessions.",
      "<strong>No waiting.</strong> A game seats exactly 4 players, and bots take any seat still empty so a game can start right away.",
      `<strong>Browser or Android.</strong> Play in any modern browser, or install the <a href="${PLAY_STORE_URL}" rel="noopener">Android app</a>.`,
    ],
    faq: [
      {
        q: "Is Mercury free to play?",
        a: "Yes. Mercury is free to play in full: there is no purchase, no subscription and nothing to unlock. The game runs in any modern web browser, and a free Android app is available on Google Play.",
      },
      {
        q: "Do I need an account to play Pegs and Jokers online?",
        a: "No account is required to play Pegs and Jokers on Mercury. You can join a game as a guest straight from the home screen. Signing in with Google is optional and only serves to keep your profile, your statistics and your leaderboard position between sessions.",
      },
      {
        q: "How many players does a game of Pegs and Jokers need?",
        a: "Every game on Mercury seats exactly 4 players. By default those 4 players are split into two teams of 2, red and blue against green and orange. If not enough human players are waiting, bots take the remaining seats so the game starts without delay.",
      },
      {
        q: "Can I play Pegs and Jokers with friends?",
        a: "Yes. The Custom Game option on the Mercury home screen creates a private table and lets you invite the players you want to play with, instead of being matched with strangers.",
      },
      {
        q: "Is Pegs and Jokers the same game as Tock, Keezen and Dog?",
        a: "Yes. Pegs and Jokers, Tock, Keezen and Dog are four regional names for the same card-and-marble race game: Tock in France and Québec, Keezen in the Netherlands, Dog in Germany and Switzerland, Pegs and Jokers in the United States and Canada. The rules on Mercury are the same for all four.",
      },
    ],
  },

  fr: {
    title: "Jouer au Tock en ligne gratuitement — jeu de société | Mercury",
    description:
      "Jouez au Tock (ou Toc) en ligne, gratuitement et à 4, en équipes 2 contre 2. Le jeu de société de cartes et de billes, sans inscription ni téléchargement.",
    eyebrow: "Jouer en ligne — gratuit",
    h1: "Jouer au Tock en ligne, gratuitement et à 4",
    playCta: "Jouer maintenant",
    resumeCta: "Reprendre la partie →",
    facts: {
      players: "4 joueurs, équipes 2v2 par défaut",
      free: "100 % gratuit, sans inscription",
      platform: "Navigateur ou Android",
    },
    highlights: [
      { icon: "🃏", text: "As, Roi ou Joker fait entrer une bille en jeu" },
      { icon: "🎯", text: "Atterrir sur une bille la renvoie au départ" },
      { icon: "🤝", text: "Équipes 2v2 : aidez votre partenaire une fois arrivé" },
      { icon: "⚡", text: "Sans inscription — jouez en invité tout de suite" },
    ],
    headings: {
      names: "Un seul jeu, quatre noms",
      cards: "Des cartes à la place du dé",
      free: "Gratuit, sans inscription, sur navigateur ou Android",
      faq: "Questions fréquentes",
    },
    moreLink: { path: RULES_PATH.fr, text: "Lire les règles complètes du Tock" },
    namesIntro:
      "Tock, Keezen, Dog et Pegs and Jokers sont quatre noms d'un seul et même jeu. Le plateau, le jeu de 54 cartes et l'effet des cartes sont identiques ; seul le nom change selon le pays. Sur Mercury, on joue exactement au même jeu quel que soit le nom sous lequel vous le connaissez.",
    cardsIntro:
      "Toute cette famille descend du jeu de parcours indien Pachisi. Sa particularité : un jeu de cartes remplace le dé. À chaque tour, vous choisissez à la fois quelle carte jouer et quelle bille déplacer — une mauvaise pioche devient un problème à résoudre, pas un tour perdu.",
    free: [
      "<strong>Entièrement gratuit.</strong> Aucun achat, aucun abonnement, rien à débloquer.",
      "<strong>Sans inscription.</strong> Vous pouvez jouer en invité ; la connexion Google sert uniquement à conserver votre profil, vos statistiques et votre place au classement d'une session à l'autre.",
      "<strong>Sans attente.</strong> Une partie réunit exactement 4 joueurs, et des bots occupent les sièges encore libres pour que la partie démarre tout de suite.",
      `<strong>Navigateur ou Android.</strong> Jouez dans n'importe quel navigateur récent, ou installez l'<a href="${PLAY_STORE_URL}" rel="noopener">application Android</a>.`,
    ],
    faq: [
      {
        q: "Le Tock en ligne sur Mercury est-il vraiment gratuit ?",
        a: "Oui. Mercury est entièrement gratuit : aucun achat, aucun abonnement, rien à débloquer. Le jeu fonctionne dans tout navigateur récent, et une application Android gratuite est disponible sur Google Play.",
      },
      {
        q: "Faut-il créer un compte pour jouer au Tock en ligne ?",
        a: "Aucun compte n'est nécessaire pour jouer au Tock sur Mercury. Vous pouvez rejoindre une partie en invité depuis l'écran d'accueil. La connexion avec Google est facultative et sert uniquement à conserver votre profil, vos statistiques et votre place au classement d'une session à l'autre.",
      },
      {
        q: "Combien de joueurs faut-il pour une partie de Tock en ligne ?",
        a: "Chaque partie sur Mercury réunit exactement 4 joueurs. Par défaut, ces 4 joueurs sont répartis en deux équipes de 2, rouge et bleu contre vert et orange. Si les joueurs humains ne sont pas assez nombreux, des bots occupent les sièges restants pour que la partie démarre sans attendre.",
      },
      {
        q: "Peut-on jouer au Tock avec ses amis ?",
        a: "Oui. L'option Custom Game, sur l'écran d'accueil de Mercury, crée une table privée et permet d'inviter les joueurs de votre choix plutôt que d'être placé avec des inconnus.",
      },
      {
        q: "Le Tock, le Keezen, le Dog et le Pegs and Jokers sont-ils le même jeu ?",
        a: "Oui. Tock, Keezen, Dog et Pegs and Jokers sont quatre noms régionaux d'un même jeu de parcours en cartes et billes : Tock en France et au Québec, Keezen aux Pays-Bas, Dog en Allemagne et en Suisse, Pegs and Jokers aux États-Unis et au Canada. Tock et Toc sont par ailleurs deux orthographes du même mot. Sur Mercury, les règles sont identiques pour les quatre.",
      },
    ],
  },

  nl: {
    title: "Keezen online spelen — gratis, met 4 spelers | Mercury",
    description:
      "Speel Keezen gratis online met 4 spelers, standaard 2 tegen 2. Het kaart- en knikkerspel in je browser of op Android, zonder account en zonder download.",
    eyebrow: "Online spelen — gratis",
    h1: "Keezen online spelen — gratis en met 4 spelers",
    playCta: "Speel nu",
    resumeCta: "Ga verder met je partij →",
    facts: {
      players: "4 spelers, standaard 2v2-teams",
      free: "100% gratis, zonder account",
      platform: "Browser of Android",
    },
    highlights: [
      { icon: "🃏", text: "Aas, Heer of Joker zet een pion in" },
      { icon: "🎯", text: "Land op een pion en die gaat terug naar start" },
      { icon: "🤝", text: "2v2-teams: help je maatje zodra jij thuis bent" },
      { icon: "⚡", text: "Geen account nodig — speel meteen als gast" },
    ],
    headings: {
      names: "Eén spel, vier namen",
      cards: "Kaarten in plaats van een dobbelsteen",
      free: "Gratis, zonder account, in je browser of op Android",
      faq: "Veelgestelde vragen",
    },
    moreLink: { path: RULES_PATH.nl, text: "Lees de volledige Keezen spelregels" },
    namesIntro:
      "Tock, Keezen, Dog en Pegs and Jokers zijn vier namen voor één en hetzelfde spel. Het bord, het spel van 54 kaarten en de werking van de kaarten zijn identiek; alleen de naam verschilt per land. Op Mercury speel je hetzelfde spel, onder welke naam je het ook kent.",
    cardsIntro:
      "Deze hele familie stamt af van het Indiase loopspel Pachisi. Het verschil zit hem hierin: een kaartspel vervangt de dobbelsteen. Elke beurt kies je zowel welke kaart je speelt als welke pion je ermee verzet, waardoor een slechte hand een puzzel wordt in plaats van een verloren beurt.",
    free: [
      "<strong>Volledig gratis.</strong> Geen aankoop, geen abonnement, niets om vrij te spelen.",
      "<strong>Geen account nodig.</strong> Je kunt als gast spelen; inloggen met Google dient alleen om je profiel, je statistieken en je plek in de ranglijst te bewaren.",
      "<strong>Geen wachttijd.</strong> Een partij telt precies 4 spelers, en bots nemen de nog vrije plaatsen in zodat je meteen kunt beginnen.",
      `<strong>Browser of Android.</strong> Speel in elke moderne browser, of installeer de <a href="${PLAY_STORE_URL}" rel="noopener">Android-app</a>.`,
    ],
    faq: [
      {
        q: "Is Keezen online spelen op Mercury echt gratis?",
        a: "Ja. Mercury is volledig gratis: geen aankoop, geen abonnement en niets om vrij te spelen. Het spel draait in elke moderne browser, en er is een gratis Android-app beschikbaar in Google Play.",
      },
      {
        q: "Heb je een account nodig om Keezen online te spelen?",
        a: "Er is geen account nodig om Keezen op Mercury te spelen. Je kunt vanaf het startscherm als gast aan een partij deelnemen. Inloggen met Google is optioneel en dient alleen om je profiel, je statistieken en je positie in de ranglijst te bewaren.",
      },
      {
        q: "Met hoeveel spelers speel je een online partij Keezen?",
        a: "Elke partij op Mercury telt precies 4 spelers. Die 4 spelers worden standaard verdeeld in twee teams van 2: rood en blauw tegen groen en oranje. Zijn er niet genoeg menselijke spelers, dan nemen bots de resterende plaatsen in zodat de partij meteen begint.",
      },
      {
        q: "Kun je Keezen met vrienden spelen?",
        a: "Ja. Met de optie Custom Game op het startscherm van Mercury maak je een privétafel aan en nodig je de spelers uit die je zelf kiest, in plaats van gekoppeld te worden aan onbekenden.",
      },
      {
        q: "Zijn Keezen, Tock, Dog en Pegs and Jokers hetzelfde spel?",
        a: "Ja. Keezen, Tock, Dog en Pegs and Jokers zijn vier regionale namen voor hetzelfde kaart- en knikkerspel: Keezen in Nederland, Tock in Frankrijk en Québec, Dog in Duitsland en Zwitserland, Pegs and Jokers in de Verenigde Staten en Canada. Op Mercury gelden voor alle vier dezelfde spelregels.",
      },
    ],
  },

  de: {
    title: "Dog online spielen — kostenlos, zu viert | Mercury",
    description:
      "Spielt Dog kostenlos online zu viert, standardmäßig 2 gegen 2. Das Karten- und Murmelspiel im Browser oder auf Android, ohne Anmeldung und ohne Download.",
    eyebrow: "Online spielen — kostenlos",
    h1: "Dog online spielen — kostenlos und zu viert",
    playCta: "Jetzt spielen",
    resumeCta: "Partie fortsetzen →",
    facts: {
      players: "4 Spieler, standardmäßig 2v2-Teams",
      free: "100% kostenlos, ohne Anmeldung",
      platform: "Browser oder Android",
    },
    highlights: [
      { icon: "🃏", text: "Ass, König oder Joker setzt eine Murmel ein" },
      { icon: "🎯", text: "Landen auf einer Murmel schickt sie zurück zum Start" },
      { icon: "🤝", text: "2v2-Teams: helft eurem Partner, sobald ihr im Ziel seid" },
      { icon: "⚡", text: "Kein Konto nötig — sofort als Gast spielen" },
    ],
    headings: {
      names: "Ein Spiel, vier Namen",
      cards: "Karten statt Würfel",
      free: "Kostenlos, ohne Anmeldung, im Browser oder auf Android",
      faq: "Häufig gestellte Fragen",
    },
    moreLink: { path: RULES_PATH.de, text: "Die vollständigen Dog-Spielregeln lesen" },
    namesIntro:
      "Tock, Keezen, Dog und Pegs and Jokers sind vier Namen für ein und dasselbe Spiel. Spielfeld, das Blatt aus 54 Karten und die Wirkung der Karten sind identisch; nur der Name wechselt mit dem Land. Auf Mercury spielt ihr dasselbe Spiel, unter welchem Namen ihr es auch kennt.",
    cardsIntro:
      "Die ganze Familie stammt vom indischen Laufspiel Pachisi ab. Der Unterschied: Ein Kartenblatt ersetzt den Würfel. In jedem Zug entscheidet ihr sowohl, welche Karte ihr spielt, als auch, welche Murmel ihr damit zieht — ein schlechtes Blatt ist damit eine Aufgabe und kein verlorener Zug.",
    free: [
      "<strong>Vollständig kostenlos.</strong> Kein Kauf, kein Abo, nichts freizuschalten.",
      "<strong>Ohne Anmeldung.</strong> Ihr könnt als Gast spielen; die Anmeldung mit Google dient nur dazu, Profil, Statistiken und Platz in der Rangliste zu behalten.",
      "<strong>Ohne Wartezeit.</strong> Eine Partie hat genau 4 Plätze, und Bots übernehmen die noch freien, damit sofort gestartet werden kann.",
      `<strong>Browser oder Android.</strong> Spielt in jedem modernen Browser oder installiert die <a href="${PLAY_STORE_URL}" rel="noopener">Android-App</a>.`,
    ],
    faq: [
      {
        q: "Ist Dog online spielen auf Mercury wirklich kostenlos?",
        a: "Ja. Mercury ist vollständig kostenlos: kein Kauf, kein Abonnement und nichts freizuschalten. Das Spiel läuft in jedem modernen Browser, und im Google Play Store gibt es eine kostenlose Android-App.",
      },
      {
        q: "Braucht man ein Konto, um Dog online zu spielen?",
        a: "Für Dog auf Mercury wird kein Konto benötigt. Ihr könnt direkt vom Startbildschirm aus als Gast einer Partie beitreten. Die Anmeldung mit Google ist freiwillig und dient nur dazu, Profil, Statistiken und Ranglistenplatz über mehrere Sitzungen hinweg zu behalten.",
      },
      {
        q: "Wie viele Spieler braucht eine Online-Partie Dog?",
        a: "Jede Partie auf Mercury wird zu genau 4 Spielern gespielt. Diese 4 Spieler werden standardmäßig in zwei Zweierteams aufgeteilt: Rot und Blau gegen Grün und Orange. Sind nicht genug menschliche Spieler da, übernehmen Bots die freien Plätze, damit die Partie sofort beginnt.",
      },
      {
        q: "Kann man Dog mit Freunden spielen?",
        a: "Ja. Über die Option Custom Game auf dem Startbildschirm von Mercury erstellt ihr einen privaten Tisch und ladet gezielt die Mitspieler ein, mit denen ihr spielen wollt, statt zufällig zugeteilt zu werden.",
      },
      {
        q: "Sind Dog, Tock, Keezen und Pegs and Jokers dasselbe Spiel?",
        a: "Ja. Dog, Tock, Keezen und Pegs and Jokers sind vier regionale Namen für dasselbe Karten- und Murmelspiel: Dog in Deutschland und der Schweiz, Tock in Frankreich und Québec, Keezen in den Niederlanden, Pegs and Jokers in den USA und Kanada. Auf Mercury gelten für alle vier dieselben Regeln.",
      },
    ],
  },
};

function renderLanding(lang) {
  const c = CONTENT[lang];
  const h = c.headings;

  return renderLandingPage({
    lang,
    path: LANDING_PATH[lang],
    title: c.title,
    description: c.description,
    cluster: LANDING_CLUSTER,
    appPath: APP_PATH,
    jsonLd:
      lang === "en"
        ? [organization(), webSite(), videoGame(lang), faqPage(c.faq)]
        : [videoGame(lang), faqPage(c.faq)],
    eyebrow: c.eyebrow,
    h1: c.h1,
    lede: ENTITY_SENTENCE[lang],
    highlights: c.highlights,
    playCta: c.playCta,
    resumeCta: c.resumeCta,
    moreLink: c.moreLink,
    names: { heading: h.names, intro: c.namesIntro },
    compare: { heading: h.cards, intro: c.cardsIntro },
    faq: { heading: h.faq, items: c.faq },
    free: {
      heading: h.free,
      items: c.free,
      factPlayers: c.facts.players,
      factFree: c.facts.free,
      factPlatform: c.facts.platform,
    },
  });
}

export default ["en", "fr", "nl", "de"].map((lang) => ({
  lang,
  path: LANDING_PATH[lang],
  outFile: lang === "en" ? "content/en/index.html" : `content/${lang}/index.html`,
  cluster: LANDING_CLUSTER,
  render: () => renderLanding(lang),
}));
