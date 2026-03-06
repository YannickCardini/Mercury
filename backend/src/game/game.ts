import { Deck } from "./deck.js";
import { Player } from "./player.js";
import {
    getHomePositions,
    hasWon,
    TURN_DURATION_SECONDS,
    CARDS_PER_HAND,
    MARBLE_ANIMATION_DURATIONS,
    CARD_LAND_DELAY_MS,
} from '@keezen/shared';
import type { Action, Card } from "@keezen/shared";

export class Game {

    player1: Player;
    player2: Player;
    player3: Player;
    player4: Player;
    turn: number = 0;        // Compteur de tours total
    round: number = 0;        // Compteur de manches
    firstPlayerOfRound: number = 0; // Index (0-3) du premier joueur de la manche courante
    currentPlayerIndex: number = 0; // Index du joueur qui doit jouer maintenant
    deck: Deck;
    ws: WebSocket;
    discardedCards: Card[] = [];

    constructor(ws: WebSocket) {
        this.ws = ws;
        this.player1 = new Player(false, "Player 1", "red", [...getHomePositions("red")]);
        this.player2 = new Player(false, "Player 2", "green", [...getHomePositions("green")]);
        this.player3 = new Player(false, "Player 3", "blue", [...getHomePositions("blue")]);
        this.player4 = new Player(false, "Player 4", "orange", [...getHomePositions("orange")]);
        this.deck = new Deck();
        this.startGame();
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    async startGame() {
        console.log("🎮 Game started");

        // Première manche : commence par le joueur 1 (index 0)
        this.firstPlayerOfRound = 0;
        this.currentPlayerIndex = 0;
        this.dealCards();

        while (!this.gameIsOver()) {
            // Vérifier si on doit commencer une nouvelle manche
            if (this.allHandsEmpty()) {
                this.startNewRound();
                // Ne pas jouer de tour immédiatement, on laisse la boucle recommencer
                continue;
            }

            await this.playOneTurn();

            // Passer au joueur suivant pour le prochain tour
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
            this.turn++;
        }
    }

    private startNewRound(): void {
        // Décaler le premier joueur pour la prochaine manche
        this.firstPlayerOfRound = (this.firstPlayerOfRound + 1) % 4;

        // Le premier joueur de la nouvelle manche est celui qui commence
        this.currentPlayerIndex = this.firstPlayerOfRound;

        // Distribuer les nouvelles cartes
        this.dealCards();

        console.log(`📦 Nouvelle manche ${this.round} - Premier joueur: ${this.getAllPlayers()[this.firstPlayerOfRound]!.name}`);
    }

    private async playOneTurn() {
        const player = this.getAllPlayers()[this.currentPlayerIndex]!;

        console.log(`🔄 Tour ${this.turn} (Manche ${this.round}) — ${player.name} (${player.color})`);

        this.syncAllMarblesOnBoard();

        // 1️⃣ Broadcast de l'état EN DÉBUT de tour
        this.broadcastState(player, 'New turn');

        // 2️⃣ Attendre l'action du joueur/IA
        const move = await this.waitForActionOrTimeout(player);
        const enrichedMove: Action = { ...move, playerColor: player.color };

        // 3️⃣ Mettre à jour l'état interne
        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 4️⃣ Broadcast de l'action (pour animation carte + pion côté front)
        this.broadcastAction(enrichedMove);

        // 5️⃣ Attendre confirmation des animations (ou timeout fallback)
        await this.waitForAnimationsOrTimeout(enrichedMove);
    }
    // ─── Bug 1 fix : timeout annulable ───────────────────────────────────────

    /**
     * Attend l'action du joueur avec un timeout annulable.
     * Le timer est clearé dès que le joueur joue, évitant les timeouts fantômes
     * qui se déclenchaient sur les tours suivants.
     */
    private waitForActionOrTimeout(player: Player): Promise<Action> {
        return new Promise<Action>((resolve) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.log(`⏰ Timeout — ${player.name} passe son tour.`);
                resolve({ type: 'pass', from: 0, to: 0, cardPlayed: null, playerColor: player.color });
            }, TURN_DURATION_SECONDS * 1000);

            player.getPlayerAction().then((action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer); // ✅ annule le timeout dès que l'IA a joué
                resolve(action);
            });
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private syncAllMarblesOnBoard(): void {
        const allPositions = this.getAllPlayers().flatMap(p => p.marblePositions);
        for (const player of this.getAllPlayers()) {
            player.allMarblesOnBoard = allPositions;
        }
    }

    private broadcastAction(action: Action): void {
        const msg = {
            type: 'actionPlayed',
            timestamp: new Date().toISOString(),
            action,
        };
        this.ws.send(JSON.stringify(msg));
    }

    private waitForAnimationsOrTimeout(action: Action): Promise<void> {
        const animDuration = MARBLE_ANIMATION_DURATIONS[action.type] ?? 0;
        const fallbackDelay = CARD_LAND_DELAY_MS + animDuration + 3000;

        return new Promise<void>((resolve) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.log(`⏰ Animation fallback timeout (${fallbackDelay}ms)`);
                resolve();
            }, fallbackDelay);

            const onMessage = (raw: MessageEvent) => {
                try {
                    const msg = JSON.parse(raw.data as string);
                    if (msg.type === 'animationDone') {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        this.ws.removeEventListener('message', onMessage);
                        +                   // Laisser le temps au front de finir le rendu avant le prochain broadcast
                            +                   setTimeout(resolve, animDuration);
                    }
                } catch { /* ignore */ }
            };
            this.ws.addEventListener('message', onMessage);
        });
    }

    private updateDiscardedCards(move: Action): void {
        if (move.cardPlayed) {
            this.discardedCards.push(...move.cardPlayed);
        }
    }

    private updateMarblePositions(player: Player, move: Action): void {
        switch (move.type) {
            case 'move':
            case 'enter': {
                const index = player.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    player.marblePositions[index] = move.to;
                } else {
                    console.warn(`⚠️ ${player.name} essaie de déplacer un pion depuis ${move.from} mais il n'y est pas.`);
                }
                break;
            }
            case 'capture': {
                // 1. Move the attacker
                const index = player.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    player.marblePositions[index] = move.to;
                }

                // 2. Find the victim and send them back to their home
                for (const victim of this.getAllPlayers()) {
                    if (victim === player) continue;

                    const victimMarbleIndex = victim.marblePositions.indexOf(move.to);
                    if (victimMarbleIndex !== -1) {
                        // Find an empty home position for the victim using getHomePositions
                        const homePositions = getHomePositions(victim.color);
                        const emptyHome = homePositions.find(pos => !victim.marblePositions.includes(pos));

                        if (emptyHome !== undefined) {
                            victim.marblePositions[victimMarbleIndex] = emptyHome;
                            console.log(`💀 ${player.name} a capturé un pion de ${victim.name}! Retour à la base (${emptyHome}).`);
                        }
                    }
                }
                break;
            }
            case 'swap':
                // TODO
                break;
            case 'pass':
                break;
        }
    }

    private broadcastState(currentPlayer: Player, message = 'New turn'): void {
        const state = {
            type: 'gameState',
            message,
            timestamp: new Date().toISOString(),
            gameState: {
                players: this.getAllPlayers().map(p => ({
                    name: p.name,
                    color: p.color,
                    isHuman: p.isHuman,
                    isConnected: p.isConnected,
                    marblePositions: p.marblePositions,
                    cardsLeft: p.cards.length,
                })),
                currentTurn: currentPlayer.color,
                timer: TURN_DURATION_SECONDS,
                hand: currentPlayer.cards,
                discardedCards: this.discardedCards,
            }
        };
        this.ws.send(JSON.stringify(state));
    }

    private getAllPlayers(): Player[] {
        return [this.player1, this.player2, this.player3, this.player4];
    }

    private allHandsEmpty(): boolean {
        return this.getAllPlayers().every(p => p.handEmpty());
    }


    dealCards(): void {
        this.round++; // Incrémenter le compteur de manche

        if (this.deck.isEmpty()) this.deck.resetDeck();
        this.deck.shuffle();
        const cardsPerHand = this.deck.isFull() ? CARDS_PER_HAND : CARDS_PER_HAND - 1;
        this.player1.cards = this.deck.drawCards(cardsPerHand);
        this.player2.cards = this.deck.drawCards(cardsPerHand);
        this.player3.cards = this.deck.drawCards(cardsPerHand);
        this.player4.cards = this.deck.drawCards(cardsPerHand);

        console.log(`🃏 Distribution - Manche ${this.round}`);
    }
    gameIsOver(): boolean {
        return this.getAllPlayers().some(p => hasWon(p.marblePositions, p.color));
    }
}