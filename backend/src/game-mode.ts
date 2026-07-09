// ─────────────────────────────────────────────────────────────────────────────
// Mode de jeu du serveur — switch 1v3 / 2v2 par variable d'environnement.
//
// Il n'y a pas (pour le moment) d'option côté interface : toutes les parties
// lancées par ce serveur utilisent le même mode. `GAME_MODE=1v3` restaure le
// chacun-pour-soi historique ; toute autre valeur (ou absence) = équipes 2v2.
// ─────────────────────────────────────────────────────────────────────────────

import type { GameMode } from '@mercury/shared';

export function getServerGameMode(): GameMode {
    return process.env['GAME_MODE'] === '1v3' ? '1v3' : '2v2';
}
