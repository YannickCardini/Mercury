import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from "@angular/core";

import { Capacitor } from "@capacitor/core";
import { Subscription } from "rxjs";
import {
  REACTION_EMOJIS,
  isEmojiUnlocked,
  type ReactionEmoji,
  type MarbleColor,
} from "@mercury/shared";
import { GameStateService } from "../../services/game-state.service";
import { SoundService } from "../../services/sound.service";
import { ShopService } from "../../../services/shop.service";
import { AuthService } from "../../../services/auth.service";
import { ToastService } from "../../../shared/toast.service";

/** Une case de la palette : l'emoji et son état de déblocage. */
export interface PaletteEntry {
  emoji: ReactionEmoji;
  locked: boolean;
}

interface FloatingReaction {
  id: number;
  emoji: ReactionEmoji;
  color: MarbleColor;
  x: number;
  y: number;
}

const COOLDOWN_MS = 2000;
const FLOAT_DURATION_MS = 1600;
// Android WebView can dispatch a spurious extra click for a single tap
// (ghost click) that lands on the just-inserted backdrop, toggling the
// palette a second time within the same gesture (open→close→open blink).
// Collapsing any open/close call within this window into the first one
// removes the duplicate without affecting genuinely separate taps.
const TOGGLE_GUARD_MS = 250;

@Component({
  selector: "app-emoji-reactions",
  standalone: true,
  imports: [],
  templateUrl: "./emoji-reactions.component.html",
  styleUrl: "./emoji-reactions.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `is-native` : allège en CSS les backdrop-filter coûteux sur WebView Android.
  host: { "[class.is-native]": "isNative" },
})
export class EmojiReactionsComponent implements OnInit, OnDestroy {
  readonly isNative = Capacitor.isNativePlatform();

  /**
   * La palette garde toujours toutes ses cases, quel que soit l'état du compte :
   * la géométrie de la grille ne dépend donc pas du nombre d'emojis débloqués
   * (pas de reflow entre invité et connecté), et le cadenas est la seule
   * publicité que la boutique reçoit depuis une partie.
   */
  readonly entries = computed<PaletteEntry[]>(() =>
    REACTION_EMOJIS.map((emoji) => ({
      emoji,
      locked: !isEmojiUnlocked(emoji, this.shop.owned()),
    }))
  );

  showPalette = signal(false);
  floating = signal<FloatingReaction[]>([]);
  private lastSentAt = signal(0);
  private now = signal(Date.now());
  private nowTimer?: ReturnType<typeof setInterval>;

  /** Trigger disabled while in cooldown after sending. */
  cooldownActive = computed(() => this.now() - this.lastSentAt() < COOLDOWN_MS);

  private gameStateService = inject(GameStateService);
  private soundService = inject(SoundService);
  private shop = inject(ShopService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private sub?: Subscription;
  private nextId = 1;
  private lastToggleAt = 0;

  constructor() {
    // Le tutoriel se dessine au-dessus de tout : il doit se taire pendant que
    // la palette est ouverte.
    this.gameStateService.publishOverlay("emoji", this.showPalette);
  }

  ngOnInit(): void {
    this.sub = this.gameStateService.reaction$.subscribe((msg) => {
      this.spawnFloating(msg.author, msg.emoji);
      this.soundService.playReaction(msg.emoji);
    });
    // Rafraîchit l'inventaire de boutique. Le cache local a déjà donné le bon
    // état de verrouillage de façon synchrone : un échec réseau ici n'empêche
    // donc rien, et le serveur revérifie la possession de toute façon.
    void this.shop.load().catch(() => { /* cache local conservé */ });
    // Pas de timer permanent : il ne sert qu'à libérer le bouton après le
    // cooldown. On ne le démarre donc que pendant la fenêtre de cooldown
    // (cf. startCooldownTicker), pour éviter 4 cycles de change detection/s
    // inutiles toute la partie.
  }

  /** Démarre un tick 250 ms le temps du cooldown, puis s'auto-arrête. */
  private startCooldownTicker(): void {
    if (this.nowTimer) return;
    this.nowTimer = setInterval(() => {
      this.now.set(Date.now());
      if (!this.cooldownActive()) {
        clearInterval(this.nowTimer);
        this.nowTimer = undefined;
      }
    }, 250);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  togglePalette(): void {
    if (this.cooldownActive()) return;
    if (!this.consumeToggleGuard()) return;
    this.showPalette.update((v) => !v);
  }

  closePalette(): void {
    if (!this.consumeToggleGuard()) return;
    this.showPalette.set(false);
  }

  /** Ignores a call arriving within TOGGLE_GUARD_MS of the previous one. */
  private consumeToggleGuard(): boolean {
    const now = Date.now();
    if (now - this.lastToggleAt < TOGGLE_GUARD_MS) return false;
    this.lastToggleAt = now;
    return true;
  }

  pickEmoji(entry: PaletteEntry): void {
    if (this.cooldownActive()) return;

    if (entry.locked) {
      // Ni envoi, ni cooldown consommé, ni navigation : quitter la page
      // pendant une partie coûterait un abandon.
      this.showPalette.set(false);
      this.toast.show(
        this.auth.user$.getValue()
          ? "Unlock this reaction in the Shop."
          : "Sign in to unlock this reaction."
      );
      return;
    }

    const emoji = entry.emoji;
    this.lastSentAt.set(Date.now());
    this.now.set(Date.now());
    this.startCooldownTicker();
    this.showPalette.set(false);
    this.gameStateService.sendReaction(emoji);
    // The server will echo the broadcast back to us — we let the broadcast
    // path spawn the animation, so single-source-of-truth and the animation
    // origin matches what other clients see.
  }

  private spawnFloating(color: MarbleColor, emoji: ReactionEmoji): void {
    const panel = document.querySelector<HTMLElement>(
      `[data-player-color="${color}"]`
    );
    const rect = panel?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    const id = this.nextId++;
    this.floating.update((list) => [...list, { id, emoji, color, x, y }]);
    setTimeout(() => {
      this.floating.update((list) => list.filter((f) => f.id !== id));
    }, FLOAT_DURATION_MS);
  }
}
