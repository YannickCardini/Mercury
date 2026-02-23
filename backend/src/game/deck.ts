import type { Card } from "../types/types.js";

export class Deck {
    // Le paquet de cartes (sera modifié pendant la partie)
    private cards: Card[] = [];

    // Jeu de base de 52 cartes (constante pour réinitialisation)
    private readonly BASE_DECK: Card[] = [
        // ♥ Cœur (Hearts)
        { id: '1', suit: '♥', value: 'A' },
        { id: '2', suit: '♥', value: '2' },
        { id: '3', suit: '♥', value: '3' },
        { id: '4', suit: '♥', value: '4' },
        { id: '5', suit: '♥', value: '5' },
        { id: '6', suit: '♥', value: '6' },
        { id: '7', suit: '♥', value: '7' },
        { id: '8', suit: '♥', value: '8' },
        { id: '9', suit: '♥', value: '9' },
        { id: '10', suit: '♥', value: '10' },
        { id: '11', suit: '♥', value: 'J' },
        { id: '12', suit: '♥', value: 'Q' },
        { id: '13', suit: '♥', value: 'K' },

        // ♦ Carreau (Diamonds)
        { id: '14', suit: '♦', value: 'A' },
        { id: '15', suit: '♦', value: '2' },
        { id: '16', suit: '♦', value: '3' },
        { id: '17', suit: '♦', value: '4' },
        { id: '18', suit: '♦', value: '5' },
        { id: '19', suit: '♦', value: '6' },
        { id: '20', suit: '♦', value: '7' },
        { id: '21', suit: '♦', value: '8' },
        { id: '22', suit: '♦', value: '9' },
        { id: '23', suit: '♦', value: '10' },
        { id: '24', suit: '♦', value: 'J' },
        { id: '25', suit: '♦', value: 'Q' },
        { id: '26', suit: '♦', value: 'K' },

        // ♣ Trèfle (Clubs)
        { id: '27', suit: '♣', value: 'A' },
        { id: '28', suit: '♣', value: '2' },
        { id: '29', suit: '♣', value: '3' },
        { id: '30', suit: '♣', value: '4' },
        { id: '31', suit: '♣', value: '5' },
        { id: '32', suit: '♣', value: '6' },
        { id: '33', suit: '♣', value: '7' },
        { id: '34', suit: '♣', value: '8' },
        { id: '35', suit: '♣', value: '9' },
        { id: '36', suit: '♣', value: '10' },
        { id: '37', suit: '♣', value: 'J' },
        { id: '38', suit: '♣', value: 'Q' },
        { id: '39', suit: '♣', value: 'K' },

        // ♠ Pique (Spades)
        { id: '40', suit: '♠', value: 'A' },
        { id: '41', suit: '♠', value: '2' },
        { id: '42', suit: '♠', value: '3' },
        { id: '43', suit: '♠', value: '4' },
        { id: '44', suit: '♠', value: '5' },
        { id: '45', suit: '♠', value: '6' },
        { id: '46', suit: '♠', value: '7' },
        { id: '47', suit: '♠', value: '8' },
        { id: '48', suit: '♠', value: '9' },
        { id: '49', suit: '♠', value: '10' },
        { id: '50', suit: '♠', value: 'J' },
        { id: '51', suit: '♠', value: 'Q' },
        { id: '52', suit: '♠', value: 'K' },
    ];

    constructor() {
        this.resetDeck();
        console.log("🃏 Nouveau deck créé avec 52 cartes");
    }

    /**
     * Réinitialise le deck avec toutes les cartes
     */
    public resetDeck(): void {
        this.cards = [...this.BASE_DECK];
    }

    /**
     * Mélange le deck 
     */
    shuffle(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = this.cards[i]!;
            this.cards[i] = this.cards[j]!;
            this.cards[j] = temp;
        }
        console.log("🔄 Deck mélangé");
    }

    /**
     * Pioche N cartes du dessus du deck
     * Les cartes sont RETIRÉES du deck
     */
    drawCards(count: number): Card[] {
        if (count <= 0) return [];
        
        if (count > this.cards.length) {
            console.warn(`⚠️ Tentative de piocher ${count} cartes mais il n'en reste que ${this.cards.length}`);
            count = this.cards.length;
        }

        // Prendre les count premières cartes
        const drawnCards = this.cards.slice(0, count);
        
        // Les retirer du deck
        this.cards = this.cards.slice(count);

        console.log(`🃏 Cartes piochées: ${drawnCards.length} (reste: ${this.cards.length})`);
        return drawnCards;
    }

    /**
     * Vérifie si le deck est vide
     */
    isEmpty(): boolean {
        return this.cards.length === 0;
    }

    /**
     * Retourne le nombre de cartes restantes
     */
    remainingCards(): number {
        return this.cards.length;
    }


}