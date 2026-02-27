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
    turn: number = 0;
    deck: Deck;
    ws: WebSocket;
    discardedCards: Card[] = [];

    constructor(ws: WebSocket) {
        this.ws = ws;
        this.player1 = new Player(false, "Player 1", "red", getHomePositions("red"));
        this.player2 = new Player(false, "Player 2", "green", getHomePositions("green"));
        this.player3 = new Player(false, "Player 3", "blue", getHomePositions("blue"));
        this.player4 = new Player(false, "Player 4", "orange", getHomePositions("orange"));
        this.deck = new Deck();
        this.startGame();
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    async startGame() {
        console.log("🎮 Game started");
        this.dealCards();
        this.broadcastState(this.player1, null, "Game started");

        while (!this.gameIsOver()) {
            if (this.player1.handEmpty() && this.player2.handEmpty() && this.player3.handEmpty() && this.player4.handEmpty()) {
                this.dealCards();
            }
            await this.playOneTurn();
        }

        console.log("🏆 Game over!");
        this.broadcastState(this.getCurrentPlayer(), null, "Game over");
    }

    private async playOneTurn() {
        this.turn++;
        const player = this.getCurrentPlayer();

        console.log(`🔄 Tour ${this.turn} — ${player.name} (${player.color})`);

        this.syncAllMarblesOnBoard();

        // ── Bug 1 fix : le timeout est maintenant annulable ──────────────────
        const move = await this.waitForActionOrTimeout(player);
        const enrichedMove: Action = { ...move, playerColor: player.color };

        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 1️⃣ Broadcast de l'action jouée (pour l'animation de carte côté front)
        this.broadcastAction(enrichedMove);

        // 2️⃣ Broadcast du nouvel état (positions mises à jour → front peut animer le pion)
        this.turn++;
        const nextPlayer = this.getCurrentPlayer();
        this.turn--;
        this.broadcastState(nextPlayer, enrichedMove);

        // 3️⃣ Attendre que le front confirme que les animations sont terminées
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
        const fallbackDelay = CARD_LAND_DELAY_MS + animDuration + 500;

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
                        resolve();
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
            case 'capture':
                // TODO
                break;
            case 'swap':
                // TODO
                break;
            case 'pass':
                break;
        }
    }

    private broadcastState(currentPlayer: Player, lastAction: Action | null, message = 'New turn'): void {
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
                })),
                currentTurn: {
                    color: currentPlayer.color,
                    lastAction: lastAction ?? null,
                },
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

    private getCurrentPlayer(): Player {
        return this.getAllPlayers()[(this.turn - 1) % 4]!;
    }

    dealCards(): void {
        if (this.deck.isEmpty()) this.deck.resetDeck();
        this.deck.shuffle();
        this.player1.cards = this.deck.drawCards(CARDS_PER_HAND);
        this.player2.cards = this.deck.drawCards(CARDS_PER_HAND);
        this.player3.cards = this.deck.drawCards(CARDS_PER_HAND);
        this.player4.cards = this.deck.drawCards(CARDS_PER_HAND);
    }

    gameIsOver(): boolean {
        return this.getAllPlayers().some(p => hasWon(p.marblePositions, p.color));
    }
}