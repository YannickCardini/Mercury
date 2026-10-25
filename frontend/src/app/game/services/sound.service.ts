import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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
  '😉': 'emoji_wink',
  '😘': 'emoji_kissing',
  '😊': 'emoji_smile',
};

@Injectable({ providedIn: 'root' })
export class SoundService {

  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();

  readonly muted = signal<boolean>(localStorage.getItem('mercury-muted') === 'true');
  readonly vibrationEnabled = signal<boolean>((localStorage.getItem('mercury-vibration') ?? 'true') === 'true');

  /**
   * True while the native app is in the background. Capacitor does not freeze
   * the WebView when the app is minimised: timers and the game socket keep
   * running, so without this every game sound would still play from the
   * player's pocket.
   */
  private backgrounded = false;

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
    if (Capacitor.isNativePlatform()) {
      // Read the current state too: the service can be created while the app is
      // already minimised (a matchmaking game found in the background).
      void App.getState().then(({ isActive }) => { this.backgrounded = !isActive; });
      void App.addListener('appStateChange', ({ isActive }) => { this.backgrounded = !isActive; });
    }
  }

  /** No sound may start: muted by the player, or app in the background. */
  private silenced(): boolean {
    return this.muted() || this.backgrounded;
  }

  private async preloadAssets(): Promise<void> {
    const assets: Array<{ key: string; url: string }> = [
      { key: 'new_turn', url: 'assets/sounds/new_turn.wav' },
      { key: 'card', url: 'assets/sounds/card.wav' },
      { key: 'capture', url: 'assets/sounds/capture.wav' },
      { key: 'lock', url: 'assets/sounds/lock.wav' },
      { key: 'teleport', url: 'assets/sounds/teleport.wav' },
      { key: 'victory', url: 'assets/sounds/victory.wav' },
      { key: 'defeat', url: 'assets/sounds/defeat.wav' },
      { key: 'coin', url: 'assets/sounds/coin.mp3' },
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
      { key: 'emoji_wink', url: 'assets/sounds/emojis/wink.mp3' },
      { key: 'emoji_kissing', url: 'assets/sounds/emojis/kissing.mp3' },
      { key: 'emoji_smile', url: 'assets/sounds/emojis/smile.mp3' },
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

  private playBuffer(key: string, when = 0): boolean {
    const buffer = this.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(when);
    return true;
  }

  /** Short, low thud — heavy marble rolling. */
  playMove(): void {
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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
    if (this.silenced()) return;
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

  /**
   * Mechanical "ka-chunk" — the 4 marbles of a finished player (2v2) bolt
   * themselves into their arrival squares at the end of the lock sequence.
   * Timed by the board so the click lands exactly on the lock keyframe.
   */
  playLock(): void {
    if (this.silenced()) return;
    if (this.playBuffer('lock')) return;
  }

  /** Emoji reactions — one preloaded sample per emoji of the palette. */
  playReaction(emoji: ReactionEmoji): void {
    if (this.silenced()) return;
    const key = REACTION_SOUND_KEY[emoji];
    if (key) this.playBuffer(key);
  }

  /**
   * "Coin pickup" chirp, one per coin: two square-wave notes in quick
   * succession (B5 then E6, the second held and fading). Synthesis so the caller
   * can match the chirps to its own animation: `count` is how many coins are in
   * flight and `stepMs` the spacing between them. If assets/sounds/coin.mp3
   * exists it is played once per coin instead.
   */
  playCoinSpend(count = 6, stepMs = 55): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    for (let i = 0; i < count; i++) {
      const start = t + (i * stepMs) / 1000;
      if (this.playBuffer('coin', start)) continue;

      // Chirps overlap when stepMs < their length, so keep the gain low.
      const notes = [
        { freq: 987.77, at: 0, len: 0.04, peak: 0.05 },
        { freq: 1318.51, at: 0.04, len: 0.11, peak: 0.05 },
      ];
      for (const n of notes) {
        const noteStart = start + n.at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(n.freq, noteStart);
        gain.gain.setValueAtTime(0.0, noteStart);
        gain.gain.linearRampToValueAtTime(n.peak, noteStart + 0.004);
        gain.gain.setValueAtTime(n.peak, noteStart + n.len * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + n.len);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + n.len);
      }
    }
  }

  /**
   * Jackpot: a pile of coins pouring out, for the rare +50 (double capture,
   * double homecoming). A burst of ~18 coin chirps with jittered timing and
   * pitch that thins out like a falling stream, over a metallic ring and a
   * bright shimmer tail. Several overlapping voices, so the gain per chirp
   * stays low.
   */
  playCoinJackpot(): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const coins = 18;

    for (let i = 0; i < coins; i++) {
      // Dense at first, then the stream thins out.
      const progress = i / (coins - 1);
      const start = t + 0.9 * Math.pow(progress, 1.4) + Math.random() * 0.025;
      const pitch = 0.85 + Math.random() * 0.5;
      const peak = 0.07 * (1 - progress * 0.5);
      const notes = [
        { freq: 987.77 * pitch, at: 0, len: 0.05 },
        { freq: 1318.51 * pitch, at: 0.045, len: 0.16 },
      ];
      for (const n of notes) {
        const noteStart = start + n.at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(n.freq, noteStart);
        gain.gain.setValueAtTime(0.0, noteStart);
        gain.gain.linearRampToValueAtTime(peak, noteStart + 0.004);
        gain.gain.setValueAtTime(peak, noteStart + n.len * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + n.len);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + n.len);
      }
    }

    // Metallic ring of coins landing on each other: inharmonic sines.
    [2637, 3520, 4186].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + 0.05 + i * 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.05, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  }

  /**
   * Bright arpeggio with a shimmer tail — a shop item is unlocked. Volontairement
   * plus haut et plus rapide que `playPromote` : les deux peuvent s'entendre dans
   * la même session et doivent rester distincts.
   */
  playUnlock(): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const notes = [784, 988, 1175, 1568]; // G5 B5 D6 G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    // Traîne cristalline : une sinusoïde très aiguë qui s'éteint lentement,
    // pour que le déverrouillage « brille » au lieu de s'arrêter net.
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    const shimmerStart = t + 0.2;
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2350, shimmerStart);
    shimmer.frequency.exponentialRampToValueAtTime(3100, shimmerStart + 0.5);
    shimmerGain.gain.setValueAtTime(0.0, shimmerStart);
    shimmerGain.gain.linearRampToValueAtTime(0.1, shimmerStart + 0.06);
    shimmerGain.gain.exponentialRampToValueAtTime(0.01, shimmerStart + 0.7);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);
    shimmer.start(shimmerStart);
    shimmer.stop(shimmerStart + 0.7);
  }

  // ── Boosters : équiper, retirer ───────────────────────────────────────────
  // Même famille que le reste (Web Audio, oscillateurs courts) : un souffle qui
  // accompagne le vol du jeton, un « clac » de bille qui tombe dans un trou du
  // plateau quand il se pose, et l'inverse quand on le retire.

  /**
   * Souffle montant pendant le vol d'un jeton vers son creux : une glissade
   * douce sur toute la durée du vol (`durationMs`), qui s'éteint juste avant
   * l'arrivée pour laisser le « clac » de playBoostLock net.
   */
  playBoostLaunch(durationMs = 420): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const len = Math.max(0.15, durationMs / 1000);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + len * 0.9);
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + len * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len * 0.92);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len);
  }

  /**
   * Le jeton se pose : un « clac » de bille qui tombe dans un trou (corps grave
   * qui chute + attaque claire), puis deux notes qui montent (C6, G6), comme
   * une pièce qui s'emboîte. Plus court et plus grave que playUnlock, qu'on
   * entend juste avant quand on vient d'acheter.
   */
  playBoostLock(): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(520, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    bodyGain.gain.setValueAtTime(0.5, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + 0.13);
    body.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    body.start(t);
    body.stop(t + 0.13);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(1900, t);
    clickGain.gain.setValueAtTime(0.16, t);
    clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.02);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.02);

    [1046.5, 1568].forEach((freq, i) => {
      const start = t + 0.05 + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  /**
   * Le jeton sort de son creux et retourne à sa rangée : un « pop » qui le
   * décolle, puis une glissade qui descend pendant son retour (`durationMs`).
   */
  playBoostRelease(durationMs = 360): void {
    if (this.silenced()) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const len = Math.max(0.15, durationMs / 1000);

    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(420, t);
    pop.frequency.exponentialRampToValueAtTime(980, t + 0.05);
    popGain.gain.setValueAtTime(0.22, t);
    popGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    pop.connect(popGain);
    popGain.connect(ctx.destination);
    pop.start(t);
    pop.stop(t + 0.08);

    const glide = ctx.createOscillator();
    const glideGain = ctx.createGain();
    const start = t + 0.05;
    glide.type = 'triangle';
    glide.frequency.setValueAtTime(820, start);
    glide.frequency.exponentialRampToValueAtTime(260, start + len);
    glideGain.gain.setValueAtTime(0.0, start);
    glideGain.gain.linearRampToValueAtTime(0.08, start + 0.03);
    glideGain.gain.exponentialRampToValueAtTime(0.001, start + len);
    glide.connect(glideGain);
    glideGain.connect(ctx.destination);
    glide.start(start);
    glide.stop(start + len);
  }

  /** Low descending tone — human player loses. */
  playDefeat(): void {
    if (this.silenced()) return;
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
