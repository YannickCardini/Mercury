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
import { MultiWsMessenger, wsSend } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import { isTrainMode } from '../train-mode.js';
import type { ReconnectRegistry } from './reconnect-registry.js';
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
    reconnect: ReconnectRegistry | null;
}

export class MatchmakingManager {

    private session: PendingMatchmaking | null = null;

    joinQueue(ws: WebSocket, playerName?: string, reconnect?: ReconnectRegistry, browserId?: string, picture?: string, userId?: string): void {
        if (!this.session) {
            this.session = {
                messenger: new MultiWsMessenger(),
                players: [],
                botDispatchTimer: null,
                botDispatchChance: 0,
                reconnect: reconnect ?? null,
            };
        }
        // Update reference if provided (in case session already existed)
        if (reconnect) this.session.reconnect = reconnect;

        // Reject duplicate joins from the same browser
        if (browserId && this.session.players.some(p => p.browserId === browserId)) {
            wsSend(ws, { type: 'actionRejected', reason: 'Already in matchmaking from another tab' });
            return;
        }

        const takenColors = new Set(this.session.players.map(p => p.color));
        const color = COLORS.find(c => !takenColors.has(c));

        if (!color) {
            wsSend(ws, { type: 'actionRejected', reason: 'Matchmaking session is full' });
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

        // En self-play (TRAIN_MODE), les 4 bots se connectent eux-mêmes :
        // pas de dispatch d'agents externes, sinon connexions surnuméraires.
        if (!isTrainMode() && !this.session.botDispatchTimer) {
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

        const playersByColor = new Map(this.session.players.map(p => [p.color, p]));

        // Un slot peut s'être vidé entre le check de remplissage et le lancement
        // (close d'un joueur traité entre-temps) : on reste en file d'attente
        // plutôt que de crasher sur une couleur manquante.
        const missing = COLORS.filter(c => !playersByColor.has(c));
        if (missing.length > 0) {
            console.warn(`⚠️ Matchmaking — lancement annulé, couleur(s) manquante(s): ${missing.join(', ')}`);
            this.broadcastStatus();
            return;
        }

        if (this.session.botDispatchTimer) clearInterval(this.session.botDispatchTimer);

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
        const reconnect = this.session.reconnect;
        this.session = null;

        console.log(`🚀 Matchmaking — lancement avec 4 joueurs`);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);

        // Wire up disconnect callbacks (immediate + permanent)
        messenger.setOnTempDisconnect((color) => game.markTempDisconnected(color));
        messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));

        // Wire up reconnection-slot cleanup (single resign + whole game end)
        game.setOnPlayerAbandoned((gameId, color) => reconnect?.releaseSlot(gameId, color));
        game.setOnGameEnded((gameId) => reconnect?.releaseGame(gameId));

        // Register guest player identities and send welcome messages
        for (const p of humanPlayers) {
            reconnect?.register(p.guestPlayerId, game.id, p.color, p.userId);
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
            wsSend(player.ws, {
                type: 'matchmakingStatus',
                connectedCount,
                totalNeeded: 4,
                myColor: player.color,
                guestPlayerId: player.guestPlayerId,
            });
        }
    }
}
