// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/index.ts
//
// Point d'entrée unique du package partagé.
// Import toujours depuis '@keezen/shared', jamais depuis les fichiers directement.
//
// Exemple :
//   import { MarbleColor, ARRIVAL_POSITIONS, TURN_DURATION_SECONDS } from '@keezen/shared';
// ─────────────────────────────────────────────────────────────────────────────

export * from './types.js';
export * from './board-config.js';
export * from './constants.js';
export * from './move-validator.js';
