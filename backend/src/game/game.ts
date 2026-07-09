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
import { isTrainMode } from '../train-mode.js';
import { getServerGameMode } from '../game-mode.js';
import { logGameStats } from './game-stats.js';
import {
    getHomePositions,
    hasWon,
    hasTeamWon,
    getControlledColor,
    getTeammateColor,
    findSolidaireEntry,
    ENTER_CARDS,
    HOME_POSITIONS,
    TURN_DURATION_SECONDS,
    TURN_DURATION_MS,
    TURN_TIMEOUT_OFFSET_MS,
    CARDS_PER_HAND,
    computeMinAnimationDuration,
} from '@mercury/shared';
import { REACTION_EMOJIS } from "@mercury/shared";
import type { Action, Card, ClientMessage, GameConfig, GameMode, GameState, MarbleColor, ReactionEmoji } from "@mercury/shared";

const REACTION_COOLDOWN_MS = 2000;

export class Game {

    readonly id: string = crypto.randomUUID();

    private players: Player[];
    /** Mode de jeu de la partie — fixé à la création (voir getServerGameMode). */
    private readonly gameMode: GameMode;
    private turn: number = 0;
    private round: number = 0;
    private readonly startTime: number = Date.now();
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

    /** Callback appelé quand un joueur abandonne (libère son slot de reconnexion). */
    private onPlayerAbandoned: ((gameId: string, color: MarbleColor) => void) | null = null;

    /** Callback appelé quand la partie se termine/annule (libère tous les slots). */
    private onGameEnded: ((gameId: string) => void) | null = null;

    /** Timestamp de la dernière réaction emoji envoyée par chaque joueur (anti-spam). */
    private lastReactionAt = new Map<MarbleColor, number>();

    // ─────────────────────────────────────────────────────────────────────────

    constructor(config: GameConfig, messenger: GameMessenger) {
        this.messenger = messenger;
        // Le mode vient de la config (tests) ou de l'env serveur (GAME_MODE).
        this.gameMode = config.gameMode ?? getServerGameMode();

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

        // Filet de sécurité : une exception dans la boucle de jeu ne doit ni
        // devenir une unhandledRejection, ni laisser la partie orpheline dans
        // le GameRegistry (fuite mémoire + slots de reconnexion bloqués).
        this.startGame()
            .catch(err => {
                console.error(`💥 Partie ${this.id} interrompue par une exception:`, err);
                this.gameFinished = true;
                try {
                    this.messenger.send({ type: 'gameEnded', winners: [], reason: 'abandoned' });
                } catch { /* sockets déjà fermées */ }
            })
            .finally(() => {
                GameRegistry.delete(this.id);
                this.onGameEnded?.(this.id);
            });
    }

    /**
     * Vrai si la partie peut être purgée du registre : terminée, annulée, ou
     * plus vieille que `maxAgeMs` (garde-fou contre les boucles bloquées).
     */
    isStale(maxAgeMs: number): boolean {
        return this.gameFinished || this.aborted || (Date.now() - this.startTime) > maxAgeMs;
    }

    getMessenger(): GameMessenger {
        return this.messenger;
    }

    setOnPlayerAbandoned(cb: (gameId: string, color: MarbleColor) => void): void {
        this.onPlayerAbandoned = cb;
    }

    setOnGameEnded(cb: (gameId: string) => void): void {
        this.onGameEnded = cb;
    }

    /**
     * Snapshot de l'état de jeu partagé par tous les joueurs (sans `hand`,
     * propre à chaque destinataire). Source unique pour tous les broadcasts.
     */
    private buildGameStateSnapshot(currentPlayer: Player): Omit<GameState, 'hand'> {
        return {
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                isConnected: p.isConnected,
                marblePositions: p.marblePositions,
                marbleInvincible: p.marbleInvincible,
                cardsLeft: p.cards.length,
                ...(p.picture !== undefined ? { picture: p.picture } : {}),
                ...(p.userId !== undefined ? { userId: p.userId } : {}),
            })),
            currentTurn: currentPlayer.color,
            gameMode: this.gameMode,
            timer: TURN_DURATION_SECONDS,
            discardedCards: this.discardedCards,
            canDiscard: this.computeCanDiscard(currentPlayer),
        };
    }

    resendStateToPlayer(color: MarbleColor): void {
        const currentPlayer = this.players[this.currentPlayerIndex]!;
        const player = this.players.find(p => p.color === color);
        if (!player) return;

        // Restore the connection flag — they may have been marked as temporarily
        // disconnected (or as abandoned, for signed-in players who came back).
        const wasDisconnected = !player.isConnected;
        player.isConnected = true;

        // Coming back cancels the permanent-disconnect penalty: a player who
        // rejoins and finishes the game must be scored normally (Elo), not left
        // with the flat -2 — which would also exclude them from the end-game
        // gameStats and freeze their screen on "Calculating…". Refund the -2 and
        // drop them from the penalized set so applyEndGamePoints treats them as a
        // regular participant.
        if (player.userId && this.penalizedUserIds.delete(player.userId)) {
            updateUserPoints(player.userId, 2)
                .then(() => recomputeRankings())
                .catch(err => console.error('❌ Failed to refund disconnect penalty on reconnect:', err));
        }

        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

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
        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

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

            const replay = await this.playOneTurn();

            if (this.aborted) break;

            // Un Joker joué (entrée ou +18) offre un tour supplémentaire :
            // on NE passe PAS au joueur suivant, le même joueur rejoue.
            if (!replay) {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            }
            this.turn++;
        }

        if (!this.aborted) {
            console.log("🏆 Game over!");
            this.gameFinished = true;
            const winners = this.computeWinners();
            this.messenger.send({ type: 'gameEnded', winners, reason: 'win' });
            this.logStats(winners, 'win');
            GameRegistry.delete(this.id);
            this.onGameEnded?.(this.id);
            this.applyEndGamePoints(winners).catch(err =>
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

    /**
     * Joue un tour. Retourne `true` si le coup déclenche un rejeu (Joker joué
     * comme entrée/déplacement) ET que le joueur a encore des cartes — auquel
     * cas la boucle principale ne passe pas au joueur suivant.
     */
    private async playOneTurn(): Promise<boolean> {
        const player = this.players[this.currentPlayerIndex]!;

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
            move = await this.waitForActionOrTimeout(player);
            isTimeout = this.pendingTimeoutAction !== null;
        }

        this.pendingTimeoutAction = null;
        // `playerColor` = le joueur qui a joué la carte (main, tour, rejeu Joker).
        // `marbleColor` = le propriétaire du pion déplacé, qui peut être le
        // coéquipier en 2v2 (switch de fin de jeu, solidaire, Valet libre).
        const enrichedMove: Action = {
            ...move,
            marbleColor: move.marbleColor ?? move.playerColor,
            playerColor: player.color,
        };

        if (enrichedMove.type === 'enter') {
            const enemyOnStart = this.players.some(
                p => p.color !== enrichedMove.marbleColor && p.marblePositions.includes(enrichedMove.to),
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

        // 6️⃣ Rejeu : un Joker effectivement joué (pas défaussé/passé) offre un
        // tour de plus, tant que le joueur a encore au moins une carte.
        return this.actionTriggersReplay(enrichedMove) && !player.handEmpty() && !this.aborted;
    }

    /**
     * Vrai quand l'action est un Joker effectivement joué (entrée ou +18),
     * ce qui déclenche un rejeu. Une défausse ou un pass (même si la main
     * défaussée contenait un Joker) ne donne PAS de tour supplémentaire.
     */
    private actionTriggersReplay(move: Action): boolean {
        if (move.type === 'discard' || move.type === 'pass') return false;
        return move.cardPlayed?.length === 1 && move.cardPlayed[0]!.value === 'Joker';
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
            case 'reaction':
                this.handleReaction(msg.emoji, senderColor, msg.fromColor);
                break;
            // start / createRoom / joinRoom sont gérés par SessionManager avant
            // que la Game soit créée — on les ignore silencieusement ici.
            default:
                console.warn(`⚠️ Game ${this.id} — message inattendu de ${senderColor ?? '?'}: ${(msg as ClientMessage).type}`);
        }
    }

    private handleReaction(emoji: ReactionEmoji, senderColor: MarbleColor | null, fromColor?: MarbleColor): void {
        // Validation stricte de la palette (le client peut être falsifié).
        if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return;

        // En multi-device, l'identité vient du messenger (autoritatif).
        // En single-device (senderColor null) on accepte fromColor envoyé par le
        // client à condition qu'il corresponde à un joueur humain de la partie.
        let author: MarbleColor;
        if (senderColor !== null) {
            author = senderColor;
        } else if (fromColor && this.players.some(p => p.color === fromColor && p.isHuman)) {
            author = fromColor;
        } else {
            return;
        }

        const now = Date.now();
        const last = this.lastReactionAt.get(author) ?? 0;
        if (now - last < REACTION_COOLDOWN_MS) return;
        this.lastReactionAt.set(author, now);

        this.messenger.send({
            type: 'reactionBroadcast',
            author,
            emoji,
            timestamp: now,
        });
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

        console.log(`🏳️ ${player.name} (${senderColor}) a abandonné la partie`);

        player.isConnected = false;

        if (player.userId) {
            this.penalizedUserIds.add(player.userId);
            updateUserPoints(player.userId, -2)
                .then(() => recomputeRankings())
                .catch(err => console.error('❌ Failed to update points on abandon:', err));
        }

        // Resigning is final for everyone now: close the WS and free the slot.
        // For signed-in players this releases their account (per spec, resign =
        // released) so they're no longer redirected into / blocked by this game;
        // the bot keeps playing their color until the game ends.
        if (this.messenger instanceof MultiWsMessenger) {
            this.messenger.forceDisconnect(senderColor);
        }
        this.onPlayerAbandoned?.(this.id, senderColor);

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

        // En 2v2, le dernier humain connecté fait gagner son ÉQUIPE entière.
        const winners = this.gameMode === '2v2'
            ? [winner.color, getTeammateColor(winner.color)]
            : [winner.color];
        this.messenger.send({ type: 'gameEnded', winners, reason: 'win_by_default' });
        this.logStats(winners, 'win_by_default');

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
        this.onGameEnded?.(this.id);

        this.applyEndGamePoints(winners).catch(err =>
            console.error('❌ Failed to update points after game end:', err)
        );
    }

    /** Stop the game immediately and clean up. Idempotent. */
    private abortGame(): void {
        if (this.aborted || this.gameFinished) return;
        this.aborted = true;
        this.gameFinished = true;

        console.log("🚫 Game aborted — no connected human players remain");

        // Notify any still-connected clients (unlikely but possible with bots-only race)
        this.messenger.send({ type: 'gameEnded', winners: [], reason: 'abandoned' });
        this.logStats([], 'abandoned');

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
        this.onGameEnded?.(this.id);
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
        const ctx = this.buildLegalMoveContext(player);

        if (action.type === 'pass') {
            return { ...action, playerColor: player.color };
        }

        // Mise en jeu solidaire (2v2) : quand elle s'applique, elle est
        // OBLIGATOIRE — la défausse est refusée et la seule action acceptée est
        // l'entrée d'un pion du coéquipier avec un A, un K ou un Joker.
        const solidaire = findSolidaireEntry(player.cards, ctx);

        if (action.type === 'discard') {
            if (solidaire) return null;
            // N'accepter la défausse que si aucun coup légal n'est possible
            const hasLegalMove = player.cards.some(card => findLegalMoveForCard(card, ctx) !== null);
            if (hasLegalMove) return null;
            return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
        }

        // Vérifier que la carte déclarée est bien dans la main du joueur
        const card = action.cardPlayed?.[0];
        if (!card) return null;
        if (!player.cards.some(c => c.id === card.id)) return null;

        if (solidaire) {
            // On respecte la carte d'entrée et le pion (case de réserve du
            // coéquipier) choisis par le client, tant qu'ils sont valides.
            if (!ENTER_CARDS.includes(card.value)) return null;
            const teammate = ctx.teammateColor!;
            const isTeammateReserve = HOME_POSITIONS[teammate].includes(action.from)
                && ctx.marblesByColor[teammate].includes(action.from);
            if (!isTeammateReserve) return null;
            return { ...solidaire, from: action.from, cardPlayed: [card], playerColor: player.color };
        }

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
        const ctx = this.buildLegalMoveContext(player);

        for (const card of player.cards) {
            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`⏰ Timeout — ${player.name} : coup imposé ${card.value}${card.suit} [${action.type}]`);
                return { ...action, playerColor: player.color };
            }
        }

        // Mise en jeu solidaire (2v2) : obligatoire avant toute défausse.
        const solidaire = findSolidaireEntry(player.cards, ctx);
        if (solidaire) {
            console.log(`⏰ Timeout — ${player.name} : entrée solidaire imposée (pion du coéquipier)`);
            return { ...solidaire, playerColor: player.color };
        }

        console.log(`⏰ Timeout — ${player.name} : défausse imposée (aucun coup légal)`);
        return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
    }

    private waitForActionOrTimeout(player: Player): Promise<Action> {
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

            player.getAction(this.buildLegalMoveContext(player)).then((action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(action);
            });
        });
    }

    private waitForAnimationsOrTimeout(action: Action): Promise<void> {
        // En self-play (TRAIN_MODE), aucun rendu visuel : on n'attend pas
        // la durée d'animation, les coups s'enchaînent immédiatement.
        const minDelay = isTrainMode() ? 0 : computeMinAnimationDuration(action);

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
        const ctx = this.buildLegalMoveContext(player);
        if (player.cards.some(card => findLegalMoveForCard(card, ctx) !== null)) return false;
        // Mise en jeu solidaire (2v2) : tant qu'elle s'applique, la défausse est interdite.
        return findSolidaireEntry(player.cards, ctx) === null;
    }

    /**
     * Contexte de validation des coups pour un joueur — source unique, utilisée
     * pour la stratégie (humain/IA), la validation serveur, le fallback timeout
     * et le calcul de `canDiscard`.
     *
     * En 2v2, un joueur qui a rentré ses 4 pions contrôle ceux de son
     * coéquipier : `ownMarbles`/`playerColor` désignent alors le coéquipier
     * (ses pions, son start, ses arrivées), et `teammateColor` active les
     * règles d'équipe du validateur (Valet libre, 7 partagé, solidaire).
     */
    private buildLegalMoveContext(player: Player): LegalMoveContext {
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;
        const base = {
            allMarbles: Object.values(marblesByColor).flat(),
            marblesByColor,
            invincibleMarblesByColor: this.buildInvincibleMarblesByColor(),
        };

        if (this.gameMode === '2v2') {
            const controlled = getControlledColor(player.color, player.marblePositions);
            return {
                ...base,
                ownMarbles: [...marblesByColor[controlled]],
                playerColor: controlled,
                teammateColor: getTeammateColor(controlled),
            };
        }

        return {
            ...base,
            ownMarbles: [...marblesByColor[player.color]],
            playerColor: player.color,
        };
    }

    /**
     * Construit la map des positions invincibles, par couleur. Un pion est
     * invincible uniquement entre son entrée (A/K) et son premier mouvement.
     */
    private buildInvincibleMarblesByColor(): Record<MarbleColor, number[]> {
        return Object.fromEntries(
            this.players.map(p => [
                p.color,
                p.marblePositions.filter((_, i) => p.marbleInvincible[i]),
            ])
        ) as Record<MarbleColor, number[]>;
    }

    /** Écrit une ligne de stats CSV pour cette partie (no-op hors TRAIN_MODE). */
    private logStats(winners: MarbleColor[], reason: string): void {
        logGameStats({
            gameId: this.id,
            durationMs: Date.now() - this.startTime,
            // 1v3 : une couleur ; 2v2 : les deux couleurs jointes (ex: "red+blue").
            winner: winners.length > 0 ? winners.join('+') : null,
            reason,
            rounds: this.round,
            turns: this.turn,
        });
    }

    private broadcastState(currentPlayer: Player, message = 'New turn'): void {
        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

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
        // Le pion déplacé peut appartenir à un autre joueur que celui qui a joué
        // la carte (2v2 : switch de fin de jeu, solidaire, 7 partagé, Valet libre).
        const moverColor = move.marbleColor ?? move.playerColor;
        const mover = this.players.find(p => p.color === moverColor) ?? player;

        switch (move.type) {
            case 'move':
            case 'enter':
            case 'promote':
            case 'capture': {
                // 1. Déplacer le pion
                const index = mover.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    mover.marblePositions[index] = move.to;
                    // Entry via A/K → marble becomes invincible. Any other
                    // movement (including a re-landing on the start) clears it.
                    mover.marbleInvincible[index] = (move.type === 'enter');
                }

                // 2. Renvoyer le pion capturé à sa base. Tout pion posé sur `to`
                // est victime SAUF celui qui vient de bouger — y compris un pion
                // du joueur actif ou de son coéquipier (pas d'immunité d'équipe).
                this.sendVictimsHome(move.to, mover, index, player);

                // 3. Split du 7 : appliquer aussi le second mouvement (le second
                // pion peut appartenir au coéquipier en 2v2)
                if (move.splitFrom !== undefined && move.splitTo !== undefined) {
                    const splitMover = this.players.find(p => p.color === (move.splitMarbleColor ?? moverColor)) ?? mover;
                    const splitIdx = splitMover.marblePositions.indexOf(move.splitFrom);
                    if (splitIdx !== -1) {
                        splitMover.marblePositions[splitIdx] = move.splitTo;
                        splitMover.marbleInvincible[splitIdx] = false;
                    }
                    this.sendVictimsHome(move.splitTo, splitMover, splitIdx, player);
                }
                break;
            }

            case 'swap': {
                // Les deux extrémités sont résolues par position : en 2v2 le
                // Valet peut échanger deux pions n'appartenant pas au joueur actif.
                const a = this.findMarbleAt(move.from);
                const b = this.findMarbleAt(move.to);
                if (a && b) {
                    a.owner.marblePositions[a.index] = move.to;
                    a.owner.marbleInvincible[a.index] = false;
                    b.owner.marblePositions[b.index] = move.from;
                    b.owner.marbleInvincible[b.index] = false;
                    console.log(`🔄 ${player.name} a échangé ${a.owner.name} ↔ ${b.owner.name} (${move.from} ↔ ${move.to})`);
                }
                break;
            }

            case 'pass':
            case 'discard':
                break;
        }
    }

    /** Localise le pion posé sur une case, toutes couleurs confondues. */
    private findMarbleAt(pos: number): { owner: Player; index: number } | null {
        for (const owner of this.players) {
            const index = owner.marblePositions.indexOf(pos);
            if (index !== -1) return { owner, index };
        }
        return null;
    }

    /**
     * Renvoie à sa base tout pion posé sur `pos`, à l'exception du pion qui
     * vient d'y être déplacé (`mover`/`moverIndex`). Contrairement à l'ancienne
     * version qui excluait le joueur actif entier, on peut capturer un pion de
     * n'importe quelle couleur — y compris celle du coéquipier ou du joueur
     * actif (second pion d'un 7 partagé atterrissant sur le premier, etc.).
     */
    private sendVictimsHome(pos: number, mover: Player, moverIndex: number, activePlayer: Player): void {
        for (const victim of this.players) {
            for (let i = 0; i < victim.marblePositions.length; i++) {
                if (victim === mover && i === moverIndex) continue;
                if (victim.marblePositions[i] !== pos) continue;
                const homePositions = getHomePositions(victim.color);
                const emptyHome = homePositions.find(p => !victim.marblePositions.includes(p));
                if (emptyHome !== undefined) {
                    victim.marblePositions[i] = emptyHome;
                    victim.marbleInvincible[i] = false;
                    console.log(`💀 ${activePlayer.name} a capturé un pion de ${victim.name}! Retour à la base (${emptyHome}).`);
                }
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private async applyEndGamePoints(winners: MarbleColor[]): Promise<void> {
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
                return { ...p, points: s?.points ?? 1000, isWinner: winners.includes(p.color) };
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

        // Penalized humans who are still connected at game end (e.g. penalized
        // via some path but never refunded) must still receive a gameStats, or
        // their screen freezes on "Calculating…". They are not Elo-scored — their
        // flat -2 was already applied — so we just report the current totals.
        const penalizedConnected = this.players.filter(
            p => p.isHuman && p.userId && p.isConnected && this.penalizedUserIds.has(p.userId),
        );
        await Promise.all(
            penalizedConnected.map(async p => {
                const updated = await getUserPointsAndRanking(p.userId!);
                if (!updated) return;
                this.messenger.sendTo(p.color, {
                    type: 'gameStats',
                    pointsDelta: -2,
                    newPoints: updated.points,
                    newRanking: updated.ranking,
                });
                console.log(`📊 gameStats → ${p.color} (pénalisé): delta=-2, total=${updated.points}, rank=#${updated.ranking}`);
            })
        );
    }

    private allHandsEmpty(): boolean {
        return this.players.every(p => p.handEmpty());
    }

    private dealCards(): void {
        this.round++;
        // Deck de 54 cartes (52 + 2 Jokers), 4 joueurs, cycle de 3 manches :
        // manche 1 = 5 cartes, manches 2 et 3 = 4 cartes ⇒ 5·4·4 = 13 cartes/joueur
        // (52 distribuées) et 2 cartes restent EN RÉSERVE (jamais distribuées) ce cycle.
        // On ne réinitialise le deck que lorsqu'il ne reste plus assez de cartes
        // pour une manche complète de 4 cartes — sinon on ferait les 2 réserves
        // entrer dans une distribution incomplète.
        const minCardsForRound = (CARDS_PER_HAND - 1) * this.players.length;
        if (this.deck.remainingCards() < minCardsForRound) {
            this.deck.resetDeck();
        }
        this.deck.shuffle();
        const cardsPerHand = this.deck.isFull() ? CARDS_PER_HAND : CARDS_PER_HAND - 1;
        for (const player of this.players) {
            player.cards = this.deck.drawCards(cardsPerHand);
        }
        console.log(`🃏 Distribution - Manche ${this.round} (${cardsPerHand} cartes/joueur, réserve: ${this.deck.remainingCards()})`);
    }

    private gameIsOver(): boolean {
        if (this.gameMode === '2v2') {
            // Victoire d'équipe : les DEUX coéquipiers ont rentré leurs 4 pions.
            // Un joueur fini seul continue de jouer (il contrôle les pions de
            // son coéquipier, voir buildLegalMoveContext).
            const marblesByColor = Object.fromEntries(
                this.players.map(p => [p.color, p.marblePositions])
            ) as Record<MarbleColor, number[]>;
            return this.players.some(p => hasTeamWon(marblesByColor, p.color));
        }
        return this.players.some(p => hasWon(p.marblePositions, p.color));
    }

    /** Couleur(s) gagnante(s) à la fin naturelle : une en 1v3, les deux de l'équipe en 2v2. */
    private computeWinners(): MarbleColor[] {
        const finished = this.players
            .filter(p => hasWon(p.marblePositions, p.color))
            .map(p => p.color);
        if (this.gameMode === '2v2') {
            const winner = finished.find(color => finished.includes(getTeammateColor(color)));
            return winner !== undefined ? [winner, getTeammateColor(winner)] : [];
        }
        return finished.length > 0 ? [finished[0]!] : [];
    }
}
