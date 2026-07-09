// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/teams.ts
//
// Mode équipes 2v2 : les équipes sont fixes et déterminées par la couleur
// (= le siège). red (siège 1) + blue (siège 3) forment une équipe,
// green (siège 2) + orange (siège 4) l'autre. Les équipes n'ont pas de nom :
// une équipe est identifiée par sa paire de couleurs.
// ─────────────────────────────────────────────────────────────────────────────

import { hasWon } from './board-config.js';
import type { MarbleColor } from './types.js';

/** Les deux équipes du mode 2v2, chacune identifiée par sa paire de couleurs. */
export const TEAMS: readonly [
  readonly [MarbleColor, MarbleColor],
  readonly [MarbleColor, MarbleColor],
] = [
  ['red', 'blue'],
  ['green', 'orange'],
];

const TEAMMATE: Record<MarbleColor, MarbleColor> = {
  red: 'blue',
  blue: 'red',
  green: 'orange',
  orange: 'green',
};

/** Couleur du coéquipier d'une couleur donnée. */
export function getTeammateColor(color: MarbleColor): MarbleColor {
  return TEAMMATE[color];
}

/** Vrai si les deux couleurs appartiennent à la même équipe (une couleur est dans sa propre équipe). */
export function sameTeam(a: MarbleColor, b: MarbleColor): boolean {
  return a === b || TEAMMATE[a] === b;
}

/**
 * Victoire d'équipe : les DEUX coéquipiers ont leurs 4 pions dans leur zone
 * d'arrivée (8 pions à l'abri au total).
 */
export function hasTeamWon(
  marblesByColor: Record<MarbleColor, number[]>,
  color: MarbleColor,
): boolean {
  const teammate = getTeammateColor(color);
  return hasWon(marblesByColor[color], color)
    && hasWon(marblesByColor[teammate], teammate);
}

/**
 * Switch de fin de jeu (2v2) : un joueur qui a rentré ses 4 pions continue de
 * jouer, mais ses cartes contrôlent désormais uniquement les pions de son
 * coéquipier. Retourne la couleur des pions que ce joueur contrôle.
 */
export function getControlledColor(color: MarbleColor, marblePositions: number[]): MarbleColor {
  return hasWon(marblePositions, color) ? getTeammateColor(color) : color;
}
