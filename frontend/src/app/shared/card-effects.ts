// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/app/shared/card-effects.ts
//
// Source UNIQUE de vérité pour la description de l'effet de chaque carte.
// Consommée par :
//   - le modal des règles (grille ca-grid)            → CARD_EFFECT_TILES
//   - l'aide contextuelle en partie (long-press/hover) → getCardEffect()
// Ne jamais redéfinir ces textes ailleurs (pas de duplication).
// ─────────────────────────────────────────────────────────────────────────────

import type { CardValue } from '@mercury/shared';

/** Une tuile de la grille « Card Actions » du modal des règles. */
export interface CardEffectTile {
  /** Texte affiché dans la pastille de valeur (ex. 'A', '2–10', '🤡'). */
  val: string;
  /** Vrai pour réduire la taille de la pastille (valeurs longues). */
  smallVal?: boolean;
  /** Classe d'accent de la tuile (ex. 'ca-green'), + ' ca-wide' si pleine largeur. */
  tileClass: string;
  /** Texte de l'effet. Peut contenir <em>/<strong> (contenu statique de confiance). */
  html: string;
}

/**
 * Tuiles de la grille « Card Actions » du modal des règles.
 * `teamMode` (2v2) adapte les cartes dont l'effet change en équipe (J, 7).
 */
export function getCardEffectTiles(teamMode: boolean): CardEffectTile[] {
  return [
    { val: 'A', tileClass: 'ca-green', html: 'Enter or move +1' },
    { val: 'K', tileClass: 'ca-green', html: 'Enter a marble <em>or</em> move forward +13' },
    { val: 'Q', tileClass: 'ca-blue', html: 'Move forward +12' },
    {
      val: 'J', tileClass: 'ca-orange',
      html: teamMode ? 'Swap any two marbles of different colors' : 'Swap with any opponent',
    },
    {
      val: '7', tileClass: 'ca-purple',
      html: teamMode
        ? '7 steps — yours first, the rest may go to your teammate'
        : '7 steps — split across 2 marbles',
    },
    { val: '4', tileClass: 'ca-red', html: 'Move backward −4' },
    { val: '2–10', smallVal: true, tileClass: 'ca-muted ca-wide', html: 'Move one marble forward by face value' },
    { val: '🤡', tileClass: 'ca-joker ca-wide', html: 'Enter a marble <em>or</em> move forward +18 — then <strong>play again</strong>' },
  ];
}

/** Effet d'une carte précise, pour l'aide contextuelle en partie. */
export interface CardEffect {
  /** Nom lisible de la carte (titre du popover). */
  title: string;
  /** Phrase décrivant l'effet. */
  text: string;
}

export function getCardEffect(value: CardValue, teamMode = false): CardEffect {
  switch (value) {
    case 'A': return { title: 'Ace', text: 'Enter a marble onto your start, or move one forward by 1.' };
    case 'K': return { title: 'King', text: 'Enter a marble onto your start, or move one forward by 13.' };
    case 'Q': return { title: 'Queen', text: 'Move one marble forward by 12.' };
    case 'J': return teamMode
      ? { title: 'Jack', text: 'Swap any two marbles of different colors, yours don\'t have to be involved.' }
      : { title: 'Jack', text: "Swap one of your marbles with any opponent's marble." };
    case '7': return teamMode
      ? { title: 'Seven', text: 'Move 7 spaces, split them across two marbles: yours moves first, the remaining steps may go to your teammate\'s.' }
      : { title: 'Seven', text: 'Move 7 spaces, you may split them across two marbles.' };
    case '4': return { title: 'Four', text: 'Move one marble backward by 4.' };
    case 'Joker': return { title: 'Joker', text: 'Enter a marble or move forward 18, then play again.' };
    default: return { title: value, text: `Move one marble forward by ${value}.` };
  }
}
