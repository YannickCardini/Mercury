// ─────────────────────────────────────────────────────────────────────────────
// MatchmakingManager — file d'attente publique "Play Now"
//
// Gère une unique session en attente à la fois ; la partie démarre dès que 4
// sockets y sont assises (humains et agents IA, indiscernables pour le client).
//
// Le premier humain tire un « script d'arrivée » (matchmaking-script.ts) que
// la session exécute : sièges déjà pris à l'arrivée, arrivées espacées ou
// groupées, joueur qui entre puis repart, changement de siège. Un siège
// « hold » s'affiche pris pendant que l'agent appelé se connecte ; le statut
// diffusé compte donc sockets + holds, mais le lancement n'a lieu qu'à 4
// sockets réelles.
//
// Invariants (vérifiés par matchmaking-dispatch.test.ts) :
//  1. sockets + dispatches en vol ≤ 4 (pas de sur-dispatch) ;
//  2. s'il reste des holds, sockets + holds ≤ 3 : jamais de 4/4 affiché sans
//     4 joueurs réels, toujours une place libre pour un humain ;
//  3. une couleur par siège (sockets et holds confondus) ;
//  4. chaque hold « incoming » correspond à un dispatch en vol ;
//  5. hors TRAIN_MODE, une session n'existe que tant qu'un humain y attend :
//     un agent ne crée jamais de session et repart (close 1000) sans humain.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger, wsSend } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import { isBotUserId, dispatchBotAgent, accountTag, type DispatchResult } from './bot-dispatch.js';
import { isTrainMode } from '../train-mode.js';
import { notifyAdmin } from '../admin/telegram.js';
import { formatClientLabel, getSocketClientInfo } from '../admin/client-info.js';
import { describeGuest, lookupGuestHistory, trackGuestGameStarts } from './guest-tracking.js';
import { queueSaveSnapshot, queueDeleteSnapshot, isSnapshotStorageConfigured } from '../storage/snapshot-store.js';
import { planArrivals, describeScript, uniform, lognormal, type ArrivalScript, type PlanInput, type ScriptEvent } from './matchmaking-script.js';
import { RecentOpponents } from './recent-opponents.js';
import type { ReconnectRegistry } from './reconnect-registry.js';
import type { ClientMessage, GameConfig, MarbleColor } from '@mercury/shared';

const COLORS: MarbleColor[] = ['red', 'green', 'blue', 'orange'];
const WS_CLOSING = 2;
const WS_CLOSED = 3;

export interface MatchmakingTimings {
    /** Un agent appelé qui ne s'est pas assis dans ce délai est considéré perdu. */
    arrivalTimeoutMs: number;
    /** Hold d'un dispatch raté : il « repart » après un délai tiré dans cet intervalle. */
    failReleaseMinMs: number;
    failReleaseMaxMs: number;
    /** Backoff exponentiel des nouveaux essais après busy/failed. */
    retryBaseMs: number;
    retryMaxMs: number;
    /** Écart médian des dispatches de rattrapage (siège vidé, échec, départ). */
    extraGapMedianMs: number;
    /** Pas de changement de siège de bot juste après un choix humain. */
    switchHumanCooldownMs: number;
}

const DEFAULT_TIMINGS: MatchmakingTimings = {
    arrivalTimeoutMs: 15_000,
    failReleaseMinMs: 800,
    failReleaseMaxMs: 3_000,
    retryBaseMs: 4_000,
    retryMaxMs: 30_000,
    extraGapMedianMs: 4_000,
    switchHumanCooldownMs: 3_000,
};

export interface JoinQueueRequest {
    ws: WebSocket;
    playerName?: string | undefined;
    reconnect?: ReconnectRegistry | undefined;
    browserId?: string | undefined;
    picture?: string | undefined;
    userId?: string | undefined;
    /**
     * Couleur choisie par le joueur avant d'arriver ici (ex. siège pris dans une
     * custom room repliée vers le matchmaking public, cf.
     * CustomGameManager.fallbackToMatchmaking). Honorée si aucune socket ne
     * l'occupe ; sinon couleur libre au hasard.
     */
    preferredColor?: MarbleColor | undefined;
    /** Joueur qui découvre le jeu (moins de 2 parties sur son appareil) : file remplie vite. */
    newcomer?: boolean | undefined;
}

export interface LaunchSeat {
    ws: WebSocket;
    color: MarbleColor;
    name: string;
    guestPlayerId: string;
    browserId?: string;
    picture?: string;
    userId?: string;
}

export interface LaunchRequest {
    /** Un siège par couleur, dans l'ordre COLORS. */
    players: readonly LaunchSeat[];
    messenger: MultiWsMessenger;
    reconnect: ReconnectRegistry | null;
}

export interface MatchmakingDeps {
    dispatch?: (avoidUserIds: readonly string[]) => Promise<DispatchResult>;
    rng?: () => number;
    isBot?: (userId: string | undefined) => boolean;
    trainMode?: () => boolean;
    plan?: (input: PlanInput) => ArrivalScript;
    startGame?: (launch: LaunchRequest) => void;
    timings?: Partial<MatchmakingTimings>;
    recentOpponents?: RecentOpponents;
}

interface MatchPlayer extends LaunchSeat {
    isBot: boolean;
    newcomer: boolean;
    joinedAt: number;
    /** Kept so launch() can detach both listeners before wiring the game messenger. */
    messageListener: (raw: MessageEvent) => void;
    closeListener: () => void;
}

/** Siège affiché pris sans socket derrière. */
type Hold =
    /** Un agent appelé va s'y asseoir. */
    | { color: MarbleColor; kind: 'incoming'; pendingId: number }
    /** Fantôme : quelqu'un « entre puis repart ». */
    | { color: MarbleColor; kind: 'leaver'; releaseTimer: NodeJS.Timeout };

interface PendingDispatch {
    id: number;
    createdAt: number;
    timeout: NodeJS.Timeout;
}

interface Scheduled {
    event: ScriptEvent;
    timer: NodeJS.Timeout;
}

interface PendingMatchmaking {
    messenger: MultiWsMessenger;
    reconnect: ReconnectRegistry | null;
    players: MatchPlayer[];
    holds: Hold[];
    pending: PendingDispatch[];
    scheduled: Set<Scheduled>;
    /** Tous les timers vivants de la session, annulés d'un coup à sa fin. */
    timers: Set<NodeJS.Timeout>;
    script: ArrivalScript | null;
    lastHumanSelectAt: number;
    failureStreak: number;
}

/** État observable de la file, pour les tests. */
export interface MatchmakingInspection {
    players: Array<{ color: MarbleColor; name: string; isBot: boolean }>;
    holds: Array<{ color: MarbleColor; kind: Hold['kind'] }>;
    pending: number;
    scheduled: number;
    script: ArrivalScript | null;
}

function isDead(ws: WebSocket): boolean {
    return ws.readyState === WS_CLOSING || ws.readyState === WS_CLOSED;
}

function closeQuietly(ws: WebSocket, reason: string): void {
    try { ws.close(1000, reason); } catch { /* déjà fermée */ }
}

export class MatchmakingManager {

    private session: PendingMatchmaking | null = null;
    private nextPendingId = 1;
    /** > 0 pendant joinGroup : le script attend que tout le groupe soit assis. */
    private groupDepth = 0;

    private readonly dispatch: (avoidUserIds: readonly string[]) => Promise<DispatchResult>;
    private readonly rng: () => number;
    private readonly isBot: (userId: string | undefined) => boolean;
    private readonly trainMode: () => boolean;
    private readonly plan: (input: PlanInput) => ArrivalScript;
    private readonly startGame: (launch: LaunchRequest) => void;
    private readonly timings: MatchmakingTimings;
    private readonly recentOpponents: RecentOpponents;

    constructor(deps: MatchmakingDeps = {}) {
        this.dispatch = deps.dispatch ?? dispatchBotAgent;
        this.rng = deps.rng ?? Math.random;
        this.isBot = deps.isBot ?? isBotUserId;
        this.trainMode = deps.trainMode ?? isTrainMode;
        this.plan = deps.plan ?? planArrivals;
        this.startGame = deps.startGame ?? startMatchmakingGame;
        this.timings = { ...DEFAULT_TIMINGS, ...deps.timings };
        this.recentOpponents = deps.recentOpponents ?? new RecentOpponents();
    }

    /**
     * Couleurs occupées par une socket dans la session publique en attente
     * (vide si aucune session). Les holds n'y figurent pas : un humain les
     * évince (cf. joinQueue). Utilisé par CustomGameManager.fallbackToMatchmaking
     * pour décider, AVANT d'y inscrire le groupe d'une room privée repliée,
     * si la paire d'équipe 2v2 formée dans cette room reste disponible.
     */
    getTakenColors(): ReadonlySet<MarbleColor> {
        return new Set(this.session?.players.map(p => p.color) ?? []);
    }

    /** État de la file publique pour GET /api/admin/stats. */
    getQueueSummary(): { waiting: number; humans: number; shown: number; pending: number } {
        const s = this.session;
        const players = s?.players ?? [];
        return {
            waiting: players.length,
            humans: players.filter(p => !p.isBot).length,
            shown: players.length + (s?.holds.length ?? 0),
            pending: s?.pending.length ?? 0,
        };
    }

    /** Tests uniquement. */
    inspect(): MatchmakingInspection | null {
        const s = this.session;
        if (!s) return null;
        return {
            players: s.players.map(p => ({ color: p.color, name: p.name, isBot: p.isBot })),
            holds: s.holds.map(h => ({ color: h.color, kind: h.kind })),
            pending: s.pending.length,
            scheduled: s.scheduled.size,
            script: s.script,
        };
    }

    joinQueue(req: JoinQueueRequest): void {
        this.prune();
        if (this.isBot(req.userId) && !this.trainMode()) {
            this.seatBot(req);
            return;
        }
        this.seatHuman(req);
    }

    /**
     * Inscrit d'un bloc les joueurs d'une custom room repliée : le script
     * d'arrivée n'est tiré qu'une fois tout le groupe assis.
     */
    joinGroup(reqs: readonly JoinQueueRequest[]): void {
        this.groupDepth++;
        try {
            for (const req of reqs) this.joinQueue(req);
        } finally {
            this.groupDepth--;
        }
        const s = this.session;
        if (s && !s.script && !this.trainMode() && this.hasLiveHuman(s)) {
            this.startScript(s);
            this.reconcile(s);
        }
    }

    // ── Arrivées ─────────────────────────────────────────────────────────────

    /** Humain, ou agent en TRAIN_MODE (self-play : pas de script, ordre de couleurs historique). */
    private seatHuman(req: JoinQueueRequest): void {
        const { ws, userId, browserId } = req;
        const train = this.trainMode();

        // Reject duplicate joins from the same browser — or the same account on
        // another device: two seats in one game would score twice (+4 and −1
        // on opposite teams = points guaranteed whatever the result).
        const existing = this.session?.players ?? [];
        if (
            (browserId && existing.some(p => p.browserId === browserId))
            || (userId && existing.some(p => p.userId === userId))
        ) {
            wsSend(ws, { type: 'actionRejected', reason: 'Already in matchmaking from another tab' });
            return;
        }

        if (!this.session) this.session = this.newSession(req.reconnect ?? null);
        const s = this.session;
        // Update reference if provided (in case session already existed)
        if (req.reconnect) s.reconnect = req.reconnect;

        const color = this.pickHumanColor(s, req.preferredColor, train);
        if (!color) {
            wsSend(ws, { type: 'actionRejected', reason: 'Matchmaking session is full' });
            return;
        }

        const player = this.addPlayer(s, req, color);
        console.log(`🔍 Matchmaking — ${player.name} (${color}) [${accountTag(userId, browserId)}] rejoint (${s.players.length}/4)`);
        if (!player.isBot && !train) this.announce(player, s.players.length);

        if (!train && !s.script && this.groupDepth === 0) this.startScript(s);
        this.reconcile(s);
    }

    private seatBot(req: JoinQueueRequest): void {
        const { ws, userId } = req;
        const s = this.session;
        if (!s || !this.hasLiveHuman(s)) {
            // Un agent ne crée jamais de session : arrivé après le lancement ou
            // l'annulation, il repart et libère son identité.
            this.rejectBot(ws, 'No match waiting');
            return;
        }
        if (userId && s.players.some(p => p.userId === userId)) {
            this.rejectBot(ws, 'Already in matchmaking from another tab');
            return;
        }

        let color: MarbleColor | undefined;
        const pending = s.pending.find(p => this.holdOf(s, p.id)) ?? s.pending[0];
        if (pending) {
            const hold = this.holdOf(s, pending.id);
            this.dropPending(s, pending);
            if (hold) {
                this.dropHold(s, hold);
                color = hold.color;
            }
            console.log(`🤖 Matchmaking — agent assis ${Date.now() - pending.createdAt} ms après son dispatch`);
        }
        if (!color) {
            // Agent hors script (re-seat d'une partie restaurée, dispatch déjà
            // abandonné) : il prend une place libre, un fantôme au besoin.
            const free = this.freeColors(s);
            if (free.length > 0) {
                color = this.pick(free);
            } else {
                const leaver = s.holds.find(h => h.kind === 'leaver');
                if (leaver) {
                    this.dropHold(s, leaver);
                    color = leaver.color;
                }
            }
        }
        if (!color) {
            this.rejectBot(ws, 'Matchmaking session is full');
            return;
        }

        const player = this.addPlayer(s, req, color);
        console.log(`🔍 Matchmaking — ${player.name} (${color}) [${accountTag(userId)}] rejoint (${s.players.length}/4)`);
        this.reconcile(s);
    }

    private pickHumanColor(s: PendingMatchmaking, preferred: MarbleColor | undefined, train: boolean): MarbleColor | undefined {
        const socketColors = new Set(s.players.map(p => p.color));
        if (preferred && COLORS.includes(preferred) && !socketColors.has(preferred)) {
            const hold = s.holds.find(h => h.color === preferred);
            if (hold) this.dropHold(s, hold);
            return preferred;
        }
        if (train) return COLORS.find(c => !socketColors.has(c));
        // Au hasard : le premier arrivé n'est plus toujours rouge.
        const free = this.freeColors(s);
        if (free.length > 0) return this.pick(free);
        // Plus que des sièges fantômes : un humain passe avant eux (un leaver
        // d'abord ; l'agent d'un hold évincé prendra une autre place).
        const hold = s.holds.find(h => h.kind === 'leaver') ?? s.holds.at(-1);
        if (!hold) return undefined;
        this.dropHold(s, hold);
        return hold.color;
    }

    private addPlayer(s: PendingMatchmaking, req: JoinQueueRequest, color: MarbleColor): MatchPlayer {
        const { ws, playerName, browserId, picture, userId } = req;
        const player: MatchPlayer = {
            ws,
            color,
            name: playerName && playerName.length > 0 ? playerName : `Guest #${COLORS.indexOf(color) + 1}`,
            guestPlayerId: crypto.randomUUID(),
            ...(browserId ? { browserId } : {}),
            ...(picture ? { picture } : {}),
            ...(userId ? { userId } : {}),
            isBot: this.isBot(userId),
            newcomer: req.newcomer === true,
            joinedAt: Date.now(),
            messageListener: () => { /* replaced below */ },
            closeListener: () => { /* replaced below */ },
        };
        s.players.push(player);
        // Note : pas de messenger.addConnection ici — voir launch(). Un joueur
        // peut encore changer de couleur via selectMatchmakingSlot avant que
        // la session soit pleine, donc le mapping couleur → ws n'est câblé
        // qu'une seule fois, au lancement, avec la couleur finale de chacun.
        player.messageListener = (raw) => {
            try {
                const msg = JSON.parse(raw.data as string) as ClientMessage;
                if (msg.type === 'selectMatchmakingSlot') this.handleSelectSlot(player, msg.color);
            } catch { /* ignore */ }
        };
        player.closeListener = () => this.handleDisconnect(player);
        ws.addEventListener('message', player.messageListener);
        ws.addEventListener('close', player.closeListener);
        return player;
    }

    private announce(player: MatchPlayer, waiting: number): void {
        // Calculé ici, avant le lookup asynchrone des invités.
        const clientLabel = formatClientLabel(getSocketClientInfo(player.ws));
        const announce = (who: string) =>
            notifyAdmin(`🔍 ${player.name} (${who}) cherche une partie, ${waiting}/4 en file [${clientLabel}]`);
        if (player.userId) {
            announce('compte');
            return;
        }
        // Tous les invités s'appellent « Guest #n » : seul l'historique de
        // l'installation dit si c'est un nouveau joueur ou un habitué.
        void lookupGuestHistory(player.browserId).then(history => {
            if (!history) return announce('invité');
            const who = describeGuest(history);
            console.log(`👤 Matchmaking — ${player.name} [guest:${player.browserId}] : ${who}`);
            announce(who);
        });
    }

    // ── Script d'arrivée ─────────────────────────────────────────────────────

    private startScript(s: PendingMatchmaking): void {
        const seatsToFill = 4 - s.players.length;
        if (seatsToFill <= 0) return;
        const newcomer = s.players.some(p => !p.isBot && p.newcomer);
        const script = this.plan({ seatsToFill, newcomer, rng: this.rng });
        s.script = script;
        console.log(`🎬 Matchmaking — script ${describeScript(script)}`);
        // Les événements à t=0 s'appliquent avant le premier statut : un
        // nouveau joueur voit d'emblée 3/4 (le reconcile de l'appelant diffuse).
        for (const event of script.events) {
            if (event.at <= 0) this.runEvent(s, event);
            else this.schedule(s, event, event.at);
        }
    }

    private schedule(s: PendingMatchmaking, event: ScriptEvent, delayMs: number): void {
        const entry: Scheduled = {
            event,
            timer: this.after(s, delayMs, () => {
                s.scheduled.delete(entry);
                this.runEvent(s, event);
                this.reconcile(s);
            }),
        };
        s.scheduled.add(entry);
    }

    private runEvent(s: PendingMatchmaking, event: ScriptEvent): void {
        if (!this.hasLiveHuman(s)) return;
        switch (event.kind) {
            case 'dispatch': this.dispatchOne(s, event.hold); break;
            case 'leaver': this.addLeaver(s, event.lingerMs); break;
            case 'switch': this.switchSomeone(s); break;
        }
    }

    private dispatchOne(s: PendingMatchmaking, hold: boolean): void {
        // Siège déjà couvert (second humain arrivé, agent hors script…) : sans objet.
        if (s.players.length + s.pending.length >= 4) return;
        const id = this.nextPendingId++;
        const pending: PendingDispatch = {
            id,
            createdAt: Date.now(),
            timeout: this.after(s, this.timings.arrivalTimeoutMs, () => this.abandonPending(s, pending, 'timeout')),
        };
        s.pending.push(pending);
        if (hold && s.players.length + s.holds.length + 1 <= 3) {
            const free = this.freeColors(s);
            if (free.length > 0) s.holds.push({ color: this.pick(free), kind: 'incoming', pendingId: id });
        }
        void this.runDispatch(s, pending);
    }

    private async runDispatch(s: PendingMatchmaking, pending: PendingDispatch): Promise<void> {
        const humanKeys = s.players.filter(p => !p.isBot).map(p => p.userId ?? p.browserId).filter((k): k is string => !!k);
        let result: DispatchResult;
        try {
            result = await this.dispatch(this.recentOpponents.avoidFor(humanKeys));
        } catch {
            result = 'failed';
        }
        // Session terminée, ou agent déjà assis : rien à faire.
        if (this.session !== s || !s.pending.includes(pending)) return;
        if (result === 'ok') {
            s.failureStreak = 0;
            return;
        }
        this.abandonPending(s, pending, result);
    }

    /** Dispatch perdu (busy, failed ou agent jamais arrivé) : son siège « repart », puis nouvel essai. */
    private abandonPending(s: PendingMatchmaking, pending: PendingDispatch, reason: DispatchResult | 'timeout'): void {
        const hold = this.holdOf(s, pending.id);
        this.dropPending(s, pending);
        if (hold) {
            const leaver: Hold = {
                color: hold.color,
                kind: 'leaver',
                releaseTimer: this.after(s, uniform(this.rng, this.timings.failReleaseMinMs, this.timings.failReleaseMaxMs), () => {
                    this.dropHold(s, leaver);
                    this.reconcile(s);
                }),
            };
            s.holds[s.holds.indexOf(hold)] = leaver;
        }
        let minExtraDelayMs = 0;
        if (reason !== 'timeout') {
            s.failureStreak++;
            const backoff = Math.min(this.timings.retryMaxMs, this.timings.retryBaseMs * 2 ** (s.failureStreak - 1));
            minExtraDelayMs = backoff * uniform(this.rng, 0.8, 1.2);
        }
        console.warn(`🤖 Matchmaking — dispatch perdu (${reason}), nouvel essai dans ≥ ${Math.round(minExtraDelayMs)} ms`);
        this.reconcile(s, minExtraDelayMs);
    }

    private addLeaver(s: PendingMatchmaking, lingerMs: number): void {
        if (s.players.length + s.holds.length + 1 > 3) return;
        const free = this.freeColors(s);
        if (free.length === 0) return;
        const leaver: Hold = {
            color: this.pick(free),
            kind: 'leaver',
            releaseTimer: this.after(s, lingerMs, () => {
                this.dropHold(s, leaver);
                this.reconcile(s);
            }),
        };
        s.holds.push(leaver);
    }

    /** Un agent assis (ou en route) change de siège, comme le ferait un humain. */
    private switchSomeone(s: PendingMatchmaking): void {
        if (Date.now() - s.lastHumanSelectAt < this.timings.switchHumanCooldownMs) return;
        const free = this.freeColors(s);
        const movers: Array<{ color: MarbleColor }> = [
            ...s.players.filter(p => p.isBot),
            ...s.holds.filter(h => h.kind === 'incoming'),
        ];
        if (free.length === 0 || movers.length === 0) return;
        const mover = this.pick(movers);
        const to = this.pick(free);
        console.log(`🔀 Matchmaking — siège ${mover.color} → ${to} (script)`);
        mover.color = to;
    }

    // ── Cohérence ────────────────────────────────────────────────────────────

    /**
     * Ramène la session dans ses invariants après tout changement, puis
     * diffuse le statut. Lance la partie à 4 sockets.
     */
    private reconcile(s: PendingMatchmaking, minExtraDelayMs = 0): void {
        if (this.session !== s) return;
        const train = this.trainMode();
        for (const p of s.players.filter(p => isDead(p.ws))) this.removePlayer(s, p, 'socket fermée');
        if (s.players.length === 0 || (!train && !this.hasLiveHuman(s))) {
            this.endSession(s, 'plus aucun humain en file');
            return;
        }
        if (s.players.length >= 4) {
            this.broadcastStatus(s);
            this.launch(s);
            return;
        }
        // Dispatches en trop (humain arrivé entre-temps) : les plus récents
        // sautent, ceux sans hold d'abord.
        while (s.players.length + s.pending.length > 4) {
            const victim = [...s.pending].reverse().find(p => !this.holdOf(s, p.id)) ?? s.pending.at(-1)!;
            const hold = this.holdOf(s, victim.id);
            if (hold) this.dropHold(s, hold);
            this.dropPending(s, victim);
        }
        // Invariant 2 : jamais 4/4 sans 4 sockets ; un fantôme part en premier,
        // un hold « incoming » retiré garde son dispatch (l'agent prendra une place libre).
        while (s.holds.length > 0 && s.players.length + s.holds.length > 3) {
            const victim = s.holds.find(h => h.kind === 'leaver') ?? s.holds.at(-1)!;
            this.dropHold(s, victim);
        }
        if (!train && s.script) this.ensureCoverage(s, minExtraDelayMs);
        this.broadcastStatus(s);
    }

    /** Programme des dispatches de rattrapage pour les sièges que rien ne couvre plus. */
    private ensureCoverage(s: PendingMatchmaking, minExtraDelayMs: number): void {
        const plannedDispatches = [...s.scheduled].filter(e => e.event.kind === 'dispatch').length;
        let uncovered = 4 - s.players.length - s.pending.length - plannedDispatches;
        let delay = 0;
        while (uncovered-- > 0) {
            const gapMs = lognormal(this.rng, this.timings.extraGapMedianMs, 0.5, 1_500, 12_000);
            delay += Math.max(minExtraDelayMs, gapMs);
            minExtraDelayMs = 0;
            // Sans hold : un nouvel essai ne fait pas clignoter un siège.
            this.schedule(s, { at: 0, kind: 'dispatch', hold: false }, delay);
        }
    }

    // ── Départs ──────────────────────────────────────────────────────────────

    /**
     * Change de siège/couleur tant que la session n'a pas atteint 4 joueurs.
     * Ne touche pas au messenger : ses connexions ne sont câblées qu'au
     * lancement (voir launch()), donc aucun re-mapping n'est nécessaire ici.
     */
    private handleSelectSlot(player: MatchPlayer, color: MarbleColor): void {
        const s = this.session;
        if (!s || !s.players.includes(player) || !COLORS.includes(color) || player.color === color) return;
        if (s.players.some(p => p.color === color) || s.holds.some(h => h.color === color)) {
            wsSend(player.ws, { type: 'actionRejected', reason: 'This seat is already taken' });
            return;
        }
        player.color = color;
        if (!player.isBot) s.lastHumanSelectAt = Date.now();
        this.broadcastStatus(s);
        console.log(`🔀 ${player.name} moved to ${color} in matchmaking`);
    }

    private handleDisconnect(player: MatchPlayer): void {
        const s = this.session;
        // Filtré par référence (pas par couleur) : la couleur du joueur a pu
        // changer depuis la connexion via selectMatchmakingSlot.
        if (!s || !s.players.includes(player)) return;
        this.removePlayer(s, player, 'déconnecté');
        this.reconcile(s);
    }

    private removePlayer(s: PendingMatchmaking, player: MatchPlayer, why: string): void {
        player.ws.removeEventListener('message', player.messageListener);
        player.ws.removeEventListener('close', player.closeListener);
        s.players = s.players.filter(p => p !== player);
        const waitedS = ((Date.now() - player.joinedAt) / 1000).toFixed(1);
        const shown = s.players.length + s.holds.length + 1;
        console.log(`🔴 Matchmaking — ${player.name} (${player.color}) ${why} après ${waitedS}s en file (${shown}/4 affichés, ${s.players.length} restant(s))`);
    }

    /** Fin sans lancement : les agents assis repartent, tous les timers tombent. */
    private endSession(s: PendingMatchmaking, why: string): void {
        if (this.session === s) this.session = null;
        this.clearTimers(s);
        const train = this.trainMode();
        for (const p of s.players) {
            p.ws.removeEventListener('message', p.messageListener);
            p.ws.removeEventListener('close', p.closeListener);
            if (p.isBot && !train) closeQuietly(p.ws, 'Matchmaking cancelled');
        }
        s.players = [];
        // Nettoie les timers de reconnexion (180s) démarrés par le close
        // handler du messenger : la session n'ira jamais jusqu'à launch(),
        // sinon un timer orphelin loggue un faux "permanently disconnected".
        s.messenger.dispose();
        console.log(`❌ Matchmaking session annulée (${why})`);
    }

    private launch(s: PendingMatchmaking): void {
        const playersByColor = new Map(s.players.map(p => [p.color, p]));

        // Un slot peut s'être vidé entre le check de remplissage et le lancement
        // (close d'un joueur traité entre-temps) : on reste en file d'attente
        // plutôt que de crasher sur une couleur manquante.
        const missing = COLORS.filter(c => !playersByColor.has(c));
        if (missing.length > 0 || s.players.length !== 4) {
            console.warn(`⚠️ Matchmaking — lancement annulé, couleur(s) manquante(s): ${missing.join(', ')}`);
            return;
        }

        this.session = null;
        this.clearTimers(s);

        // Détache les listeners de la phase de file d'attente (selectMatchmakingSlot
        // + handleDisconnect) avant que startGame câble le messenger avec la
        // couleur FINALE de chacun — une seule fois, pour éviter tout mapping
        // périmé ou toute double écoute (voir addPlayer()).
        for (const p of s.players) {
            p.ws.removeEventListener('message', p.messageListener);
            p.ws.removeEventListener('close', p.closeListener);
        }

        const humans = s.players.filter(p => !p.isBot);
        this.recentOpponents.record(
            humans.map(p => p.userId ?? p.browserId).filter((k): k is string => !!k),
            s.players.filter(p => p.isBot && p.userId).map(p => p.userId!),
        );

        console.log(`🚀 Matchmaking — lancement avec 4 joueurs (${humans.length} humain(s))`);
        this.startGame({
            players: COLORS.map(color => playersByColor.get(color)!),
            messenger: s.messenger,
            reconnect: s.reconnect,
        });
    }

    // ── Utilitaires ──────────────────────────────────────────────────────────

    /** Retire les sockets mortes et ferme une session sans humain avant toute arrivée. */
    private prune(): void {
        const s = this.session;
        if (!s) return;
        for (const p of s.players.filter(p => isDead(p.ws))) this.removePlayer(s, p, 'socket fermée');
        if (s.players.length === 0 || (!this.trainMode() && !this.hasLiveHuman(s))) {
            this.endSession(s, 'plus aucun humain en file');
        }
    }

    private newSession(reconnect: ReconnectRegistry | null): PendingMatchmaking {
        return {
            messenger: new MultiWsMessenger(),
            reconnect,
            players: [],
            holds: [],
            pending: [],
            scheduled: new Set(),
            timers: new Set(),
            script: null,
            lastHumanSelectAt: 0,
            failureStreak: 0,
        };
    }

    private hasLiveHuman(s: PendingMatchmaking): boolean {
        return s.players.some(p => !p.isBot && !isDead(p.ws));
    }

    /** Couleurs sans socket ni hold. */
    private freeColors(s: PendingMatchmaking): MarbleColor[] {
        const taken = new Set<MarbleColor>([...s.players.map(p => p.color), ...s.holds.map(h => h.color)]);
        return COLORS.filter(c => !taken.has(c));
    }

    private holdOf(s: PendingMatchmaking, pendingId: number): Hold | undefined {
        return s.holds.find(h => h.kind === 'incoming' && h.pendingId === pendingId);
    }

    private dropHold(s: PendingMatchmaking, hold: Hold): void {
        if (hold.kind === 'leaver') this.cancel(s, hold.releaseTimer);
        s.holds = s.holds.filter(h => h !== hold);
    }

    private dropPending(s: PendingMatchmaking, pending: PendingDispatch): void {
        this.cancel(s, pending.timeout);
        s.pending = s.pending.filter(p => p !== pending);
    }

    private rejectBot(ws: WebSocket, reason: string): void {
        wsSend(ws, { type: 'actionRejected', reason });
        closeQuietly(ws, reason);
    }

    private pick<T>(items: readonly T[]): T {
        return items[Math.min(items.length - 1, Math.floor(this.rng() * items.length))]!;
    }

    /** Timer lié à la session : sans effet si elle a été lancée ou annulée entre-temps. */
    private after(s: PendingMatchmaking, ms: number, fn: () => void): NodeJS.Timeout {
        const timer = setTimeout(() => {
            s.timers.delete(timer);
            if (this.session === s) fn();
        }, Math.max(0, ms));
        timer.unref?.();
        s.timers.add(timer);
        return timer;
    }

    private cancel(s: PendingMatchmaking, timer: NodeJS.Timeout): void {
        clearTimeout(timer);
        s.timers.delete(timer);
    }

    private clearTimers(s: PendingMatchmaking): void {
        for (const timer of s.timers) clearTimeout(timer);
        s.timers.clear();
        s.scheduled.clear();
        s.pending = [];
        s.holds = [];
    }

    private broadcastStatus(s: PendingMatchmaking): void {
        // Holds compris : le client voit ces sièges pris (billes anonymes).
        const takenColors = [...s.players.map(p => p.color), ...s.holds.map(h => h.color)];
        for (const player of s.players) {
            wsSend(player.ws, {
                type: 'matchmakingStatus',
                connectedCount: takenColors.length,
                totalNeeded: 4,
                myColor: player.color,
                guestPlayerId: player.guestPlayerId,
                takenColors,
            });
        }
    }
}

/** Lancement réel d'une partie de matchmaking (remplacé par un espion dans les tests). */
export function startMatchmakingGame({ players, messenger, reconnect }: LaunchRequest): void {
    for (const p of players) messenger.addConnection(p.color, p.ws);

    const config: GameConfig = {
        players: players.map(p => ({
            color: p.color,
            name: p.name,
            isHuman: true,
            ...(p.picture ? { picture: p.picture } : {}),
            ...(p.userId ? { userId: p.userId } : {}),
        })),
    };

    const game = new Game(config, messenger);
    GameRegistry.register(game.id, game);
    if (!isTrainMode()) trackGuestGameStarts(game.id, players);

    // Wire up disconnect callbacks (immediate + permanent)
    messenger.setOnTempDisconnect((color) => game.markTempDisconnected(color));
    messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));

    // Persistance blob à chaque fin de tour (survie aux redéploiements) —
    // jamais en TRAIN_MODE (self-play jetable, souvent sans storage configuré).
    const persistToBlob = !isTrainMode() && reconnect !== null && isSnapshotStorageConfigured();
    if (persistToBlob) {
        game.setOnSnapshot(g => queueSaveSnapshot({
            ...g.toSnapshotData(),
            reconnectSlots: reconnect!.getSlotsForGame(g.id),
        }));
    }

    // Wire up reconnection-slot cleanup (single resign + whole game end)
    game.setOnPlayerAbandoned((gameId, color) => reconnect?.releaseSlot(gameId, color));
    game.setOnGameEnded((gameId) => {
        reconnect?.releaseGame(gameId);
        if (persistToBlob) queueDeleteSnapshot(gameId);
    });

    // Register guest player identities and send welcome messages
    for (const p of players) {
        reconnect?.register(p.guestPlayerId, game.id, p.color, p.userId);
        messenger.sendTo(p.color, {
            type: 'welcome',
            message: 'Game started',
            timestamp: new Date().toISOString(),
            gameState: null,
            guestPlayerId: p.guestPlayerId,
            gameId: game.id,
            myColor: p.color,
        });
    }
}
