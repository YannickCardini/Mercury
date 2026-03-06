// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/board-config.ts
//
// Source unique de vérité pour toute la géométrie du plateau.
// Utilisé par le backend (logique de jeu) ET le frontend (affichage).
//
// Convention d'indexation : les cases sont numérotées de 1 à N,
// où N = gridSize² (ex: gridSize=15 → 225 cases).
// ─────────────────────────────────────────────────────────────────────────────

import type { MarbleColor } from './types.js';

// ── Taille de la grille ───────────────────────────────────────────────────────

export const GRID_SIZE = 15;

// ── Cases à afficher (chemin + zones spéciales) ───────────────────────────────
// Toutes les cases non listées ici sont cachées (case-hidden).

export const SQUARES_TO_DISPLAY: number[] = [
  3, 6, 7, 8, 9, 10, 13, 18, 21, 25, 28, 33,
  36, 38, 40, 43, 48, 51, 53, 55, 58, 66, 68,
  70, 76, 77, 78, 79, 80, 81, 83, 85, 86, 87,
  88, 89, 90, 91, 105, 106, 108, 109, 110,
  111, 115, 116, 117, 118, 120, 121, 135,
  136, 137, 138, 139, 140, 141, 143, 145,
  146, 147, 148, 149, 150, 156, 158, 160,
  168, 171, 173, 175, 178, 183, 186, 188,
  190, 193, 198, 201, 205, 208, 213, 216,
  217, 218, 219, 220, 223, 231,
];

// ── Chemin principal ──────────────────────────────────────────────────────────
// Ordre de parcours des cases du chemin commun (sens de déplacement des pions).

export const MAIN_PATH: number[] = [
  9, 10, 25, 40, 55, 70, 85, 86, 87, 88, 89, 90, 105, 120, 135, 150,
  149, 148, 147, 146, 145, 160, 175, 190, 205, 220, 219, 218, 217, 216,
  201, 186, 171, 156, 141, 140, 139, 138, 137, 136, 121, 106, 91, 76,
  77, 78, 79, 80, 81, 66, 51, 36, 21, 6, 7, 8,
];

// ── Cases de départ (home) ────────────────────────────────────────────────────
// Positions initiales des 4 pions d'un joueur, avant d'entrer en jeu.

export const HOME_POSITIONS: Record<MarbleColor, number[]> = {
  red:    [3, 18, 33, 48],
  green:  [13, 28, 43, 58],
  blue:   [178, 193, 208, 223],
  orange: [168, 183, 198, 213],
};

// ── Cases d'entrée en jeu (start) ─────────────────────────────────────────────
// Case sur laquelle un pion arrive quand il entre en jeu (carte A ou K).

export const START_POSITIONS: Record<MarbleColor, number> = {
  red:    9,
  green:  135,
  blue:   217,
  orange: 91,
};

// ── Cases d'arrivée (arrival) ─────────────────────────────────────────────────
// Zone finale de chaque joueur. Un pion y entre et ne peut plus en sortir.
// L'ordre des cases correspond à l'ordre d'entrée dans la zone.

export const ARRIVAL_POSITIONS: Record<MarbleColor, number[]> = {
  red:    [83, 68, 53, 38],
  green:  [115, 116, 117, 118],
  blue:   [143, 158, 173, 188],
  orange: [111, 110, 109, 108],
};

// ── Cases des infos joueurs (player info panel) ───────────────────────────────
// Cases de la grille utilisées pour afficher les panneaux joueur dans le HTML.

export const PLAYER_INFO_STARTS: Record<number, MarbleColor> = {
  61:  'red',
  71:  'green',
  151: 'orange',
  161: 'blue',
};

// ── Cases ignorées dans le rendu ──────────────────────────────────────────────
// Ces cases font partie de la zone des panneaux joueurs et ne sont pas rendues.

export const SKIPPED_INDICES: number[] = [
  62, 63, 64, 65,
  72, 73, 74, 75,
  152, 153, 154, 155,
  162, 163, 164, 165,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retourne les positions de départ (home) pour une couleur donnée. */
export function getHomePositions(color: MarbleColor): number[] {
  return HOME_POSITIONS[color];
}

/** Retourne la case d'entrée en jeu pour une couleur donnée. */
export function getStartPosition(color: MarbleColor): number {
  return START_POSITIONS[color];
}

/** Retourne les cases d'arrivée pour une couleur donnée. */
export function getArrivalPositions(color: MarbleColor): number[] {
  return ARRIVAL_POSITIONS[color];
}

/** Indique si une case est une case de home pour une couleur donnée. */
export function isHomePosition(index: number, color: MarbleColor): boolean {
  return HOME_POSITIONS[color].includes(index);
}

/** Indique si une case est une case d'arrivée pour une couleur donnée. */
export function isArrivalPosition(index: number, color: MarbleColor): boolean {
  return ARRIVAL_POSITIONS[color].includes(index);
}

/** Indique si un joueur a tous ses pions dans sa zone d'arrivée (victoire). */
export function hasWon(marblePositions: number[], color: MarbleColor): boolean {
  const arrivals = ARRIVAL_POSITIONS[color];
  return marblePositions.every(pos => arrivals.includes(pos));
}
