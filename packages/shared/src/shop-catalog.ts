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

import { REACTION_EMOJIS, type ReactionEmoji } from './types.js';

// ── Économie ──────────────────────────────────────────────────────────────────

/** Prix unitaire d'une réaction emoji (phase 1 de la boutique). */
export const EMOJI_ITEM_PRICE = 50;

/**
 * Bornes du gain de fin de partie. Le gain brut est l'écart de pions rentrés
 * entre les deux camps : en 2v2 le camp gagnant en a toujours 8, donc le gain
 * vaut 8 moins le total du camp adverse (0 à 7). Le plancher couvre la victoire
 * par forfait, où l'écart peut être nul ou négatif.
 */
export const MIN_COINS_PER_WIN = 1;
export const MAX_COINS_PER_WIN = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopItemKind = 'emoji' | 'cardback';

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

export type ShopItem = EmojiShopItem | CardBackShopItem;

// ── Catalogue ─────────────────────────────────────────────────────────────────
//
// `satisfies` (et non une annotation `: readonly ShopItem[]`) conserve le type
// littéral des ids tout en vérifiant à la compilation que chaque `emoji`
// appartient bien à REACTION_EMOJIS. La palette n'est donc jamais dupliquée :
// seuls les emojis payants sont cités ici, les autres restent gratuits.

export const SHOP_CATALOG = [
  { id: 'emoji.wink', kind: 'emoji', label: 'Wink', price: EMOJI_ITEM_PRICE, emoji: '😉' },
  { id: 'emoji.kissing', kind: 'emoji', label: 'Heart eyes', price: EMOJI_ITEM_PRICE, emoji: '😘' },
  { id: 'emoji.smile', kind: 'emoji', label: 'Smile', price: EMOJI_ITEM_PRICE, emoji: '😊' },
] as const satisfies readonly ShopItem[];

export type ShopItemId = typeof SHOP_CATALOG[number]['id'];

/**
 * Forme autorisée d'un id de catalogue. Sert à désinfecter tout id avant son
 * interpolation dans une expression SQL Cosmos (la `condition` d'un patch
 * n'accepte pas de paramètres nommés).
 */
export const CATALOG_ID_PATTERN = /^[a-z]+\.[a-z0-9_]+$/;

// ── Index ─────────────────────────────────────────────────────────────────────

const BY_ID = new Map<string, ShopItem>(SHOP_CATALOG.map(item => [item.id, item]));

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
