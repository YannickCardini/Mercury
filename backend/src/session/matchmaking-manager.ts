// ─────────────────────────────────────────────────────────────────────────────
// MatchmakingManager — file d'attente publique "Play Now"
//
// Gère une unique session en attente à la fois.
// Les joueurs sont assignés dans l'ordre red → green → blue → orange.
// Dès que 4 joueurs sont présents la partie démarre immédiatement.
// Tant qu'un humain attend, on appelle l'agent IA externe avec une probabilité
// croissante (+1% / seconde) qui est divisée par 2 après chaque dispatch.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import type { GameConfig, MarbleColor } from '@mercury/shared';

const COLORS: MarbleColor[] = ['red', 'green', 'blue', 'orange'];
const BOT_USER_IDS = new Set(['1', '2', '3', '4']);
const BOT_DISPATCH_TICK_MS = 1_000;
const BOT_DISPATCH_CHANCE_STEP = 0.01;

interface MatchPlayer {
    ws: WebSocket;
    color: MarbleColor;
    name: string;
    guestPlayerId: string;
    browserId?: string;
    picture?: string;
    userId?: string;
}

interface PendingMatchmaking {
    messenger: MultiWsMessenger;
    players: MatchPlayer[];
    botDispatchTimer: NodeJS.Timeout | null;
    botDispatchChance: number;
    playerIdentities: Map<string, { gameId: string; color: MarbleColor }> | null;
}

export class MatchmakingManager {

    private session: PendingMatchmaking | null = null;

    joinQueue(ws: WebSocket, playerName?: string, playerIdentities?: Map<string, { gameId: string; color: MarbleColor }>, browserId?: string, picture?: string, userId?: string): void {
        if (!this.session) {
            this.session = {
                messenger: new MultiWsMessenger(),
                players: [],
                botDispatchTimer: null,
                botDispatchChance: 0,
                playerIdentities: playerIdentities ?? null,
            };
        }
        // Update reference if provided (in case session already existed)
        if (playerIdentities) this.session.playerIdentities = playerIdentities;

        // Reject duplicate joins from the same browser
        if (browserId && this.session.players.some(p => p.browserId === browserId)) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Already in matchmaking from another tab' }));
            return;
        }

        const takenColors = new Set(this.session.players.map(p => p.color));
        const color = COLORS.find(c => !takenColors.has(c));

        if (!color) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Matchmaking session is full' }));
            return;
        }

        const guestPlayerId = crypto.randomUUID();
        const finalName = playerName && playerName.length > 0
            ? playerName
            : `Guest #${COLORS.indexOf(color) + 1}`;
        const player: MatchPlayer = { ws, color, name: finalName, guestPlayerId, ...(browserId ? { browserId } : {}), ...(picture ? { picture } : {}), ...(userId ? { userId } : {}) };
        this.session.players.push(player);
        this.session.messenger.addConnection(color, ws);

        ws.addEventListener('close', () => this.handleDisconnect(color));

        this.broadcastStatus();
        console.log(`🔍 Matchmaking — ${finalName} (${color}) rejoint (${this.session.players.length}/4)`);

        if (!this.session.botDispatchTimer) {
            this.session.botDispatchTimer = setInterval(
                () => this.tickBotDispatch(),
                BOT_DISPATCH_TICK_MS,
            );
        }

        if (this.session.players.length === 4) {
            this.launch();
        }
    }

    private tickBotDispatch(): void {
        if (!this.session) return;

        const hasHuman = this.session.players.some(
            p => !p.userId || !BOT_USER_IDS.has(p.userId),
        );
        if (!hasHuman) return;
        if (this.session.players.length >= 4) return;

        this.session.botDispatchChance += BOT_DISPATCH_CHANCE_STEP;
        if (Math.random() >= this.session.botDispatchChance) return;

        this.session.botDispatchChance /= 2;
        void this.dispatchBotAgent();
    }

    private async dispatchBotAgent(): Promise<void> {
        const url = process.env['AGENT_URL'];
        const secret = process.env['BOT_SECRET'];
        if (!url || !secret) {
            console.warn('🤖 AGENT_URL or BOT_SECRET non configuré — dispatch ignoré');
            return;
        }
        try {
            const res = await fetch(`${url.replace(/\/$/, '')}/dispatch`, {
                method: 'POST',
                headers: { 'X-Bot-Secret': secret, 'Content-Type': 'application/json' },
                body: '{}',
            });
            if (res.ok) {
                console.log('🤖 Bot agent dispatched');
            } else if (res.status === 503) {
                console.log('🤖 Agent service occupé (tous les bots sont actifs)');
            } else {
                console.warn(`🤖 Dispatch agent a retourné ${res.status}`);
            }
        } catch (err) {
            console.warn('🤖 Dispatch agent a échoué:', err);
        }
    }

    private handleDisconnect(color: MarbleColor): void {
        if (!this.session) return;

        this.session.players = this.session.players.filter(p => p.color !== color);
        console.log(`🔴 Matchmaking — ${color} déconnecté (${this.session.players.length} restant(s))`);

        if (this.session.players.length === 0) {
            if (this.session.botDispatchTimer) clearInterval(this.session.botDispatchTimer);
            this.session = null;
            console.log('❌ Matchmaking session annulée (tous déconnectés)');
        } else {
            this.broadcastStatus();
        }
    }

    private launch(): void {
        if (!this.session) return;
        if (this.session.botDispatchTimer) clearInterval(this.session.botDispatchTimer);

        const playersByColor = new Map(this.session.players.map(p => [p.color, p]));

        const config: GameConfig = {
            players: COLORS.map(color => {
                const p = playersByColor.get(color)!;
                return {
                    color,
                    name: p.name,
                    isHuman: true,
                    ...(p.picture ? { picture: p.picture } : {}),
                    ...(p.userId ? { userId: p.userId } : {}),
                };
            }),
        };

        const messenger = this.session.messenger;
        const humanPlayers = [...this.session.players];
        const playerIdentities = this.session.playerIdentities;
        this.session = null;

        console.log(`🚀 Matchmaking — lancement avec 4 joueurs`);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);

        // Wire up permanent disconnect callback
        messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));

        // Wire up abandon callback to clean up playerIdentities
        game.setOnPlayerAbandoned((gameId, color) => {
            if (!playerIdentities) return;
            for (const [guestId, identity] of playerIdentities) {
                if (identity.gameId === gameId && identity.color === color) {
                    playerIdentities.delete(guestId);
                    break;
                }
            }
        });

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
