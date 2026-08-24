import { renderRules, rulesPage } from "../lib/rules-layout.mjs";

const FAQ = [
  {
    q: "Met hoeveel spelers speel je Keezen?",
    a: "Keezen wordt van oudsher met 2 tot 8 spelers gespeeld, afhankelijk van het bord. Op Mercury telt elke partij precies 4 spelers, standaard verdeeld in twee teams van 2.",
  },
  {
    q: "Wat is het verschil tussen Keezen en Mens erger je niet?",
    a: "Keezen en Mens erger je niet zijn allebei afgeleid van het Indiase bordspel Pachisi. Het verschil zit in de manier van verzetten: bij Keezen gebruik je een spel van 54 kaarten, jokers inbegrepen, terwijl Mens erger je niet met een dobbelsteen wordt gespeeld. Daardoor heb je bij Keezen elke beurt veel meer tactische keuze.",
  },
  {
    q: "Welke kaarten mag je gebruiken om een pion in te zetten?",
    a: "Bij Keezen kun je alleen met een Aas, een Heer of een Joker een pion vanaf je startvak inzetten. Geen enkele andere kaart geeft dat recht.",
  },
  {
    q: "Kun je bij Keezen ook achteruit spelen?",
    a: "Ja. De 4 is bij Keezen de enige kaart die achteruit gaat: je zet er één pion vier vakken mee terug.",
  },
];

const HOW_TO_STEPS = [
  "Op jouw beurt speel je één kaart uit je hand.",
  "Met een Aas, een Heer of een Joker zet je een pion in vanaf je startvak.",
  "Land je op de pion van een tegenstander, dan gaat die terug naar zijn startvak.",
  "Voorbij je startvak mag je pion de thuisbasis in: daarvoor moet je precies op een vrij vak uitkomen.",
  "Kun je met geen enkele kaart een geldige zet doen, dan leg je je hand weg en wacht je de volgende deelronde af.",
];

const SECTIONS = `<section class="rp-section">
        <h2>Wat is Keezen?</h2>
        <p>
          Keezen is een echt <strong>oud-Hollands</strong> bordspel: er bestaan al verwijzingen naar het spel in
          teksten uit de 15<sup>e</sup> en 16<sup>e</sup> eeuw. De naam komt van "kezen", een verbastering van het
          Franse woord <em>caisse</em> ("kist"), naar de kist waarin de pionnen werden bewaard. Net als
          Mens-erger-je-niet stamt Keezen af van het Indiase <strong>Pachisi</strong>, maar in plaats van een
          dobbelsteen gebruik je een set speelkaarten, wat het spel veel tactischer maakt. Hetzelfde spel bestaat
          in andere landen onder een andere naam: <strong>Tock</strong> in Frankrijk, <strong>Dog</strong> in
          Duitsland en Zwitserland. In Nederland is Keezen nog altijd populair; sinds 2012 wordt er zelfs jaarlijks
          een Nederlands kampioenschap Keezen georganiseerd.
        </p>
        <p>
          Het doel: al je 4 pionnen vanaf de start over het bord naar je <strong>thuisbasis</strong> brengen, vóór
          je tegenstanders.
        </p>
      </section>

      <section class="rp-section">
        <h2>Opstelling</h2>
        <ul>
          <li>Op Mercury speel je altijd met exact <strong>4 spelers</strong>, elk met 4 pionnen in een eigen kleur.</li>
          <li>Er wordt gespeeld met <strong>54 kaarten</strong> (een volledig kaartspel van 52 kaarten plus 2 jokers).</li>
          <li>Elke speler krijgt <strong>13 kaarten</strong>, verdeeld over 3 rondes van 5, 4 en 4 kaarten; per cyclus
            blijven 2 kaarten in reserve.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>Verloop van een beurt</h2>
        <ol>
          <li>Op jouw beurt speel je <strong>één kaart</strong> uit je hand.</li>
          <li>Met een <strong>Aas</strong>, een <strong>Heer</strong> of een <strong>Joker</strong> zet je een pion
            in vanaf je startvak.</li>
          <li>Land je op de pion van een tegenstander, dan gaat die terug naar zijn startvak.</li>
          <li>Voorbij je startvak mag je pion de thuisbasis in: daarvoor moet je <em>precies</em> op een vrij vak
            uitkomen.</li>
          <li>Kun je met geen enkele kaart een geldige zet doen, dan leg je je hand weg en wacht je de volgende
            deelronde af.</li>
        </ol>
      </section>

      <section class="rp-section">
        <h2>Wat elke kaart doet</h2>
        <div class="rp-table-scroll">
          <table class="rp-table">
            <caption>Kaartwaarde en het effect op je pionnen</caption>
            <thead>
              <tr>
                <th scope="col">Kaart</th>
                <th scope="col">Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Aas</td><td>Pion inzetten, of 1 vak vooruit.</td></tr>
              <tr><td>Heer</td><td>Pion inzetten, of 13 vakken vooruit.</td></tr>
              <tr><td>Vrouw</td><td>12 vakken vooruit.</td></tr>
              <tr><td>Boer</td><td>Wissel twee pionnen van verschillende kleur (teammodus).</td></tr>
              <tr><td>7</td><td>7 stappen te verdelen: eerst je eigen pion, de rest mag naar de pion van je
                maatje.</td></tr>
              <tr><td>4</td><td>4 vakken achteruit.</td></tr>
              <tr><td>2 t/m 10</td><td>Eén pion het aantal vakken vooruit dat op de kaart staat.</td></tr>
              <tr><td>Joker</td><td>Pion inzetten of 18 vakken vooruit, en daarna meteen nog een keer spelen.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rp-section">
        <h2>Belangrijke spelregels</h2>
        <ul>
          <li><strong>Vers ingezette pion:</strong> een pion die net is ingezet op het startvak (met een Aas of
            Heer) is volledig beschermd: hij blokkeert de doorgang en kan niet gepasseerd, geslagen, gewisseld of
            teruggezet worden. Zodra hij één stap vooruit gaat, vervalt de bescherming definitief.</li>
          <li><strong>Beperking van de Boer:</strong> je mag nooit wisselen met een pion die al in een thuisbasis
            staat.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>De teammodus: 2 tegen 2</h2>
        <p>
          Op Mercury speel je standaard met twee teams van twee spelers, tegenover elkaar gezeten:
          <strong>Rood &amp; Blauw</strong> tegen <strong>Groen &amp; Oranje</strong>. Jouw team wint zodra jij én je
          maatje allebei je 4 pionnen thuis hebben.
        </p>
        <h3>Samen spelen als team</h3>
        <ul>
          <li>Staan al je 4 pionnen thuis? Dan blijf je meespelen: je kaarten sturen dan de pionnen van je
            <strong>maatje</strong> aan.</li>
          <li>Met een <strong>7</strong> moet je eerst je eigen pion zetten; de overige stappen mag je daarna aan een
            pion van je maatje geven.</li>
          <li>Met een <strong>Boer</strong> mag je twee pionnen van verschillende kleur wisselen, zonder dat een van
            je eigen pionnen erbij betrokken hoeft te zijn.</li>
          <li><strong>Redding bij een geblokkeerde hand:</strong> heb je zelf geen geldige zet, maar heb je een Aas,
            Heer of Joker op de hand, staat je maatje nog met pionnen in reserve en is zijn startvak vrij, dan
            <strong>moet</strong> je die kaart spelen om zijn pion in te zetten: weggooien mag niet.</li>
        </ul>
        <h3>Wat hetzelfde blijft</h3>
        <ul>
          <li>Geen teamimmuniteit: land je op de pion van je maatje, dan wordt die net als bij een tegenstander
            teruggestuurd naar zijn startvak.</li>
          <li>Een vers ingezette pion blijft beschermd tegen iedereen, ook tegen je eigen maatje.</li>
        </ul>
      </section>`;

export default rulesPage("nl", () =>
  renderRules({
    lang: "nl",
    title: "Keezen spelregels: hoe speel je Keezenspel? | Mercury",
    description:
      "Alle Keezen spelregels op een rij: opstelling, kaartwaarden, teamvariant 2 tegen 2. Speel Keezen nu gratis online op Mercury.",
    eyebrow: "Spelregels",
    h1: "Keezen spelregels: het oud-Hollandse kaart- en knikkerspel",
    lede: `Keezen, ook wel <strong>Keezenspel</strong> genoemd, is een bordspel voor 4 spelers waarbij je je pionnen
      over het bord verplaatst met speelkaarten in plaats van een dobbelsteen. Hieronder vind je de volledige
      spelregels, en hoe ze precies worden toegepast in <strong>Mercury</strong>, de gratis online versie van het
      spel.`,
    sections: SECTIONS,
    namesHeading: "Keezen in andere landen",
    namesIntro:
      "Keezen is de Nederlandse naam van een kaart- en knikkerspel dat in verschillende landen onder een eigen naam wordt gespeeld. De spelregels hierboven gelden voor alle vier de varianten.",
    faqHeading: "Veelgestelde vragen",
    faq: FAQ,
    howToName: "Hoe speel je Keezen?",
    howToSteps: HOW_TO_STEPS,
    playLink: "Keezen gratis online spelen",
    note: `Hetzelfde spel bestaat ook onder de namen
      <a href="/rules/tock">Tock</a> (Frankrijk), <a href="/rules/dog">Dog</a>
      (Duitsland/Zwitserland) en <a href="/rules/pegs-and-jokers">Pegs and Jokers</a> (Engelstalige landen).`,
  }),
);
