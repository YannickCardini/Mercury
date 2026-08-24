import { renderRules, rulesPage } from "../lib/rules-layout.mjs";

const FAQ = [
  {
    q: "Wie viele Spieler braucht man für Dog?",
    a: "Dog wird traditionell zu 4, 6 oder 8 Spielern gespielt, je nach Spielbrett. Auf Mercury spielt ihr immer zu genau 4 Spielern, standardmäßig in zwei Zweierteams.",
  },
  {
    q: "Was ist der Unterschied zwischen Dog und Mensch ärgere dich nicht?",
    a: "Dog und Mensch ärgere dich nicht gehen beide auf das indische Brettspiel Pachisi zurück. Der Unterschied liegt im Antrieb der Züge: Bei Dog bewegt ihr eure Murmeln mit einem Blatt aus 54 Karten samt Jokern, bei Mensch ärgere dich nicht mit einem Würfel. Dog bietet deshalb in jedem Zug deutlich mehr taktische Entscheidungen.",
  },
  {
    q: "Mit welchen Karten kann man eine Murmel einsetzen?",
    a: "Bei Dog dürfen nur ein Ass, ein König oder ein Joker eine Murmel auf das Startfeld setzen. Keine andere Karte erlaubt das Einsetzen.",
  },
  {
    q: "Kann man bei Dog rückwärts ziehen?",
    a: "Ja. Die 4 ist bei Dog die einzige Karte, die rückwärts zieht: Damit setzt ihr eine Murmel um vier Felder zurück.",
  },
];

const HOW_TO_STEPS = [
  "Ihr spielt reihum eine Karte aus eurer Hand.",
  "Mit einem Ass, einem König oder einem Joker setzt ihr eine Murmel auf euer Startfeld.",
  "Landet ihr auf der Murmel eines Gegners, wird diese zurück auf ihr Startfeld geschickt.",
  "Sobald eure Murmel das Startfeld passiert hat, darf sie ins Ziel einlaufen: dafür müsst ihr exakt auf einem freien Feld landen.",
  "Habt ihr keine spielbare Karte, legt ihr eure Hand ab und wartet auf die nächste Austeilung.",
];

const SECTIONS = `<section class="rp-section">
        <h2>Was ist Dog?</h2>
        <p>
          Dog gehört zur großen Familie der Lauf- und Wettspiele, die vom indischen <strong>Pachisi</strong>
          abstammen, genau wie "Mensch ärgere dich nicht". Der Unterschied: Statt eines Würfels bewegt ihr eure
          Murmeln mit einem Kartenspiel, was dem Spiel deutlich mehr Taktik verleiht. In der Schweiz wurde die
          heute bekannte Form 1982 populär, als Christine Trösch das Spiel aus Kanada mitbrachte. In anderen
          Ländern ist dasselbe Spiel unter anderen Namen bekannt: <strong>Tock</strong> in Frankreich,
          <strong>Keezen</strong> in den Niederlanden.
        </p>
        <p>
          Ziel des Spiels: alle 4 eigenen Murmeln vom Startfeld über das Spielfeld ins eigene
          <strong>Ziel</strong> bringen, bevor es die Gegner schaffen.
        </p>
      </section>

      <section class="rp-section">
        <h2>Spielvorbereitung</h2>
        <ul>
          <li>Auf Mercury wird immer zu genau <strong>4 Spielern</strong> gespielt, jeder mit 4 Murmeln in einer
            eigenen Farbe.</li>
          <li>Gespielt wird mit <strong>54 Karten</strong> (ein komplettes 52er-Kartenspiel plus 2 Joker).</li>
          <li>Jede:r Spieler:in erhält <strong>13 Karten</strong>, verteilt auf 3 Runden zu 5, 4 und 4 Karten; pro
            Zyklus bleiben 2 Karten in Reserve.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>Spielablauf</h2>
        <ol>
          <li>Ihr spielt reihum <strong>eine Karte</strong> aus eurer Hand.</li>
          <li>Mit einem <strong>Ass</strong>, einem <strong>König</strong> oder einem <strong>Joker</strong> setzt
            ihr eine Murmel auf euer Startfeld.</li>
          <li>Landet ihr auf der Murmel eines Gegners, wird diese zurück auf ihr Startfeld geschickt.</li>
          <li>Sobald eure Murmel das Startfeld passiert hat, darf sie ins Ziel einlaufen: dafür müsst ihr
            <em>exakt</em> auf einem freien Feld landen.</li>
          <li>Habt ihr keine spielbare Karte, legt ihr eure Hand ab und wartet auf die nächste Austeilung.</li>
        </ol>
      </section>

      <section class="rp-section">
        <h2>Was jede Karte bewirkt</h2>
        <div class="rp-table-scroll">
          <table class="rp-table">
            <caption>Kartenwert und Effekt auf eure Murmeln</caption>
            <thead>
              <tr>
                <th scope="col">Karte</th>
                <th scope="col">Effekt</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Ass</td><td>Murmel einsetzen, oder 1 Feld vorwärts.</td></tr>
              <tr><td>König</td><td>Murmel einsetzen, oder 13 Felder vorwärts.</td></tr>
              <tr><td>Dame</td><td>12 Felder vorwärts.</td></tr>
              <tr><td>Bube</td><td>Zwei Murmeln unterschiedlicher Farbe tauschen (Team-Modus).</td></tr>
              <tr><td>7</td><td>7 Schritte aufteilen: zuerst die eigene Murmel, der Rest darf zur Murmel des
                Partners gehen.</td></tr>
              <tr><td>4</td><td>4 Felder rückwärts.</td></tr>
              <tr><td>2 bis 10</td><td>Eine Murmel um den auf der Karte stehenden Wert vorwärts.</td></tr>
              <tr><td>Joker</td><td>Murmel einsetzen oder 18 Felder vorwärts, danach sofort noch einmal
                spielen.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rp-section">
        <h2>Die wichtigsten Sonderregeln</h2>
        <ul>
          <li><strong>Frisch eingesetzte Murmel:</strong> Eine Murmel, die gerade erst auf dem Startfeld eingesetzt
            wurde (mit Ass oder König), ist vollständig geschützt: Sie blockiert den Weg und kann weder überholt
            noch geschlagen, getauscht oder zurückgesetzt werden. Sobald sie vorwärts zieht, entfällt der Schutz
            endgültig.</li>
          <li><strong>Einschränkung beim Buben:</strong> Ein Tausch mit einer Murmel, die bereits im Ziel steht,
            ist nicht erlaubt.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>Der Team-Modus: 2 gegen 2</h2>
        <p>
          Auf Mercury spielt ihr standardmäßig in zwei Teams zu je zwei Spielern, die sich gegenübersitzen:
          <strong>Rot &amp; Blau</strong> gegen <strong>Grün &amp; Orange</strong>. Euer Team gewinnt, sobald ihr
          beide, du und dein Partner, alle 4 Murmeln im Ziel habt.
        </p>
        <h3>Zusammenspiel im Team</h3>
        <ul>
          <li>Stehen alle 4 eigenen Murmeln im Ziel, spielt ihr weiter: Eure Karten steuern dann die Murmeln eures
            <strong>Partners</strong>.</li>
          <li>Bei einer <strong>7</strong> müsst ihr zuerst eure eigene Murmel ziehen; die restlichen Schritte
            dürft ihr danach an die Murmel eures Partners geben.</li>
          <li>Mit einem <strong>Buben</strong> dürft ihr zwei Murmeln unterschiedlicher Farbe tauschen, ohne dass
            eine eigene Murmel beteiligt sein muss.</li>
          <li><strong>Rettung bei blockierter Hand:</strong> Habt ihr selbst keinen gültigen Zug, aber ein Ass,
            einen König oder einen Joker auf der Hand, hat euer Partner noch Murmeln in Reserve und ist dessen
            Startfeld frei, <strong>müsst</strong> ihr diese Karte spielen, um seine Murmel einzusetzen: Ablegen
            ist dann nicht erlaubt.</li>
        </ul>
        <h3>Was gleich bleibt</h3>
        <ul>
          <li>Keine Teamimmunität: Landet ihr auf der Murmel eures Partners, wird diese genau wie bei einem Gegner
            zurückgeschickt.</li>
          <li>Eine frisch eingesetzte Murmel bleibt gegenüber allen geschützt, auch gegenüber dem eigenen Partner.</li>
        </ul>
      </section>`;

export default rulesPage("de", () =>
  renderRules({
    lang: "de",
    title: "Dog Spielregeln: Murmeln & Karten einfach erklärt | Mercury",
    description:
      "Die kompletten Dog-Spielregeln: Vorbereitung, Kartenwerte, 2-gegen-2-Teammodus. Jetzt kostenlos online Dog spielen auf Mercury.",
    eyebrow: "Spielregeln",
    h1: "Dog Spielregeln: das Karten- und Murmelspiel",
    lede: `Dog, in der Schweiz oft <strong>Brändi Dog</strong> genannt, ist ein Brettspiel für 4 Spieler, bei dem ihr
      eure Murmeln mit Spielkarten statt mit einem Würfel über das Spielfeld bewegt. Hier findet ihr die
      vollständigen Spielregeln sowie die genaue Umsetzung in <strong>Mercury</strong>, der kostenlosen
      Online-Version des Spiels.`,
    sections: SECTIONS,
    namesHeading: "Dog in anderen Ländern",
    namesIntro:
      "Dog ist der im deutschsprachigen Raum gebräuchliche Name eines Karten- und Murmelspiels, das in mehreren Ländern unter einem eigenen Namen gespielt wird. Die oben beschriebenen Regeln gelten für alle vier Varianten.",
    faqHeading: "Häufig gestellte Fragen",
    faq: FAQ,
    howToName: "Wie spielt man Dog?",
    howToSteps: HOW_TO_STEPS,
    playLink: "Dog kostenlos online spielen",
    note: `Dasselbe Spiel gibt es auch unter den Namen
      <a href="/rules/tock">Tock</a> (Frankreich), <a href="/rules/keezen">Keezen</a> (Niederlande) und
      <a href="/rules/pegs-and-jokers">Pegs and Jokers</a> (englischsprachige Länder).`,
  }),
);
