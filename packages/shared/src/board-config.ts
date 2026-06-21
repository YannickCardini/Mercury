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
  red: [13, 14, 28, 29],
  green: [208, 209, 223, 224],
  blue: [197, 198, 212, 213],
  orange: [2, 3, 17, 18],
};

// ── Cases d'entrée en jeu (start) ─────────────────────────────────────────────
// Case sur laquelle un pion arrive quand il entre en jeu (carte A ou K).

export const START_POSITIONS: Record<MarbleColor, number> = {
  red: 10,
  green: 150,
  blue: 216,
  orange: 76,
};

// ── Cases d'arrivée (arrival) ─────────────────────────────────────────────────
// Zone finale de chaque joueur. Un pion y entre et ne peut plus en sortir.
// L'ordre des cases correspond à l'ordre d'entrée dans la zone.

export const ARRIVAL_POSITIONS: Record<MarbleColor, number[]> = {
  red: [38, 53, 68, 83],
  green: [118, 117, 116, 115],
  blue: [188, 173, 158, 143],
  orange: [108, 109, 110, 111],
};

// ── Cases des infos joueurs (player info panel) ───────────────────────────────
// Cases de la grille utilisées pour afficher les panneaux joueur dans le HTML.

export const PLAYER_INFO_STARTS: Record<number, MarbleColor> = {
  61: 'red',
  71: 'green',
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

// ── Cases à afficher (chemin + zones spéciales) ───────────────────────────────
// Toutes les cases non listées ici sont cachées (case-hidden).
//
// NB : les cases de HOME ne sont volontairement PAS listées ici. Les billes de
// départ sont désormais rendues dans le grand panneau joueur de chaque coin
// (cf. board.component « home-tray »), pas dans la grille. Les cases restent
// donc `case-hidden` : l'espace de grille est conservé (alignement préservé)
// mais ni le cercle de home ni la bille ne sont affichés dans la grille.

export const SQUARES_TO_DISPLAY: number[] = [...MAIN_PATH,
...ARRIVAL_POSITIONS['red'],
...ARRIVAL_POSITIONS['green'],
...ARRIVAL_POSITIONS['blue'],
...ARRIVAL_POSITIONS['orange'],
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
