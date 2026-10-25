/**
 * Plateau animé des landings « jouer », en tête de la feuille sous le pli :
 * une partie à quatre qui tourne en boucle.
 *
 * C'est un fichier SVG externe (www/content/board.svg), affiché par un
 * <img loading="lazy"> :
 *   - il ne pèse rien dans le HTML que lisent les robots, et le navigateur ne
 *     le demande qu'à l'approche du pli ;
 *   - sa place est réservée par les attributs width/height de l'<img> : la
 *     page ne bouge pas quand il arrive ;
 *   - l'animation est entièrement en CSS, avec des @keyframes calculées ici
 *     au build. Un SVG chargé comme image n'exécute pas de script : rien ne
 *     tourne sur le thread principal de la page ;
 *   - sous prefers-reduced-motion, le plateau reste figé sur une position de
 *     milieu de partie (celle des attributs transform).
 *
 * La géométrie et la chorégraphie viennent du plateau de petits chevaux fourni
 * par le propriétaire le 2026-10-25 : une croix vue en isométrie, 32 cases de
 * parcours, 4 couloirs d'arrivée et 4 maisons. Les pions y deviennent des
 * billes aux couleurs des sièges de Mercury (le jaune devient orange) et le
 * plateau prend le charbon du site. Les couleurs sont lues dans tokens.css,
 * comme la feuille de style des pages (voir styles.mjs).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** URL publique du fichier, et son chemin sous www/. */
export const BOARD_DEMO_PATH = "/content/board.svg";
export const BOARD_DEMO_FILE = "content/board.svg";

/** Cadre du dessin : le plateau, sa tranche et une marge de 2 unités. */
const VIEW = { x: 0, y: 14, width: 382, height: 246 };

/** Dimensions intrinsèques, reprises par l'<img> pour réserver sa place. */
export const BOARD_DEMO_SIZE = { width: VIEW.width * 2, height: VIEW.height * 2 };

const TOKENS = readFileSync(
  fileURLToPath(new URL("../../src/app/styles/tokens.css", import.meta.url)),
  "utf8",
);

/** Valeur d'un token du :root de base (la nuit, déclarée en premier). */
function token(name) {
  const value = TOKENS.match(new RegExp(`--m-${name}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`board-demo : --m-${name} introuvable dans tokens.css`);
  return value;
}

// ─── Géométrie ──────────────────────────────────────────────────────────────

/** Le plateau : un rectangle arrondi projeté en losange. */
const BOARD_TRANSFORM = "rotate(151.35)scale(1 .88862)skewX(24.64)";
const BOARD_RECT = { x: -102.3, y: -350.33, width: 213.91, height: 230.1, r: 12 };

/** Inclinaison des trous, et leurs demi-axes. */
const HOLE_TILT = 13;
const HOLE_RX = 8.8;
const HOLE_RY = 6.3;

/**
 * Centre des 44 cases, numérotées comme dans le fichier d'origine pour que la
 * chorégraphie reste lisible. Le parcours tourne dans le sens
 * 3 → 2 → 1 → 4 → 7 → 17 … 11 → 9 → 6 → 3.
 */
const CELLS = {
  1: [276.7, 98.4], 2: [258.5, 84.4], 3: [239.2, 70.5], 4: [260.9, 110.8],
  5: [242.6, 96.8], 6: [223.4, 82.8], 7: [244.1, 123.2], 8: [225.8, 109.2],
  9: [206.6, 95.2], 10: [205.7, 119.3], 11: [187.1, 106.6], 12: [168.6, 93],
  13: [149.1, 79.3], 14: [278.8, 173.9], 15: [260.3, 161.2], 16: [241.8, 147.6],
  17: [222.3, 133.9], 18: [131.8, 66.7], 19: [168.7, 117.3], 20: [150.1, 103.7],
  21: [130.6, 90], 22: [260.3, 184.6], 23: [241.8, 172], 24: [223.3, 158.3],
  25: [203.8, 144.7], 26: [113.3, 77.4], 27: [169.6, 141.7], 28: [151.1, 129.1],
  29: [132.5, 115.4], 30: [113, 101.8], 31: [242.7, 196.3], 32: [224.2, 183.7],
  33: [205.7, 170], 34: [186.2, 156.4], 35: [95.7, 89.1], 36: [170.5, 171.5],
  37: [152.2, 157.6], 38: [132.9, 143.6], 39: [154.7, 183.9], 40: [136.4, 170],
  41: [117.1, 156], 42: [137.9, 196.3], 43: [119.6, 182.3], 44: [100.3, 168.3],
};

/** Par couleur : sa case de départ, son couloir d'arrivée, ses 4 maisons (h1 à h4). */
const SEATS = {
  red: {
    start: 1,
    lane: [5, 8, 10],
    homes: [[307.1, 142.7], [325.7, 133.8], [326.7, 156.4], [345.2, 147.5]],
  },
  green: {
    start: 18,
    lane: [21, 20, 19],
    homes: [[155, 44.2], [173.5, 35.3], [174.6, 57.9], [193.1, 49]],
  },
  orange: {
    start: 31,
    lane: [23, 24, 25],
    homes: [[174.5, 215.8], [193, 207], [194.1, 229.6], [212.6, 220.7]],
  },
  blue: {
    start: 44,
    lane: [40, 37, 27],
    homes: [[29.2, 121.3], [47.8, 112.4], [48.8, 134.9], [67.3, 126.1]],
  },
};

// ─── Chorégraphie ───────────────────────────────────────────────────────────

/** Les cinq billes qui bougent, et leur maison de départ (indice 0 à 3). */
const ACTORS = {
  r2: { color: "red", home: 1 },
  r3: { color: "red", home: 0 },
  g4: { color: "green", home: 0 },
  b4: { color: "blue", home: 2 },
  o1: { color: "orange", home: 3 },
};

/** Durées en ms : sortie de maison, capture, pause entre deux tours. */
const ENTRY = 1000;
const KNOCK = "knock";
const KNOCK_MS = 1100;
/** La bille capturée part quand l'autre a fait cette part de son dernier pas. */
const KNOCK_AT = 0.5;
const GAP = 350;

/**
 * Un tour : [rôle, durée d'un pas, ...destinations]. Une destination est un
 * numéro de case, ou "h1" à "h4" pour une maison de la couleur. Une capture
 * ([rôle, KNOCK, maison]) part pendant le dernier pas du tour précédent : la
 * bille touchée est éjectée au moment où l'autre arrive.
 *
 * Rôles : R joue les rouges, C est le rouge capturé, O l'orange, B le bleu,
 * G le vert. On y voit les gestes du jeu : sortie sur la case de départ,
 * recul de 4 (« 7, 4, 1, 2 »), captures en chaîne sur la case 11.
 */
const INTRO = [
  ["R", ENTRY, 1], ["O", ENTRY, 31], ["B", ENTRY, 44], ["G", ENTRY, 18],
  ["R", 600, 4, 7, 17], ["O", 700, 32], ["B", 400, 41, 38, 28, 29, 30, 35], ["G", 500, 13, 12, 11],
  ["R", 400, 7, 4, 1, 2], ["O", 700, 33], ["B", 400, 26, 18, 13, 12, 11], ["G", KNOCK, "h1"],
  ["R", 400, 3, 6, 9, 11], ["B", KNOCK, "h3"], ["O", 700, 34],
];

/** Une manche de la boucle. Les deux rouges échangent leur rôle à chaque manche. */
const ROUND = [
  ["R", ENTRY, 1], ["O", 700, 36], ["R", 600, 4, 7, 17], ["O", 400, 34, 33, 32, 31],
  ["B", ENTRY, 44], ["G", ENTRY, 18], ["R", 400, 7, 4, 1, 2], ["O", 700, 32],
  ["B", 400, 41, 38, 28, 29, 30, 35], ["G", 500, 13, 12, 11], ["C", KNOCK, "h1"],
  ["O", 700, 33], ["B", 400, 26, 18, 13, 12, 11], ["G", KNOCK, "h1"],
  ["R", 400, 3, 6, 9, 11], ["B", KNOCK, "h3"], ["O", 700, 34],
];

/** Image figée (mouvement réduit) : après la course du bleu dans la première manche. */
const STILL_AFTER_TURN = 8;

/** Hauteur du saut d'une bille, selon le geste. */
const LIFT = { step: 4.5, entry: 9, knock: 16 };

const EASE_MOVE = "cubic-bezier(.45,.05,.55,.95)";
const EASE_KNOCK = "cubic-bezier(.22,.61,.36,1)";
const EASE_UP = "cubic-bezier(.25,.46,.45,.94)";
const EASE_DOWN = "cubic-bezier(.55,.085,.68,.53)";

function homeOf(color, slot) {
  return SEATS[color].homes[slot];
}

/**
 * Joue une suite de tours à partir de `time` : met à jour `positions` et
 * renvoie les déplacements { actor, t0, t1, from, to, kind } et la fin de la
 * suite.
 */
function play(turns, roles, positions, time) {
  const moves = [];
  let cursor = time;
  let lastStep = null;

  for (const [role, ms, ...targets] of turns) {
    const actor = roles[role];
    const { color } = ACTORS[actor];
    const point = (target) =>
      typeof target === "number" ? CELLS[target] : homeOf(color, Number(target.slice(1)) - 1);

    if (ms === KNOCK) {
      const t0 = lastStep.t0 + (lastStep.t1 - lastStep.t0) * KNOCK_AT;
      const move = { actor, t0, t1: t0 + KNOCK_MS, from: positions[actor], to: point(targets[0]), kind: "knock" };
      moves.push(move);
      positions[actor] = move.to;
      cursor = Math.max(cursor, move.t1 + GAP);
    } else {
      let t = cursor;
      for (const target of targets) {
        const kind = ms === ENTRY ? "entry" : "step";
        lastStep = { actor, t0: t, t1: t + ms, from: positions[actor], to: point(target), kind };
        moves.push(lastStep);
        positions[actor] = lastStep.to;
        t += ms;
      }
      cursor = t + GAP;
    }
  }

  return { moves, end: cursor };
}

/** Rejoue l'intro puis deux manches, et vérifie que la boucle se referme. */
function choreography() {
  const positions = Object.fromEntries(
    Object.entries(ACTORS).map(([id, a]) => [id, homeOf(a.color, a.home)]),
  );
  const common = { O: "o1", B: "b4", G: "g4" };
  const firstRoles = { ...common, R: "r3", C: "r2" };

  const intro = play(INTRO, { ...common, R: "r2", C: "r3" }, positions, 0);
  const atLoop = { ...positions };
  const still = { ...atLoop };
  play(ROUND.slice(0, STILL_AFTER_TURN + 1), firstRoles, still, 0);
  const first = play(ROUND, firstRoles, positions, intro.end);
  const round = first.end - intro.end;
  const atHalf = { ...positions };
  const second = play(ROUND, { ...common, R: "r2", C: "r3" }, positions, first.end);

  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (const id of Object.keys(ACTORS)) {
    const red = ACTORS[id].color === "red";
    if (!same(red ? positions[id] : atHalf[id], atLoop[id]))
      throw new Error(`board-demo : la boucle ne se referme pas pour ${id}`);
  }

  return { intro, rounds: [...first.moves, ...second.moves], introMs: intro.end, round, atLoop, still };
}

// ─── Keyframes ──────────────────────────────────────────────────────────────

const num = (v) => String(+v.toFixed(1));
const pct = (t, period) => `${+((t / period) * 100).toFixed(3)}%`;
const at = ([x, y]) => `transform:translate(${num(x)}px,${num(y)}px)`;
const up = (h) => `transform:translateY(${h ? `-${h}px` : 0})`;

/**
 * Deux @keyframes pour une bille sur une période : la position (le groupe et
 * son ombre) et le saut (le groupe intérieur). Entre deux déplacements, la
 * bille reste en place.
 */
function keyframes(name, moves, start, period, origin) {
  const pos = [];
  const lift = [];
  // Deux images-clés au même instant (fin d'un pas, début du suivant) portent
  // la même valeur : la seconde, qui peut fixer la courbe, remplace la première.
  const add = (list, t, body) => {
    const key = pct(t, period);
    if (list.at(-1)?.[0] === key) list.pop();
    list.push([key, body]);
  };

  add(pos, 0, at(start));
  add(lift, 0, up(0));
  for (const m of moves) {
    const t0 = m.t0 - origin;
    const t1 = m.t1 - origin;
    const peak = t0 + (t1 - t0) * (m.kind === "knock" ? 0.45 : 0.5);
    add(pos, t0, at(m.from) + (m.kind === "knock" ? `;animation-timing-function:${EASE_KNOCK}` : ""));
    add(pos, t1, at(m.to));
    add(lift, t0, up(0));
    add(lift, peak, `${up(LIFT[m.kind])};animation-timing-function:${EASE_DOWN}`);
    add(lift, t1, up(0));
  }
  add(pos, period, at(moves.at(-1)?.to ?? start));
  add(lift, period, up(0));

  const css = (list) => list.map(([key, body]) => `${key}{${body}}`).join("");
  return `@keyframes ${name}-p{${css(pos)}}@keyframes ${name}-l{${css(lift)}}`;
}

/** Feuille de style du SVG : keyframes et pilotage, sous prefers-reduced-motion: no-preference. */
function animationCss(c) {
  const ms = (v) => `${Math.round(v)}ms`;
  const rules = [];
  const frames = [];

  for (const [id, actor] of Object.entries(ACTORS)) {
    const own = (list) => list.filter((m) => m.actor === id);
    const period = actor.color === "red" ? c.round * 2 : c.round;
    const loopMoves = own(c.rounds).filter((m) => m.t0 < c.introMs + period);
    const start = homeOf(actor.color, actor.home);

    frames.push(keyframes(`${id}i`, own(c.intro.moves), start, c.introMs, 0));
    frames.push(keyframes(`${id}b`, loopMoves, c.atLoop[id], period, c.introMs));

    const run = (part) =>
      `${id}i-${part} ${ms(c.introMs)} both,${id}b-${part} ${ms(period)} ${ms(c.introMs)} infinite`;
    rules.push(`.p-${id}{animation:${run("p")}}.l-${id}{animation:${run("l")}}`);
  }

  return `@media (prefers-reduced-motion:no-preference){${frames.join("")}${rules.join("")}.p{animation-timing-function:${EASE_MOVE}}.l{animation-timing-function:${EASE_UP}}}`;
}

// ─── Dessin ─────────────────────────────────────────────────────────────────

const use = (href, [x, y]) => `<use href="#${href}" x="${num(x)}" y="${num(y)}"/>`;

/** Une bille : tranche sombre, face, reflet crème. Son point de contact est l'origine. */
function marbleSymbol(color) {
  return `<g id="m-${color}"><circle cy="-3.3" r="6.1" fill="${token(`${color}-deep`)}"/><circle cx="-.5" cy="-4" r="5.3" fill="${token(color)}"/><ellipse cx="-2.3" cy="-6" rx="1.7" ry="1.15" transform="rotate(-30 -2.3 -6)" fill="${token("cream")}" fill-opacity=".7"/></g>`;
}

export function boardDemoSvg() {
  const c = choreography();
  const moving = new Map(
    Object.entries(ACTORS).map(([id, a]) => [`${a.color}-${a.home}`, id]),
  );

  // Billes immobiles : toutes les maisons non occupées par une bille qui bouge.
  const fixed = [];
  for (const [color, seat] of Object.entries(SEATS)) {
    seat.homes.forEach((point, slot) => {
      if (!moving.has(`${color}-${slot}`)) fixed.push({ color, point });
    });
  }
  fixed.sort((a, b) => a.point[1] - b.point[1]);

  const holes = [
    ...Object.values(CELLS),
    ...Object.values(SEATS).flatMap((s) => s.homes),
  ];

  const tints = Object.entries(SEATS)
    .map(
      ([color, seat]) =>
        `<g fill="${token(color)}" fill-opacity=".3">${[...seat.lane.map((n) => CELLS[n]), ...seat.homes]
          .map((p) => use("e", p))
          .join("")}</g>`,
    )
    .join("");

  const starts = Object.entries(SEATS)
    .map(([color, seat]) => `<g fill="${token(color)}" fill-opacity=".45" stroke="${token(`${color}-light`)}" stroke-width="1.1">${use("e", CELLS[seat.start])}</g>`)
    .join("");

  const ids = Object.keys(ACTORS);
  const place = ([x, y]) => `transform="translate(${num(x)} ${num(y)})"`;
  const shadows = [
    ...fixed.map((f) => use("s", f.point)),
    ...ids.map((id) => `<use href="#s" class="p p-${id}" ${place(c.still[id])}/>`),
  ].join("");
  const marbles = [
    ...fixed.map((f) => use(`m-${f.color}`, f.point)),
    ...ids.map(
      (id) =>
        `<g class="p p-${id}" ${place(c.still[id])}><g class="l l-${id}"><use href="#m-${ACTORS[id].color}"/></g></g>`,
    ),
  ].join("");

  const { x, y, width, height, r } = BOARD_RECT;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}" width="${BOARD_DEMO_SIZE.width}" height="${BOARD_DEMO_SIZE.height}">
<style>${animationCss(c)}</style>
<defs>
<rect id="board" x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" transform="${BOARD_TRANSFORM}"/>
<ellipse id="e" rx="${HOLE_RX}" ry="${HOLE_RY}" transform="rotate(${HOLE_TILT})"/>
<g id="h"><use href="#e" fill="#000" fill-opacity=".6"/><ellipse cy="1.2" rx="${HOLE_RX - 0.8}" ry="${HOLE_RY - 1.3}" transform="rotate(${HOLE_TILT})" fill="${token("paper-lo")}"/></g>
<ellipse id="s" cy=".6" rx="5.6" ry="2.4" fill="#000" fill-opacity=".35"/>
${Object.keys(SEATS).map(marbleSymbol).join("")}
</defs>
<use href="#board" y="6" fill="${token("paper-edge")}"/>
<use href="#board" y="3" fill="${token("paper-mid")}"/>
<use href="#board" fill="${token("paper-hi")}"/>
${holes.map((p) => use("h", p)).join("")}
${tints}${starts}
${shadows}
${marbles}
</svg>
`;
}
