import { Deck } from "./deck.js";
import { Player } from "./player.js";
import { AiStrategy } from "./ai-strategy.js";
import { HumanStrategy } from "./human-strategy.js";
import { getLegalAction, findLegalMoveForCard, type LegalMoveContext } from '../utils/utils.js';
import type { GameMessenger } from './game-messenger.js';
import {
    getHomePositions,
    hasWon,
    TURN_DURATION_SECONDS,
    CARDS_PER_HAND,
} from '@keezen/shared';
import type { Action, Card, ClientMessage, GameConfig, MarbleColor } from "@keezen/shared";

export class Game {

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

    // ─────────────────────────────────────────────────────────────────────────

    constructor(config: GameConfig, messenger: GameMessenger) {
        this.messenger = messenger;

        this.players = config.players.map(cfg =>
            new Player(
                cfg.name,
                cfg.color,
                cfg.isHuman,
                cfg.isHuman
                    ? new HumanStrategy(() => this.awaitHumanAction())
                    : new AiStrategy(),
            )
        );

        this.deck = new Deck();

        // Handler centralisé : toute la logique WS passe par ici
        messenger.onMessage((msg, senderColor) => this.handleClientMessage(msg, senderColor));

        this.startGame();
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    private async startGame() {
        console.log("🎮 Game started");

        this.firstPlayerOfRound = 0;
        this.currentPlayerIndex = 0;
        this.dealCards();

        while (!this.gameIsOver()) {
            if (this.allHandsEmpty()) {
                this.startNewRound();
                continue;
            }

            await this.playOneTurn();

            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            this.turn++;
        }

        console.log("🏆 Game over!");
    }

    private startNewRound(): void {
        this.firstPlayerOfRound = (this.firstPlayerOfRound + 1) % this.players.length;
        this.currentPlayerIndex = this.firstPlayerOfRound;
        console.log(`📦 Nouvelle manche ${this.round} - Premier joueur: ${this.players[this.firstPlayerOfRound]!.name}`);
        this.dealCards();
    }

    private async playOneTurn() {
        const player = this.players[this.currentPlayerIndex]!;
        const allMarbles = this.players.flatMap(p => p.marblePositions);

        console.log(`🔄 Tour ${this.turn} (Manche ${this.round}) — ${player.name} (${player.color})`);

        // 1️⃣ Broadcast de l'état EN DÉBUT de tour
        this.broadcastState(player, 'New turn');

        // 2️⃣ Attendre l'action du joueur/IA
        // Main vide → pass immédiat, pas besoin d'attendre (humain ou IA)
        const move = player.handEmpty()
            ? { type: 'pass' as const, from: 0, to: 0, cardPlayed: null, playerColor: player.color }
            : await this.waitForActionOrTimeout(player, allMarbles);
        const enrichedMove: Action = { ...move, playerColor: player.color };

        // 3️⃣ Mettre à jour l'état interne
        player.applyAction(enrichedMove);
        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 4️⃣ Broadcast de l'action (pour animation carte + pion côté front)
        this.broadcastAction(enrichedMove);

        // 5️⃣ Attendre confirmation des animations (ou timeout fallback)
        await this.waitForAnimationsOrTimeout();
    }

    // ─── Handler centralisé des messages WS ──────────────────────────────────

    private handleClientMessage(msg: ClientMessage, senderColor: MarbleColor | null): void {
        switch (msg.type) {
            case 'playAction':
                this.handlePlayAction(msg.action, senderColor);
                break;
            case 'animationDone':
                this.pendingAnimationResolve?.();
                this.pendingAnimationResolve = null;
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

    private handlePlayAction(action: Action, senderColor: MarbleColor | null): void {
        if (!this.pendingHumanActionResolve) return; // pas de tour humain en cours

        const currentPlayer = this.players[this.currentPlayerIndex]!;
        if (!currentPlayer.isHuman) return;

        // En multi-device : vérifier que l'action vient du bon joueur
        if (senderColor !== null && senderColor !== currentPlayer.color) {
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
        const allMarbles = this.players.flatMap(p => p.marblePositions);
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles,
            playerColor: player.color,
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

        // Le serveur recalcule lui-même l'action légale à partir de card + from.
        // On ne fait pas confiance au type/to du client — le serveur est autoritaire.
        const serverAction = getLegalAction(card, action.from, ctx);
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
        const allMarbles = this.players.flatMap(p => p.marblePositions);
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles,
            playerColor: player.color,
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

    private waitForActionOrTimeout(player: Player, allMarbles: number[]): Promise<Action> {
        return new Promise<Action>((resolve) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.pendingHumanActionResolve = null;
                resolve(this.computeFallbackAction(player));
            }, TURN_DURATION_SECONDS * 1000);

            player.getAction(allMarbles).then((action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(action);
            });
        });
    }

    private waitForAnimationsOrTimeout(): Promise<void> {
        const fallbackDelay = 10000;

        return new Promise<void>((resolve) => {
            let settled = false;

            this.pendingAnimationResolve = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            setTimeout(() => {
                if (settled) return;
                settled = true;
                this.pendingAnimationResolve = null;
                console.log(`⏰ Animation fallback timeout (${fallbackDelay}ms)`);
                resolve();
            }, fallbackDelay);
        });
    }

    // ─── Broadcast ───────────────────────────────────────────────────────────

    private broadcastAction(action: Action): void {
        this.messenger.send({
            type: 'actionPlayed',
            timestamp: new Date().toISOString(),
            action,
        });
    }

    /** Vrai si le joueur courant n'a aucun coup légal (peut défausser). */
    private computeCanDiscard(player: Player): boolean {
        if (player.handEmpty()) return false;
        const allMarbles = this.players.flatMap(p => p.marblePositions);
        const ctx: LegalMoveContext = {
            ownMarbles: [...player.marblePositions],
            allMarbles,
            playerColor: player.color,
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
                break;
            }

            case 'swap':
                // TODO Phase 4 (carte J)
                break;

            case 'pass':
            case 'discard':
                break;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

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
