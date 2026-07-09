// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/index.ts
//
// Point d'entrée unique du package partagé.
// Import toujours depuis '@mercury/shared', jamais depuis les fichiers directement.
//
// Exemple :
//   import { MarbleColor, ARRIVAL_POSITIONS, TURN_DURATION_SECONDS } from '@mercury/shared';
// ─────────────────────────────────────────────────────────────────────────────

export * from './types.js';
export * from './board-config.js';
export * from './constants.js';
export * from './move-validator.js';
export * from './teams.js';
