import crypto from 'node:crypto';
import { Deck } from "./deck.js";
import { Player } from "./player.js";
import { AiStrategy } from "./ai-strategy.js";
import { HumanStrategy } from "./human-strategy.js";
import { getLegalAction, findLegalMoveForCard, getLegalSplit7Action, MAIN_PATH, type LegalMoveContext } from '../utils/utils.js';
import { MultiWsMessenger, type GameMessenger } from './game-messenger.js';
import { GameRegistry } from '../session/game-registry.js';
import { updateUserPoints, recomputeRankings, getUserPointsAndRanking } from '../db.js';
import { computeEndGamePointsDeltas } from './points.js';
import {
    getHomePositions,
    hasWon,
    TURN_DURATION_SECONDS,
    TURN_DURATION_MS,
    TURN_TIMEOUT_OFFSET_MS,
    CARDS_PER_HAND,
    computeMinAnimationDuration,
} from '@mercury/shared';
import type { Action, Card, ClientMessage, GameConfig, MarbleColor } from "@mercury/shared";

export class Game {

    readonly id: string = crypto.randomUUID();

    private players: Player[];
    private turn: number = 0;
    private round: number = 0;
    private firstPlayerOfRound: number = 0;
    private currentPlayerIndex: number = 0;
    private deck: Deck;
    private messenger: GameMessenger;
    private discardedCards: Card[] = [];

    // ── Synchronisation des tours humains ────────────────────────────────────

    /**
     * Resolve de la Promise créée par `awaitHumanAction()`.
     * Mis à null dès qu'une action est reçue ou qu'un timeout se déclenche,
     * ce qui évite d'accepter des actions en retard sur le tour suivant.
     */
    private pendingHumanActionResolve: ((action: Action) => void) | null = null;

    /** Resolve de la Promise créée par `waitForAnimationsOrTimeout()`. */
    private pendingAnimationResolve: (() => void) | null = null;

    /** Action jouée automatiquement suite à un `turnTimeout` du front (pour marquer isTimeout). */
    private pendingTimeoutAction: Action | null = null;

    /** Vrai quand la partie a été annulée (plus aucun humain connecté). */
    private aborted = false;

    /** Vrai quand la partie est terminée (victoire naturelle ou abandon). */
    private gameFinished = false;

    /** UserIds des joueurs déjà pénalisés pour abandon (-2), pour ne pas aussi leur infliger -1. */
    private penalizedUserIds = new Set<string>();

    /** Callback appelé quand un joueur abandonne (pour nettoyer playerIdentities). */
    private onPlayerAbandoned: ((gameId: string, color: MarbleColor) => void) | null = null;

    // ─────────────────────────────────────────────────────────────────────────

    constructor(config: GameConfig, messenger: GameMessenger) {
        this.messenger = messenger;

        this.players = config.players.map(cfg => {
            const player = new Player(
                cfg.name,
                cfg.color,
                cfg.isHuman,
                cfg.isHuman
                    ? new HumanStrategy(() => this.awaitHumanAction())
                    : new AiStrategy(),
            );
            if (cfg.picture) player.picture = cfg.picture;
            if (cfg.userId) player.userId = cfg.userId;
            return player;
        });

        this.deck = new Deck();

        // Handler centralisé : toute la logique WS passe par ici
        messenger.onMessage((msg, senderColor) => this.handleClientMessage(msg, senderColor));

        this.startGame();
    }

    getMessenger(): GameMessenger {
        return this.messenger;
    }

    setOnPlayerAbandoned(cb: (gameId: string, color: MarbleColor) => void): void {
        this.onPlayerAbandoned = cb;
    }

    resendStateToPlayer(color: MarbleColor): void {
        const currentPlayer = this.players[this.currentPlayerIndex]!;
        const player = this.players.find(p => p.color === color);
        if (!player) return;

        // Restore the connection flag — they may have been marked as temporarily
        // disconnected (or as abandoned, for signed-in players who came back).
        const wasDisconnected = !player.isConnected;
        player.isConnected = true;

        const commonGameState = {
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                isConnected: p.isConnected,
                marblePositions: p.marblePositions,
                cardsLeft: p.cards.length,
                picture: p.picture,
                userId: p.userId,
            })),
            currentTurn: currentPlayer.color,
            timer: TURN_DURATION_SECONDS,
            discardedCards: this.discardedCards,
            canDiscard: this.computeCanDiscard(currentPlayer),
        };

        this.messenger.sendTo(color, {
            type: 'gameState',
            message: 'Reconnected',
            timestamp: new Date().toISOString(),
            gameState: { ...commonGameState, hand: player.cards },
            myColor: color,
        });

        // Notify other players that this player is connected again — they need to
        // update their UI (remove the "disconnected" indicator).
        if (wasDisconnected) {
            this.broadcastConnectionUpdate();
        }
    }

    /**
     * Mark a player as temporarily disconnected (their WebSocket just closed).
     * Other players should see them as offline immediately, without waiting for
     * the 180s reconnect window to expire. This does NOT trigger abort/win-by-default
     * logic — that is reserved for the permanent disconnect path (`markDisconnected`).
     */
    markTempDisconnected(color: MarbleColor): void {
        const player = this.players.find(p => p.color === color);
        if (!player || !player.isConnected) return;
        player.isConnected = false;
        this.broadcastConnectionUpdate();
    }

    /** Mark a player as permanently disconnected and check if game should abort. */
    markDisconnected(color: MarbleColor): void {
        const player = this.players.find(p => p.color === color);
        if (player) {
            const wasConnected = player.isConnected;
            player.isConnected = false;
            if (player.userId && !this.gameFinished && !this.penalizedUserIds.has(player.userId)) {
                this.penalizedUserIds.add(player.userId);
                updateUserPoints(player.userId, -2)
                    .then(() => recomputeRankings())
                    .catch(err => console.error('❌ Failed to update points on disconnect:', err));
            }
            if (wasConnected) this.broadcastConnectionUpdate();
            this.checkAbort();
        }
    }

    /**
     * Broadcast a lightweight state update reflecting current connection flags.
     * Reuses the 'gameState' message shape but with a distinct message string so
     * the frontend does not treat it as a new turn (which would reset the timer).
     */
    private broadcastConnectionUpdate(): void {
        const currentPlayer = this.players[this.currentPlayerIndex]!;
        const commonGameState = {
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                isConnected: p.isConnected,
                marblePositions: p.marblePositions,
                cardsLeft: p.cards.length,
                picture: p.picture,
                userId: p.userId,
            })),
            currentTurn: currentPlayer.color,
            timer: TURN_DURATION_SECONDS,
            discardedCards: this.discardedCards,
            canDiscard: this.computeCanDiscard(currentPlayer),
        };

        for (const player of this.players.filter(p => p.isHuman)) {
            this.messenger.sendTo(player.color, {
                type: 'gameState',
                message: 'Connection update',
                timestamp: new Date().toISOString(),
                gameState: { ...commonGameState, hand: player.cards },
            });
        }
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    private async startGame() {
        console.log("🎮 Game started");

        this.firstPlayerOfRound = 0;
        this.currentPlayerIndex = 0;
        this.dealCards();

        while (!this.aborted && !this.gameIsOver()) {
            if (this.allHandsEmpty()) {
                this.startNewRound();
                continue;
            }

            await this.playOneTurn();

            if (this.aborted) break;

            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            this.turn++;
        }

        if (!this.aborted) {
            console.log("🏆 Game over!");
            this.gameFinished = true;
            const winner = this.players.find(p => hasWon(p.marblePositions, p.color))!;
            this.messenger.send({ type: 'gameEnded', winner: winner.color, reason: 'win' });
            GameRegistry.delete(this.id);
            this.applyEndGamePoints(winner.color).catch(err =>
                console.error('❌ Failed to update points after game end:', err)
            );
        }
    }

    private startNewRound(): void {
        this.firstPlayerOfRound = (this.firstPlayerOfRound + 1) % this.players.length;
        this.currentPlayerIndex = this.firstPlayerOfRound;
        console.log(`📦 Nouvelle manche ${this.round} - Premier joueur: ${this.players[this.firstPlayerOfRound]!.name}`);
        this.dealCards();
    }

    private async playOneTurn() {
        const player = this.players[this.currentPlayerIndex]!;
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;

        console.log(`🔄 Tour ${this.turn} (Manche ${this.round}) — ${player.name} (${player.color})`);

        // 1️⃣ Broadcast de l'état EN DÉBUT de tour
        this.broadcastState(player, 'New turn');

        // 2️⃣ Attendre l'action du joueur/IA
        // Main vide → pass immédiat, pas besoin d'attendre (humain ou IA)
        this.pendingTimeoutAction = null;
        let move: Action;
        let isTimeout = false;
        let isAutoPlay = false;

        if (player.handEmpty()) {
            move = { type: 'pass' as const, from: 0, to: 0, cardPlayed: null, playerColor: player.color };
        } else if (player.isHuman && !player.isConnected) {
            // Joueur humain déconnecté → coup automatique immédiat (pas d'attente 32s)
            console.log(`🤖 ${player.name} est déconnecté — coup automatique`);
            move = this.computeFallbackAction(player);
            isAutoPlay = true;
        } else {
            move = await this.waitForActionOrTimeout(player, marblesByColor);
            isTimeout = this.pendingTimeoutAction !== null;
        }

        this.pendingTimeoutAction = null;
        const enrichedMove: Action = { ...move, playerColor: player.color };

        if (enrichedMove.type === 'enter') {
            const enemyOnStart = this.players.some(
                p => p.color !== player.color && p.marblePositions.includes(enrichedMove.to),
            );
            if (enemyOnStart) {
                enrichedMove.capturedOnEnter = true;
            }
        }

        // 3️⃣ Mettre à jour l'état interne
        player.applyAction(enrichedMove);
        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 4️⃣ Broadcast de l'action (pour animation carte + pion côté front)
        this.broadcastAction(enrichedMove, isTimeout, isAutoPlay);

        // 5️⃣ Attendre la durée minimale d'animation (autorité serveur)
        await this.waitForAnimationsOrTimeout(enrichedMove);
    }

    // ─── Handler centralisé des messages WS ──────────────────────────────────

    private handleClientMessage(msg: ClientMessage, senderColor: MarbleColor | null): void {
        switch (msg.type) {
            case 'playAction':
                this.handlePlayAction(msg.action, senderColor);
                break;
            case 'animationDone':
                // Le serveur fait autorité sur le timing : il attend
                // computeMinAnimationDuration(action) avant de continuer.
                // Le message du client est conservé dans le contrat WS mais
                // ignoré ici pour empêcher un client malveillant d'écourter
                // les animations des autres joueurs.
                break;
            case 'turnTimeout':
                this.handleTurnTimeout(senderColor);
                break;
            case 'abandonGame':
                this.handleAbandonGame(senderColor);
                break;
            // start / createRoom / joinRoom sont gérés par SessionManager avant
            // que la Game soit créée — on les ignore silencieusement ici.
        }
    }

    // ─── Gestion des actions humaines ────────────────────────────────────────

    /**
     * Retourne une Promise qui sera résolue par `handlePlayAction`
     * quand un message `playAction` valide arrive.
     */
    private awaitHumanAction(): Promise<Action> {
        return new Promise<Action>(resolve => {
            this.pendingHumanActionResolve = resolve;
        });
    }

    private handleTurnTimeout(senderColor: MarbleColor | null): void {
        if (!this.pendingHumanActionResolve) return;

        const currentPlayer = this.players[this.currentPlayerIndex]!;
        if (!currentPlayer.isHuman) return;
        if (senderColor !== null && senderColor !== currentPlayer.color) return;

        console.log(`⏰ Timeout signalé par le front — ${currentPlayer.name} : coup imposé`);
        const resolve = this.pendingHumanActionResolve;
        this.pendingHumanActionResolve = null;
        this.pendingTimeoutAction = this.computeFallbackAction(currentPlayer);
        resolve(this.pendingTimeoutAction);
    }

    // ─── Abandon & abort ───────────────────────────────────────────────────

    private handleAbandonGame(senderColor: MarbleColor | null): void {
        if (!senderColor) return; // abandon only makes sense in multi-device

        const player = this.players.find(p => p.color === senderColor);
        if (!player || !player.isHuman) return;

        const isSignedIn = !!player.userId;
        console.log(`🏳️ ${player.name} (${senderColor}) a abandonné la partie${isSignedIn ? ' (signed-in — reconnect allowed)' : ''}`);

        player.isConnected = false;

        if (player.userId) {
            this.penalizedUserIds.add(player.userId);
            updateUserPoints(player.userId, -2)
                .then(() => recomputeRankings())
                .catch(err => console.error('❌ Failed to update points on abandon:', err));
        }

        if (this.messenger instanceof MultiWsMessenger) {
            if (isSignedIn) {
                // Signed-in player: keep the slot reservable so they can rejoin any time.
                // Their guestPlayerId in playerIdentities is preserved.
                this.messenger.softDisconnect(senderColor);
            } else {
                // Guest player: abandoning is final — close the WS and clean up identity.
                this.messenger.forceDisconnect(senderColor);
                this.onPlayerAbandoned?.(this.id, senderColor);
            }
        }

        // Tell remaining players about the connection change
        this.broadcastConnectionUpdate();

        this.checkAbort();
    }

    /** Abort the game if no human players are still connected. */
    private checkAbort(): void {
        const humanPlayers = this.players.filter(p => p.isHuman);
        const connectedHumans = humanPlayers.filter(p => p.isConnected);
        if (connectedHumans.length === 0) {
            this.abortGame();
            return;
        }
        if (connectedHumans.length === 1 && humanPlayers.length > 1) {
            this.declareLastConnectedWinner(connectedHumans[0]!);
        }
    }

    /** End the game with a win for the last remaining connected human player. */
    private declareLastConnectedWinner(winner: Player): void {
        if (this.gameFinished) return;
        this.gameFinished = true;
        this.aborted = true;

        console.log(`🏆 ${winner.name} (${winner.color}) wins — last connected player`);

        this.messenger.send({ type: 'gameEnded', winner: winner.color, reason: 'win_by_default' });

        if (this.pendingHumanActionResolve) {
            const currentPlayer = this.players[this.currentPlayerIndex]!;
            this.pendingHumanActionResolve({
                type: 'pass', from: 0, to: 0,
                cardPlayed: null, playerColor: currentPlayer.color,
            });
            this.pendingHumanActionResolve = null;
        }
        this.pendingAnimationResolve?.();
        this.pendingAnimationResolve = null;

        GameRegistry.delete(this.id);

        this.applyEndGamePoints(winner.color).catch(err =>
            console.error('❌ Failed to update points after game end:', err)
        );
    }

    /** Stop the game immediately and clean up. Idempotent. */
    private abortGame(): void {
        if (this.aborted) return;
        this.aborted = true;
        this.gameFinished = true;

        console.log("🚫 Game aborted — no connected human players remain");

        // Notify any still-connected clients (unlikely but possible with bots-only race)
        this.messenger.send({ type: 'gameEnded', winner: null, reason: 'abandoned' });

        // Unblock any pending promises so the game loop can exit
        if (this.pendingHumanActionResolve) {
            const currentPlayer = this.players[this.currentPlayerIndex]!;
            this.pendingHumanActionResolve({
                type: 'pass', from: 0, to: 0,
                cardPlayed: null, playerColor: currentPlayer.color,
            });
            this.pendingHumanActionResolve = null;
        }
        this.pendingAnimationResolve?.();
        this.pendingAnimationResolve = null;

        GameRegistry.delete(this.id);
    }

    // ─── Gestion des actions humaines ────────────────────────────────────────

    private handlePlayAction(action: Action, senderColor: MarbleColor | null): void {
        if (!this.pendingHumanActionResolve) return; // pas de tour humain en cours

        const currentPlayer = this.players[this.currentPlayerIndex]!;
        if (!currentPlayer.isHuman) return;

        // En multi-device : vérifier que l'action vient du bon joueur
        if (senderColor !== null && senderColor !== currentPlayer.color) {
            console.warn(`⚠️ Actions reçue de ${senderColor} alors que c'est au tour de ${currentPlayer.color}`);
            this.messenger.sendTo(senderColor, {
                type: 'actionRejected',
                reason: 'Not your turn',
            });
            return;
        }

        const validated = this.validateHumanAction(action, currentPlayer);
        if (!validated) {
            this.messenger.sendTo(currentPlayer.color, {
                type: 'actionRejected',
                reason: 'Invalid action',
            });
            return;
        }

        // Résoudre la Promise en attente et invalider immédiatement le slot
        const resolve = this.pendingHumanActionResolve;
        this.pendingHumanActionResolve = null;
        resolve(validated);
    }

    /**
     * Validation serveur d'une action humaine.
     * Recalcule le coup légal côté serveur et compare avec ce qu'a envoyé le client.
     * Retourne null si l'action est illégale.
     */
    private validateHumanAction(action: Action, player: Player): Action | null {
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles: Object.values(marblesByColor).flat(),
            playerColor: player.color,
            marblesByColor,
        };

        if (action.type === 'pass') {
            return { ...action, playerColor: player.color };
        }

        if (action.type === 'discard') {
            // N'accepter la défausse que si aucun coup légal n'est possible
            const hasLegalMove = player.cards.some(card => findLegalMoveForCard(card, ctx) !== null);
            if (hasLegalMove) return null;
            return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
        }

        // Vérifier que la carte déclarée est bien dans la main du joueur
        const card = action.cardPlayed?.[0];
        if (!card) return null;
        if (!player.cards.some(c => c.id === card.id)) return null;

        // Split 7 : le client envoie from/to pour le premier pion et splitFrom pour le second.
        if (card.value === '7' && action.splitFrom !== undefined && action.splitFrom !== 0) {
            const fromIdx = MAIN_PATH.indexOf(action.from);
            const toIdx = MAIN_PATH.indexOf(action.to);
            if (fromIdx === -1 || toIdx === -1) return null;
            const steps1 = (toIdx - fromIdx + MAIN_PATH.length) % MAIN_PATH.length;
            const serverAction = getLegalSplit7Action(card, action.from, steps1, action.splitFrom, ctx);
            if (!serverAction) return null;
            return { ...serverAction, playerColor: player.color };
        }

        // Le serveur recalcule lui-même l'action légale à partir de card + from.
        // Pour le Jack, on passe aussi action.to (la cible du swap choisie par le client).
        const target = card.value === 'J' ? action.to : undefined;
        const serverAction = getLegalAction(card, action.from, ctx, target);
        if (!serverAction) return null;

        return { ...serverAction, playerColor: player.color };
    }

    // ─── Attente avec timeout ─────────────────────────────────────────────────

    /**
     * Si le joueur n'a pas joué avant la fin du timer, le serveur impose une action :
     *  - coup légal (priorité IA) si possible
     *  - défausse sinon
     * `pass` est réservé à la main vide, géré en amont dans playOneTurn.
     */
    private computeFallbackAction(player: Player): Action {
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles: Object.values(marblesByColor).flat(),
            playerColor: player.color,
            marblesByColor,
        };

        for (const card of player.cards) {
            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`⏰ Timeout — ${player.name} : coup imposé ${card.value}${card.suit} [${action.type}]`);
                return { ...action, playerColor: player.color };
            }
        }

        console.log(`⏰ Timeout — ${player.name} : défausse imposée (aucun coup légal)`);
        return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
    }

    private waitForActionOrTimeout(player: Player, marblesByColor: Record<MarbleColor, number[]>): Promise<Action> {
        return new Promise<Action>((resolve) => {
            let settled = false;

            // Timer de sécurité : se déclenche si le frontend ne répond pas
            // (déconnexion, crash). En temps normal, c'est le `turnTimeout` du front
            // qui résout la promesse en premier (via handleTurnTimeout).
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.pendingHumanActionResolve = null;
                const fallback = this.computeFallbackAction(player);
                this.pendingTimeoutAction = fallback;
                resolve(fallback);
            }, TURN_DURATION_MS + TURN_TIMEOUT_OFFSET_MS);

            player.getAction(marblesByColor).then((action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(action);
            });
        });
    }

    private waitForAnimationsOrTimeout(action: Action): Promise<void> {
        const minDelay = computeMinAnimationDuration(action);

        return new Promise<void>((resolve) => {
            let settled = false;

            const finish = () => {
                if (settled) return;
                settled = true;
                this.pendingAnimationResolve = null;
                resolve();
            };

            // Conservé pour permettre à handleAbandonGame de débloquer la boucle.
            this.pendingAnimationResolve = finish;

            setTimeout(finish, minDelay);
        });
    }

    // ─── Broadcast ───────────────────────────────────────────────────────────

    private broadcastAction(action: Action, isTimeout = false, isAutoPlay = false): void {
        this.messenger.send({
            type: 'actionPlayed',
            timestamp: new Date().toISOString(),
            action,
            isTimeout,
            isAutoPlay,
        });
    }

    /** Vrai si le joueur courant n'a aucun coup légal (peut défausser). */
    private computeCanDiscard(player: Player): boolean {
        if (player.handEmpty()) return false;
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles: Object.values(marblesByColor).flat(),
            playerColor: player.color,
            marblesByColor,
        };
        return !player.cards.some(card => findLegalMoveForCard(card, ctx) !== null);
    }

    private broadcastState(currentPlayer: Player, message = 'New turn'): void {
        const commonGameState = {
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                isConnected: p.isConnected,
                marblePositions: p.marblePositions,
                cardsLeft: p.cards.length,
                picture: p.picture,
                userId: p.userId,
            })),
            currentTurn: currentPlayer.color,
            timer: TURN_DURATION_SECONDS,
            discardedCards: this.discardedCards,
            canDiscard: this.computeCanDiscard(currentPlayer),
        };

        const humanPlayers = this.players.filter(p => p.isHuman);

        if (humanPlayers.length === 0) {
            // Partie 100% IA — on diffuse sans main
            this.messenger.send({
                type: 'gameState', message,
                timestamp: new Date().toISOString(),
                gameState: { ...commonGameState, hand: [] },
            });
        } else {
            // Chaque humain reçoit sa propre main via sendTo.
            // En single-device sendTo == send ; en multi-device chacun reçoit les siennes.
            for (const player of humanPlayers) {
                this.messenger.sendTo(player.color, {
                    type: 'gameState', message,
                    timestamp: new Date().toISOString(),
                    gameState: { ...commonGameState, hand: player.cards },
                });
            }
        }
    }

    // ─── Mise à jour de l'état ────────────────────────────────────────────────

    private updateDiscardedCards(move: Action): void {
        if (move.cardPlayed) {
            this.discardedCards.push(...move.cardPlayed);
        }
    }

    private updateMarblePositions(player: Player, move: Action): void {
        switch (move.type) {
            case 'move':
            case 'enter':
            case 'promote':
            case 'capture': {
                // 1. Déplacer l'attaquant
                const index = player.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    player.marblePositions[index] = move.to;
                }

                // 2. Renvoyer le pion capturé à sa base
                for (const victim of this.players) {
                    if (victim === player) continue;
                    const victimIndex = victim.marblePositions.indexOf(move.to);
                    if (victimIndex !== -1) {
                        const homePositions = getHomePositions(victim.color);
                        const emptyHome = homePositions.find(pos => !victim.marblePositions.includes(pos));
                        if (emptyHome !== undefined) {
                            victim.marblePositions[victimIndex] = emptyHome;
                            console.log(`💀 ${player.name} a capturé un pion de ${victim.name}! Retour à la base (${emptyHome}).`);
                        }
                    }
                }

                // 3. Split du 7 : appliquer aussi le second mouvement
                if (move.splitFrom !== undefined && move.splitTo !== undefined) {
                    const splitIdx = player.marblePositions.indexOf(move.splitFrom);
                    if (splitIdx !== -1) {
                        player.marblePositions[splitIdx] = move.splitTo;
                    }
                    for (const victim of this.players) {
                        if (victim === player) continue;
                        const victimIndex = victim.marblePositions.indexOf(move.splitTo);
                        if (victimIndex !== -1) {
                            const homePositions = getHomePositions(victim.color);
                            const emptyHome = homePositions.find(pos => !victim.marblePositions.includes(pos));
                            if (emptyHome !== undefined) {
                                victim.marblePositions[victimIndex] = emptyHome;
                                console.log(`💀 Split 7 — ${player.name} a capturé un pion de ${victim.name}! Retour à la base (${emptyHome}).`);
                            }
                        }
                    }
                }
                break;
            }

            case 'swap': {
                // Déplacer le pion du joueur courant de `from` vers `to`
                const ownIdx = player.marblePositions.indexOf(move.from);
                if (ownIdx !== -1) {
                    player.marblePositions[ownIdx] = move.to;
                }
                // Déplacer le pion adverse de `to` vers `from`
                for (const other of this.players) {
                    if (other === player) continue;
                    const otherIdx = other.marblePositions.indexOf(move.to);
                    if (otherIdx !== -1) {
                        other.marblePositions[otherIdx] = move.from;
                        console.log(`🔄 ${player.name} a échangé avec ${other.name} (${move.from} ↔ ${move.to})`);
                        break;
                    }
                }
                break;
            }

            case 'pass':
            case 'discard':
                break;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private async applyEndGamePoints(winnerColor: MarbleColor): Promise<void> {
        // Collect non-penalized human players with a userId.
        // Disconnect/abandon penalties are applied separately with a flat -2 (intentionally
        // not Elo-weighted: they are a behaviour penalty, not a match outcome).
        const participants = this.players
            .filter(p => p.isHuman && p.userId && !this.penalizedUserIds.has(p.userId))
            .map(p => ({ color: p.color, userId: p.userId! }));

        if (participants.length === 0) return;

        // Fetch current points for every participant (needed for the Elo formula)
        const currentStats = await Promise.all(
            participants.map(async p => {
                const s = await getUserPointsAndRanking(p.userId);
                return { ...p, points: s?.points ?? 1000, isWinner: p.color === winnerColor };
            })
        );

        // Compute weighted deltas using the Elo-like formula in points.ts
        const deltas = computeEndGamePointsDeltas(
            currentStats.map(p => ({ userId: p.userId, points: p.points, isWinner: p.isWinner }))
        );

        // Apply deltas in parallel, then recompute rankings once
        await Promise.all(deltas.map(({ userId, delta }) => updateUserPoints(userId, delta)));
        await recomputeRankings();

        // Fetch updated stats and push a gameStats message to each player
        await Promise.all(
            currentStats.map(async p => {
                const updated = await getUserPointsAndRanking(p.userId);
                if (!updated) return;
                const delta = deltas.find(d => d.userId === p.userId)?.delta ?? 0;
                this.messenger.sendTo(p.color, {
                    type: 'gameStats',
                    pointsDelta: delta,
                    newPoints: updated.points,
                    newRanking: updated.ranking,
                });
                console.log(`📊 gameStats → ${p.color}: delta=${delta}, total=${updated.points}, rank=#${updated.ranking}`);
            })
        );
    }

    private allHandsEmpty(): boolean {
        return this.players.every(p => p.handEmpty());
    }

    private dealCards(): void {
        this.round++;
        if (this.deck.isEmpty()) this.deck.resetDeck();
        this.deck.shuffle();
        const cardsPerHand = this.deck.isFull() ? CARDS_PER_HAND : CARDS_PER_HAND - 1;
        for (const player of this.players) {
            player.cards = this.deck.drawCards(cardsPerHand);
        }
        console.log(`🃏 Distribution - Manche ${this.round}`);
    }

    private gameIsOver(): boolean {
        return this.players.some(p => hasWon(p.marblePositions, p.color));
    }
}
