import { renderRules, rulesPage } from "../lib/rules-layout.mjs";

const FAQ = [
  {
    q: "Combien de joueurs faut-il pour jouer au Tock ?",
    a: "Le Tock se joue traditionnellement à 2, 4 ou 6 joueurs selon le plateau utilisé. Sur Mercury, chaque partie réunit exactement 4 joueurs, répartis par défaut en deux équipes de 2.",
  },
  {
    q: "Le Tock se joue-t-il obligatoirement en équipe ?",
    a: "Non, il existe une variante du Tock où chaque joueur joue pour lui-même. Sur Mercury, le mode par défaut est le mode équipes 2 contre 2, mais l'effet des cartes reste identique dans les deux cas.",
  },
  {
    q: "Quelle est la différence entre le Tock et le jeu des petits chevaux ?",
    a: "Le Tock et le jeu des petits chevaux appartiennent à la même famille de jeux de parcours dérivés du Pachisi indien. La différence tient au moteur de déplacement : le Tock se joue avec un jeu de 54 cartes, jokers inclus, là où les petits chevaux se jouent avec un dé. Le Tock ouvre donc beaucoup plus de choix tactiques à chaque tour.",
  },
  {
    q: "Quelles cartes permettent de faire sortir une bille ?",
    a: "Au Tock, l'As, le Roi et le Joker permettent de faire entrer une bille sur sa case de départ. Aucune autre carte ne le permet.",
  },
];

const HOW_TO_STEPS = [
  "À votre tour, jouez une seule carte de votre main.",
  "Jouer un As, un Roi ou un Joker permet de faire entrer une bille sur votre case de départ.",
  "Une bille qui atterrit sur une bille adverse la capture : celle-ci retourne dans sa case de départ.",
  "Une fois votre case de départ dépassée, votre bille peut entrer dans votre maison : il faut tomber exactement sur une case libre pour y accéder.",
  "Si aucune carte de votre main ne permet un coup légal, défaussez votre main et attendez la prochaine donne.",
];

const SECTIONS = `<section class="rp-section">
        <h2>Qu'est-ce que le Tock ?</h2>
        <p>
          Le Tock appartient à la grande famille des jeux de parcours dérivés du <strong>Pachisi</strong> indien, au
          même titre que le jeu des petits chevaux. Sa particularité : au lieu d'avancer ses pions grâce à un dé, on
          avance ses <strong>billes</strong> grâce à un jeu de <strong>cartes</strong>, ce qui remplace le hasard pur
          par de vrais choix tactiques à chaque tour. L'origine exacte du jeu reste discutée : certaines sources le
          rattachent au Poitou, exporté au Canada par les colons du XIX<sup>e</sup> siècle, d'autres pensent l'inverse.
          On le retrouve en tout cas aujourd'hui sous des noms différents selon les pays : <strong>Keezen</strong> aux Pays-Bas,
          <strong>Dog</strong> en Allemagne et en Suisse, ou <strong>Pegs and Jokers</strong> dans les pays anglophones.
        </p>
        <p>
          Le but du jeu : faire sortir vos 4 billes de leur case de départ, leur faire parcourir le plateau, puis les
          amener dans votre <strong>maison</strong> (la colonne d'arrivée) avant vos adversaires.
        </p>
      </section>

      <section class="rp-section">
        <h2>Mise en place</h2>
        <ul>
          <li>Le jeu se joue à <strong>4 joueurs</strong> exactement sur Mercury, chacun disposant de 4 billes d'une
            couleur.</li>
          <li>Le jeu utilise un jeu de <strong>54 cartes</strong> (52 cartes classiques + 2 jokers).</li>
          <li>Chaque joueur reçoit <strong>13 cartes</strong>, distribuées en 3 donnes successives de 5, 4 puis 4
            cartes ; 2 cartes restent en réserve à chaque cycle.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>Déroulement d'un tour</h2>
        <ol>
          <li>À votre tour, vous jouez <strong>une seule carte</strong> de votre main.</li>
          <li>Jouer un <strong>As</strong>, un <strong>Roi</strong> ou un <strong>Joker</strong> permet de faire
            entrer une bille sur votre case de départ.</li>
          <li>Une bille qui atterrit sur une bille adverse la capture : celle-ci retourne dans sa case de départ.</li>
          <li>Une fois votre case de départ dépassée, votre bille peut entrer dans votre maison : il faut tomber
            <em>exactement</em> sur une case libre pour y accéder.</li>
          <li>Si aucune carte de votre main ne permet un coup légal, vous défaussez votre main et attendez la
            prochaine donne.</li>
        </ol>
      </section>

      <section class="rp-section">
        <h2>L'effet de chaque carte</h2>
        <div class="rp-table-scroll">
          <table class="rp-table">
            <caption>Valeur de chaque carte et effet sur vos billes</caption>
            <thead>
              <tr>
                <th scope="col">Carte</th>
                <th scope="col">Effet</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>As</td><td>Faire entrer une bille, ou avancer d'1 case.</td></tr>
              <tr><td>Roi</td><td>Faire entrer une bille, ou avancer de 13 cases.</td></tr>
              <tr><td>Dame</td><td>Avancer de 12 cases.</td></tr>
              <tr><td>Valet</td><td>Échanger deux billes de couleurs différentes (mode équipes).</td></tr>
              <tr><td>7</td><td>7 pas à répartir : d'abord sur votre propre bille, le reste peut aller à celle de
                votre partenaire.</td></tr>
              <tr><td>4</td><td>Reculer de 4 cases.</td></tr>
              <tr><td>2 à 10</td><td>Avancer une bille du nombre de cases indiqué sur la carte.</td></tr>
              <tr><td>Joker</td><td>Faire entrer une bille ou avancer de 18 cases, puis rejouer immédiatement.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rp-section">
        <h2>Les règles clés à connaître</h2>
        <ul>
          <li><strong>Bille fraîchement entrée :</strong> une bille qui vient d'entrer sur sa case de départ (via un
            As ou un Roi) est totalement protégée : elle bloque le passage et ne peut être ni doublée, ni capturée,
            ni échangée, ni reculée. Dès qu'elle avance, la protection disparaît définitivement.</li>
          <li><strong>Restriction du Valet :</strong> il est impossible d'échanger une bille avec une bille déjà
            arrivée dans une maison.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>Le mode équipes 2 contre 2</h2>
        <p>
          Sur Mercury, le mode par défaut oppose deux équipes de deux joueurs assis face à face :
          <strong>Rouge &amp; Bleu</strong> contre <strong>Vert &amp; Orange</strong>. Votre équipe gagne quand vous
          et votre partenaire avez chacun vos 4 billes arrivées dans votre maison.
        </p>
        <h3>Jouer en équipe</h3>
        <ul>
          <li>Une fois vos 4 billes arrivées, vous continuez à jouer : vos cartes contrôlent alors les billes de
            votre <strong>partenaire</strong>.</li>
          <li>Avec un <strong>7</strong>, vous devez d'abord avancer une de vos propres billes ; les pas restants
            peuvent ensuite être donnés à une bille de votre partenaire.</li>
          <li>Avec un <strong>Valet</strong>, vous pouvez échanger deux billes de couleurs différentes, sans que l'une
            des vôtres soit forcément impliquée.</li>
          <li><strong>Sauvetage main bloquée :</strong> si vous n'avez aucun coup légal mais tenez un As, un Roi ou un
            Joker, que votre partenaire a encore des billes en réserve et que sa case de départ est libre, vous
            <strong>devez</strong> jouer cette carte pour faire entrer sa bille : la défausse n'est pas autorisée.</li>
        </ul>
        <h3>Ce qui ne change pas</h3>
        <ul>
          <li>Aucune immunité d'équipe : atterrir sur la bille de votre partenaire la capture, exactement comme
            celle d'un adversaire.</li>
          <li>Une bille fraîchement entrée reste protégée face à tout le monde, y compris votre partenaire.</li>
        </ul>
      </section>`;

export default rulesPage("fr", () =>
  renderRules({
    lang: "fr",
    title: "Règles du Tock : comment jouer aux cartes et aux billes | Mercury",
    description:
      "Règles complètes du Tock (ou Toc) : mise en place, effet de chaque carte, mode équipes 2 contre 2. Jouez gratuitement en ligne sur Mercury.",
    eyebrow: "Règles du jeu",
    h1: "Règles du Tock (ou Toc) : le jeu de cartes et de billes",
    lede: `Le Tock, parfois orthographié <strong>Toc</strong>, est un jeu de parcours pour 4 joueurs où l'on fait
      avancer ses billes autour d'un plateau en jouant des cartes plutôt qu'en lançant un dé. Voici les règles
      complètes, ainsi que la façon dont elles sont appliquées dans <strong>Mercury</strong>, la version en ligne
      gratuite du jeu.`,
    sections: SECTIONS,
    namesHeading: "Le Tock ailleurs dans le monde",
    namesIntro:
      "Le Tock n'est pas un jeu français isolé : c'est le nom français d'un jeu de parcours en cartes et billes joué sous d'autres noms dans plusieurs pays. Les règles décrites ci-dessus valent pour les quatre variantes.",
    faqHeading: "Questions fréquentes",
    faq: FAQ,
    howToName: "Comment jouer au Tock",
    howToSteps: HOW_TO_STEPS,
    playLink: "Jouer au Tock en ligne, gratuitement",
    note: `Ce même jeu existe aussi sous les noms
      <a href="/rules/keezen">Keezen</a> (Pays-Bas), <a href="/rules/dog">Dog</a> (Allemagne/Suisse) et
      <a href="/rules/pegs-and-jokers">Pegs and Jokers</a> (pays anglophones).`,
  }),
);
