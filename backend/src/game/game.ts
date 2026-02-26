import { Deck } from "./deck.js";
import { Player } from "./player.js";
import {
    getHomePositions,
    hasWon,
    TURN_DURATION_SECONDS,
    CARDS_PER_HAND,
    type MarbleColor,
    MARBLE_ANIMATION_DURATIONS,
    CARD_LAND_DELAY_MS,
} from '@keezen/shared';
import type { Action } from "@keezen/shared";
const PLAYER_ORDER: MarbleColor[] = ['red', 'green', 'blue', 'orange'];

export class Game {

    player1: Player;
    player2: Player;
    player3: Player;
    player4: Player;
    turn: number = 0;
    deck: Deck;
    ws: WebSocket;
    discardedCards: string[] = [];

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
        // Premier broadcast : currentTurn pointe vers le joueur qui va jouer (player1)
        this.broadcastState(this.player1, null, "Game started");

        while (!this.gameIsOver()) {
            await this.playOneTurn();
        }

        console.log("🏆 Game over!");
        this.broadcastState(this.getCurrentPlayer(), null, "Game over");
    }

    private async playOneTurn() {
        this.turn++;
        const player = this.getCurrentPlayer();

        if (player.handEmpty()) {
            this.dealCards();
        }

        const move = await this.waitForActionOrTimeout(player);
        const enrichedMove: Action = { ...move, playerColor: player.color };

        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 1️⃣ Broadcast immédiat : "voici l'action qui vient d'être jouée"
        this.broadcastAction(enrichedMove);

        // 2️⃣ Attendre que les animations soient terminées côté client
        await this.waitForAnimationsOrTimeout(enrichedMove);

        // 3️⃣ Avancer au prochain joueur et broadcaster le nouvel état
        this.turn++;
        const nextPlayer = this.getCurrentPlayer();
        this.turn--;

        this.broadcastState(nextPlayer, enrichedMove);
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
        // Délai total = vol de carte + animation du pion + petite marge
        const fallbackDelay = CARD_LAND_DELAY_MS + animDuration + 200;

        return new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, fallbackDelay);

            // Écoute un acquittement "animationDone" du client
            const onMessage = (raw: MessageEvent) => {
                try {
                    const msg = JSON.parse(raw.data as string);
                    if (msg.type === 'animationDone') {
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
            this.discardedCards.push(`${move.cardPlayed.value} of ${move.cardPlayed.suit}`);
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
                    console.warn(`⚠️ ${player.name} essaie de déplacer une bille depuis ${move.from} mais elle n'y est pas.`);
                }
                break;
            }
            case 'capture':
                // TODO: renvoyer le pion capturé à la home de son propriétaire
                break;
            case 'swap':
                // TODO: échanger les positions des deux pions
                break;
        }
    }

    private waitForActionOrTimeout(player: Player): Promise<Action> {
        const actionPromise = player.getPlayerAction();

        const timeoutPromise = new Promise<Action>((resolve) => {
            setTimeout(() => {
                console.log(`⏰ Timeout — ${player.name} passe son tour.`);
                resolve({ type: 'pass', from: 0, to: 0, cardPlayed: null, playerColor: player.color });
            }, TURN_DURATION_SECONDS * 1000);
        });

        return Promise.race([actionPromise, timeoutPromise]);
    }

    // ─── Broadcast ────────────────────────────────────────────────────────────

    /**
     * @param currentPlayer  Le joueur dont c'est LE TOUR (celui qui doit jouer)
     * @param lastAction     L'action qui vient d'être jouée (null en début de partie)
     * @param message        Message lisible pour le frontend
     */
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
                    color: currentPlayer.color, // ✅ couleur du joueur qui DOIT jouer maintenant
                    lastAction: lastAction ?? null,
                },
                timer: TURN_DURATION_SECONDS,
                hand: currentPlayer.cards,   // ✅ main du joueur dont c'est le tour
                discardedCards: this.discardedCards,
            }
        };
        this.ws.send(JSON.stringify(state));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private getAllPlayers(): Player[] {
        return [this.player1, this.player2, this.player3, this.player4];
    }

    /** Retourne le joueur dont c'est le tour selon `this.turn`. */
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
