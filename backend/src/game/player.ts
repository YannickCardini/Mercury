import type { Action, Card, MarbleColor } from '@mercury/shared';
import { getHomePositions } from '@mercury/shared';
import type { LegalMoveContext } from '../utils/utils.js';
import type { PlayerStrategy } from './player-strategy.js';

export class Player {

    public cards: Card[] = [];
    public isConnected: boolean = true;
    public marblePositions: number[];
    /**
     * Aligné 1:1 avec `marblePositions`. true uniquement entre l'entrée en
     * jeu (A/K) et le premier déplacement du pion. Voir le commentaire dans
     * shared/types.ts pour la règle complète.
     */
    public marbleInvincible: boolean[];
    public picture?: string;
    public userId?: string;

    constructor(
        public readonly name: string,
        public readonly color: MarbleColor,
        public readonly isHuman: boolean,
        private readonly strategy: PlayerStrategy,
    ) {
        this.marblePositions = [...getHomePositions(color)];
        this.marbleInvincible = this.marblePositions.map(() => false);
    }

    // ── Interface principale ─────────────────────────────────────────────────

    /**
     * Demande à la strategy de choisir un coup.
     * `allMarbles` = toutes les positions de pions sur le plateau (toutes couleurs),
     * fourni par Game au moment du tour — plus besoin de propriété mutable.
     */
    getAction(
        marblesByColor: Record<MarbleColor, number[]>,
        invincibleMarblesByColor: Record<MarbleColor, number[]>,
    ): Promise<Action> {
        console.log(`${this.name} (${this.isHuman ? 'humain' : 'IA'}) calcule son coup...`);

        const ctx: LegalMoveContext = {
            ownMarbles: [...this.marblePositions],
            allMarbles: Object.values(marblesByColor).flat(),
            playerColor: this.color,
            marblesByColor,
            invincibleMarblesByColor,
        };
        return this.strategy.getAction(ctx, this.cards);
    }

    /**
     * Applique l'effet de l'action sur la main du joueur.
     * Appelé par Game après réception de l'action, avant broadcast.
     */
    applyAction(action: Action): void {
        if (action.type === 'discard') {
            this.cards = [];
        } else if (action.cardPlayed) {
            for (const played of action.cardPlayed) {
                const i = this.cards.findIndex(c => c.id === played.id);
                if (i !== -1) this.cards.splice(i, 1);
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    handEmpty(): boolean {
        return this.cards.length === 0;
    }
}
