import type { Game } from '../game/game.js';

class GameRegistryImpl {

    private games = new Map<string, Game>();

    register(gameId: string, game: Game): void {
        this.games.set(gameId, game);
    }

    get(gameId: string): Game | undefined {
        return this.games.get(gameId);
    }

    delete(gameId: string): void {
        this.games.delete(gameId);
    }
}

export const GameRegistry = new GameRegistryImpl();
