import crypto from 'node:crypto';
import { Deck } from "./deck.js";
import { Player } from "./player.js";
import { AiStrategy } from "./ai-strategy.js";
import { HumanStrategy } from "./human-strategy.js";
import { getLegalAction, findLegalMoveForCard, getLegalSplit7Action, MAIN_PATH, type LegalMoveContext } from '../utils/utils.js';
import { MultiWsMessenger, type GameMessenger } from './game-messenger.js';
import { GameRegistry } from '../session/game-registry.js';
import { isBotUserId } from '../session/bot-dispatch.js';
import { updateUserPoints, recomputeRankings, getUserPointsAndRanking } from '../db.js';
import { computeEndGamePointsDeltas } from './points.js';
import { isTrainMode } from '../train-mode.js';
import { getServerGameMode } from '../game-mode.js';
import {
    getHomePositions,
    hasWon,
    hasTeamWon,
    getControlledColor,
    getTeammateColor,
    findSolidaireEntry,
    ENTER_CARDS,
    HOME_POSITIONS,
    TURN_DURATION_SECONDS,
    TURN_DURATION_MS,
    TURN_TIMEOUT_OFFSET_MS,
    CARDS_PER_HAND,
    computeMinAnimationDuration,
    SQUARES_TO_DISPLAY,
} from '@mercury/shared';
import { REACTION_EMOJIS } from "@mercury/shared";
import { SNAPSHOT_SCHEMA_VERSION, type GameSnapshot } from './game-snapshot.js';
import type { Action, Card, ClientMessage, GameConfig, GameMode, GameState, GameStatsMessage, MarbleColor, ReactionEmoji } from "@mercury/shared";

const REACTION_COOLDOWN_MS = 2000;

/**
 * Période de grâce au boot d'une partie restaurée : la boucle attend que les
 * joueurs se reconnectent avant de rejouer le tour courant. Au-delà, les
 * absents sont auto-joués (même mécanique que la déconnexion en cours de
 * partie) et la fenêtre de 180s armée par game-restore fait le ménage.
 */
const RESTORED_RECONNECT_GRACE_MS = 30_000;

/**
 * Même sémantique que le DEBUG d'index.ts : active les messages
 * debugPause/debugResume. Fonction (et non `const` figé à l'import) car
 * dotenv.config() est appelé dans index.ts APRÈS l'évaluation des imports —
 * même piège que isTrainMode(), voir train-mode.ts.
 */
function isDebugEnabled(): boolean {
    return process.env['DEBUG'] === 'true';
}

export class Game {

    readonly id: string;

    private players: Player[];
    /** Mode de jeu de la partie — fixé à la création (voir getServerGameMode). */
    private readonly gameMode: GameMode;
    private turn: number = 0;
    private round: number = 0;
    private readonly startTime: number;
    private firstPlayerOfRound: number = 0;
    private currentPlayerIndex: number = 0;
    /** Vrai pour une partie réhydratée depuis un snapshot (voir fromSnapshot). */
    private readonly restored: boolean;

    /**
     * Couleurs des sièges tenus par un agent IA externe, reportées du snapshot.
     * Un agent d'une partie restaurée peut n'avoir pas encore ré-authentifié
     * son compte dans CE process (auto-play en attendant) : sans ce report, le
     * prochain snapshot le reclasserait en humain (voir isBotSeat).
     */
    private readonly botSeatColors = new Set<MarbleColor>();
    private deck: Deck;
    private messenger: GameMessenger;
    private discardedCards: Card[] = [];

    // ── Synchronisation des tours humains ────────────────────────────────────

    /**
     * Resolve de la Promise créée par `awaitHumanAction()`.
     * Mis à null dès qu'une action est reçue ou qu'un timeout se déclenche,
     * ce qui évite d'accepter des actions en retard sur le tour suivant.
     */
    private pendingHumanActionResolve: ((action: Action) => void) | null = null;

    /** Resolve de la Promise créée par `waitForAnimationsOrTimeout()`. */
    private pendingAnimationResolve: (() => void) | null = null;

    /** Action jouée automatiquement suite à un `turnTimeout` du front (pour marquer isTimeout). */
    private pendingTimeoutAction: Action | null = null;

    /** Vrai quand la partie a été annulée (plus aucun humain connecté). */
    private aborted = false;

    // ── Pause debug (édition du plateau) ─────────────────────────────────────

    /**
     * Vrai quand la partie est suspendue par un `debugPause` (DEBUG uniquement).
     * Pendant la pause : la boucle se fige au prochain début de tour, le timer
     * de sécurité se réarme sans imposer de coup, et les `turnTimeout` /
     * `playAction` entrants sont ignorés.
     */
    private debugPaused = false;

    /** Resolve du blocage de la boucle quand la pause survient à une frontière de tour. */
    private debugResumeResolve: (() => void) | null = null;

    /** Vrai quand la partie est terminée (victoire naturelle ou abandon). */
    private gameFinished = false;

    /** UserIds des joueurs déjà pénalisés pour abandon (-2), pour ne pas aussi leur infliger -1. */
    private penalizedUserIds = new Set<string>();

    /** Callback appelé quand un joueur abandonne (libère son slot de reconnexion). */
    private onPlayerAbandoned: ((gameId: string, color: MarbleColor) => void) | null = null;

    /** Callback appelé quand la partie se termine/annule (libère tous les slots). */
    private onGameEnded: ((gameId: string) => void) | null = null;

    /** Callback appelé à chaque point de sauvegarde (fin de tour, distribution).
     *  Jamais câblé pour les parties DEBUG single-device et TRAIN_MODE. */
    private onSnapshot: ((game: Game) => void) | null = null;

    /** Timestamp de la dernière réaction emoji envoyée par chaque joueur (anti-spam). */
    private lastReactionAt = new Map<MarbleColor, number>();

    /**
     * Dernier `gameStats` calculé par joueur signed-in. Permet de le renvoyer
     * si sa connexion était momentanément coupée au moment de l'envoi initial
     * (voir resendStateToPlayer) — sans ça, un joueur qui rate la fenêtre de
     * `sendTo` (socket pas encore rouverte) ne recevait jamais ses points.
     */
    private lastGameStats = new Map<MarbleColor, GameStatsMessage>();

    // ─────────────────────────────────────────────────────────────────────────

    constructor(config: GameConfig, messenger: GameMessenger, snapshot?: GameSnapshot) {
        this.messenger = messenger;
        this.id = snapshot?.gameId ?? crypto.randomUUID();
        this.startTime = snapshot?.startTime ?? Date.now();
        this.restored = snapshot !== undefined;
        // Le mode vient du snapshot (restauration — l'env a pu changer entre
        // deux déploiements), de la config (tests) ou de l'env serveur (GAME_MODE).
        this.gameMode = snapshot?.gameMode ?? config.gameMode ?? getServerGameMode();

        this.players = config.players.map(cfg => {
            const player = new Player(
                cfg.name,
                cfg.color,
                cfg.isHuman,
                cfg.isHuman
                    ? new HumanStrategy(() => this.awaitHumanAction())
                    : new AiStrategy(),
            );
            if (cfg.picture) player.picture = cfg.picture;
            if (cfg.userId) player.userId = cfg.userId;
            return player;
        });

        this.deck = new Deck();

        if (snapshot) {
            this.applySnapshot(snapshot);
        }

        // Handler centralisé : toute la logique WS passe par ici
        messenger.onMessage((msg, senderColor) => this.handleClientMessage(msg, senderColor));

        // Filet de sécurité : une exception dans la boucle de jeu ne doit ni
        // devenir une unhandledRejection, ni laisser la partie orpheline dans
        // le GameRegistry (fuite mémoire + slots de reconnexion bloqués).
        this.startGame()
            .catch(err => {
                console.error(`💥 Partie ${this.id} interrompue par une exception:`, err);
                this.gameFinished = true;
                try {
                    this.messenger.send({ type: 'gameEnded', winners: [], reason: 'abandoned' });
                } catch { /* sockets déjà fermées */ }
            })
            .finally(() => {
                GameRegistry.delete(this.id);
                this.onGameEnded?.(this.id);
            });
    }

    /**
     * Vrai si la partie peut être purgée du registre : terminée, annulée, ou
     * plus vieille que `maxAgeMs` (garde-fou contre les boucles bloquées).
     */
    isStale(maxAgeMs: number): boolean {
        return this.gameFinished || this.aborted || (Date.now() - this.startTime) > maxAgeMs;
    }

    getMessenger(): GameMessenger {
        return this.messenger;
    }

    setOnPlayerAbandoned(cb: (gameId: string, color: MarbleColor) => void): void {
        this.onPlayerAbandoned = cb;
    }

    setOnGameEnded(cb: (gameId: string) => void): void {
        this.onGameEnded = cb;
    }

    setOnSnapshot(cb: (game: Game) => void): void {
        this.onSnapshot = cb;
    }

    // ─── Persistance (survie aux redéploiements) ─────────────────────────────

    /**
     * Reconstruit une partie depuis un snapshot persisté. L'état transient
     * (messenger, stratégies, promesses, timers) est recréé par le constructeur ;
     * les joueurs humains repartent déconnectés et la boucle attend leurs
     * reconnexions (voir waitForRestoredReconnections). Les callbacks
     * (setOnGameEnded, setOnSnapshot…) restent à câbler par l'appelant, comme
     * aux sites de lancement normaux.
     */
    static fromSnapshot(snapshot: GameSnapshot, messenger: GameMessenger): Game {
        const config: GameConfig = {
            gameMode: snapshot.gameMode,
            // L'ordre de players[] doit être celui du snapshot : les index
            // currentPlayerIndex/firstPlayerOfRound s'y réfèrent.
            players: snapshot.players.map(p => ({
                color: p.color,
                name: p.name,
                isHuman: p.isHuman,
                ...(p.picture !== undefined ? { picture: p.picture } : {}),
                ...(p.userId !== undefined ? { userId: p.userId } : {}),
            })),
        };
        return new Game(config, messenger, snapshot);
    }

    /** Applique l'état persisté (appelé par le constructeur, joueurs déjà créés). */
    private applySnapshot(snapshot: GameSnapshot): void {
        this.turn = snapshot.turn;
        this.round = snapshot.round;
        this.firstPlayerOfRound = snapshot.firstPlayerOfRound;
        this.currentPlayerIndex = snapshot.currentPlayerIndex;
        this.deck.setCards(snapshot.deckCards);
        this.discardedCards = [...snapshot.discardedCards];
        this.penalizedUserIds = new Set(snapshot.penalizedUserIds);
        snapshot.players.forEach((ps, i) => {
            if (ps.isBot) this.botSeatColors.add(ps.color);
            const player = this.players[i]!;
            player.cards = [...ps.cards];
            player.marblePositions = [...ps.marblePositions];
            player.marbleInvincible = [...ps.marbleInvincible];
            // Personne n'est encore reconnecté ; resendStateToPlayer remettra
            // le flag à true au fil des `joinGame`. Les sièges IA internes
            // (AiStrategy) restent connectés — ils ne dépendent d'aucune socket.
            if (player.isHuman) player.isConnected = false;
        });
    }

    /**
     * État complet sérialisable de la partie, hors slots de reconnexion —
     * l'appelant (site de lancement) les ajoute depuis le ReconnectRegistry.
     */
    toSnapshotData(): Omit<GameSnapshot, 'reconnectSlots'> {
        return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            savedAt: Date.now(),
            gameId: this.id,
            gameMode: this.gameMode,
            turn: this.turn,
            round: this.round,
            firstPlayerOfRound: this.firstPlayerOfRound,
            currentPlayerIndex: this.currentPlayerIndex,
            startTime: this.startTime,
            deckCards: this.deck.getCards(),
            discardedCards: [...this.discardedCards],
            penalizedUserIds: [...this.penalizedUserIds],
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                ...(this.isBotSeat(p) ? { isBot: true } : {}),
                marblePositions: [...p.marblePositions],
                marbleInvincible: [...p.marbleInvincible],
                cards: [...p.cards],
                ...(p.picture !== undefined ? { picture: p.picture } : {}),
                ...(p.userId !== undefined ? { userId: p.userId } : {}),
            })),
        };
    }

    /** Siège tenu par un agent IA externe : compte authentifié comme bot dans
     *  ce process, ou siège déjà marqué bot dans le snapshot d'origine. */
    private isBotSeat(player: Player): boolean {
        return isBotUserId(player.userId) || this.botSeatColors.has(player.color);
    }

    /**
     * Point de sauvegarde. Jamais après la victoire : un snapshot d'une partie
     * gagnée serait rejoué au restore et réattribuerait les points de fin de
     * partie une seconde fois.
     */
    private persist(): void {
        if (this.gameFinished || this.aborted || this.gameIsOver()) return;
        this.onSnapshot?.(this);
    }

    /** Force une sauvegarde immédiate (flush SIGTERM). No-op si non câblé/terminé. */
    persistNow(): void {
        this.persist();
    }

    /**
     * Réassigne le compte d'un siège — un agent IA re-dispatché après un
     * redéploiement peut recevoir un botId différent de celui d'origine.
     */
    updatePlayerUserId(color: MarbleColor, userId: string): void {
        const player = this.players.find(p => p.color === color);
        if (player) player.userId = userId;
    }

    /**
     * Snapshot de l'état de jeu partagé par tous les joueurs (sans `hand`,
     * propre à chaque destinataire). Source unique pour tous les broadcasts.
     */
    private buildGameStateSnapshot(currentPlayer: Player): Omit<GameState, 'hand'> {
        return {
            players: this.players.map(p => ({
                name: p.name,
                color: p.color,
                isHuman: p.isHuman,
                isConnected: p.isConnected,
                marblePositions: p.marblePositions,
                marbleInvincible: p.marbleInvincible,
                cardsLeft: p.cards.length,
                ...(p.picture !== undefined ? { picture: p.picture } : {}),
                ...(p.userId !== undefined ? { userId: p.userId } : {}),
            })),
            currentTurn: currentPlayer.color,
            gameMode: this.gameMode,
            timer: TURN_DURATION_SECONDS,
            discardedCards: this.discardedCards,
            canDiscard: this.computeCanDiscard(currentPlayer),
        };
    }

    resendStateToPlayer(color: MarbleColor): void {
        const currentPlayer = this.players[this.currentPlayerIndex]!;
        const player = this.players.find(p => p.color === color);
        if (!player) return;

        // Restore the connection flag — they may have been marked as temporarily
        // disconnected (or as abandoned, for signed-in players who came back).
        const wasDisconnected = !player.isConnected;
        player.isConnected = true;

        // Coming back cancels the permanent-disconnect penalty: a player who
        // rejoins and finishes the game must be scored normally (Elo), not left
        // with the flat -2 — which would also exclude them from the end-game
        // gameStats and freeze their screen on "Calculating…". Refund the -2 and
        // drop them from the penalized set so applyEndGamePoints treats them as a
        // regular participant.
        if (player.userId && this.penalizedUserIds.delete(player.userId)) {
            updateUserPoints(player.userId, 2)
                .then(() => recomputeRankings())
                .catch(err => console.error('❌ Failed to refund disconnect penalty on reconnect:', err));
        }

        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

        this.messenger.sendTo(color, {
            type: 'gameState',
            message: 'Reconnected',
            timestamp: new Date().toISOString(),
            gameState: { ...commonGameState, hand: player.cards },
            myColor: color,
        });

        // La partie est peut-être déjà terminée (le joueur reconnecte pendant
        // ou juste après le calcul des points) : renvoyer son dernier gameStats
        // connu, sinon son écran de victoire reste bloqué sans jamais recevoir
        // ses points (le premier envoi, fait pendant la coupure, a été perdu).
        const stats = this.lastGameStats.get(color);
        if (stats) this.messenger.sendTo(color, stats);

        // Notify other players that this player is connected again — they need to
        // update their UI (remove the "disconnected" indicator).
        if (wasDisconnected) {
            this.broadcastConnectionUpdate();
        }
    }

    /**
     * Mark a player as temporarily disconnected (their WebSocket just closed).
     * Other players should see them as offline immediately, without waiting for
     * the 180s reconnect window to expire. This does NOT trigger abort/win-by-default
     * logic — that is reserved for the permanent disconnect path (`markDisconnected`).
     */
    markTempDisconnected(color: MarbleColor): void {
        const player = this.players.find(p => p.color === color);
        if (!player || !player.isConnected) return;
        player.isConnected = false;
        this.broadcastConnectionUpdate();
    }

    /** Mark a player as permanently disconnected and check if game should abort. */
    markDisconnected(color: MarbleColor): void {
        const player = this.players.find(p => p.color === color);
        if (player) {
            const wasConnected = player.isConnected;
            player.isConnected = false;
            if (player.userId && !this.gameFinished && !this.penalizedUserIds.has(player.userId)) {
                this.penalizedUserIds.add(player.userId);
                updateUserPoints(player.userId, -2)
                    .then(() => recomputeRankings())
                    .catch(err => console.error('❌ Failed to update points on disconnect:', err));
            }
            if (wasConnected) this.broadcastConnectionUpdate();
            this.checkAbort();
        }
    }

    /**
     * Broadcast a lightweight state update reflecting current connection flags.
     * Reuses the 'gameState' message shape but with a distinct message string so
     * the frontend does not treat it as a new turn (which would reset the timer).
     */
    private broadcastConnectionUpdate(): void {
        const currentPlayer = this.players[this.currentPlayerIndex]!;
        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

        for (const player of this.players.filter(p => p.isHuman)) {
            this.messenger.sendTo(player.color, {
                type: 'gameState',
                message: 'Connection update',
                timestamp: new Date().toISOString(),
                gameState: { ...commonGameState, hand: player.cards },
            });
        }
    }

    // ─── Boucle principale ────────────────────────────────────────────────────

    private async startGame() {
        if (this.restored) {
            // Partie réhydratée : l'état (mains, pioche, index de tour) vient du
            // snapshot — surtout ne pas redistribuer. On laisse aux joueurs le
            // temps de se reconnecter avant de rejouer le tour courant.
            await this.waitForRestoredReconnections();
            if (this.aborted || this.gameFinished) return;
        } else {
            console.log("🎮 Game started");
            this.firstPlayerOfRound = 0;
            this.currentPlayerIndex = 0;
            this.dealCards();
        }

        while (!this.aborted && !this.gameIsOver()) {
            if (this.allHandsEmpty()) {
                this.startNewRound();
                continue;
            }

            const replay = await this.playOneTurn();

            if (this.aborted) break;

            // Un Joker joué (entrée ou +18) offre un tour supplémentaire :
            // on NE passe PAS au joueur suivant, le même joueur rejoue.
            if (!replay) {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            }
            this.turn++;
            this.persist();
        }

        if (!this.aborted) {
            console.log("🏆 Game over!");
            this.gameFinished = true;
            const winners = this.computeWinners();
            this.messenger.send({ type: 'gameEnded', winners, reason: 'win' });
            // Calculer et envoyer les points AVANT de libérer le slot de
            // reconnexion et de retirer la partie du registre : sinon, un
            // joueur dont la socket coupe juste au moment de la victoire (cas
            // fréquent sur mobile) perd sa fenêtre de reconnexion pendant les
            // allers-retours DB de applyEndGamePoints et ne reçoit jamais son
            // gameStats — voir aussi lastGameStats pour le cas où la coupure
            // dure plus longtemps que ce calcul.
            await this.applyEndGamePoints(winners).catch(err =>
                console.error('❌ Failed to update points after game end:', err)
            );
            GameRegistry.delete(this.id);
            this.onGameEnded?.(this.id);
        }
    }

    private startNewRound(): void {
        this.firstPlayerOfRound = (this.firstPlayerOfRound + 1) % this.players.length;
        this.currentPlayerIndex = this.firstPlayerOfRound;
        console.log(`📦 Nouvelle manche ${this.round} - Premier joueur: ${this.players[this.firstPlayerOfRound]!.name}`);
        this.dealCards();
    }

    /**
     * Attend le retour des joueurs d'une partie restaurée (grâce de 30s, sortie
     * anticipée dès que tous les sièges humains sont reconnectés). Au-delà, la
     * boucle reprend : les absents passent par l'auto-play « déconnecté »
     * existant de playOneTurn, et les fenêtres de 180s armées par game-restore
     * finissent par aborter une partie que personne ne rejoint.
     */
    private async waitForRestoredReconnections(): Promise<void> {
        console.log(`⏸️ Partie ${this.id} restaurée — attente des reconnexions (max ${RESTORED_RECONNECT_GRACE_MS / 1000}s)`);
        const deadline = Date.now() + RESTORED_RECONNECT_GRACE_MS;
        while (Date.now() < deadline && !this.aborted && !this.gameFinished) {
            if (this.players.every(p => !p.isHuman || p.isConnected)) {
                console.log(`▶️ Partie ${this.id} — tous les joueurs sont revenus, reprise`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1_000));
        }
        if (!this.aborted && !this.gameFinished) {
            console.log(`▶️ Partie ${this.id} — reprise après la période de grâce (sièges absents auto-joués)`);
        }
    }

    /**
     * Joue un tour. Retourne `true` si le coup déclenche un rejeu (Joker joué
     * comme entrée/déplacement) ET que le joueur a encore des cartes — auquel
     * cas la boucle principale ne passe pas au joueur suivant.
     */
    private async playOneTurn(): Promise<boolean> {
        // Pause debug demandée pendant le tour précédent (bot ou animation) :
        // on se fige ICI, avant le broadcast, pour que la reprise rebroadcaste
        // un « New turn » cohérent avec l'état édité.
        await this.waitWhileDebugPaused();

        const player = this.players[this.currentPlayerIndex]!;

        console.log(`🔄 Tour ${this.turn} (Manche ${this.round}) — ${player.name} (${player.color})`);

        // 1️⃣ Broadcast de l'état EN DÉBUT de tour
        this.broadcastState(player, 'New turn');

        // 2️⃣ Attendre l'action du joueur/IA
        // Main vide → pass immédiat, pas besoin d'attendre (humain ou IA)
        this.pendingTimeoutAction = null;
        let move: Action;
        let isTimeout = false;
        let isAutoPlay = false;

        if (player.handEmpty()) {
            move = { type: 'pass' as const, from: 0, to: 0, cardPlayed: null, playerColor: player.color };
        } else if (player.isHuman && !player.isConnected) {
            // Joueur humain déconnecté → coup automatique immédiat (pas d'attente 32s)
            console.log(`🤖 ${player.name} est déconnecté — coup automatique`);
            move = this.computeFallbackAction(player);
            isAutoPlay = true;
        } else {
            move = await this.waitForActionOrTimeout(player);
            isTimeout = this.pendingTimeoutAction !== null;
        }

        this.pendingTimeoutAction = null;
        // `playerColor` = le joueur qui a joué la carte (main, tour, rejeu Joker).
        // `marbleColor` = le propriétaire du pion déplacé, qui peut être le
        // coéquipier en 2v2 (switch de fin de jeu, solidaire, Valet libre).
        const enrichedMove: Action = {
            ...move,
            marbleColor: move.marbleColor ?? move.playerColor,
            playerColor: player.color,
        };

        if (enrichedMove.type === 'enter') {
            const enemyOnStart = this.players.some(
                p => p.color !== enrichedMove.marbleColor && p.marblePositions.includes(enrichedMove.to),
            );
            if (enemyOnStart) {
                enrichedMove.capturedOnEnter = true;
            }
        }

        // 3️⃣ Mettre à jour l'état interne
        player.applyAction(enrichedMove);
        this.updateMarblePositions(player, enrichedMove);
        this.updateDiscardedCards(enrichedMove);

        // 4️⃣ Broadcast de l'action (pour animation carte + pion côté front)
        this.broadcastAction(enrichedMove, isTimeout, isAutoPlay);

        // 5️⃣ Attendre la durée minimale d'animation (autorité serveur)
        await this.waitForAnimationsOrTimeout(enrichedMove);

        // 6️⃣ Rejeu : un Joker effectivement joué (pas défaussé/passé) offre un
        // tour de plus, tant que le joueur a encore au moins une carte.
        return this.actionTriggersReplay(enrichedMove) && !player.handEmpty() && !this.aborted;
    }

    /**
     * Vrai quand l'action est un Joker effectivement joué (entrée ou +18),
     * ce qui déclenche un rejeu. Une défausse ou un pass (même si la main
     * défaussée contenait un Joker) ne donne PAS de tour supplémentaire.
     */
    private actionTriggersReplay(move: Action): boolean {
        if (move.type === 'discard' || move.type === 'pass') return false;
        return move.cardPlayed?.length === 1 && move.cardPlayed[0]!.value === 'Joker';
    }

    // ─── Handler centralisé des messages WS ──────────────────────────────────

    private handleClientMessage(msg: ClientMessage, senderColor: MarbleColor | null): void {
        switch (msg.type) {
            case 'playAction':
                this.handlePlayAction(msg.action, senderColor);
                break;
            case 'animationDone':
                // Le serveur fait autorité sur le timing : il attend
                // computeMinAnimationDuration(action) avant de continuer.
                // Le message du client est conservé dans le contrat WS mais
                // ignoré ici pour empêcher un client malveillant d'écourter
                // les animations des autres joueurs.
                break;
            case 'turnTimeout':
                this.handleTurnTimeout(senderColor);
                break;
            case 'abandonGame':
                this.handleAbandonGame(senderColor);
                break;
            case 'reaction':
                this.handleReaction(msg.emoji, senderColor, msg.fromColor);
                break;
            case 'debugPause':
                this.handleDebugPause();
                break;
            case 'debugResume':
                this.handleDebugResume(msg.marblePositions, senderColor);
                break;
            // start / createRoom / joinRoom sont gérés par SessionManager avant
            // que la Game soit créée — on les ignore silencieusement ici.
            default:
                console.warn(`⚠️ Game ${this.id} — message inattendu de ${senderColor ?? '?'}: ${(msg as ClientMessage).type}`);
        }
    }

    private handleReaction(emoji: ReactionEmoji, senderColor: MarbleColor | null, fromColor?: MarbleColor): void {
        // Validation stricte de la palette (le client peut être falsifié).
        if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return;

        // En multi-device, l'identité vient du messenger (autoritatif).
        // En single-device (senderColor null) on accepte fromColor envoyé par le
        // client à condition qu'il corresponde à un joueur humain de la partie.
        let author: MarbleColor;
        if (senderColor !== null) {
            author = senderColor;
        } else if (fromColor && this.players.some(p => p.color === fromColor && p.isHuman)) {
            author = fromColor;
        } else {
            return;
        }

        const now = Date.now();
        const last = this.lastReactionAt.get(author) ?? 0;
        if (now - last < REACTION_COOLDOWN_MS) return;
        this.lastReactionAt.set(author, now);

        this.messenger.send({
            type: 'reactionBroadcast',
            author,
            emoji,
            timestamp: now,
        });
    }

    // ─── Pause debug : édition du plateau ────────────────────────────────────

    /**
     * Suspend la partie pour édition (DEBUG uniquement). Idempotent. Pendant un
     * tour humain la partie est déjà en attente : la pause est effective tout de
     * suite. Pendant un tour bot/animation, elle prend effet au prochain début
     * de tour (voir playOneTurn).
     */
    private handleDebugPause(): void {
        if (!isDebugEnabled() || this.gameFinished || this.aborted) return;
        if (this.debugPaused) return;
        this.debugPaused = true;
        console.log(`🛠️ Partie ${this.id} suspendue pour édition du plateau (debug)`);
    }

    /**
     * Applique les positions éditées comme nouvel état autoritaire puis reprend
     * la partie. Rejette (sans reprendre) si l'état reçu est invalide : chaque
     * couleur doit fournir 4 cases visibles du plateau, sans doublon global.
     */
    private handleDebugResume(marblePositions: Record<MarbleColor, number[]>, senderColor: MarbleColor | null): void {
        if (!isDebugEnabled() || !this.debugPaused || this.gameFinished || this.aborted) return;

        const reject = (reason: string) => {
            console.warn(`⚠️ debugResume rejeté (partie ${this.id}) : ${reason}`);
            const msg = { type: 'actionRejected' as const, reason: `Debug: ${reason}` };
            if (senderColor !== null) this.messenger.sendTo(senderColor, msg);
            else this.messenger.send(msg);
        };

        for (const p of this.players) {
            const next = marblePositions?.[p.color];
            if (!Array.isArray(next) || next.length !== 4) {
                return reject(`positions manquantes ou incomplètes pour ${p.color}`);
            }
            if (next.some(pos => !Number.isInteger(pos) || !SQUARES_TO_DISPLAY.includes(pos))) {
                return reject(`case hors plateau pour ${p.color}`);
            }
        }
        const all = this.players.flatMap(p => marblePositions[p.color]);
        if (new Set(all).size !== all.length) {
            return reject('deux pions sur la même case');
        }

        for (const p of this.players) {
            p.marblePositions = [...marblePositions[p.color]];
            // Remise à zéro volontaire : l'invincibilité (entrée A/K non encore
            // déplacée) n'est pas éditable — état simple et prédictible.
            p.marbleInvincible = [false, false, false, false];
        }

        this.debugPaused = false;
        console.log(`▶️ Partie ${this.id} : plateau édité appliqué, reprise de la partie`);

        if (this.debugResumeResolve) {
            // La boucle était figée à une frontière de tour : playOneTurn va
            // rebroadcaster « New turn » lui-même avec l'état édité.
            const resume = this.debugResumeResolve;
            this.debugResumeResolve = null;
            resume();
        } else {
            // Pause en plein tour humain : le serveur attend toujours l'action.
            // On rebroadcaste l'état pour resynchroniser tous les clients
            // (positions éditées, coups légaux recalculés, timers relancés).
            this.broadcastState(this.players[this.currentPlayerIndex]!, 'New turn');
        }
    }

    /** Bloque la boucle de jeu tant qu'une pause debug est active. */
    private waitWhileDebugPaused(): Promise<void> {
        if (!this.debugPaused) return Promise.resolve();
        return new Promise(resolve => {
            this.debugResumeResolve = resolve;
        });
    }

    // ─── Gestion des actions humaines ────────────────────────────────────────

    /**
     * Retourne une Promise qui sera résolue par `handlePlayAction`
     * quand un message `playAction` valide arrive.
     */
    private awaitHumanAction(): Promise<Action> {
        return new Promise<Action>(resolve => {
            this.pendingHumanActionResolve = resolve;
        });
    }

    private handleTurnTimeout(senderColor: MarbleColor | null): void {
        // Pause debug : le timer d'un client peut expirer pendant l'édition —
        // aucun coup ne doit être imposé tant que la partie est suspendue.
        if (this.debugPaused) return;
        if (!this.pendingHumanActionResolve) return;

        const currentPlayer = this.players[this.currentPlayerIndex]!;
        if (!currentPlayer.isHuman) return;
        if (senderColor !== null && senderColor !== currentPlayer.color) return;

        console.log(`⏰ Timeout signalé par le front — ${currentPlayer.name} : coup imposé`);
        const resolve = this.pendingHumanActionResolve;
        this.pendingHumanActionResolve = null;
        this.pendingTimeoutAction = this.computeFallbackAction(currentPlayer);
        resolve(this.pendingTimeoutAction);
    }

    // ─── Abandon & abort ───────────────────────────────────────────────────

    private handleAbandonGame(senderColor: MarbleColor | null): void {
        if (!senderColor) return; // abandon only makes sense in multi-device

        const player = this.players.find(p => p.color === senderColor);
        if (!player || !player.isHuman) return;

        console.log(`🏳️ ${player.name} (${senderColor}) a abandonné la partie`);

        player.isConnected = false;

        if (player.userId) {
            this.penalizedUserIds.add(player.userId);
            updateUserPoints(player.userId, -2)
                .then(() => recomputeRankings())
                .catch(err => console.error('❌ Failed to update points on abandon:', err));
        }

        // Resigning is final for everyone now: close the WS and free the slot.
        // For signed-in players this releases their account (per spec, resign =
        // released) so they're no longer redirected into / blocked by this game;
        // the bot keeps playing their color until the game ends.
        if (this.messenger instanceof MultiWsMessenger) {
            this.messenger.forceDisconnect(senderColor);
        }
        this.onPlayerAbandoned?.(this.id, senderColor);

        // Tell remaining players about the connection change
        this.broadcastConnectionUpdate();

        this.checkAbort();
    }

    /** Abort the game if no human players are still connected. */
    private checkAbort(): void {
        const humanPlayers = this.players.filter(p => p.isHuman);
        const connectedHumans = humanPlayers.filter(p => p.isConnected);
        if (connectedHumans.length === 0) {
            this.abortGame();
            return;
        }
        if (connectedHumans.length === 1 && humanPlayers.length > 1) {
            void this.declareLastConnectedWinner(connectedHumans[0]!);
        }
    }

    /** End the game with a win for the last remaining connected human player. */
    private async declareLastConnectedWinner(winner: Player): Promise<void> {
        if (this.gameFinished) return;
        this.gameFinished = true;
        this.aborted = true;

        console.log(`🏆 ${winner.name} (${winner.color}) wins — last connected player`);

        // En 2v2, le dernier humain connecté fait gagner son ÉQUIPE entière.
        const winners = this.gameMode === '2v2'
            ? [winner.color, getTeammateColor(winner.color)]
            : [winner.color];
        this.messenger.send({ type: 'gameEnded', winners, reason: 'win_by_default' });

        if (this.pendingHumanActionResolve) {
            const currentPlayer = this.players[this.currentPlayerIndex]!;
            this.pendingHumanActionResolve({
                type: 'pass', from: 0, to: 0,
                cardPlayed: null, playerColor: currentPlayer.color,
            });
            this.pendingHumanActionResolve = null;
        }
        this.pendingAnimationResolve?.();
        this.pendingAnimationResolve = null;
        this.debugResumeResolve?.();
        this.debugResumeResolve = null;

        // Voir le commentaire équivalent dans startGame() : les points sont
        // calculés et envoyés avant de libérer le slot de reconnexion.
        await this.applyEndGamePoints(winners).catch(err =>
            console.error('❌ Failed to update points after game end:', err)
        );
        GameRegistry.delete(this.id);
        this.onGameEnded?.(this.id);
    }

    /** Stop the game immediately and clean up. Idempotent. */
    private abortGame(): void {
        if (this.aborted || this.gameFinished) return;
        this.aborted = true;
        this.gameFinished = true;

        console.log("🚫 Game aborted — no connected human players remain");

        // Notify any still-connected clients (unlikely but possible with bots-only race)
        this.messenger.send({ type: 'gameEnded', winners: [], reason: 'abandoned' });

        // Unblock any pending promises so the game loop can exit
        if (this.pendingHumanActionResolve) {
            const currentPlayer = this.players[this.currentPlayerIndex]!;
            this.pendingHumanActionResolve({
                type: 'pass', from: 0, to: 0,
                cardPlayed: null, playerColor: currentPlayer.color,
            });
            this.pendingHumanActionResolve = null;
        }
        this.pendingAnimationResolve?.();
        this.pendingAnimationResolve = null;
        this.debugResumeResolve?.();
        this.debugResumeResolve = null;

        GameRegistry.delete(this.id);
        this.onGameEnded?.(this.id);
    }

    // ─── Gestion des actions humaines ────────────────────────────────────────

    private handlePlayAction(action: Action, senderColor: MarbleColor | null): void {
        if (this.debugPaused) return; // partie suspendue pour édition (debug)
        if (!this.pendingHumanActionResolve) return; // pas de tour humain en cours

        const currentPlayer = this.players[this.currentPlayerIndex]!;
        if (!currentPlayer.isHuman) return;

        // En multi-device : vérifier que l'action vient du bon joueur
        if (senderColor !== null && senderColor !== currentPlayer.color) {
            console.warn(`⚠️ Actions reçue de ${senderColor} alors que c'est au tour de ${currentPlayer.color}`);
            this.messenger.sendTo(senderColor, {
                type: 'actionRejected',
                reason: 'Not your turn',
            });
            return;
        }

        const validated = this.validateHumanAction(action, currentPlayer);
        if (!validated) {
            this.messenger.sendTo(currentPlayer.color, {
                type: 'actionRejected',
                reason: 'Invalid action',
            });
            return;
        }

        // Résoudre la Promise en attente et invalider immédiatement le slot
        const resolve = this.pendingHumanActionResolve;
        this.pendingHumanActionResolve = null;
        resolve(validated);
    }

    /**
     * Validation serveur d'une action humaine.
     * Recalcule le coup légal côté serveur et compare avec ce qu'a envoyé le client.
     * Retourne null si l'action est illégale.
     */
    private validateHumanAction(action: Action, player: Player): Action | null {
        const ctx = this.buildLegalMoveContext(player);

        if (action.type === 'pass') {
            return { ...action, playerColor: player.color };
        }

        // Mise en jeu solidaire (2v2) : quand elle s'applique, elle est
        // OBLIGATOIRE — la défausse est refusée et la seule action acceptée est
        // l'entrée d'un pion du coéquipier avec un A, un K ou un Joker.
        const solidaire = findSolidaireEntry(player.cards, ctx);

        if (action.type === 'discard') {
            if (solidaire) return null;
            // N'accepter la défausse que si aucun coup légal n'est possible
            const hasLegalMove = player.cards.some(card => findLegalMoveForCard(card, ctx) !== null);
            if (hasLegalMove) return null;
            return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
        }

        // Vérifier que la carte déclarée est bien dans la main du joueur
        const card = action.cardPlayed?.[0];
        if (!card) return null;
        if (!player.cards.some(c => c.id === card.id)) return null;

        if (solidaire) {
            // On respecte la carte d'entrée et le pion (case de réserve du
            // coéquipier) choisis par le client, tant qu'ils sont valides.
            if (!ENTER_CARDS.includes(card.value)) return null;
            const teammate = ctx.teammateColor!;
            const isTeammateReserve = HOME_POSITIONS[teammate].includes(action.from)
                && ctx.marblesByColor[teammate].includes(action.from);
            if (!isTeammateReserve) return null;
            return { ...solidaire, from: action.from, cardPlayed: [card], playerColor: player.color };
        }

        // Split 7 : le client envoie from/to pour le premier pion et splitFrom pour le second.
        if (card.value === '7' && action.splitFrom !== undefined && action.splitFrom !== 0) {
            const fromIdx = MAIN_PATH.indexOf(action.from);
            const toIdx = MAIN_PATH.indexOf(action.to);
            if (fromIdx === -1 || toIdx === -1) return null;
            const steps1 = (toIdx - fromIdx + MAIN_PATH.length) % MAIN_PATH.length;
            const serverAction = getLegalSplit7Action(card, action.from, steps1, action.splitFrom, ctx);
            if (!serverAction) return null;
            return { ...serverAction, playerColor: player.color };
        }

        // Le serveur recalcule lui-même l'action légale à partir de card + from.
        // Pour le Jack, on passe aussi action.to (la cible du swap choisie par le client).
        const target = card.value === 'J' ? action.to : undefined;
        const serverAction = getLegalAction(card, action.from, ctx, target);
        if (!serverAction) return null;

        return { ...serverAction, playerColor: player.color };
    }

    // ─── Attente avec timeout ─────────────────────────────────────────────────

    /**
     * Si le joueur n'a pas joué avant la fin du timer, le serveur impose une action :
     *  - coup légal (priorité IA) si possible
     *  - défausse sinon
     * `pass` est réservé à la main vide, géré en amont dans playOneTurn.
     */
    private computeFallbackAction(player: Player): Action {
        const ctx = this.buildLegalMoveContext(player);

        for (const card of player.cards) {
            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`⏰ Timeout — ${player.name} : coup imposé ${card.value}${card.suit} [${action.type}]`);
                return { ...action, playerColor: player.color };
            }
        }

        // Mise en jeu solidaire (2v2) : obligatoire avant toute défausse.
        const solidaire = findSolidaireEntry(player.cards, ctx);
        if (solidaire) {
            console.log(`⏰ Timeout — ${player.name} : entrée solidaire imposée (pion du coéquipier)`);
            return { ...solidaire, playerColor: player.color };
        }

        console.log(`⏰ Timeout — ${player.name} : défausse imposée (aucun coup légal)`);
        return { type: 'discard', from: 0, to: 0, cardPlayed: [...player.cards], playerColor: player.color };
    }

    private waitForActionOrTimeout(player: Player): Promise<Action> {
        return new Promise<Action>((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout>;

            // Timer de sécurité : se déclenche si le frontend ne répond pas
            // (déconnexion, crash). En temps normal, c'est le `turnTimeout` du front
            // qui résout la promesse en premier (via handleTurnTimeout).
            // Pendant une pause debug, il se réarme sans imposer de coup — le
            // joueur retrouve un tour complet à la reprise.
            const arm = () => {
                timer = setTimeout(() => {
                    if (settled) return;
                    if (this.debugPaused) { arm(); return; }
                    settled = true;
                    this.pendingHumanActionResolve = null;
                    const fallback = this.computeFallbackAction(player);
                    this.pendingTimeoutAction = fallback;
                    resolve(fallback);
                }, TURN_DURATION_MS + TURN_TIMEOUT_OFFSET_MS);
            };
            arm();

            player.getAction(this.buildLegalMoveContext(player)).then((action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(action);
            });
        });
    }

    private waitForAnimationsOrTimeout(action: Action): Promise<void> {
        // En self-play (TRAIN_MODE), aucun rendu visuel : on n'attend pas
        // la durée d'animation, les coups s'enchaînent immédiatement.
        const minDelay = isTrainMode() ? 0 : computeMinAnimationDuration(action);

        return new Promise<void>((resolve) => {
            let settled = false;

            const finish = () => {
                if (settled) return;
                settled = true;
                this.pendingAnimationResolve = null;
                resolve();
            };

            // Conservé pour permettre à handleAbandonGame de débloquer la boucle.
            this.pendingAnimationResolve = finish;

            setTimeout(finish, minDelay);
        });
    }

    // ─── Broadcast ───────────────────────────────────────────────────────────

    private broadcastAction(action: Action, isTimeout = false, isAutoPlay = false): void {
        this.messenger.send({
            type: 'actionPlayed',
            timestamp: new Date().toISOString(),
            action,
            isTimeout,
            isAutoPlay,
        });
    }

    /** Vrai si le joueur courant n'a aucun coup légal (peut défausser). */
    private computeCanDiscard(player: Player): boolean {
        if (player.handEmpty()) return false;
        const ctx = this.buildLegalMoveContext(player);
        if (player.cards.some(card => findLegalMoveForCard(card, ctx) !== null)) return false;
        // Mise en jeu solidaire (2v2) : tant qu'elle s'applique, la défausse est interdite.
        return findSolidaireEntry(player.cards, ctx) === null;
    }

    /**
     * Contexte de validation des coups pour un joueur — source unique, utilisée
     * pour la stratégie (humain/IA), la validation serveur, le fallback timeout
     * et le calcul de `canDiscard`.
     *
     * En 2v2, un joueur qui a rentré ses 4 pions contrôle ceux de son
     * coéquipier : `ownMarbles`/`playerColor` désignent alors le coéquipier
     * (ses pions, son start, ses arrivées), et `teammateColor` active les
     * règles d'équipe du validateur (Valet libre, 7 partagé, solidaire).
     */
    private buildLegalMoveContext(player: Player): LegalMoveContext {
        const marblesByColor = Object.fromEntries(this.players.map(p => [p.color, [...p.marblePositions]])) as Record<MarbleColor, number[]>;
        const base = {
            allMarbles: Object.values(marblesByColor).flat(),
            marblesByColor,
            invincibleMarblesByColor: this.buildInvincibleMarblesByColor(),
        };

        if (this.gameMode === '2v2') {
            const controlled = getControlledColor(player.color, player.marblePositions);
            return {
                ...base,
                ownMarbles: [...marblesByColor[controlled]],
                playerColor: controlled,
                teammateColor: getTeammateColor(controlled),
            };
        }

        return {
            ...base,
            ownMarbles: [...marblesByColor[player.color]],
            playerColor: player.color,
        };
    }

    /**
     * Construit la map des positions invincibles, par couleur. Un pion est
     * invincible uniquement entre son entrée (A/K) et son premier mouvement.
     */
    private buildInvincibleMarblesByColor(): Record<MarbleColor, number[]> {
        return Object.fromEntries(
            this.players.map(p => [
                p.color,
                p.marblePositions.filter((_, i) => p.marbleInvincible[i]),
            ])
        ) as Record<MarbleColor, number[]>;
    }

    private broadcastState(currentPlayer: Player, message = 'New turn'): void {
        const commonGameState = this.buildGameStateSnapshot(currentPlayer);

        const humanPlayers = this.players.filter(p => p.isHuman);

        if (humanPlayers.length === 0) {
            // Partie 100% IA — on diffuse sans main
            this.messenger.send({
                type: 'gameState', message,
                timestamp: new Date().toISOString(),
                gameState: { ...commonGameState, hand: [] },
            });
        } else {
            // Chaque humain reçoit sa propre main via sendTo.
            // En single-device sendTo == send ; en multi-device chacun reçoit les siennes.
            for (const player of humanPlayers) {
                this.messenger.sendTo(player.color, {
                    type: 'gameState', message,
                    timestamp: new Date().toISOString(),
                    gameState: { ...commonGameState, hand: player.cards },
                });
            }
        }
    }

    // ─── Mise à jour de l'état ────────────────────────────────────────────────

    private updateDiscardedCards(move: Action): void {
        if (move.cardPlayed) {
            this.discardedCards.push(...move.cardPlayed);
        }
    }

    private updateMarblePositions(player: Player, move: Action): void {
        // Le pion déplacé peut appartenir à un autre joueur que celui qui a joué
        // la carte (2v2 : switch de fin de jeu, solidaire, 7 partagé, Valet libre).
        const moverColor = move.marbleColor ?? move.playerColor;
        const mover = this.players.find(p => p.color === moverColor) ?? player;

        switch (move.type) {
            case 'move':
            case 'enter':
            case 'promote':
            case 'capture': {
                // 1. Déplacer le(s) pion(s). Pour un split de 7, les DEUX
                // moitiés bougent avant toute résolution de capture : sinon,
                // si la destination de l'une coïncide avec la position de
                // départ de l'autre (ex : promouvoir un coéquipier situé
                // exactement `steps1` cases devant soi), la première moitié
                // capturerait à tort la seconde avant qu'elle ait pu bouger.
                const index = mover.marblePositions.indexOf(move.from);
                if (index !== -1) {
                    mover.marblePositions[index] = move.to;
                    // Entry via A/K/Joker → marble becomes invincible. Any other
                    // movement (including a re-landing on the start) clears it.
                    mover.marbleInvincible[index] = (move.type === 'enter');
                }

                // Split du 7 : le second pion peut appartenir au coéquipier en 2v2.
                let splitMover: Player | null = null;
                let splitIdx = -1;
                if (move.splitFrom !== undefined && move.splitTo !== undefined) {
                    splitMover = this.players.find(p => p.color === (move.splitMarbleColor ?? moverColor)) ?? mover;
                    splitIdx = splitMover.marblePositions.indexOf(move.splitFrom);
                    if (splitIdx !== -1) {
                        splitMover.marblePositions[splitIdx] = move.splitTo;
                        splitMover.marbleInvincible[splitIdx] = false;
                    }
                }

                // 2. Renvoyer les pions capturés à leur base, une fois les deux
                // moitiés déplacées. Tout pion posé sur `to`/`splitTo` est
                // victime SAUF celui qui vient d'y arriver — y compris un pion
                // du joueur actif ou de son coéquipier (pas d'immunité d'équipe).
                this.sendVictimsHome(move.to, mover, index, player);
                if (splitMover !== null && splitIdx !== -1) {
                    this.sendVictimsHome(move.splitTo!, splitMover, splitIdx, player);
                }
                break;
            }

            case 'swap': {
                // Les deux extrémités sont résolues par position : en 2v2 le
                // Valet peut échanger deux pions n'appartenant pas au joueur actif.
                const a = this.findMarbleAt(move.from);
                const b = this.findMarbleAt(move.to);
                if (a && b) {
                    a.owner.marblePositions[a.index] = move.to;
                    a.owner.marbleInvincible[a.index] = false;
                    b.owner.marblePositions[b.index] = move.from;
                    b.owner.marbleInvincible[b.index] = false;
                    console.log(`🔄 ${player.name} a échangé ${a.owner.name} ↔ ${b.owner.name} (${move.from} ↔ ${move.to})`);
                }
                break;
            }

            case 'pass':
            case 'discard':
                break;
        }
    }

    /** Localise le pion posé sur une case, toutes couleurs confondues. */
    private findMarbleAt(pos: number): { owner: Player; index: number } | null {
        for (const owner of this.players) {
            const index = owner.marblePositions.indexOf(pos);
            if (index !== -1) return { owner, index };
        }
        return null;
    }

    /**
     * Renvoie à sa base tout pion posé sur `pos`, à l'exception du pion qui
     * vient d'y être déplacé (`mover`/`moverIndex`). Contrairement à l'ancienne
     * version qui excluait le joueur actif entier, on peut capturer un pion de
     * n'importe quelle couleur — y compris celle du coéquipier ou du joueur
     * actif (second pion d'un 7 partagé atterrissant sur le premier, etc.).
     */
    private sendVictimsHome(pos: number, mover: Player, moverIndex: number, activePlayer: Player): void {
        for (const victim of this.players) {
            for (let i = 0; i < victim.marblePositions.length; i++) {
                if (victim === mover && i === moverIndex) continue;
                if (victim.marblePositions[i] !== pos) continue;
                const homePositions = getHomePositions(victim.color);
                const emptyHome = homePositions.find(p => !victim.marblePositions.includes(p));
                if (emptyHome !== undefined) {
                    victim.marblePositions[i] = emptyHome;
                    victim.marbleInvincible[i] = false;
                    console.log(`💀 ${activePlayer.name} a capturé un pion de ${victim.name}! Retour à la base (${emptyHome}).`);
                }
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private async applyEndGamePoints(winners: MarbleColor[]): Promise<void> {
        // Collect non-penalized human players with a userId.
        // Disconnect/abandon penalties are applied separately with a flat -2 (intentionally
        // not Elo-weighted: they are a behaviour penalty, not a match outcome).
        const participants = this.players
            .filter(p => p.isHuman && p.userId && !this.penalizedUserIds.has(p.userId))
            .map(p => ({ color: p.color, userId: p.userId! }));

        if (participants.length === 0) return;

        // Fetch current points for every participant (needed for the Elo formula)
        const currentStats = await Promise.all(
            participants.map(async p => {
                const s = await getUserPointsAndRanking(p.userId);
                return { ...p, points: s?.points ?? 1000, isWinner: winners.includes(p.color) };
            })
        );

        // Compute weighted deltas using the Elo-like formula in points.ts
        const deltas = computeEndGamePointsDeltas(
            currentStats.map(p => ({ userId: p.userId, points: p.points, isWinner: p.isWinner }))
        );

        // Apply deltas in parallel, then recompute rankings once
        await Promise.all(deltas.map(({ userId, delta }) => updateUserPoints(userId, delta)));
        await recomputeRankings();

        // Fetch updated stats and push a gameStats message to each player.
        // Promise.allSettled + try/catch per player: one player's fetch/send
        // failure (e.g. a socket that closed right at the win moment, still
        // present in the messenger's connections map but no longer writable)
        // must not swallow the console logging for the other, unrelated players.
        await Promise.allSettled(
            currentStats.map(async p => {
                try {
                    const updated = await getUserPointsAndRanking(p.userId);
                    if (!updated) return;
                    const delta = deltas.find(d => d.userId === p.userId)?.delta ?? 0;
                    const statsMsg: GameStatsMessage = {
                        type: 'gameStats',
                        pointsDelta: delta,
                        newPoints: updated.points,
                        newRanking: updated.ranking,
                    };
                    this.lastGameStats.set(p.color, statsMsg);
                    this.messenger.sendTo(p.color, statsMsg);
                    console.log(`📊 gameStats → ${p.color}: delta=${delta}, total=${updated.points}, rank=#${updated.ranking}`);
                } catch (err) {
                    console.error(`❌ Failed to send gameStats to ${p.color}:`, err);
                }
            })
        );

        // Penalized humans who are still connected at game end (e.g. penalized
        // via some path but never refunded) must still receive a gameStats, or
        // their screen freezes on "Calculating…". They are not Elo-scored — their
        // flat -2 was already applied — so we just report the current totals.
        const penalizedConnected = this.players.filter(
            p => p.isHuman && p.userId && p.isConnected && this.penalizedUserIds.has(p.userId),
        );
        await Promise.allSettled(
            penalizedConnected.map(async p => {
                try {
                    const updated = await getUserPointsAndRanking(p.userId!);
                    if (!updated) return;
                    const statsMsg: GameStatsMessage = {
                        type: 'gameStats',
                        pointsDelta: -2,
                        newPoints: updated.points,
                        newRanking: updated.ranking,
                    };
                    this.lastGameStats.set(p.color, statsMsg);
                    this.messenger.sendTo(p.color, statsMsg);
                    console.log(`📊 gameStats → ${p.color} (pénalisé): delta=-2, total=${updated.points}, rank=#${updated.ranking}`);
                } catch (err) {
                    console.error(`❌ Failed to send gameStats to ${p.color} (pénalisé):`, err);
                }
            })
        );
    }

    private allHandsEmpty(): boolean {
        return this.players.every(p => p.handEmpty());
    }

    private dealCards(): void {
        this.round++;
        // Deck de 54 cartes (52 + 2 Jokers), 4 joueurs, cycle de 3 manches :
        // manche 1 = 5 cartes, manches 2 et 3 = 4 cartes ⇒ 5·4·4 = 13 cartes/joueur
        // (52 distribuées) et 2 cartes restent EN RÉSERVE (jamais distribuées) ce cycle.
        // On ne réinitialise le deck que lorsqu'il ne reste plus assez de cartes
        // pour une manche complète de 4 cartes — sinon on ferait les 2 réserves
        // entrer dans une distribution incomplète.
        const minCardsForRound = (CARDS_PER_HAND - 1) * this.players.length;
        if (this.deck.remainingCards() < minCardsForRound) {
            this.deck.resetDeck();
        }
        this.deck.shuffle();
        const cardsPerHand = this.deck.isFull() ? CARDS_PER_HAND : CARDS_PER_HAND - 1;
        for (const player of this.players) {
            player.cards = this.deck.drawCards(cardsPerHand);
        }
        console.log(`🃏 Distribution - Manche ${this.round} (${cardsPerHand} cartes/joueur, réserve: ${this.deck.remainingCards()})`);
        // Point de sauvegarde juste après la distribution : un crash entre la
        // distribution et la première fin de tour ne doit pas redistribuer des
        // mains différentes au restore.
        this.persist();
    }

    private gameIsOver(): boolean {
        if (this.gameMode === '2v2') {
            // Victoire d'équipe : les DEUX coéquipiers ont rentré leurs 4 pions.
            // Un joueur fini seul continue de jouer (il contrôle les pions de
            // son coéquipier, voir buildLegalMoveContext).
            const marblesByColor = Object.fromEntries(
                this.players.map(p => [p.color, p.marblePositions])
            ) as Record<MarbleColor, number[]>;
            return this.players.some(p => hasTeamWon(marblesByColor, p.color));
        }
        return this.players.some(p => hasWon(p.marblePositions, p.color));
    }

    /** Couleur(s) gagnante(s) à la fin naturelle : une en 1v3, les deux de l'équipe en 2v2. */
    private computeWinners(): MarbleColor[] {
        const finished = this.players
            .filter(p => hasWon(p.marblePositions, p.color))
            .map(p => p.color);
        if (this.gameMode === '2v2') {
            const winner = finished.find(color => finished.includes(getTeammateColor(color)));
            return winner !== undefined ? [winner, getTeammateColor(winner)] : [];
        }
        return finished.length > 0 ? [finished[0]!] : [];
    }
}
