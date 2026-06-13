import type { Game } from '../game/game.js';

// Balayage périodique : purge les parties terminées/bloquées qui n'auraient
// pas été retirées par les chemins normaux (exception dans la boucle de jeu,
// callback jamais appelé…). Filet de sécurité contre les fuites mémoire.
const SWEEP_INTERVAL_MS = 10 * 60_000;
// Bien au-delà de la durée d'une partie normale (~20-40 min).
const MAX_GAME_AGE_MS = 3 * 60 * 60_000;

class GameRegistryImpl {

    private games = new Map<string, Game>();
    private sweepTimer: NodeJS.Timeout | null = null;

    register(gameId: string, game: Game): void {
        this.games.set(gameId, game);
        this.ensureSweeper();
    }

    get(gameId: string): Game | undefined {
        return this.games.get(gameId);
    }

    delete(gameId: string): void {
        this.games.delete(gameId);
    }

    private ensureSweeper(): void {
        if (this.sweepTimer) return;
        this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
        this.sweepTimer.unref(); // ne pas retenir le process à lui tout seul
    }

    private sweep(): void {
        for (const [id, game] of this.games) {
            if (game.isStale(MAX_GAME_AGE_MS)) {
                console.warn(`🧹 GameRegistry — purge de la partie ${id} (terminée ou trop ancienne)`);
                this.games.delete(id);
            }
        }
    }
}

export const GameRegistry = new GameRegistryImpl();
