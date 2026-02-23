import { Board } from "./board.js";
import { Deck } from "./deck.js";
import { Player } from "./player.js";
import type { Action } from "../types/types.js";

export class Game {

    player1: Player;
    player2: Player;
    player3: Player;
    player4: Player;
    turn: number = 0;
    deck: Deck;
    ws: WebSocket;
    discardedCards: string[] = []; // À typer avec Card[] quand tu veux

    readonly TURN_DURATION = 30; // 30 secondes

    constructor(ws: WebSocket) {
        this.ws = ws;
        this.player1 = new Player(false, "Player 1", "red", Board.getInitialMarblePositions("red"));
        this.player2 = new Player(false, "Player 2", "green", Board.getInitialMarblePositions("green"));
        this.player3 = new Player(false, "Player 3", "blue", Board.getInitialMarblePositions("blue"));
        this.player4 = new Player(false, "Player 4", "orange", Board.getInitialMarblePositions("orange"));
        this.deck = new Deck();
        this.startGame();
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    async startGame() {
        this.broadcastState(null, null, "Game started");
        console.log("🎮 Game started");
        this.dealCards(); // Distribution initiale

        while (!this.gameIsOver()) {
            await this.playOneTurn();
        }

        console.log("🏆 Game over!");
        this.broadcastState(null, null, "Game over"); // Dernier état envoyé
    }

    /**
     * Joue UN seul tour, puis retourne.
     * Le while dans startGame() s'occupe d'enchaîner.
     */
    private async playOneTurn() {
        this.turn++;
        const player = this.getPlayerTurn();

        console.log(`🔄 Tour ${this.turn} — ${player.name}`);

        if (player.handEmpty()) {
            console.log(`${player.name} n'a plus de cartes. Nouvelle donne...`);
            this.dealCards();
        }

        // Race entre l'action du joueur et le timeout de 30s
        const move = await this.waitForActionOrTimeout(player);
        this.updateMarblePositions(player, move);
        console.log(`✅ ${player.name} a joué :`, move);
        this.broadcastState(player, move);
    }

    private updateMarblePositions(player: Player, move: Action) {
        switch (move.type) {
            case 'move':
            case 'enter':
                const index = player.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    player.marblePositions[index] = move.to;
                } else {
                    console.warn(`⚠️ ${player.name} essaie de déplacer une bille depuis une position où il n'en a pas !`);
                }
                break;
            case 'capture':
                // Logique de capture à implémenter
                break;
            case 'swap':
                // Logique d'échange à implémenter
                break;
        }
    }

    /**
     * Retourne l'action du joueur, ou un "pass" forcé si le timeout expire.
     */
    private waitForActionOrTimeout(player: Player): Promise<Action> {
        const actionPromise = player.getPlayerAction();

        const timeoutPromise = new Promise<Action>((resolve) => {
            setTimeout(() => {
                console.log(`⏰ Timeout — ${player.name} passe son tour.`);
                resolve({ type: 'pass', from: 0, to: 0 });
            }, this.TURN_DURATION * 1000);
        });

        return Promise.race([actionPromise, timeoutPromise]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private broadcastState(player: Player | null, move: Action | null, message = 'New turn'): void {
        const state = {
            type: 'gameState',
            message: message,
            timestamp: new Date().toISOString(),
            gameState: {
                players: [this.player1, this.player2, this.player3, this.player4],
                currentTurn: player ? {
                    color: player ? this.getNextPlayer(player.color) : 'red',
                    lastAction: move ? move : null
                } : { color: 'red', lastAction: null },
                timer: this.TURN_DURATION,
                discardedCards: this.discardedCards,
            }
        };
        this.ws.send(JSON.stringify(state));
    }

    private getNextPlayer(currentColor: string): string {
        const order = ['red', 'green', 'blue', 'orange'];
        const currentIndex = order.indexOf(currentColor);
        return order[(currentIndex + 1) % order.length]!;
    }

    dealCards() {
        if (this.deck.isEmpty()) {
            this.deck.resetDeck();
        }
        this.deck.shuffle();
        this.player1.cards = this.deck.drawCards(5);
        this.player2.cards = this.deck.drawCards(5);
        this.player3.cards = this.deck.drawCards(5);
        this.player4.cards = this.deck.drawCards(5);
    }

    gameIsOver(): boolean {
        const players = [this.player1, this.player2, this.player3, this.player4];
        return players.some(player =>
            player.marblePositions.every(pos =>
                Board.getArrivalPositions(player.color).includes(pos)
            )
        );
    }

    getPlayerTurn(): Player {
        const players = [this.player1, this.player2, this.player3, this.player4];
        return players[(this.turn - 1) % 4]!;
        // turn=1 → index 0 → player1
        // turn=2 → index 1 → player2
        // turn=3 → index 2 → player3
        // turn=4 → index 3 → player4
        // turn=5 → index 0 → player1 ...
    }

}