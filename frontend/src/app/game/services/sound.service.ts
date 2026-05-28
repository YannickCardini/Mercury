import { Injectable, signal } from '@angular/core';
import type { ReactionEmoji } from '@mercury/shared';

const REACTION_SOUND_KEY: Record<ReactionEmoji, string> = {
  '👏': 'emoji_clap',
  '😂': 'emoji_laugh',
  '😮': 'emoji_shocked',
  '😥': 'emoji_sad',
  '🔥': 'emoji_fire',
  '🤔': 'emoji_thinking',
  '😡': 'emoji_angry',
  '😎': 'emoji_cool',
  '😴': 'emoji_sleep',
  '⏰': 'emoji_alarm',
  '🥱': 'emoji_yawn',
  '🦧': 'emoji_confused',
};

@Injectable({ providedIn: 'root' })
export class SoundService {

  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();

  readonly muted = signal<boolean>(localStorage.getItem('mercury-muted') === 'true');
  readonly vibrationEnabled = signal<boolean>((localStorage.getItem('mercury-vibration') ?? 'true') === 'true');

  toggleMute(): void {
    this.muted.set(!this.muted());
    localStorage.setItem('mercury-muted', String(this.muted()));
  }

  toggleVibration(): void {
    this.vibrationEnabled.set(!this.vibrationEnabled());
    localStorage.setItem('mercury-vibration', String(this.vibrationEnabled()));
  }

  constructor() {
    this.preloadAssets();
  }

  private async preloadAssets(): Promise<void> {
    const assets: Array<{ key: string; url: string }> = [
      { key: 'new_turn', url: 'assets/sounds/new_turn.wav' },
      { key: 'card', url: 'assets/sounds/card.wav' },
      { key: 'capture', url: 'assets/sounds/capture.wav' },
      { key: 'teleport', url: 'assets/sounds/teleport.wav' },
      { key: 'victory', url: 'assets/sounds/victory.wav' },
      { key: 'defeat', url: 'assets/sounds/defeat.wav' },
      { key: 'emoji_clap', url: 'assets/sounds/emojis/clap.mp3' },
      { key: 'emoji_laugh', url: 'assets/sounds/emojis/laugh.mp3' },
      { key: 'emoji_shocked', url: 'assets/sounds/emojis/shocked.mp3' },
      { key: 'emoji_sad', url: 'assets/sounds/emojis/sad.wav' },
      { key: 'emoji_fire', url: 'assets/sounds/emojis/fire.wav' },
      { key: 'emoji_thinking', url: 'assets/sounds/emojis/thinking.mp3' },
      { key: 'emoji_angry', url: 'assets/sounds/emojis/angry.mp3' },
      { key: 'emoji_cool', url: 'assets/sounds/emojis/cool.mp3' },
      { key: 'emoji_sleep', url: 'assets/sounds/emojis/sleep.wav' },
      { key: 'emoji_alarm', url: 'assets/sounds/emojis/alarm.mp3' },
      { key: 'emoji_yawn', url: 'assets/sounds/emojis/yawn.wav' },
      { key: 'emoji_confused', url: 'assets/sounds/emojis/confused.mp3' },
    ];

    for (const { key, url } of assets) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = this.getCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(key, audioBuffer);
      } catch (err) {
        console.warn(`[SoundService] Could not load asset "${url}", falling back to synthesis.`, err);
      }
    }
  }

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playBuffer(key: string): boolean {
    const buffer = this.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    return true;
  }

  /** Short, low thud — heavy marble rolling. */
  playMove(): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  /** Percussive "tok" — marble dropping onto the board. */
  playEnter(): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Punchy body: triangle that drops quickly (like a ball hitting wood)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.06);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Subtle click on top for attack sharpness
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(1200, t);
    clickGain.gain.setValueAtTime(0.15, t);
    clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.025);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.025);
  }

  /** Sharp impact — marble knocked off the board. */
  playCapture(): void {
    if (this.muted()) return;
    if (this.playBuffer('capture')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Noise burst via white noise buffer
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    // Low thud underneath
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(t);
    noise.stop(t + 0.15);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Double-hit whoosh — two marbles swapping places. */
  playSwap(): void {
    if (this.muted()) return;
    if (this.playBuffer('teleport')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const hit = (startTime: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, startTime + 0.08);
      gain.gain.setValueAtTime(0.45, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.08);
    };

    hit(t, 180);
    hit(t + 0.12, 140);
  }

  /** Soft ascending chime — marble reaching the finish zone. */
  playPromote(): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }

  /** Paper whoosh — card played/thrown onto the discard pile. */
  playCard(): void {
    if (this.muted()) return;
    if (this.playBuffer('card')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Highpass to keep it airy/papery
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.12);
  }

  /** Subtle card-swipe tick — discard or pass. */
  playDiscard(): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.07);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /** Soft single bell — new turn notification. */
  playNewTurn(): void {
    if (this.muted()) return;
    if (this.playBuffer('new_turn')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // One gentle sine bell at a calm frequency, low gain, long tail
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.2);

    // Very faint fifth (E5) for warmth, even softer
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659, t + 0.04);
    gain2.gain.setValueAtTime(0.0, t + 0.04);
    gain2.gain.linearRampToValueAtTime(0.06, t + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.04);
    osc2.stop(t + 1.0);
  }

  /** Triumphant fanfare — human player wins. */
  playVictory(): void {
    if (this.muted()) return;
    if (this.playBuffer('victory')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Rising arpeggio C4–E4–G4–C5
    const notes = [262, 330, 392, 523];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.15;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  /** Stressful countdown tick — last 5 seconds warning. Pitch rises as time runs out. */
  playCountdownTick(secondsLeft: number): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Pitch increases as time runs out (600 Hz at 5 s → 900 Hz at 1 s)
    const baseFreq = 600 + (5 - secondsLeft) * 75;

    // Sharp tick body — square wave drops quickly
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, t + 0.05);
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);

    // High click for sharpness
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(baseFreq * 2.5, t);
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.03);
  }

  /** Urgent descending buzzer — time is up, AI will play instead. */
  playTimeUp(): void {
    if (this.muted()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Three rapid sawtooth hits, descending in pitch
    [0, 0.15, 0.30].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + offset;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300 - i * 40, start);
      osc.frequency.exponentialRampToValueAtTime(100, start + 0.12);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.5, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  /** Emoji reactions — one preloaded sample per emoji of the palette. */
  playReaction(emoji: ReactionEmoji): void {
    if (this.muted()) return;
    const key = REACTION_SOUND_KEY[emoji];
    if (key) this.playBuffer(key);
  }

  /** Low descending tone — human player loses. */
  playDefeat(): void {
    if (this.muted()) return;
    if (this.playBuffer('defeat')) return;

    const ctx = this.getCtx();
    const t = ctx.currentTime;

    // Descending minor: A4–F4–D4
    const notes = [440, 349, 294];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.2;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.7);
    });
  }
}
