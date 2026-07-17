import type { Card, GameMode, MarbleColor } from '@mercury/shared';

// ─────────────────────────────────────────────────────────────────────────────
// GameSnapshot — état complet d'une partie en cours, persisté dans Azure Blob
// à chaque fin de tour pour survivre aux redéploiements (voir snapshot-store.ts
// pour la persistance et game-restore.ts pour la réhydratation au boot).
//
// Contient UNIQUEMENT l'état sérialisable : l'état transient (messenger/WS,
// stratégies, promesses en attente, timers) est reconstruit par
// Game.fromSnapshot. Types purs, sans dépendance au SDK de stockage, pour que
// game.ts puisse les importer sans tirer @azure/storage-blob.
// ─────────────────────────────────────────────────────────────────────────────

/** Incrémenter à chaque changement incompatible du format : les snapshots
 *  d'une version différente sont jetés au boot (parties perdues, assumé). */
export const SNAPSHOT_SCHEMA_VERSION = 2;

export interface PlayerSnapshot {
    name: string;
    color: MarbleColor;
    isHuman: boolean;
    /** Siège tenu par un agent IA externe (les botIds du pool sont arbitraires,
     *  seul ce flag permet de reclasser le siège au restore — re-dispatch d'un
     *  agent plutôt que fenêtre de reconnexion humaine). */
    isBot?: boolean;
    marblePositions: number[];
    /** Aligné 1:1 avec marblePositions (voir Player). */
    marbleInvincible: boolean[];
    /** Main complète — jamais exposée aux clients, uniquement persistée. */
    cards: Card[];
    picture?: string;
    userId?: string;
}

/** Entrée du ReconnectRegistry pour un siège — persistée avec la partie pour
 *  que les clients puissent réemprunter le chemin `joinGame` après un restart. */
export interface ReconnectSlotSnapshot {
    guestPlayerId: string;
    color: MarbleColor;
    userId?: string;
}

export interface GameSnapshot {
    schemaVersion: number;
    /** Date.now() à l'écriture — filtre de fraîcheur au boot. */
    savedAt: number;
    gameId: string;
    gameMode: GameMode;
    turn: number;
    round: number;
    /** Index dans players[] — l'ordre de players[] doit être préservé. */
    firstPlayerOfRound: number;
    currentPlayerIndex: number;
    /** Restauré tel quel pour que isStale (3h max) reste correct. */
    startTime: number;
    /** Pioche restante, dans l'ordre. */
    deckCards: Card[];
    discardedCards: Card[];
    penalizedUserIds: string[];
    /** Dans l'ordre de Game.players (les index ci-dessus s'y réfèrent). */
    players: PlayerSnapshot[];
    reconnectSlots: ReconnectSlotSnapshot[];
}
