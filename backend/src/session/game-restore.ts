import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import { dispatchBotAgent } from './bot-dispatch.js';
import { isTrainMode } from '../train-mode.js';
import { listSnapshots, queueSaveSnapshot, queueDeleteSnapshot, whenWritesIdle } from '../storage/snapshot-store.js';
import { SNAPSHOT_SCHEMA_VERSION, type GameSnapshot } from '../game/game-snapshot.js';
import { hasWon, hasTeamWon } from '@mercury/shared';
import type { MarbleColor } from '@mercury/shared';
import type { SessionManager } from './session-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// GameRestore — réhydratation des parties au boot après un redéploiement
//
// Au démarrage (AVANT server.listen, pour qu'aucun `joinGame` n'arrive sur un
// registre vide et ne fasse abandonner le client), on recharge les snapshots
// blob, on reconstruit les Game et on réinscrit les slots de reconnexion. Les
// clients humains reviennent seuls via leur auto-rejoin `joinGame` existant.
//
// Les sièges tenus par un agent IA externe ne reviennent pas seuls : on
// re-dispatche l'agent, et quand son `joinMatchmaking` arrive (le flux normal
// d'un agent, inchangé), SessionManager le redirige ici — le premier siège bot
// vacant d'une partie restaurée lui est attribué, peu importe le botId reçu
// (le pool peut en donner un autre que celui d'origine). Tant que l'agent
// n'est pas revenu, l'auto-play « joueur déconnecté » fait tourner la partie.
// ─────────────────────────────────────────────────────────────────────────────

/** Snapshots plus vieux que ça au boot = d'un déploiement antérieur, jetés. */
const MAX_SNAPSHOT_AGE_MS = 5 * 60_000;
/** Miroir de MAX_GAME_AGE_MS (game-registry.ts) appliqué au startTime restauré. */
const MAX_GAME_AGE_MS = 3 * 60 * 60_000;
const BOT_RESEAT_RETRY_MS = 15_000;
const BOT_RESEAT_MAX_MS = 3 * 60_000;
/** Un siège bot non réclamé finit par sortir de la liste (auto-play définitif). */
const BOT_SEAT_TTL_MS = 10 * 60_000;

interface RestoredBotSeat {
    gameId: string;
    color: MarbleColor;
    guestPlayerId: string;
    originalUserId: string;
    addedAt: number;
}

/** Sièges bots de parties restaurées, en attente de re-seat (FIFO). */
const restoredBotSeats: RestoredBotSeat[] = [];

/**
 * Recharge et reconstruit toutes les parties persistées. Retourne le nombre de
 * parties restaurées. Ne lève jamais : une erreur de stockage ne doit pas
 * empêcher l'API de démarrer (les parties sont perdues, comme avant).
 */
export async function rehydrateGames(sessionManager: SessionManager): Promise<number> {
    if (isTrainMode()) return 0;
    if (!process.env['AZURE_STORAGE_CONNECTION_STRING']) {
        console.warn('💾 AZURE_STORAGE_CONNECTION_STRING absent — pas de réhydratation');
        return 0;
    }

    const snapshots = await listSnapshots();
    let restoredCount = 0;
    let discardedCount = 0;

    for (const snap of snapshots) {
        const rejection = validateSnapshot(snap);
        if (rejection) {
            console.log(`💾 Snapshot ${snap?.gameId ?? '?'} écarté (${rejection})`);
            if (snap?.gameId) queueDeleteSnapshot(snap.gameId);
            discardedCount++;
            continue;
        }
        try {
            restoreGame(snap, sessionManager);
            restoredCount++;
        } catch (err) {
            console.error(`💾 Échec de restauration de la partie ${snap.gameId}:`, err);
            queueDeleteSnapshot(snap.gameId);
            discardedCount++;
        }
    }

    if (restoredCount > 0 || discardedCount > 0) {
        console.log(`💾 Réhydratation : ${restoredCount} partie(s) restaurée(s), ${discardedCount} snapshot(s) écarté(s)`);
    }
    return restoredCount;
}

/** Raison du rejet, ou null si le snapshot est restaurable. Exporté pour les tests. */
export function validateSnapshot(snap: GameSnapshot): string | null {
    if (!snap || typeof snap.gameId !== 'string' || snap.gameId.length === 0) return 'gameId manquant';
    if (snap.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return `schemaVersion ${snap.schemaVersion} ≠ ${SNAPSHOT_SCHEMA_VERSION}`;
    if (typeof snap.savedAt !== 'number' || Date.now() - snap.savedAt > MAX_SNAPSHOT_AGE_MS) return 'snapshot trop ancien (déploiement antérieur)';
    if (typeof snap.startTime !== 'number' || Date.now() - snap.startTime > MAX_GAME_AGE_MS) return 'partie trop ancienne (>3h)';
    if (!Array.isArray(snap.players) || snap.players.length !== 4) return 'players invalide';
    if (snap.players.some(p => !Array.isArray(p.marblePositions) || p.marblePositions.length !== 4
        || !Array.isArray(p.marbleInvincible) || p.marbleInvincible.length !== 4
        || !Array.isArray(p.cards))) return 'joueur invalide';
    if (!Array.isArray(snap.deckCards) || !Array.isArray(snap.discardedCards)) return 'deck invalide';
    if (!Array.isArray(snap.reconnectSlots)) return 'reconnectSlots invalide';
    if (!Number.isInteger(snap.currentPlayerIndex) || snap.currentPlayerIndex < 0 || snap.currentPlayerIndex >= 4
        || !Number.isInteger(snap.firstPlayerOfRound) || snap.firstPlayerOfRound < 0 || snap.firstPlayerOfRound >= 4) return 'index de tour invalide';
    // Une partie sans aucun humain réel (que des agents IA) n'intéresse
    // personne : la restaurer re-dispatcherait des agents pour jouer seuls.
    if (!snap.players.some(p => p.isHuman && !p.isBot)) return 'aucun joueur humain réel';
    // Ceinture et bretelles anti double-attribution de points : persist()
    // n'écrit jamais un état gagné, mais un crash au mauvais moment pourrait
    // en laisser un — le rejouer réappliquerait les points de fin de partie.
    if (snapshotIsWon(snap)) return 'partie déjà gagnée';
    return null;
}

function snapshotIsWon(snap: GameSnapshot): boolean {
    if (snap.gameMode === '2v2') {
        const marblesByColor = Object.fromEntries(
            snap.players.map(p => [p.color, p.marblePositions])
        ) as Record<MarbleColor, number[]>;
        return snap.players.some(p => hasTeamWon(marblesByColor, p.color));
    }
    return snap.players.some(p => hasWon(p.marblePositions, p.color));
}

/** Reconstruit une partie : câblage identique aux sites de lancement normaux. */
function restoreGame(snap: GameSnapshot, sessionManager: SessionManager): void {
    const reconnect = sessionManager.reconnect;
    const messenger = new MultiWsMessenger();
    const game = Game.fromSnapshot(snap, messenger);
    GameRegistry.register(game.id, game);

    messenger.setOnTempDisconnect((color) => game.markTempDisconnected(color));
    messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));
    game.setOnPlayerAbandoned((gameId, color) => reconnect.releaseSlot(gameId, color));
    game.setOnGameEnded((gameId) => {
        reconnect.releaseGame(gameId);
        queueDeleteSnapshot(gameId);
    });
    game.setOnSnapshot(g => queueSaveSnapshot({
        ...g.toSnapshotData(),
        reconnectSlots: reconnect.getSlotsForGame(g.id),
    }));

    for (const slot of snap.reconnectSlots) {
        reconnect.register(slot.guestPlayerId, game.id, slot.color, slot.userId);
    }

    const slotByColor = new Map(snap.reconnectSlots.map(s => [s.color, s]));
    let botSeats = 0;
    for (const p of snap.players.filter(p => p.isHuman)) {
        if (p.isBot && p.userId) {
            // Siège agent IA : PAS de fenêtre de 180s — si l'agent ne revient
            // jamais, l'auto-play tient le siège indéfiniment ; une expiration
            // déclencherait markDisconnected et offrirait au dernier humain une
            // victoire par forfait imméritée.
            let slot = slotByColor.get(p.color);
            if (!slot) {
                // Snapshot sans slot pour ce siège (ne devrait pas arriver) :
                // on en recrée un pour que le re-seat reste possible.
                slot = { guestPlayerId: crypto.randomUUID(), color: p.color, userId: p.userId };
                reconnect.register(slot.guestPlayerId, game.id, slot.color, slot.userId);
            }
            restoredBotSeats.push({
                gameId: game.id,
                color: p.color,
                guestPlayerId: slot.guestPlayerId,
                originalUserId: p.userId,
                addedAt: Date.now(),
            });
            botSeats++;
        } else {
            // Siège humain : arme la fenêtre de 180s pour que les invités
            // puissent rejoindre (cas 1 de reconnect()) et que les sièges
            // définitivement abandonnés soient nettoyés par le chemin
            // onPermanentDisconnect existant.
            messenger.armReconnectWindow(p.color);
        }
    }

    console.log(`💾 Partie ${game.id} restaurée (tour ${snap.turn}, ${botSeats} siège(s) bot)`);
    if (botSeats > 0) scheduleBotRedispatch(game.id, snap);
}

/** Sièges bots de cette partie toujours en attente d'un agent. */
function pendingBotSeats(gameId: string): number {
    const game = GameRegistry.get(gameId);
    const messenger = game?.getMessenger();
    if (!game || !(messenger instanceof MultiWsMessenger)) return 0;
    return restoredBotSeats.filter(s => s.gameId === gameId && !messenger.hasConnection(s.color)).length;
}

/**
 * Re-réveille les agents IA d'une partie restaurée : un dispatch par siège
 * vacant, réessayé tant que le pool est occupé (503) ou que l'agent n'est pas
 * revenu, jusqu'à BOT_RESEAT_MAX_MS. L'auto-play couvre l'attente.
 */
function scheduleBotRedispatch(gameId: string, snap: GameSnapshot): void {
    const startedAt = Date.now();
    const tick = () => {
        const pending = pendingBotSeats(gameId);
        if (pending === 0 || Date.now() - startedAt > BOT_RESEAT_MAX_MS) {
            clearInterval(timer);
            if (pending > 0) {
                console.warn(`🤖 Partie ${gameId} — ${pending} siège(s) bot jamais réclamé(s), auto-play définitif`);
            }
            return;
        }
        for (let i = 0; i < pending; i++) void dispatchBotAgent(snap.gameMode);
    };
    const timer = setInterval(tick, BOT_RESEAT_RETRY_MS);
    timer.unref();
    tick();
}

/**
 * Tente d'asseoir un agent IA (dont le `joinMatchmaking` vient d'arriver) sur
 * un siège bot vacant d'une partie restaurée, au lieu de la file d'attente.
 * L'agent reçoit exactement la même séquence qu'à un lancement normal
 * (`welcome` puis l'état complet) — aucun changement côté service agent.
 * Retourne false s'il n'y a aucun siège à réclamer (flux matchmaking normal).
 */
export function trySeatBotInRestoredGame(ws: WebSocket, botUserId: string, sessionManager: SessionManager): boolean {
    const seat = claimRestoredBotSeat();
    if (!seat) return false;

    const game = GameRegistry.get(seat.gameId)!;
    const messenger = game.getMessenger() as MultiWsMessenger;
    // allowExpired : aucun timer de 180s n'est armé pour les sièges bots.
    messenger.reconnect(seat.color, ws, true);

    if (botUserId !== seat.originalUserId) {
        // Le pool a fourni un autre botId que celui d'origine : réaligner le
        // siège et les deux index du ReconnectRegistry (release d'abord, sinon
        // l'ancien botId reste engagé dans byUser).
        game.updatePlayerUserId(seat.color, botUserId);
        sessionManager.reconnect.releaseSlot(seat.gameId, seat.color);
        sessionManager.reconnect.register(seat.guestPlayerId, seat.gameId, seat.color, botUserId);
    }

    messenger.sendTo(seat.color, {
        type: 'welcome',
        message: 'Game started',
        timestamp: new Date().toISOString(),
        gameState: null,
        guestPlayerId: seat.guestPlayerId,
        gameId: seat.gameId,
        myColor: seat.color,
    });
    game.resendStateToPlayer(seat.color);

    console.log(`🤖 Agent ${botUserId} re-seaté sur ${seat.color} (partie restaurée ${seat.gameId})`);
    return true;
}

/**
 * Premier siège encore réclamable (FIFO). Les entrées périmées — partie
 * disparue, siège déjà occupé (agent revenu par `joinGame` de lui-même), ou
 * TTL dépassé — sont purgées au passage.
 */
function claimRestoredBotSeat(): RestoredBotSeat | null {
    const now = Date.now();
    while (restoredBotSeats.length > 0) {
        const seat = restoredBotSeats.shift()!;
        if (now - seat.addedAt > BOT_SEAT_TTL_MS) continue;
        const game = GameRegistry.get(seat.gameId);
        const messenger = game?.getMessenger();
        if (!game || !(messenger instanceof MultiWsMessenger)) continue;
        if (messenger.hasConnection(seat.color)) continue;
        return seat;
    }
    return null;
}

/**
 * Flush au shutdown (SIGTERM) : snapshot immédiat de toutes les parties vives
 * puis attente des écritures. Assurance complémentaire — la persistance par
 * tour reste le mécanisme principal (un crash ne reçoit aucun signal).
 */
export async function flushAllSnapshots(): Promise<void> {
    for (const game of GameRegistry.all()) {
        game.persistNow();
    }
    await whenWritesIdle();
}
