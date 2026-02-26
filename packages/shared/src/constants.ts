// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/constants.ts
//
// Constantes partagées entre le front et le back.
//
// ANIMATIONS : les durées ici sont la source de vérité.
// Le SCSS doit les refléter via des CSS custom properties.
// Voir : apps/frontend/src/styles/_animations.scss
//
// Convention : toutes les durées sont en millisecondes (ms).
// ─────────────────────────────────────────────────────────────────────────────

import type { ActionType } from './types.js';

// ── Durée du tour ─────────────────────────────────────────────────────────────

/** Durée d'un tour de jeu en secondes. */
export const TURN_DURATION_SECONDS = 30;

/** Durée d'un tour de jeu en millisecondes. */
export const TURN_DURATION_MS = TURN_DURATION_SECONDS * 1000;

// ── Durées d'animation des pions (ms) ────────────────────────────────────────

export const MARBLE_ANIMATION_DURATIONS: Record<ActionType, number> = {
  enter: 1200,
  move: 600,
  capture: 700,
  swap: 900,
  promote: 1000,
  pass: 0,   // pas d'animation pour un pass
};

// ── Durée de l'animation de vol de carte (ms) ─────────────────────────────────
//
// Doit correspondre à la durée de l'animation CSS `.flying-card`.
// La carte reste visible CARD_FLY_DURATION ms avant d'atterrir sur la pile.

export const CARD_FLY_DURATION_MS = 1500;

/** Délai avant de déclencher les animations de pions après le vol de carte. */
export const CARD_LAND_DELAY_MS = 1600;

// ── Affichage ─────────────────────────────────────────────────────────────────

/** Durée d'affichage du bandeau "Nouveau tour" en millisecondes. */
export const NEW_TURN_BANNER_DURATION_MS = 2500;

/** Nombre de cartes maximum visibles dans la pile de défausse. */
export const MAX_VISIBLE_DISCARD_CARDS = 5;

// ── Jeu de cartes ─────────────────────────────────────────────────────────────

/** Nombre de cartes distribuées à chaque joueur en début de tour. */
export const CARDS_PER_HAND = 5;

/** Cartes qui permettent d'entrer un pion en jeu. */
export const ENTER_CARDS: string[] = ['A', 'K'];
