import { JOKER_SUIT, JOKER_VALUE } from '@mercury/shared';
import { COURT_PATHS, JOKER_ART, RANK_PATHS, SUIT_PATHS } from './card-art.data';

/** Identifiant compact d'une carte : rang + enseigne (ex. `'2S'`, `'TH'`, `'KC'`) ou `'JOKER'`. */
export type CardId = string;

const RANK_CHAR_TO_NUM: Readonly<Record<string, number>> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13,
};
const SUIT_CHAR_TO_INDEX: Readonly<Record<string, number>> = { S: 0, H: 1, D: 2, C: 3 };

/** Traduit le modèle partagé (`Card.value`/`Card.suit`, ou leurs équivalents `string` widened) vers un identifiant de carte compact. */
export function toCardId(value: string, suit: string): CardId {
  if (value === JOKER_VALUE || suit === JOKER_SUIT) return 'JOKER';
  const rankChar = value === '10' ? 'T' : value;
  const suitChar = suit === '♠' ? 'S' : suit === '♥' ? 'H' : suit === '♦' ? 'D' : 'C';
  return rankChar + suitChar;
}

// ── Palette ──────────────────────────────────────────────────────────────────
// Rouge/noir alignés sur la palette du jeu (au lieu du #f00/#000 du POC).
const RED = '#dc2626';
const BLACK = '#0f172a';
/** Couleur par index d'enseigne (0=♠ 1=♥ 2=♦ 3=♣), pour les rangs et les pips. */
const SUIT_COLOR: readonly [string, string, string, string] = [BLACK, RED, RED, BLACK];

// ── Cadre de carte ───────────────────────────────────────────────────────────
const BORDER_COLOR = '#444';
const BORDER_WIDTH = 1;
const CARD_FILL = '#fff';
const CORNER_RADIUS = 12;
const MOTIF_OPACITY = 0.8;
/** Facteur d'échelle du bloc coin+pips des cartes 2-10/As (1 = collé au bord, <1 = marge). */
const NUMBER_CARD_CONTENT_SCALE = 0.90;

// ── Libellé « JOKER » (coin haut-gauche, empilé lettre par lettre) ──────────
const JOKER_LABEL_X = -84;
const JOKER_LABEL_START_Y = -108;
const JOKER_LABEL_LINE_HEIGHT = 28;
const JOKER_LABEL_FONT_SIZE = 24;

// ── Couleurs des figures (Valet/Dame/Roi) ───────────────────────────────────
// [or, rouge, bleu, noir, détail-stroke, détail-largeur]. ♠/♣ forcent un bleu pur,
// ♦ force un rouge cramoisi — quirk du POC conservé tel quel (design validé).
const COURT_GOLD = '#db3';
const COURT_BLUE = '#44f';
const COURT_BLUE_OVERRIDE = '#0303ff';
const COURT_RED_OVERRIDE = '#dc143c';
const COURT_DETAIL_WIDTH = '4';

// ── Géométrie des pips (2 à 10) ──────────────────────────────────────────────
// Table de layout : chaque caractère 'P' place un pip au slot correspondant,
// '0' le laisse vide. Index de la table = rang (1=As … 10=Dix).
const PIP_LAYOUT: readonly string[] = [
  '000000000P0', // As (le seul 'P' utilisé est recentré, cf. ACE_CENTER_SLOT ci-dessous)
  '00000P00000', // 2
  '0P0000000P0', // 3
  'P0P00000000', // 4
  'P0P000000P0', // 5
  'P0P00000P0P', // 6
  'P0P0000PP0P', // 7
  'P0P000P0P0P', // 8
  'P0PPP0000P0', // 9
  'P0PPPP00000', // 10
];
const ACE_CENTER_SLOT = 9; // pour le rang 1 (As), le slot 9 est recentré et agrandi

/** Position [x, y] de chaque slot de pip, pour un rang donné. */
function pipSlotPositions(rank: number): readonly [number, number][] {
  const pipSize = 70;
  const colRight = -pipSize / 2; // -35
  const colCenter = -colRight / 2; // 17.5
  const colLeft = -pipSize - colCenter; // -87.5
  const rowTop = rank === 9 || rank === 10 ? -130 : -122;
  return [
    [colLeft, rowTop], [colRight, rowTop], [colCenter, rowTop],
    [colLeft, -68.5], [colCenter, -68.5],
    [colRight, -102], [colRight, -90], [colRight, -90],
    [colLeft, colRight], [colRight, colRight], [colCenter, colRight],
  ];
}

// ── Figures (Valet/Dame/Roi) ─────────────────────────────────────────────────
// Une seule illustration par figure (voir card-art.data.ts) : la variation par
// enseigne vient uniquement de la couleur (COURT_BLUE_OVERRIDE / COURT_RED_OVERRIDE)
// et d'un effet miroir. Le miroir dépend du rang de figure seul (pas de l'enseigne) —
// quirk du POC conservé tel quel, vérifié visuellement sur les 12 figures.
const COURT_MIRROR: readonly boolean[] = [false, true, true]; // Valet, Dame, Roi

/** width/height/x/y/rotation du petit motif d'enseigne dans le coin de la figure, par rang de figure. */
const COURT_SUIT_MARK_POS: readonly [number, number][] = [
  [35.8, -124], // Valet
  [-88, -124],  // Dame
  [-88, -124],  // Roi
];

/** Pips décoratifs incrustés dans l'illustration, par rang de figure (vide = aucun). */
const COURT_INLAY_MARKS: readonly (readonly [number, number, number, string])[][] = [
  [ // Valet — [height, x, y, rotation]
    [114, 520, 939, ''],
    [100, 1100, 60, 'rotate(30)'],
    [100, 1100, 160, 'rotate(30)'],
    [100, 440, 430, 'rotate(30)'],
    [160, 370, 560, 'rotate(30)'],
  ],
  [ // Dame
    [80, 1140, 552, 'rotate(10)'],
    [80, 1155, 660, 'rotate(11)'],
    [85, 1240, 660, 'rotate(17)'],
  ],
  [ // Roi
    [100, 694, 870, 'rotate(-15)'],
    [113, 932, 798, 'rotate(0)'],
    [100, 1280, 230, 'rotate(35)'],
  ],
];

// ── Petits utilitaires SVG ───────────────────────────────────────────────────
const viewBoxSquare = (half: number) => `-${half} -${half} ${2 * half} ${2 * half}`;
const attrs = (width?: number, height?: number, x?: number, y?: number) =>
  `${width ? ` width='${width}'` : ''}${height ? ` height='${height}'` : ''}${x !== undefined ? ` x='${x}'` : ''}${y !== undefined ? ` y='${y}'` : ''}`;
const useEl = (id: string, height: number, x: number, y: number, extra = '', width?: number) =>
  `<use href='#${id}'${attrs(width, height, x, y)} ${extra}/>`;
const symbolEl = (id: string, viewBox: string, path: string, styleAttrs: string) =>
  `<symbol id='${id}' viewBox='${viewBox}' preserveAspectRatio='xMinYMid' opacity='${MOTIF_OPACITY}'><path d='${path}' ${styleAttrs}/></symbol>`;

const memoCache = new Map<CardId, string>();

/** Renvoie une data-URI SVG pour la carte donnée. Mémoïsé : au plus 55 entrées pour toute une partie. */
export function cardSvgUrl(id: CardId): string {
  const cached = memoCache.get(id);
  if (cached !== undefined) return cached;
  const svg = id === 'JOKER' ? buildJokerSvg() : buildRankSuitSvg(id);
  const url = 'data:image/svg+xml,' + svg.replace(/#/g, '%23');
  memoCache.set(id, url);
  return url;
}

function cardFrame(): string {
  const w = 240 - BORDER_WIDTH;
  const h = 334 - BORDER_WIDTH;
  const x = BORDER_WIDTH / 2 - 120;
  const y = BORDER_WIDTH / 2 - 167;
  return `<rect width='${w}' height='${h}' x='${x}' y='${y}' rx='${CORNER_RADIUS}' ry='${CORNER_RADIUS}' stroke='${BORDER_COLOR}' fill='${CARD_FILL}' fill-opacity='1' stroke-width='${BORDER_WIDTH}'/>`;
}

/** Lettres de « JOKER » empilées verticalement (droites, pas tournées sur le côté), dupliquées
 * en <g rotate(180)> pour le coin opposé — même technique que le coin rang+enseigne des autres
 * cartes, pour que le libellé reste lisible carte à l'envers. */
function jokerCornerLabel(): string {
  return 'JOKER'
    .split('')
    .map((letter, i) => {
      const y = JOKER_LABEL_START_Y + i * JOKER_LABEL_LINE_HEIGHT;
      return `<text x='${JOKER_LABEL_X}' y='${y}' text-anchor='middle' font-family='sans-serif' font-weight='700' font-size='${JOKER_LABEL_FONT_SIZE}' fill='${BLACK}' fill-opacity='${MOTIF_OPACITY}'>${letter}</text>`;
    })
    .join('');
}

function buildJokerSvg(): string {
  const label = jokerCornerLabel();
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-120 -167 240 334'>${cardFrame()}${JOKER_ART}${label}<g transform='rotate(180)'>${label}</g></svg>`;
}

function buildRankSuitSvg(id: CardId): string {
  const rankChar = id[0];
  const suitChar = id[1];
  const rank = RANK_CHAR_TO_NUM[rankChar];
  const suitIndex = SUIT_CHAR_TO_INDEX[suitChar];
  // Suffixe d'ids interne à ce document SVG (namespace isolé par data-URI, pas besoin d'être global).
  const uid = rankChar.toLowerCase() + suitChar.toLowerCase();

  const rankSymbolId = 'R' + uid;
  const suitSymbolId = 'S' + suitIndex + uid;
  const color = SUIT_COLOR[suitIndex];

  let out = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-120 -167 240 334'>${cardFrame()}`;

  out += symbolEl(rankSymbolId, viewBoxSquare(500), RANK_PATHS[rank - 1], `stroke='${color}' fill='none' fill-opacity='1' stroke-width='110'`);
  // Un seul symbole d'enseigne (celui de cette carte) : les 3 autres du POC ne sont jamais référencés.
  out += symbolEl(suitSymbolId, viewBoxSquare(600), SUIT_PATHS[suitIndex], `fill='${color}' fill-opacity='1'`);

  // Le petit rang+enseigne de coin est toujours dessiné (cartes numériques ET figures) ;
  // les pips (s'il y en a) s'y ajoutent, l'illustration de figure (s'il y en a une)
  // vient en plus, après ce bloc coin — pas à sa place.
  const corner = useEl(rankSymbolId, 39, -120, -158) + useEl(suitSymbolId, 39, -120, -120);
  const pipUses: string[] = [];
  const mirroredPipUses: string[] = [];
  if (rank <= 10) {
    const positions = pipSlotPositions(rank);
    const pattern = PIP_LAYOUT[rank - 1];
    for (let slot = 0; slot < pattern.length; slot++) {
      if (pattern[slot] !== 'P') continue;
      let [x, y] = positions[slot];
      let size = 70;
      if (rank === 1 && slot === ACE_CENTER_SLOT) {
        x = -size;
        y = -size;
        size *= 2;
      }
      const use = useEl(suitSymbolId, size, x, y);
      pipUses.push(use);
      if (slot < 7) mirroredPipUses.push(use);
    }
  }
  const cornerAndPips = corner + pipUses.join('') + `<g transform='rotate(180)'>${corner}${mirroredPipUses.join('')}</g>`;
  // Cartes numériques (2-10 + As) seulement : le viewBox est centré en (0,0), donc un
  // `scale` sans translation rapproche uniformément coin + pips du centre — ça ajoute
  // une marge avec le bord sans toucher aux figures (dessin dédié) ni au Joker.
  out += rank <= 10 ? `<g transform='scale(${NUMBER_CARD_CONTENT_SCALE})'>${cornerAndPips}</g>` : cornerAndPips;

  if (rank > 10) {
    const courtIndex = rank - 11; // Valet=0 Dame=1 Roi=2
    const courtColors = [COURT_GOLD, RED, COURT_BLUE, BLACK, BLACK, COURT_DETAIL_WIDTH];
    if (suitIndex === 0 || suitIndex === 3) courtColors[2] = COURT_BLUE_OVERRIDE;
    if (suitIndex === 2) courtColors[1] = COURT_RED_OVERRIDE;

    const layers = COURT_PATHS[courtIndex];
    const layerIds = ['go', 're', 'bu', 'ba', 'de'];
    let symbolDefs = '';
    let layerUses = '';
    for (let layer = 0; layer < 5; layer++) {
      const layerId = layerIds[layer] + uid;
      const isDetailLayer = layer === 4;
      const styleAttrs = isDetailLayer
        ? `stroke='${courtColors[4]}' fill='none' fill-opacity='1' stroke-width='${courtColors[5]}'`
        : `fill='${courtColors[layer]}' fill-opacity='1'`;
      // Opacité pleine sur la couche détail : elle porte les incrustations d'enseigne,
      // qui doivent rester nettes (cf. `a.length` dans le POC original).
      let symbol = `<symbol id='${layerId}' viewBox='0 0 1300 2000' preserveAspectRatio='xMinYMid' opacity='${isDetailLayer ? 1 : MOTIF_OPACITY}'><path d='${layers[layer]}' ${styleAttrs}/>`;
      if (isDetailLayer) {
        for (const [h, mx, my, rot] of COURT_INLAY_MARKS[courtIndex]) {
          symbol += useEl(suitSymbolId, h, mx, my, `transform='${rot}'`);
        }
      }
      symbol += '</symbol>';
      symbolDefs += symbol;
      layerUses += useEl(layerId, 261, -82, -130, '', 165) + useEl(layerId, 261, -82, -130, "transform='rotate(180)'", 165);
    }

    out += COURT_MIRROR[courtIndex] ? "<g transform='scale(-1,1)'>" : '<g>';
    out += symbolDefs;
    out += layerUses;
    const [markX, markY] = COURT_SUIT_MARK_POS[courtIndex];
    out += useEl(suitSymbolId, 52, markX, markY) + useEl(suitSymbolId, 52, markX, markY, "transform='rotate(180)'");
    out += `<rect width='166' height='254' x='-83' y='-127' rx='2' ry='2' stroke='#44f' fill='none' fill-opacity='1' stroke-width='3'/></g>`;
  }

  out += '</svg>';
  return out;
}
