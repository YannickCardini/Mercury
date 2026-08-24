import { renderRules, rulesPage } from "../lib/rules-layout.mjs";

const FAQ = [
  {
    q: "How many players do you need for Pegs and Jokers?",
    a: "Pegs and Jokers is traditionally played by 4, 6 or 8 players depending on the board. On Mercury, every game seats exactly 4 players, split by default into two teams of 2.",
  },
  {
    q: "What is the difference between Pegs and Jokers and Ludo or Parcheesi?",
    a: "Pegs and Jokers, Ludo and Parcheesi all descend from the Indian race game Pachisi. The difference is what drives the moves: Pegs and Jokers uses a 54-card deck including jokers, while Ludo and Parcheesi are played with a die. Pegs and Jokers therefore offers far more tactical choice on every turn.",
  },
  {
    q: "Which cards let you bring a marble into play?",
    a: "In Pegs and Jokers, only an Ace, a King or a Joker lets you enter a marble onto your starting square. No other card allows it.",
  },
  {
    q: "Can you move backwards in Pegs and Jokers?",
    a: "Yes. The 4 is the only card in Pegs and Jokers that moves backwards: it sends one marble four spaces back.",
  },
];

const HOW_TO_STEPS = [
  "On your turn, play one card from your hand.",
  "Playing an Ace, a King or a Joker lets you enter a marble onto your starting square.",
  "Landing on an opponent's marble sends it back to its starting box.",
  "Once your marble is past your starting square, it can enter your home lane: you must land exactly on a free slot to get in.",
  "If no card in your hand allows a legal move, discard your hand and wait for the next deal.",
];

const SECTIONS = `<section class="rp-section">
        <h2>What is Pegs and Jokers?</h2>
        <p>
          Pegs and Jokers belongs to the same family of race games descended from the Indian game
          <strong>Pachisi</strong>, the same family as Sorry! or Ludo. Its twist: instead of a die, you move your
          <strong>marbles</strong> using a deck of <strong>playing cards</strong>, trading pure luck for real
          tactical decisions on every turn. Its exact origin is debated: some accounts trace it to the early
          20th-century United States, others date the modern ruleset closer to the 1970s. The same game goes by
          different names elsewhere: <strong>Tock</strong> in France, <strong>Keezen</strong> in the Netherlands,
          <strong>Dog</strong> in Germany and Switzerland.
        </p>
        <p>
          The goal: get all 4 of your marbles from their starting box, around the board, and into your
          <strong>home lane</strong> before your opponents do.
        </p>
      </section>

      <section class="rp-section">
        <h2>Setup</h2>
        <ul>
          <li>Mercury always seats exactly <strong>4 players</strong>, each with 4 marbles in their own color.</li>
          <li>The game uses a <strong>54-card deck</strong> (a standard 52-card deck plus 2 jokers).</li>
          <li>Each player is dealt <strong>13 cards</strong>, split across 3 rounds of 5, 4, and 4 cards; 2 cards
            stay in reserve each cycle.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>How a Turn Works</h2>
        <ol>
          <li>On your turn, you play <strong>one card</strong> from your hand.</li>
          <li>Playing an <strong>Ace</strong>, a <strong>King</strong>, or a <strong>Joker</strong> lets you enter a
            marble onto your starting square.</li>
          <li>Landing on an opponent's marble sends it back to its starting box.</li>
          <li>Once your marble is past your starting square, it can enter your home lane: you must land
            <em>exactly</em> on a free slot to get in.</li>
          <li>If no card in your hand allows a legal move, you discard your hand and wait for the next deal.</li>
        </ol>
      </section>

      <section class="rp-section">
        <h2>What Each Card Does</h2>
        <div class="rp-table-scroll">
          <table class="rp-table">
            <caption>Card value and its effect on your marbles</caption>
            <thead>
              <tr>
                <th scope="col">Card</th>
                <th scope="col">Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Ace</td><td>Enter a marble, or move forward 1 space.</td></tr>
              <tr><td>King</td><td>Enter a marble, or move forward 13 spaces.</td></tr>
              <tr><td>Queen</td><td>Move forward 12 spaces.</td></tr>
              <tr><td>Jack</td><td>Swap any two marbles of different colors (team mode).</td></tr>
              <tr><td>7</td><td>Split 7 steps: your own marble moves first, the rest may go to your teammate's.</td></tr>
              <tr><td>4</td><td>Move backward 4 spaces.</td></tr>
              <tr><td>2 to 10</td><td>Move one marble forward by the number of spaces shown.</td></tr>
              <tr><td>Joker</td><td>Enter a marble or move forward 18 spaces, then play again immediately.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rp-section">
        <h2>Key Rules to Know</h2>
        <ul>
          <li><strong>Freshly entered marble:</strong> a marble that has just entered on its starting square (via an
            Ace or King) is fully protected: it blocks passage and cannot be passed, captured, swapped, or moved
            backward. Once it moves forward, that protection is lifted for good.</li>
          <li><strong>Jack restriction:</strong> you can never swap with a marble that is already in a home lane.</li>
        </ul>
      </section>

      <section class="rp-section">
        <h2>2v2 Team Mode</h2>
        <p>
          On Mercury, the default mode pits two teams of two players against each other, sitting across from their
          partner: <strong>Red &amp; Blue</strong> versus <strong>Green &amp; Orange</strong>. Your team wins once
          both you and your partner have all 4 marbles home.
        </p>
        <h3>Playing as a Team</h3>
        <ul>
          <li>Once all 4 of your marbles are home, you keep playing: your cards now control your
            <strong>teammate's</strong> marbles instead.</li>
          <li>With a <strong>7</strong>, you must move one of your own marbles first; the remaining steps may then
            go to one of your teammate's marbles.</li>
          <li>With a <strong>Jack</strong>, you can swap any two marbles of different colors, and your own marble
            doesn't have to be involved.</li>
          <li><strong>Blocked-hand rescue:</strong> if you have no legal move but hold an Ace, King, or Joker, your
            teammate still has marbles in reserve, and their starting square is free, you <strong>must</strong> play
            that card to bring their marble in. Discarding is not allowed.</li>
        </ul>
        <h3>What Doesn't Change</h3>
        <ul>
          <li>No team immunity: landing on your teammate's marble captures it too, sending it back to its starting
            box just like an opponent's.</li>
          <li>A freshly entered marble stays protected from everyone, including your own teammate.</li>
        </ul>
      </section>`;

export default rulesPage("en", () =>
  renderRules({
    lang: "en",
    title: "Pegs and Jokers Rules: How to Play (Cards & Marbles) | Mercury",
    description:
      "Complete Pegs and Jokers rules (aka Tock): setup, card values, 2v2 team mode. Play free online right now on Mercury, no download needed.",
    eyebrow: "Game rules",
    h1: "Pegs and Jokers Rules: the Card &amp; Marble Race Game",
    lede: `Pegs and Jokers is a race game for 4 players where you move marbles around a board using playing cards
      instead of dice. Below are the complete rules, and exactly how they're implemented in
      <strong>Mercury</strong>, the free online version of the game.`,
    sections: SECTIONS,
    namesHeading: "Pegs and Jokers around the world",
    namesIntro:
      "Pegs and Jokers is the North American name of a card-and-marble race game played under its own name in several countries. The rules described above apply to all four variants.",
    faqHeading: "Frequently Asked Questions",
    faq: FAQ,
    howToName: "How to play Pegs and Jokers",
    howToSteps: HOW_TO_STEPS,
    playLink: "Play Pegs and Jokers online for free",
    note: `This same game is also known as
      <a href="/rules/tock">Tock</a> (France), <a href="/rules/keezen">Keezen</a> (Netherlands), and
      <a href="/rules/dog">Dog</a> (Germany/Switzerland).`,
  }),
);
