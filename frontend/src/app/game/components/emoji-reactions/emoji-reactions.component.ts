import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { REACTION_EMOJIS, type ReactionEmoji, type MarbleColor } from '@mercury/shared';
import { GameStateService } from '../../services/game-state.service';
import { SoundService } from '../../services/sound.service';

interface FloatingReaction {
  id: number;
  emoji: ReactionEmoji;
  color: MarbleColor;
  x: number;
  y: number;
}

const COOLDOWN_MS = 2000;
const FLOAT_DURATION_MS = 1600;

@Component({
  selector: 'app-emoji-reactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './emoji-reactions.component.html',
  styleUrl: './emoji-reactions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmojiReactionsComponent implements OnInit, OnDestroy {

  readonly emojis = REACTION_EMOJIS;

  showPalette = signal(false);
  floating = signal<FloatingReaction[]>([]);
  private lastSentAt = signal(0);
  private now = signal(Date.now());
  private nowTimer?: ReturnType<typeof setInterval>;

  /** Trigger disabled while in cooldown after sending. */
  cooldownActive = computed(() => this.now() - this.lastSentAt() < COOLDOWN_MS);

  private gameStateService = inject(GameStateService);
  private soundService = inject(SoundService);
  private sub?: Subscription;
  private nextId = 1;

  ngOnInit(): void {
    this.sub = this.gameStateService.reaction$.subscribe(msg => {
      this.spawnFloating(msg.author, msg.emoji);
      this.soundService.playReaction(msg.emoji);
    });
    // Tick once a second so the cooldown computed clears the disabled state.
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 250);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  togglePalette(): void {
    if (this.cooldownActive()) return;
    this.showPalette.update(v => !v);
  }

  closePalette(): void {
    this.showPalette.set(false);
  }

  pickEmoji(emoji: ReactionEmoji): void {
    if (this.cooldownActive()) return;
    this.lastSentAt.set(Date.now());
    this.now.set(Date.now());
    this.showPalette.set(false);
    this.gameStateService.sendReaction(emoji);
    // The server will echo the broadcast back to us — we let the broadcast
    // path spawn the animation, so single-source-of-truth and the animation
    // origin matches what other clients see.
  }

  private spawnFloating(color: MarbleColor, emoji: ReactionEmoji): void {
    const panel = document.querySelector<HTMLElement>(`[data-player-color="${color}"]`);
    const rect = panel?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    const id = this.nextId++;
    this.floating.update(list => [...list, { id, emoji, color, x, y }]);
    setTimeout(() => {
      this.floating.update(list => list.filter(f => f.id !== id));
    }, FLOAT_DURATION_MS);
  }
}
