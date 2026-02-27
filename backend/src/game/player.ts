import type { Action, Card, MarbleColor } from "@keezen/shared";
import {
    findLegalMoveForCard,
    sleep,
    type LegalMoveContext,
} from "../utils/utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Priorité des cartes pour l'IA
//
// L'IA essaie les cartes dans cet ordre de préférence :
//  1. A/K  → entrer un pion en jeu est toujours prioritaire
//  2. Q    → avance de 12, très efficace
//  3. 10   → avance de 10
//  4. 9    → avance de 9
//  5. 8    → avance de 8
//  6. 6    → avance de 6
//  7. 5    → avance de 5
//  8. 3    → avance de 3
//  9. 2    → avance de 2
// 10. A    → utilisé comme 1 si pas d'entrée possible
//
// Cartes non gérées pour l'instant → pass :
//  - J (swap) : nécessite les positions adverses
//  - 7 (split): action multi-pion
//  - 4 (recul): logique inverse
// ─────────────────────────────────────────────────────────────────────────────

const AI_CARD_PRIORITY: Card['value'][] = [
    'K', 'A',  // entrée en jeu en premier
    'Q',        // grands déplacements
    '10', '9', '8', '6', '5', '3', '2',
    // J, 7, 4 : non gérés → seront passés
];

export class Player {

    public cards: Card[] = [];
    public isConnected: boolean = false;

    /**
     * Positions de tous les pions sur le plateau (toutes couleurs confondues).
     * Mis à jour par Game avant chaque tour pour que l'IA ait une vision globale.
     */
    public allMarblesOnBoard: number[] = [];

    constructor(
        public isHuman: boolean,
        public name: string,
        public color: MarbleColor,
        public marblePositions: number[]
    ) {
        this.isConnected = true;
    }

    // ── Interface principale ─────────────────────────────────────────────────

    async getPlayerAction(): Promise<Action> {
        if (this.isHuman) {
            console.log(`${this.name} est un joueur humain. En attente de l'input...`);
            // Sera implémenté avec la connexion WebSocket du joueur humain
            return this.calculateAIMove(); // fallback temporaire
        }

        console.log(`${this.name} (IA) calcule son coup...`);
        return this.calculateAIMove();
    }

    // ── Logique IA ───────────────────────────────────────────────────────────

    async calculateAIMove(): Promise<Action> {
        if (this.handEmpty()) {
            console.log(`${this.name} n'a plus de cartes. Passe son tour...`);
            return this.passAction();
        }
        await sleep(4500); // simule un temps de réflexion

        const ctx = this.buildContext();

        // Essaie les cartes par ordre de priorité
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = this.cards.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`${this.name} joue ${card.value}${card.suit} → ${action.type} [${action.from} → ${action.to}]`);
                this.removeCardFromHand(card);
                return action;
            }
        }

        // Aucun coup légal trouvé : passe et défausse toute la main
        console.log(`${this.name} ne peut jouer aucune carte → défausse`);
        const cardsBeforeDiscard = this.cards;
        this.discardHand();
        return this.discardAction(cardsBeforeDiscard);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Construit le contexte nécessaire à la validation des coups légaux.
     * `allMarblesOnBoard` doit avoir été mis à jour par Game avant l'appel.
     */
    private buildContext(): LegalMoveContext {
        return {
            ownMarbles: [...this.marblePositions],
            allMarbles: this.allMarblesOnBoard.length > 0
                ? [...this.allMarblesOnBoard]
                : [...this.marblePositions], // fallback si pas encore alimenté
            playerColor: this.color,
        };
    }

    private removeCardFromHand(card: Card): void {
        const index = this.cards.indexOf(card);
        if (index !== -1) this.cards.splice(index, 1);
    }

    /**
     * Défausse toute la main (règle : si on ne peut jouer aucune carte,
     * on défausse toute sa main face visible).
     */
    private discardHand(): void {
        console.log(`${this.name} défausse sa main (${this.cards.length} cartes)`);
        this.cards = [];
    }

    private discardAction(cardsBeforeDiscard: Card[]): Action {
        return {
            type: 'discard',
            from: 0,
            to: 0,
            cardPlayed: cardsBeforeDiscard,
            playerColor: this.color,
        };
    }

    private passAction(): Action {
        return {
            type: 'pass',
            from: 0,
            to: 0,
            cardPlayed: [], // pas de cartes jouées pour un pass
            playerColor: this.color,
        };
    }

    handEmpty(): boolean {
        return this.cards.length === 0;
    }
}