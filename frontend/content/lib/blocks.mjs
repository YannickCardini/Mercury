/**
 * Blocs de contenu partagés par les 8 pages, en 4 langues.
 *
 * Les deux tableaux ci-dessous sont volontairement répétés sur *toutes* les
 * pages : le tableau est le format le plus fidèlement extrait et cité par les
 * moteurs de réponse IA, et la répétition d'un même ensemble de faits sur
 * l'ensemble du site est ce qui rend l'entité « Mercury / Tock / Keezen / Dog /
 * Pegs and Jokers » résolvable pour un modèle.
 */

import { PLAY_STORE_URL, APP_PATH, RULES_PATH } from "./site.mjs";

/** Libellés d'interface (navigation, pieds de page, boutons). */
export const UI = {
  en: {
    play: "Play online",
    rules: "Game rules",
    playCta: "Play now",
    resume: "Resume your game",
    updated: "Updated on",
    languages: "Language",
    otherNames: "Also known as",
    privacy: "Privacy policy",
    legal: "Legal",
    contact: "Contact",
    contactDialogTitle: "Contact",
    contactDialogBody:
      "For any question, feedback or issue about Mercury, send an email to the address below, it goes directly to the developer.",
    contactClose: "Close",
    android: "Android app",
    androidCta: "Download for Android",
    androidSub: "Free on Google Play",
    breadcrumbHome: "Home",
    breadcrumbRules: "Rules",
    tocLabel: "On this page",
  },
  fr: {
    play: "Jouer en ligne",
    rules: "Règles du jeu",
    playCta: "Jouer maintenant",
    resume: "Reprendre la partie",
    updated: "Mis à jour le",
    languages: "Langue",
    otherNames: "Aussi appelé",
    privacy: "Politique de confidentialité",
    legal: "Légal",
    contact: "Contact",
    contactDialogTitle: "Contact",
    contactDialogBody:
      "Pour toute question, retour ou problème concernant Mercury, envoyez un e-mail à l'adresse ci-dessous, il arrive directement au développeur.",
    contactClose: "Fermer",
    android: "Application Android",
    androidCta: "Télécharger sur Android",
    androidSub: "Gratuit sur Google Play",
    breadcrumbHome: "Accueil",
    breadcrumbRules: "Règles",
    tocLabel: "Sur cette page",
  },
  nl: {
    play: "Online spelen",
    rules: "Spelregels",
    playCta: "Speel nu",
    resume: "Ga verder met je partij",
    updated: "Bijgewerkt op",
    languages: "Taal",
    otherNames: "Ook bekend als",
    privacy: "Privacybeleid",
    legal: "Juridisch",
    contact: "Contact",
    contactDialogTitle: "Contact",
    contactDialogBody:
      "Voor vragen, feedback of problemen over Mercury stuur je een e-mail naar onderstaand adres, die komt rechtstreeks bij de ontwikkelaar terecht.",
    contactClose: "Sluiten",
    android: "Android-app",
    androidCta: "Download voor Android",
    androidSub: "Gratis in Google Play",
    breadcrumbHome: "Home",
    breadcrumbRules: "Spelregels",
    tocLabel: "Op deze pagina",
  },
  de: {
    play: "Online spielen",
    rules: "Spielregeln",
    playCta: "Jetzt spielen",
    resume: "Partie fortsetzen",
    updated: "Aktualisiert am",
    languages: "Sprache",
    otherNames: "Auch bekannt als",
    privacy: "Datenschutz",
    legal: "Rechtliches",
    contact: "Kontakt",
    contactDialogTitle: "Kontakt",
    contactDialogBody:
      "Bei Fragen, Feedback oder Problemen zu Mercury schreibt einfach eine E-Mail an die untenstehende Adresse, sie geht direkt an den Entwickler.",
    contactClose: "Schließen",
    android: "Android-App",
    androidCta: "Für Android herunterladen",
    androidSub: "Kostenlos bei Google Play",
    breadcrumbHome: "Startseite",
    breadcrumbRules: "Regeln",
    tocLabel: "Auf dieser Seite",
  },
};

/** Libellés natifs des 4 langues, pour le sélecteur. */
export const LANG_LABEL = {
  en: "English",
  fr: "Français",
  nl: "Nederlands",
  de: "Deutsch",
};

const LANG_FLAG = { en: "🇬🇧", fr: "🇫🇷", nl: "🇳🇱", de: "🇩🇪" };

// ─── Tableau canonique : un jeu, quatre noms ────────────────────────────────

const NAMES_TABLE = {
  en: {
    caption: "The same game under its different names",
    head: ["Name", "Where it is played", "Also written"],
    rows: [
      ["Tock", "France, Québec", "Toc, Jeu du Toc"],
      ["Keezen", "Netherlands", "Keezenspel"],
      ["Dog", "Germany, Switzerland", "Brändi Dog"],
      ["Pegs and Jokers", "United States, Canada", "Pegs &amp; Jokers, Jokers and Marbles"],
    ],
  },
  fr: {
    caption: "Le même jeu sous ses différents noms",
    head: ["Nom", "Où l'on y joue", "Autres graphies"],
    rows: [
      ["Tock", "France, Québec", "Toc, jeu du Toc"],
      ["Keezen", "Pays-Bas", "Keezenspel"],
      ["Dog", "Allemagne, Suisse", "Brändi Dog"],
      ["Pegs and Jokers", "États-Unis, Canada", "Pegs &amp; Jokers, Jokers and Marbles"],
    ],
  },
  nl: {
    caption: "Hetzelfde spel onder zijn verschillende namen",
    head: ["Naam", "Waar het gespeeld wordt", "Ook geschreven als"],
    rows: [
      ["Tock", "Frankrijk, Québec", "Toc, jeu du Toc"],
      ["Keezen", "Nederland", "Keezenspel"],
      ["Dog", "Duitsland, Zwitserland", "Brändi Dog"],
      ["Pegs and Jokers", "Verenigde Staten, Canada", "Pegs &amp; Jokers, Jokers and Marbles"],
    ],
  },
  de: {
    caption: "Dasselbe Spiel unter seinen verschiedenen Namen",
    head: ["Name", "Wo es gespielt wird", "Auch geschrieben"],
    rows: [
      ["Tock", "Frankreich, Québec", "Toc, jeu du Toc"],
      ["Keezen", "Niederlande", "Keezenspel"],
      ["Dog", "Deutschland, Schweiz", "Brändi Dog"],
      ["Pegs and Jokers", "USA, Kanada", "Pegs &amp; Jokers, Jokers and Marbles"],
    ],
  },
};

/** Chaque nom renvoie vers la page de règles rédigée dans cette langue. */
const NAME_TO_LANG = {
  Tock: "fr",
  Keezen: "nl",
  Dog: "de",
  "Pegs and Jokers": "en",
};

export function namesTable(lang) {
  const t = NAMES_TABLE[lang];
  const head = t.head.map((h) => `<th scope="col">${h}</th>`).join("");
  const rows = t.rows
    .map(([name, where, alias]) => {
      const target = RULES_PATH[NAME_TO_LANG[name]];
      const cell = `<a href="${target}">${name}</a>`;
      return `<tr><td>${cell}</td><td>${where}</td><td>${alias}</td></tr>`;
    })
    .join("\n        ");
  return `<table class="rp-table">
        <caption>${t.caption}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>
        ${rows}
        </tbody>
      </table>`;
}

// ─── Tableau canonique : cartes contre dé ───────────────────────────────────
//
// Le jeu de comparaison retenu par langue est toujours un jeu *de dé* de la
// même famille (Pachisi). Sorry! est volontairement exclu : ce jeu se joue
// lui aussi avec des cartes, la comparaison serait fausse.

const VS_TABLE = {
  en: {
    caption: "Pegs and Jokers compared with Ludo and Parcheesi",
    them: "Ludo, Parcheesi",
    rows: [
      ["What moves your pieces", "A 54-card deck (52 cards + 2 jokers)", "A single die"],
      ["Your decision each turn", "Which card to play, and which marble to move with it", "Only which marble to move with the number rolled"],
      ["Getting a marble out", "An Ace, a King or a Joker", "Rolling a 6"],
      ["Special moves", "Jack swaps two marbles · 4 moves backwards · 7 splits across marbles · Joker moves 18 and plays again", "None"],
      ["Teams", "2 v 2 by default: once your 4 marbles are home, your cards move your partner's", "Usually every player for themselves"],
      ["Players", "Exactly 4 on Mercury", "2 to 4"],
    ],
  },
  fr: {
    caption: "Le Tock comparé au jeu des petits chevaux",
    them: "Petits chevaux",
    rows: [
      ["Ce qui fait avancer", "Un jeu de 54 cartes (52 cartes + 2 jokers)", "Un dé"],
      ["Votre décision à chaque tour", "Quelle carte jouer, et quelle bille déplacer avec", "Seulement quelle bille avancer du nombre tiré"],
      ["Faire sortir une bille", "Un As, un Roi ou un Joker", "Faire un 6"],
      ["Coups spéciaux", "Le Valet échange deux billes · le 4 recule · le 7 se répartit · le Joker avance de 18 et rejoue", "Aucun"],
      ["Équipes", "2 contre 2 par défaut : vos 4 billes arrivées, vos cartes jouent celles de votre partenaire", "Chacun pour soi le plus souvent"],
      ["Joueurs", "Exactement 4 sur Mercury", "2 à 4"],
    ],
  },
  nl: {
    caption: "Keezen vergeleken met Mens erger je niet",
    them: "Mens erger je niet",
    rows: [
      ["Wat je pionnen beweegt", "Een spel van 54 kaarten (52 kaarten + 2 jokers)", "Eén dobbelsteen"],
      ["Je keuze per beurt", "Welke kaart je speelt, én welke pion je ermee verzet", "Alleen welke pion je met de geworpen waarde verzet"],
      ["Een pion inzetten", "Een Aas, een Heer of een Joker", "Een 6 gooien"],
      ["Bijzondere zetten", "De Boer wisselt twee pionnen · de 4 gaat achteruit · de 7 verdeel je · de Joker gaat 18 vooruit en speelt opnieuw", "Geen"],
      ["Teams", "Standaard 2 tegen 2: staan je 4 pionnen thuis, dan sturen je kaarten die van je maatje aan", "Meestal ieder voor zich"],
      ["Spelers", "Op Mercury precies 4", "2 tot 4"],
    ],
  },
  de: {
    caption: "Dog im Vergleich zu Mensch ärgere dich nicht",
    them: "Mensch ärgere dich nicht",
    rows: [
      ["Was die Figuren bewegt", "Ein Spiel mit 54 Karten (52 Karten + 2 Joker)", "Ein Würfel"],
      ["Eure Entscheidung pro Zug", "Welche Karte ihr spielt und welche Murmel ihr damit zieht", "Nur welche Figur ihr um die gewürfelte Zahl zieht"],
      ["Eine Murmel einsetzen", "Ein Ass, ein König oder ein Joker", "Eine 6 würfeln"],
      ["Sonderzüge", "Der Bube tauscht zwei Murmeln · die 4 zieht rückwärts · die 7 wird aufgeteilt · der Joker zieht 18 und spielt erneut", "Keine"],
      ["Teams", "Standardmäßig 2 gegen 2: sind eure 4 Murmeln im Ziel, steuern eure Karten die des Partners", "Meist jeder für sich"],
      ["Spieler", "Auf Mercury genau 4", "2 bis 4"],
    ],
  },
};

const US_LABEL = {
  en: "Pegs and Jokers (Tock, Keezen, Dog)",
  fr: "Tock (Keezen, Dog, Pegs and Jokers)",
  nl: "Keezen (Tock, Dog, Pegs and Jokers)",
  de: "Dog (Tock, Keezen, Pegs and Jokers)",
};

export function vsTable(lang) {
  const t = VS_TABLE[lang];
  const rows = t.rows
    .map(([label, us, them]) => `<tr><td>${label}</td><td>${us}</td><td>${them}</td></tr>`)
    .join("\n        ");
  return `<table class="rp-table rp-table--vs">
        <caption>${t.caption}</caption>
        <thead><tr><th scope="col"></th><th scope="col">${US_LABEL[lang]}</th><th scope="col">${t.them}</th></tr></thead>
        <tbody>
        ${rows}
        </tbody>
      </table>`;
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

/**
 * Rend la FAQ visible à partir des mêmes objets `{ q, a }` que le JSON-LD :
 * la règle de Google impose que le texte balisé soit strictement celui affiché,
 * et un texte identique des deux côtés est aussi ce qui se cite le mieux.
 */
export function faqSection(items) {
  return items
    .map(
      (item) => `<details class="rp-faq">
        <summary>${item.q}</summary>
        <p>${item.a}</p>
      </details>`,
    )
    .join("\n      ");
}

// ─── Appel à l'action ───────────────────────────────────────────────────────

/**
 * Le bouton « reprendre » n'est révélé que si le navigateur a une partie en
 * cours. Les crawlers n'ont pas de localStorage : ils voient toujours la page
 * complète, jamais une redirection.
 */
export function ctaBlock(lang) {
  const t = UI[lang];
  return `<p class="rp-actions">
      <a class="rp-cta" href="${APP_PATH}">${t.playCta}</a>
      <a class="rp-resume" id="rp-resume" href="${APP_PATH}" hidden>${t.resume}</a>
    </p>`;
}

// ─── Chrome : sélecteur de langue et pied de page ───────────────────────────

export function langSwitch(lang, cluster) {
  const links = cluster
    .filter((alt) => alt.lang !== "x-default")
    .map((alt) => {
      const active = alt.lang === lang ? ' class="rls-link active" aria-current="page"' : ' class="rls-link"';
      return `<a href="${alt.path}" hreflang="${alt.lang}" lang="${alt.lang}"${active}><span class="rls-flag" aria-hidden="true">${LANG_FLAG[alt.lang]}</span>${LANG_LABEL[alt.lang]}</a>`;
    })
    .join("\n        ");
  return `<nav class="rls-switch" aria-label="${UI[lang].languages}">
        ${links}
      </nav>`;
}

/** Adresse de contact, identique à celle affichée dans la modale « À propos » de l'app (home.page.html). */
const CONTACT_EMAIL = "yannick.cardini@gmail.com";

/**
 * Overlay de contact, ouverte par le bouton "Contact" du footer via
 * `<dialog>` natif pas de framework de modale nécessaire pour une seule
 * boîte par page. `showModal()`/`close()` sont supportés par tous les
 * navigateurs modernes ; le contenu (adresse en clair + lien mailto) reste
 * lisible même par un crawler qui n'exécute pas ce script.
 */
function contactDialog(lang) {
  const t = UI[lang];
  return `<dialog id="rp-contact-dialog" class="rp-dialog">
      <form method="dialog" class="rp-dialog-card">
        <button type="submit" class="rp-dialog-close" aria-label="${t.contactClose}">✕</button>
        <h2>${t.contactDialogTitle}</h2>
        <p>${t.contactDialogBody}</p>
        <a class="rp-dialog-email" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
      </form>
    </dialog>
    <script>
      (function () {
        var d = document.getElementById('rp-contact-dialog');
        var openers = document.querySelectorAll('[data-open-contact]');
        for (var i = 0; i < openers.length; i++) {
          openers[i].addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof d.showModal === 'function') d.showModal();
          });
        }
      })();
    </script>`;
}

/**
 * Pied de page commun. Le sélecteur de langue en haut de chaque page (voir
 * `langSwitch`) couvre déjà la navigation entre les 4 landings, donc le
 * footer se concentre sur ce qu'il n'y a nulle part ailleurs : contact,
 * confidentialité, et le maillage vers les 4 pages de règles les 3 autres
 * que l'anglaise n'étaient jusqu'ici liées par rien.
 */
export function footer(lang) {
  const t = UI[lang];
  const rules = ["fr", "nl", "de", "en"]
    .map(
      (l) =>
        `<li><a href="${RULES_PATH[l]}" hreflang="${l}" lang="${l}">${{ fr: "Tock", nl: "Keezen", de: "Dog", en: "Pegs and Jokers" }[l]
        }</a></li>`,
    )
    .join("");
  return `<footer class="rp-footer">
    <div class="rp-footer-cols">
      <div>
        <h2>${t.legal}</h2>
        <ul>
          <li><a href="mailto:${CONTACT_EMAIL}" data-open-contact>${t.contact}</a></li>
          <li><a href="/privacy">${t.privacy}</a></li>
        </ul>
      </div>
      <div>
        <h2>${t.rules}</h2>
        <ul>${rules}</ul>
      </div>
      <div>
        <h2>Mercury</h2>
        <ul>
          <li><a href="${APP_PATH}">${t.play}</a></li>
          <li><a href="${PLAY_STORE_URL}" rel="noopener">${t.android}</a></li>
        </ul>
      </div>
    </div>
    ${contactDialog(lang)}
  </footer>`;
}
