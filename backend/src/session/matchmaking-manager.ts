// ─────────────────────────────────────────────────────────────────────────────
// MatchmakingManager — file d'attente publique "Play Now"
//
// Gère une unique session en attente à la fois.
// Les joueurs sont assignés dans l'ordre red → green → blue → orange.
// Dès que 4 joueurs sont présents la partie démarre immédiatement.
// Après MATCHMAKING_TIMEOUT_MS sans 4 joueurs, les slots vides sont remplis
// par des bots et la partie démarre quand même.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import type { GameConfig, MarbleColor } from '@keezen/shared';

const COLORS: MarbleColor[] = ['red', 'green', 'blue', 'orange'];
const MATCHMAKING_TIMEOUT_MS = 30_000;

interface MatchPlayer {
    ws: WebSocket;
    color: MarbleColor;
    name: string;
    guestPlayerId: string;
}

interface PendingMatchmaking {
    messenger: MultiWsMessenger;
    players: MatchPlayer[];
    timer: NodeJS.Timeout | null;
    playerIdentities: Map<string, { gameId: string; color: MarbleColor }> | null;
}

export class MatchmakingManager {

    private session: PendingMatchmaking | null = null;

    joinQueue(ws: WebSocket, playerName: string = 'Player', playerIdentities?: Map<string, { gameId: string; color: MarbleColor }>): void {
        if (!this.session) {
            this.session = {
                messenger: new MultiWsMessenger(),
                players: [],
                timer: null,
                playerIdentities: playerIdentities ?? null,
            };
        }
        // Update reference if provided (in case session already existed)
        if (playerIdentities) this.session.playerIdentities = playerIdentities;

        const takenColors = new Set(this.session.players.map(p => p.color));
        const color = COLORS.find(c => !takenColors.has(c));

        if (!color) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Matchmaking session is full' }));
            return;
        }

        const guestPlayerId = crypto.randomUUID();
        const player: MatchPlayer = { ws, color, name: playerName, guestPlayerId };
        this.session.players.push(player);
        this.session.messenger.addConnection(color, ws);

        ws.addEventListener('close', () => this.handleDisconnect(color));

        this.broadcastStatus();
        console.log(`🔍 Matchmaking — ${playerName} (${color}) rejoint (${this.session.players.length}/4)`);

        if (this.session.players.length === 1) {
            this.session.timer = setTimeout(() => this.fillWithBots(), MATCHMAKING_TIMEOUT_MS);
        }

        if (this.session.players.length === 4) {
            this.launch();
        }
    }

    private handleDisconnect(color: MarbleColor): void {
        if (!this.session) return;

        this.session.players = this.session.players.filter(p => p.color !== color);
        console.log(`🔴 Matchmaking — ${color} déconnecté (${this.session.players.length} restant(s))`);

        if (this.session.players.length === 0) {
            if (this.session.timer) clearTimeout(this.session.timer);
            this.session = null;
            console.log('❌ Matchmaking session annulée (tous déconnectés)');
        } else {
            this.broadcastStatus();
        }
    }

    private fillWithBots(): void {
        if (!this.session) return;
        console.log(`⏱️ Matchmaking timeout — remplissage avec des bots`);
        this.launch();
    }

    private launch(): void {
        if (!this.session) return;
        if (this.session.timer) clearTimeout(this.session.timer);

        const playersByColor = new Map(this.session.players.map(p => [p.color, p]));

        const config: GameConfig = {
            players: COLORS.map(color => ({
                color,
                name: playersByColor.get(color)?.name ?? 'Bot',
                isHuman: playersByColor.has(color),
            })),
        };

        const messenger = this.session.messenger;
        const humanPlayers = [...this.session.players];
        const playerIdentities = this.session.playerIdentities;
        const humanCount = humanPlayers.length;
        this.session = null;

        console.log(`🚀 Matchmaking — lancement avec ${humanCount} humain(s) et ${4 - humanCount} bot(s)`);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);

        // Wire up permanent disconnect callback
        messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));

        // Register guest player identities and send welcome messages
        for (const p of humanPlayers) {
            playerIdentities?.set(p.guestPlayerId, { gameId: game.id, color: p.color });
            messenger.sendTo(p.color, {
                type: 'welcome',
                message: 'Game started',
                timestamp: new Date().toISOString(),
                gameState: null,
                guestPlayerId: p.guestPlayerId,
                gameId: game.id,
            });
        }
    }

    private broadcastStatus(): void {
        if (!this.session) return;
        const connectedCount = this.session.players.length;
        for (const player of this.session.players) {
            player.ws.send(JSON.stringify({
                type: 'matchmakingStatus',
                connectedCount,
                totalNeeded: 4,
                myColor: player.color,
                guestPlayerId: player.guestPlayerId,
            }));
        }
    }
}
