import type { Action, Card, MarbleColor } from "@keezen/shared";
import { calculateMoveFromCardAndMarble, sleep } from "../utils/utils.js";

export class Player {

    public cards: Card[] = [];
    public isConnected: boolean = false;


    constructor(
        public isHuman: boolean,
        public name: string,
        public color: MarbleColor,
        public marblePositions: number[]
    ) {
        this.isConnected = true;
    }

    async getPlayerAction(): Promise<Action> {
        // Logic to determine the player's action based on the game state and player type (human or AI)
        // This is a placeholder and should be implemented with actual game logic
        if (this.isHuman) {
            console.log(`${this.name} is a human player. Waiting for user input...`);
            // Here you would typically wait for user input from the frontend
        } else {
            console.log(`${this.name} is an AI player. Calculating move...`);
            return this.calculateAIMove();
        }
        return this.calculateAIMove();

    }

    async calculateAIMove(): Promise<Action> {
        // AI move calculation logic would go here
        console.log(`${this.name} is calculating an AI move.`);
        await sleep(5000); // Simulate thinking time for AI
        const chosenCard = this.calculateAICardChoice();
        const chosenMarble = this.calculateAIMarbleChoice();
        if (chosenCard) {
            console.log(`${this.name} chooses to play ${chosenCard.value} of ${chosenCard.suit}.`);
            return calculateMoveFromCardAndMarble(chosenCard, chosenMarble, this.color);
        } else {
            console.log(`${this.name} has no valid cards to play.`);
        }
        return {
            type: 'pass',
            from: 0,
            to: 0
        } as Action;
    }

    calculateAICardChoice(): Card | undefined {
        if (this.cards.length == 0) {
            console.log(`${this.name} has no cards left to play.`);
            return undefined;
        }
        // if there's an As or King, play it
        const hasAsOrKing = this.cards.some(card => card.value === 'A' || card.value === 'K');
        console.log(`${this.name} has ${this.cards.length} cards. Has As or King: ${hasAsOrKing}`);
        if (hasAsOrKing) {
            const chosenCard = this.cards.find(card => card.value === 'A' || card.value === 'K');
            console.log(`${this.name} has an As or King and chooses to play it.`);
            return chosenCard;
        }
        return undefined;

    }

    calculateAIMarbleChoice(): number {
        const chosenMarble = this.marblePositions[0] || 0; // Just choose the first marble for now
        console.log(`${this.name} chooses to move marble at position ${chosenMarble}.`);
        return chosenMarble;
    }

    handEmpty(): boolean {
        return this.cards.length === 0;
    }


}

