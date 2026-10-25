// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/shop-catalog.ts
//
// Catalogue de la boutique : source unique de vérité pour le client (affichage)
// ET le serveur (validation, débit). Aucun id ni aucun prix ne doit être écrit
// ailleurs.
//
// Convention d'id : "<kind>.<slug>", ex. "emoji.wink" et plus tard
// "cardback.nebula". Le préfixe n'est jamais parsé à l'exécution (le `kind` est
// porté par l'objet), il garantit seulement l'unicité entre familles d'objets.
// ─────────────────────────────────────────────────────────────────────────────

import { REACTION_EMOJIS, type Action, type ReactionEmoji } from './types.js';
import { isArrivalPosition } from './board-config.js';

// ── Économie ──────────────────────────────────────────────────────────────────

/** Prix unitaire d'une réaction emoji (phase 1 de la boutique). */
export const EMOJI_ITEM_PRICE = 50;

/**
 * Prix des boosters (décision du propriétaire, 2026-10-23). Un booster
 * s'achète une fois et se garde pour toujours.
 */
export const DOUBLE_POINTS_PRICE = 250;
export const DOUBLE_COINS_PRICE = 200;
export const BOUNTY_PRICE = 50;
/** Homecoming et Double Strike : bas, car les coups qu'ils paient sont rares. */
export const PAIR_BOOST_PRICE = 80;
/** Perfect Game : le moins cher, l'exploit qu'il paie est le plus rare. */
export const PERFECT_GAME_PRICE = 30;

/**
 * Emplacements d'équipement. Chacun reçoit un booster qui vaut pour chaque
 * partie du joueur. Deux sont offerts ; les suivants s'achètent, un à la
 * fois, jusqu'à pouvoir équiper tout le catalogue (voir maxBoostSlots).
 */
export const FREE_BOOST_SLOTS = 2;
export const BOOST_SLOT_PRICE = 100;

/** Pièces gagnées par pion adverse capturé avec Bounty (avant Double Coins). */
export const COINS_PER_CAPTURE = 1;

/**
 * Pièces perdues par pion de son camp (le sien ou celui du coéquipier)
 * capturé avec Bounty. Jamais doublé par Double Coins : il se retranche après.
 */
export const COINS_PER_ALLY_CAPTURE = 1;

/** Prime de Homecoming et de Double Strike, par coup réussi (avant Double Coins). */
export const PAIR_BONUS_COINS = 50;

/**
 * Points de classement de Perfect Game (avant Double Points) : une victoire
 * sans qu'un seul pion adverse soit rentré. Une victoire normale en vaut 4.
 */
export const PERFECT_GAME_POINTS = 100;

/** Facteur appliqué par un booster « Double … ». */
export const BOOST_MULTIPLIER = 2;

/**
 * Bornes du gain de fin de partie. Le gain brut est l'écart de pions rentrés
 * entre les deux camps : en 2v2 le camp gagnant en a toujours 8, donc le gain
 * vaut 8 moins le total du camp adverse (0 à 7). Le plancher couvre la victoire
 * par forfait, où l'écart peut être nul ou négatif.
 */
export const MIN_COINS_PER_WIN = 1;
export const MAX_COINS_PER_WIN = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopItemKind = 'emoji' | 'cardback' | 'consumable';

interface ShopItemCommon {
  readonly id: string;
  readonly kind: ShopItemKind;
  /** Libellé affiché en boutique (anglais, comme tout le reste de l'app). */
  readonly label: string;
  readonly price: number;
}

export interface EmojiShopItem extends ShopItemCommon {
  readonly kind: 'emoji';
  readonly emoji: ReactionEmoji;
}

/** Phase 2 : non implémenté, présent pour figer la forme des données. */
export interface CardBackShopItem extends ShopItemCommon {
  readonly kind: 'cardback';
  /** Clé d'asset résolue côté client. */
  readonly asset: string;
}

/**
 * Ce que change un booster au décompte de fin de partie.
 * - `pair_home` : deux pions du camp rentrés dans le même tour (Homecoming) ;
 * - `pair_capture` : deux pions adverses capturés dans le même tour (Double Strike) ;
 * - `perfect_win` : victoire sans pion adverse rentré (Perfect Game).
 */
export type ConsumableEffect =
  | 'double_points'
  | 'double_coins'
  | 'capture_coins'
  | 'pair_home'
  | 'pair_capture'
  | 'perfect_win';

/**
 * Booster : acheté une fois, il entre dans `ownedItems` et se garde pour
 * toujours. Le joueur en équipe autant qu'il a d'emplacements, et ils valent
 * pour chacune de ses parties (voir takeGameBoosts, backend/src/db.ts).
 *
 * Le kind garde son nom historique `consumable` (du temps où un booster ne
 * valait qu'une partie) : il est écrit dans les ids stockés (`consumable.*`)
 * et lu par les binaires Android déjà installés.
 */
export interface ConsumableShopItem extends ShopItemCommon {
  readonly kind: 'consumable';
  readonly effect: ConsumableEffect;
  /** Effet en une ligne, affiché sous le libellé en boutique. */
  readonly description: string;
}

export type ShopItem = EmojiShopItem | CardBackShopItem | ConsumableShopItem;

// ── Catalogue ─────────────────────────────────────────────────────────────────
//
// `satisfies` (et non une annotation `: readonly ShopItem[]`) conserve le type
// littéral des ids tout en vérifiant à la compilation que chaque `emoji`
// appartient bien à REACTION_EMOJIS. La palette n'est donc jamais dupliquée :
// seuls les emojis payants sont cités ici, les autres restent gratuits.

//
// Les six premiers emojis de la palette étaient gratuits avant la boutique :
// les comptes existants les ont reçus par migration ponctuelle au déploiement
// (backend/scripts/grant-legacy-emojis.ts), ils ne se paient que pour les
// nouveaux joueurs.

export const SHOP_CATALOG = [
  { id: 'emoji.angry', kind: 'emoji', label: 'Angry', price: EMOJI_ITEM_PRICE, emoji: '😡' },
  { id: 'emoji.cool', kind: 'emoji', label: 'Cool', price: EMOJI_ITEM_PRICE, emoji: '😎' },
  { id: 'emoji.sleeping', kind: 'emoji', label: 'Sleeping', price: EMOJI_ITEM_PRICE, emoji: '😴' },
  { id: 'emoji.alarm', kind: 'emoji', label: 'Alarm clock', price: 60, emoji: '⏰' },
  { id: 'emoji.yawning', kind: 'emoji', label: 'Yawning', price: EMOJI_ITEM_PRICE, emoji: '🥱' },
  { id: 'emoji.orangutan', kind: 'emoji', label: 'Orangutan', price: 80, emoji: '🦧' },
  { id: 'emoji.wink', kind: 'emoji', label: 'Wink', price: EMOJI_ITEM_PRICE, emoji: '😉' },
  { id: 'emoji.kissing', kind: 'emoji', label: 'Heart eyes', price: EMOJI_ITEM_PRICE, emoji: '😘' },
  { id: 'emoji.smile', kind: 'emoji', label: 'Smile', price: EMOJI_ITEM_PRICE, emoji: '😊' },
  {
    id: 'consumable.double_points',
    kind: 'consumable',
    label: 'Double Points',
    price: DOUBLE_POINTS_PRICE,
    effect: 'double_points',
    description: 'Doubles the ranking points of each game: a win earns twice the points, but a defeat also costs twice as many.',
  },
  {
    id: 'consumable.double_coins',
    kind: 'consumable',
    label: 'Double Coins',
    price: DOUBLE_COINS_PRICE,
    effect: 'double_coins',
    description: 'Doubles every coin you earn in a game: the reward for a win and the coins from your other boosters, such as Bounty.',
  },
  {
    id: 'consumable.bounty',
    kind: 'consumable',
    label: 'Bounty',
    price: BOUNTY_PRICE,
    effect: 'capture_coins',
    description: "Earns 1 coin for each enemy marble you capture, whether you win or lose. Capturing your own or your teammate's marble costs 1 coin.",
  },
  {
    id: 'consumable.homecoming',
    kind: 'consumable',
    label: 'Homecoming',
    price: PAIR_BOOST_PRICE,
    effect: 'pair_home',
    description: 'Earns 50 coins each time a single move brings two marbles of your team into their home rows, for example with a split 7.',
  },
  {
    id: 'consumable.double_strike',
    kind: 'consumable',
    label: 'Double Strike',
    price: PAIR_BOOST_PRICE,
    effect: 'pair_capture',
    description: 'Earns 50 coins each time a single move captures two enemy marbles, for example with a split 7.',
  },
  {
    id: 'consumable.perfect_game',
    kind: 'consumable',
    label: 'Perfect Game',
    price: PERFECT_GAME_PRICE,
    effect: 'perfect_win',
    description: 'Earns 100 extra ranking points when your team wins without a single enemy marble reaching home. Wins by forfeit do not count.',
  },
] as const satisfies readonly ShopItem[];

export type ShopItemId = typeof SHOP_CATALOG[number]['id'];

/** Ids des boosters, seuls ids acceptés dans un équipement de boosters. */
export type ConsumableId = Extract<typeof SHOP_CATALOG[number], { kind: 'consumable' }>['id'];

/**
 * Forme autorisée d'un id de catalogue. Sert à désinfecter tout id avant son
 * interpolation dans une expression SQL Cosmos (la `condition` d'un patch
 * n'accepte pas de paramètres nommés).
 */
export const CATALOG_ID_PATTERN = /^[a-z]+\.[a-z0-9_]+$/;

// ── Index ─────────────────────────────────────────────────────────────────────

const BY_ID = new Map<string, ShopItem>(SHOP_CATALOG.map(item => [item.id, item]));

const BOOST_COUNT = SHOP_CATALOG.filter(item => item.kind === 'consumable').length;

// flatMap plutôt que filter + map : le narrowing par discriminant reste correct
// le jour où le catalogue contiendra des objets d'un autre `kind`.
const PAID_EMOJI_ID = new Map<ReactionEmoji, string>(
  SHOP_CATALOG.flatMap(item =>
    item.kind === 'emoji' ? [[item.emoji, item.id] as [ReactionEmoji, string]] : [],
  ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Objet du catalogue, ou undefined si l'id est inconnu (client falsifié). */
export function getCatalogItem(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

/** Tous les objets achetables, dans l'ordre d'affichage de la boutique. */
export function getShopItems(): readonly ShopItem[] {
  return SHOP_CATALOG;
}

/** Id catalogue d'un emoji payant, ou undefined si l'emoji est gratuit. */
export function emojiItemId(emoji: ReactionEmoji): string | undefined {
  return PAID_EMOJI_ID.get(emoji);
}

/** Vrai pour les emojis historiques : disponibles pour tous, invités compris. */
export function isFreeEmoji(emoji: ReactionEmoji): boolean {
  return !PAID_EMOJI_ID.has(emoji);
}

/** Palette accessible sans achat. Dérivée du catalogue, jamais recopiée. */
export const FREE_REACTION_EMOJIS: readonly ReactionEmoji[] = REACTION_EMOJIS.filter(isFreeEmoji);

/**
 * Seule règle d'autorisation d'envoi d'un emoji, partagée par le client
 * (affichage du cadenas) et le serveur (contrôle avant diffusion).
 */
export function isEmojiUnlocked(
  emoji: ReactionEmoji,
  owned: ReadonlySet<string> | readonly string[],
): boolean {
  const id = PAID_EMOJI_ID.get(emoji);
  if (id === undefined) return true;
  return owned instanceof Set ? owned.has(id) : (owned as readonly string[]).includes(id);
}

// ── Boosters ──────────────────────────────────────────────────────────────────

/** Vrai pour un booster, faux pour un objet de collection (emoji, dos de carte). */
export function isConsumable(item: ShopItem): item is ConsumableShopItem {
  return item.kind === 'consumable';
}

/** Booster du catalogue, ou undefined si l'id n'en désigne pas un. */
export function getConsumable(id: string): ConsumableShopItem | undefined {
  const item = BY_ID.get(id);
  return item && isConsumable(item) ? item : undefined;
}

/** Emplacements au plus : de quoi équiper tout le catalogue de boosters. */
export function maxBoostSlots(): number {
  return Math.max(FREE_BOOST_SLOTS, BOOST_COUNT);
}

/**
 * Emplacements d'un joueur d'après son compte. Absent (compte antérieur aux
 * emplacements) ou hors bornes : ramené entre les offerts et le maximum.
 */
export function boostSlotsOf(stored: number | undefined): number {
  const n = Number.isInteger(stored) ? (stored as number) : FREE_BOOST_SLOTS;
  return Math.min(maxBoostSlots(), Math.max(FREE_BOOST_SLOTS, n));
}

/**
 * Équipement valide tiré d'une liste d'ids : boosters connus du catalogue et
 * possédés, sans doublon, dans l'ordre donné (l'ordre des emplacements), au
 * plus `slots`. Seule règle, partagée par le serveur (validation, lancement
 * de partie) et le client (affichage avant la réponse du serveur).
 */
export function sanitizeLoadout(
  ids: readonly string[] | undefined,
  owned: ReadonlySet<string> | readonly string[],
  slots: number,
): ConsumableId[] {
  const has = (id: string) =>
    owned instanceof Set ? owned.has(id) : (owned as readonly string[]).includes(id);
  const loadout: ConsumableId[] = [];
  for (const id of ids ?? []) {
    if (loadout.length >= slots) break;
    if (!getConsumable(id) || !has(id) || loadout.includes(id as ConsumableId)) continue;
    loadout.push(id as ConsumableId);
  }
  return loadout;
}

/** Vrai si l'un des boosters actifs d'un joueur a cet effet. */
export function hasBoost(boosts: readonly string[] | undefined, effect: ConsumableEffect): boolean {
  return !!boosts?.some(id => getConsumable(id)?.effect === effect);
}

/**
 * Facteur à appliquer à un gain d'après les boosters actifs d'un joueur sur
 * une partie. Seule règle de calcul, partagée par le serveur (décompte) et le
 * client (écran de fin de partie).
 */
export function boostMultiplier(
  boosts: readonly string[] | undefined,
  effect: 'double_points' | 'double_coins',
): number {
  return hasBoost(boosts, effect) ? BOOST_MULTIPLIER : 1;
}

// ── Coups doubles (Homecoming, Double Strike) ────────────────────────────────

/**
 * Pions rentrés par une action : ceux qui passent d'une case hors de leur
 * couloir d'arrivée à une case de ce couloir. Un pion qui avance à
 * l'intérieur du couloir ne compte pas. Seul le 7 partagé peut en rentrer
 * deux à la fois (le sien et/ou celui du coéquipier). Même règle pour le
 * serveur (prime) et le client (animation).
 */
export function countHomeEntries(action: Action): number {
  const mover = action.marbleColor ?? action.playerColor;
  let n = 0;
  if (!isArrivalPosition(action.from, mover) && isArrivalPosition(action.to, mover)) n++;
  if (action.splitFrom !== undefined && action.splitTo !== undefined) {
    const splitMover = action.splitMarbleColor ?? mover;
    if (!isArrivalPosition(action.splitFrom, splitMover) && isArrivalPosition(action.splitTo, splitMover)) n++;
  }
  return n;
}

/** Une action vaut un coup double à partir de deux pions (rentrés ou capturés). */
export const PAIR_THRESHOLD = 2;

// ── Pièces de fin de partie ──────────────────────────────────────────────────

/** Origine des pièces d'une partie, en pièces, AVANT Double Coins. */
export interface CoinParts {
  /** Gain de victoire (vainqueurs seulement). */
  victory: number;
  /** Bounty : pions adverses capturés. */
  captures: number;
  /** Bounty : pions de son camp capturés (malus, jamais doublé). */
  allyPenalty: number;
  /** Homecoming : coups réussis × PAIR_BONUS_COINS. */
  pairHome: number;
  /** Double Strike : coups réussis × PAIR_BONUS_COINS. */
  pairCapture: number;
}

/** Gains doublables d'une partie : tout sauf le malus. */
export function coinGains(parts: CoinParts): number {
  return parts.victory + parts.captures + parts.pairHome + parts.pairCapture;
}

/**
 * Variation de pièces d'une partie : les gains, multipliés par Double Coins,
 * moins le malus Bounty. Peut être négative : le serveur la retire alors du
 * solde, sans le faire passer sous 0. Seule règle, partagée par le serveur
 * (décompte) et le client (écran de fin).
 */
export function endGameCoinDelta(parts: CoinParts, multiplier: number): number {
  return coinGains(parts) * multiplier - parts.allyPenalty;
}

// ── Partie parfaite ──────────────────────────────────────────────────────────

/**
 * Points de Perfect Game pour un joueur en fin de partie, avant Double Points :
 * le booster équipé, une victoire jouée jusqu'au bout (pas par abandon des
 * adversaires) et aucun pion adverse rentré. 0 sinon.
 */
export function perfectGameBonus(
  boosts: readonly string[] | undefined,
  isWinner: boolean,
  enemiesArrived: number,
  byForfeit: boolean,
): number {
  if (!isWinner || byForfeit || enemiesArrived > 0) return 0;
  return hasBoost(boosts, 'perfect_win') ? PERFECT_GAME_POINTS : 0;
}
