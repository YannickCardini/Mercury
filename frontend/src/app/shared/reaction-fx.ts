import type { ReactionEmoji } from "@mercury/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Réactions animées : une mise en scène par emoji, validée une à une par le
// propriétaire (2026-11-01).
//
// Le visage reste l'emoji de l'appareil. Il bouge (sauts, tremblements,
// étirements) et des éléments dessinés l'entourent : des autocollants à bord
// crème, lisibles sur le hublot de nuit, la table de verre et le voile du
// jour. Rien que transform et opacity, par l'API Web Animations : le
// compositeur fait tout le travail, rien ne repeint le plateau.
//
// Chaque chorégraphie est calée sur les temps forts de son son (voir
// SoundService) et dure moins de 2,8 s, la vie d'une réaction en partie.
// Positions et déplacements sont des fractions de la taille de la scène,
// les temps sont en ms.
// ─────────────────────────────────────────────────────────────────────────────

/** Couleurs fixes : un effet est le même sur tous les thèmes et pour toute la table. */
const C = {
  edge: "#f3ebdd",
  ink: "#2a2523",
  vein: "#d8432a",
  heart: "#e0393e",
  tear: "#4aa8e8",
  z: "#3f8fd8",
  gold: "#ffb703",
  glint: "#fff6dc",
  red: "#c8452f",
  blue: "#0477bd",
  green: "#00c885",
  orange: "#f7914e",
  bubble: "#fbf6ec",
} as const;

/** Trait doublé : un bord crème large sous un trait de couleur. */
const two = (d: string, wEdge: number, wCore: number, core: string): string =>
  '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  `<g stroke="${C.edge}" stroke-width="${wEdge}">${d}</g>` +
  `<g stroke="${core}" stroke-width="${wCore}">${d}</g></g>`;

const SHAPES = {
  vein: () =>
    '<svg viewBox="0 0 24 24">' +
    two('<path d="M9.6 3.2Q9.8 9.8 3.2 9.6"/><path d="M14.4 3.2Q14.2 9.8 20.8 9.6"/><path d="M9.6 20.8Q9.8 14.2 3.2 14.4"/><path d="M14.4 20.8Q14.2 14.2 20.8 14.4"/>', 5.6, 3, C.vein) +
    "</svg>",
  drop: () =>
    `<svg viewBox="0 0 24 24"><path d="M12 2.5C12 2.5 5.5 11 5.5 15.2a6.5 6.5 0 0 0 13 0C18.5 11 12 2.5 12 2.5Z" fill="${C.tear}" stroke="${C.edge}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/></svg>`,
  heart: () =>
    `<svg viewBox="0 0 24 24"><path d="M12 21C5 15.5 2 12 2 8.2A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 10 2.2C22 12 19 15.5 12 21Z" fill="${C.heart}" stroke="${C.edge}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/></svg>`,
  dash: (core: string) => '<svg viewBox="0 0 24 24">' + two('<path d="M5 12h14"/>', 6.5, 3.4, core) + "</svg>",
  arc: () => '<svg viewBox="0 0 24 24">' + two('<path d="M9 5q6 7 0 14"/>', 5.8, 3, C.red) + "</svg>",
  z: () => '<svg viewBox="0 0 24 24">' + two('<path d="M7 6.5h10L7 17.5h10"/>', 6.5, 3.4, C.z) + "</svg>",
  qmark: () =>
    '<svg viewBox="0 0 24 24">' +
    two('<path d="M8.2 8.4C8.2 5.6 10 4 12.4 4c2.5 0 4.2 1.6 4.2 3.8 0 2.9-4 3.3-4 6.6"/>', 6.5, 3.4, C.gold) +
    `<circle cx="12.6" cy="19.6" r="2.9" fill="${C.edge}"/><circle cx="12.6" cy="19.6" r="1.8" fill="${C.gold}"/></svg>`,
  note: () =>
    '<svg viewBox="0 0 24 24">' +
    `<ellipse cx="8.5" cy="17.5" rx="4" ry="3" transform="rotate(-22 8.5 17.5)" fill="${C.ink}" stroke="${C.edge}" stroke-width="2.6" paint-order="stroke"/>` +
    two('<path d="M12.1 16.6V4.5l6 2.6"/>', 5, 2.2, C.ink) +
    `<ellipse cx="8.5" cy="17.5" rx="4" ry="3" transform="rotate(-22 8.5 17.5)" fill="${C.ink}"/></svg>`,
  sparkle: (core: string) =>
    `<svg viewBox="0 0 24 24"><path d="M12 1C12.8 8 16 11.2 23 12C16 12.8 12.8 16 12 23C11.2 16 8 12.8 1 12C8 11.2 11.2 8 12 1Z" fill="${core}" stroke="${core === C.glint ? C.gold : C.edge}" stroke-width="1.8" stroke-linejoin="round" paint-order="stroke"/></svg>`,
  bubble: () =>
    `<svg viewBox="0 0 24 24" preserveAspectRatio="none"><ellipse cx="12" cy="12" rx="11" ry="11" fill="${C.bubble}" stroke="${C.ink}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`,
  dot: () => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${C.ink}"/></svg>`,
};

// ── Kit de mouvement ─────────────────────────────────────────────────────────

/** Une pose : position (fractions de la scène), rotation, échelle, opacité, à `t` ms. */
interface Pose {
  t: number;
  x?: number;
  y?: number;
  r?: number;
  sc?: number;
  sx?: number;
  sy?: number;
  o?: number;
  /** Courbe du segment qui part de cette pose. */
  e?: string;
}

interface SpriteOptions {
  /** Classe CSS de la forme quand elle n'est pas un SVG (bouffée, braise…). */
  cls?: string;
  /** Centre, en fractions de la scène. */
  x: number;
  y: number;
  /** Largeur (et hauteur, à défaut de `h`), en fractions de la scène. */
  w: number;
  h?: number;
  D: number;
  delay?: number;
  easing?: string;
  /** Sous le visage plutôt que devant. */
  under?: boolean;
  /** Contenu dans un disque de la taille du visage (un reflet). */
  clip?: boolean;
  css?: Record<string, string>;
  frames: Pose[];
}

interface FxContext {
  s: number;
  rnd: () => number;
  body(points: Pose[], origin?: string, ease?: string): void;
  face(points: Pose[], origin?: string, ease?: string): void;
  sprite(html: string, o: SpriteOptions): void;
}

interface Choreography {
  D: number;
  seed?: number;
  play(c: FxContext): void;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Tirages reproductibles : la même réaction a la même allure pour toute la table. */
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function transformOf(p: Pose, s: number): string {
  const sx = p.sx ?? p.sc ?? 1;
  const sy = p.sy ?? p.sc ?? 1;
  return (
    `translate(${((p.x ?? 0) * s).toFixed(2)}px, ${((p.y ?? 0) * s).toFixed(2)}px) ` +
    `rotate(${(p.r ?? 0).toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
  );
}

function keyframes(points: Pose[], D: number, s: number, withOpacity: boolean, ease?: string): Keyframe[] {
  const pts = points.slice().sort((a, b) => a.t - b.t);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (first.t > 0) pts.unshift({ ...first, t: 0 });
  if (last.t < D) pts.push({ ...last, t: D, e: undefined });
  const hasO = withOpacity || pts.some(p => p.o !== undefined);
  return pts.map(p => {
    const k: Keyframe = { offset: Math.max(0, Math.min(1, p.t / D)), transform: transformOf(p, s) };
    if (hasO) k["opacity"] = p.o ?? 1;
    const easing = p.e ?? ease;
    if (easing) k.easing = easing;
    return k;
  });
}

/** Poses régulières de `t0` à `t1`, tous les `step` ms. */
function jitter(t0: number, t1: number, step: number, fn: (i: number, u: number) => Omit<Pose, "t">): Pose[] {
  const pts: Pose[] = [];
  for (let i = 0, t = t0; t <= t1 + 1e-6; i++, t += step) {
    pts.push({ t, ...fn(i, (t - t0) / Math.max(1, t1 - t0)) });
  }
  return pts;
}

/** Trajectoire de projectile : traînée `k`, gravité `g`, chute régulière `fall`, sur T secondes. */
function arc(o: { vx: number; vy: number; g?: number; k?: number; fall?: number; T: number; n?: number }): Pose[] {
  const { vx, vy, g = 0, k = 0, fall = 0, T, n = 6 } = o;
  const pts: Pose[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    const d = k ? (1 - Math.exp(-k * t)) / k : t;
    pts.push({ t: t * 1000, x: vx * d, y: vy * d + 0.5 * g * t * t + fall * t });
  }
  return pts;
}

function sparkleAt(c: FxContext, core: string, x: number, y: number, w: number, delay: number, D: number): void {
  c.sprite(SHAPES.sparkle(core), {
    x, y, w, D, delay,
    frames: [
      { t: 0, sc: 0, r: -45, o: 0, e: "ease-out" },
      { t: D * 0.18, sc: 1.25, r: 0, o: 1 },
      { t: D * 0.34, sc: 1, r: 15, o: 1 },
      { t: D * 0.7, sc: 0.9, r: 40, o: 1 },
      { t: D, sc: 0, r: 90, o: 0 },
    ],
  });
}

// ── Les 18 chorégraphies ─────────────────────────────────────────────────────

const FX: Record<ReactionEmoji, Choreography> = {
  // Deux claps calés sur le son ; à chaque coup, des traits d'impact dorés.
  "👏": {
    D: 1300,
    play(c) {
      c.body([
        { t: 0 }, { t: 40, sx: 0.86, sy: 0.92, r: -4 }, { t: 120, sx: 1.1, sy: 1.06, r: 2 }, { t: 240 },
        { t: 280, sx: 0.86, sy: 0.92, r: 4 }, { t: 360, sx: 1.12, sy: 1.08, r: -2 }, { t: 520, y: -0.04 }, { t: 680 }, { t: 1300 },
      ], "50% 70%");
      const fans: [number, number, number[]][] = [[0.86, 0.14, [-75, -40, -5]], [0.1, 0.62, [160, 200]]];
      for (const tc of [40, 280]) {
        for (const [x, y, angles] of fans) {
          for (const a of angles) {
            const ux = Math.cos(rad(a));
            const uy = Math.sin(rad(a));
            c.sprite(SHAPES.dash(C.gold), {
              x, y, w: 0.22, D: 260, delay: tc,
              frames: [
                { t: 0, x: ux * 0.04, y: uy * 0.04, r: a, sc: 0.3, o: 0 },
                { t: 70, x: ux * 0.12, y: uy * 0.12, r: a, sc: 1, o: 1 },
                { t: 260, x: ux * 0.24, y: uy * 0.24, r: a, sc: 0.6, o: 0 },
              ],
            });
          }
        }
      }
    },
  },

  // Il sautille sur chaque éclat de rire, les larmes giclent des deux côtés.
  "😂": {
    D: 1900,
    play(c) {
      const bursts = [220, 360, 540, 700];
      const pts: Pose[] = [{ t: 0 }, { t: 160, y: 0.02, sy: 0.96 }];
      bursts.forEach((tb, i) => {
        const side = i % 2 ? 1 : -1;
        pts.push({ t: tb, y: -0.09, r: 7 * side, sy: 1.04 }, { t: tb + 80, y: 0.01, r: 3 * side, sy: 0.97 });
      });
      pts.push({ t: 900, y: -0.04, r: -4 }, { t: 1060, r: 2 }, { t: 1250, y: -0.02, r: -1 }, { t: 1450 }, { t: 1900 });
      c.face(pts, "50% 85%");
      bursts.forEach((tb, i) => {
        for (const side of [-1, 1]) {
          const p = arc({ vx: 0.95 * side * (1 - i * 0.08), vy: -1.5, g: 5.2, T: 0.6 });
          c.sprite(SHAPES.drop(), {
            x: side < 0 ? 0.1 : 0.9, y: 0.52, w: 0.17, D: 600, delay: tb + 20,
            frames: p.map((q, j) => ({ ...q, r: side * (20 + j * 14), sc: j === 0 ? 0.4 : 1 - j * 0.04, o: j === 0 || j === 6 ? 0 : 1 })),
          });
        }
      });
    },
  },

  // Il se ramasse, bondit en arrière et reste figé sous trois traits de stupeur.
  "😮": {
    D: 1700,
    play(c) {
      c.body([
        { t: 0 }, { t: 280, sx: 1.06, sy: 0.9, y: 0.03 }, { t: 360, y: -0.14, sx: 0.94, sy: 1.16, e: "cubic-bezier(.22,1,.36,1)" }, { t: 470, y: -0.12, sc: 1.12 },
        ...jitter(510, 900, 40, i => ({ y: -0.12, sc: 1.12, x: (i % 2 ? 1 : -1) * 0.012 })),
        { t: 1050, y: 0.02, sx: 1.05, sy: 0.95 }, { t: 1250 }, { t: 1700 },
      ], "50% 90%");
      [-130, -90, -50].forEach((a, i) => {
        const ux = Math.cos(rad(a));
        const uy = Math.sin(rad(a));
        c.sprite(SHAPES.dash(C.ink), {
          x: 0.5, y: -0.12, w: 0.22, D: 760, delay: 360 + i * 30,
          frames: [
            { t: 0, x: ux * 0.1, y: uy * 0.1, r: a, sc: 0.3, o: 0 },
            { t: 90, x: ux * 0.22, y: uy * 0.22, r: a, sc: 1, o: 1 },
            { t: 320, x: ux * 0.22, y: uy * 0.22, r: a, sc: 1, o: 1 },
            { t: 380, x: ux * 0.24, y: uy * 0.24, r: a, sc: 1, o: 0.35 },
            { t: 440, x: ux * 0.22, y: uy * 0.22, r: a, sc: 1, o: 1 },
            { t: 760, x: ux * 0.3, y: uy * 0.3, r: a, sc: 0.7, o: 0 },
          ],
        });
      });
    },
  },

  // Deux sanglots, la tête s'affaisse, trois gouttes tombent de la joue.
  "😥": {
    D: 2000,
    play(c) {
      c.face([
        { t: 0 }, { t: 120, y: 0.015, sy: 0.97 }, { t: 240 }, { t: 360, y: 0.02, sy: 0.96, r: -3 }, { t: 480, y: 0.01, r: -4 },
        { t: 950, y: 0.06, r: -9, sy: 0.97 }, { t: 1500, y: 0.06, r: -9, sy: 0.97 }, { t: 2000 },
      ], "50% 85%");
      for (const [d, w] of [[150, 0.17], [650, 0.14], [1100, 0.12]] as const) {
        c.sprite(SHAPES.drop(), {
          x: 0.15, y: 0.6, w, D: 760, delay: d,
          frames: [
            { t: 0, sc: 0.2, o: 0, e: "ease-out" }, { t: 130, sc: 1, o: 1 },
            { t: 260, y: 0.03, o: 1, e: "cubic-bezier(.55,0,.9,.55)" }, { t: 760, y: 0.78, sc: 0.85, o: 0 },
          ],
        });
      }
    },
  },

  // La flamme s'embrase puis danse ; des braises montent en ondulant.
  "🔥": {
    D: 1800,
    seed: 11,
    play(c) {
      c.body([
        { t: 0, sx: 0.9, sy: 0.8 }, { t: 140, sx: 1.04, sy: 1.22, e: "ease-out" }, { t: 260, sx: 0.98, sy: 0.98 },
        ...jitter(330, 1500, 90, (i, u) => {
          const k = 1 - u * 0.7;
          return { sy: 1 + (i % 2 ? 0.07 : -0.02) * k, sx: 1 + (i % 2 ? -0.03 : 0.02) * k, r: ((i % 3) - 1) * 3 * k };
        }),
        { t: 1800 },
      ], "50% 92%");
      for (let k = 0; k < 9; k++) {
        const x0 = 0.34 + c.rnd() * 0.32;
        const y0 = 0.22 + c.rnd() * 0.12;
        const dy = -(0.55 + c.rnd() * 0.35);
        const dx = (c.rnd() - 0.5) * 0.36;
        const w = 0.09 + c.rnd() * 0.05;
        c.sprite("", {
          cls: "rfx-ember", x: x0, y: y0, w, D: 820, delay: 60 + k * 125,
          frames: [
            { t: 0, sc: 0.5, o: 0 }, { t: 120, x: dx * 0.15, y: dy * 0.18, sc: 1, o: 1 },
            { t: 420, x: -dx * 0.25, y: dy * 0.55, sc: 0.85, o: 1 }, { t: 820, x: dx, y: dy, sc: 0.35, o: 0 },
          ],
        });
      }
    },
  },

  // Il penche la tête d'un côté puis de l'autre ; une bulle se remplit de points.
  "🤔": {
    D: 2300,
    play(c) {
      c.face([{ t: 0 }, { t: 350, r: -8, y: -0.02 }, { t: 950, r: 6, y: -0.03 }, { t: 1500, r: -4, y: -0.01 }, { t: 2000 }, { t: 2300 }], "50% 75%");
      const pop = (D: number): Pose[] => [
        { t: 0, sc: 0, o: 0, e: "ease-out" }, { t: 140, sc: 1.15, o: 1 }, { t: 220, sc: 1, o: 1 }, { t: D - 260, sc: 1, o: 1 }, { t: D, sc: 0.85, o: 0 },
      ];
      c.sprite(SHAPES.bubble(), { x: 0.8, y: 0.14, w: 0.09, D: 1850, delay: 150, frames: pop(1850) });
      c.sprite(SHAPES.bubble(), { x: 0.9, y: -0.01, w: 0.15, D: 1720, delay: 280, frames: pop(1720) });
      c.sprite(SHAPES.bubble(), { x: 0.92, y: -0.32, w: 0.58, h: 0.42, D: 1580, delay: 420, frames: pop(1580) });
      [0, 1, 2].forEach(i => {
        const d = 650 + i * 170;
        const D = 1330 - i * 170;
        const b = 1250 - d;
        c.sprite(SHAPES.dot(), {
          x: 0.92 + (i - 1) * 0.14, y: -0.32, w: 0.08, D, delay: d,
          frames: [
            { t: 0, sc: 0, o: 0 }, { t: 100, sc: 1.25, o: 1 }, { t: 170, sc: 1, o: 1 }, { t: b, o: 1 },
            { t: b + 90, y: -0.05, o: 1 }, { t: b + 200, o: 1 }, { t: D - 260, o: 1 }, { t: D, sc: 0.6, o: 0 },
          ],
        });
      });
    },
  },

  // Il tremble de plus en plus, une veine éclate et bat, la vapeur sort.
  "😡": {
    D: 2100,
    play(c) {
      c.body([{ t: 0, sc: 0.86 }, { t: 170, sc: 1.08 }, { t: 315, sc: 1 }, { t: 860 }, { t: 945, sx: 1.12, sy: 0.86 }, { t: 1090, sx: 0.95, sy: 1.06 }, { t: 1260 }, { t: 2100 }], "50% 50%", "ease-out");
      const pts: Pose[] = [];
      const N = 52;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        let env: number;
        if (u < 0.1) env = 0;
        else if (u < 0.43) env = Math.pow((u - 0.1) / 0.33, 1.7);
        else if (u < 0.62) env = 1 - ((u - 0.43) / 0.19) * 0.4;
        else env = Math.max(0, 0.6 * (1 - (u - 0.62) / 0.3));
        const side = i % 2 ? 1 : -1;
        pts.push({ t: u * 2100, x: side * 0.06 * env, r: side * 6 * env });
      }
      pts[0] = { t: 0 };
      pts[N] = { t: 2100 };
      c.face(pts, "50% 50%", "linear");
      c.sprite(SHAPES.vein(), {
        x: 0.87, y: 0.11, w: 0.46, D: 2100, easing: "ease-out",
        frames: [
          { t: 0, sc: 0, r: -24, o: 0 }, { t: 630, sc: 0, r: -24, o: 0 }, { t: 756, sc: 1.32, r: 6, o: 1 }, { t: 861, sc: 1, o: 1 },
          { t: 1050, sc: 1.2, o: 1 }, { t: 1176, sc: 1, o: 1 }, { t: 1386, sc: 1.2, o: 1 }, { t: 1512, sc: 1, o: 1 }, { t: 1806, sc: 1, o: 1 },
          { t: 2100, sc: 0.6, r: 10, o: 0 },
        ],
      });
      const jets = [{ x: 0.04, y: 0.34, dx: -0.55, dy: -0.62 }, { x: 0.96, y: 0.4, dx: 0.6, dy: -0.5 }];
      for (const b of [{ at: 860, n: 3, k: 1 }, { at: 1240, n: 2, k: 0.78 }]) {
        for (const j of jets) {
          for (let i = 0; i < b.n; i++) {
            const wob = (i - 1) * 0.1;
            c.sprite("", {
              cls: "rfx-puff", x: j.x, y: j.y, w: 0.34, D: 740, delay: b.at + i * 85, easing: "cubic-bezier(.22,1,.36,1)",
              frames: [
                { t: 0, sc: 0.25 * b.k, o: 0 },
                { t: 133, x: j.dx * 0.22, y: j.dy * 0.22, sc: 0.72 * b.k, o: 0.95 },
                { t: 740, x: j.dx + wob, y: j.dy, sc: 1.35 * b.k, o: 0 },
              ],
            });
          }
        }
      }
    },
  },

  // Il gonfle le torse et se cale en arrière, hoche la tête sur chaque temps
  // fort ; un reflet balaie les lunettes puis un grand éclat brille sur le verre.
  "😎": {
    D: 2200,
    play(c) {
      c.body([
        { t: 0 }, { t: 180, sc: 1.12, r: -8, y: -0.04, e: "ease-out" }, { t: 420, sc: 1.05, r: -6 }, { t: 900, sc: 1.05, r: -6 },
        { t: 980, sc: 1.15, r: -2 }, { t: 1150, sc: 1.06, r: -5 }, { t: 1800, sc: 1.06, r: -5 }, { t: 2200 },
      ], "50% 90%");
      c.face([{ t: 0 }, { t: 340, y: 0.05 }, { t: 470 }, { t: 960, y: 0.05 }, { t: 1040 }, { t: 1100, y: 0.04 }, { t: 1200 }, { t: 2200 }], "50% 85%");
      c.sprite("", {
        cls: "rfx-shine", clip: true, x: 0.5, y: 0.5, w: 0.26, h: 1.5, D: 520, delay: 600, easing: "ease-in-out",
        frames: [
          { t: 0, x: -0.75, r: 22, o: 0 }, { t: 80, x: -0.55, r: 22, o: 1 }, { t: 440, x: 0.55, r: 22, o: 1 }, { t: 520, x: 0.75, r: 22, o: 0 },
        ],
      });
      sparkleAt(c, C.glint, 0.78, 0.33, 0.5, 980, 760);
      sparkleAt(c, C.glint, 0.28, 0.32, 0.3, 1120, 600);
      sparkleAt(c, C.glint, 1.02, 0.08, 0.2, 1250, 520);
    },
  },

  // Il respire au rythme du ronflement, trois Z s'envolent en zigzag.
  "😴": {
    D: 2400,
    play(c) {
      c.body([{ t: 0 }, { t: 580, sx: 1.04, sy: 1.08 }, { t: 1050, sx: 0.99, sy: 0.97 }, { t: 1450, sx: 1.03, sy: 1.06 }, { t: 1950 }, { t: 2400 }], "50% 95%");
      c.face([{ t: 0 }, { t: 600, r: 4 }, { t: 1100, r: -1 }, { t: 1500, r: 3 }, { t: 2000 }, { t: 2400 }], "50% 80%");
      ([[250, 0.2], [650, 0.26], [1050, 0.32]] as const).forEach(([d, w], i) => {
        c.sprite(SHAPES.z(), {
          x: 0.82, y: 0.1, w, D: 1300, delay: d,
          frames: [
            { t: 0, sc: 0.3, o: 0, r: -10 }, { t: 250, x: 0.06, y: -0.12, sc: 0.8, o: 1, r: 8 },
            { t: 650, x: 0.18 + i * 0.03, y: -0.32, sc: 1, o: 1, r: -8 },
            { t: 1000, x: 0.25 + i * 0.04, y: -0.5, sc: 1, o: 0.85, r: 6 },
            { t: 1300, x: 0.32 + i * 0.05, y: -0.64, sc: 0.9, o: 0, r: -4 },
          ],
        });
      });
    },
  },

  // Il sonne : secousses rapides, ondes rouges qui clignotent près des cloches.
  "⏰": {
    D: 1500,
    play(c) {
      c.face([
        { t: 0 }, ...jitter(20, 900, 40, i => ({ r: (i % 2 ? 1 : -1) * 9 })),
        { t: 960, r: -5 }, { t: 1030, r: 3 }, { t: 1100, r: -1.5 }, { t: 1200 }, { t: 1500 },
      ], "50% 55%", "linear");
      c.body([{ t: 0 }, { t: 60, y: -0.05 }, { t: 900, y: -0.05 }, { t: 1050, y: 0.02, sx: 1.04, sy: 0.96 }, { t: 1200 }, { t: 1500 }], "50% 95%");
      for (const sd of [{ x: 0.98, y: 0.12, r: -25, dx: 1 }, { x: 0.02, y: 0.12, r: 205, dx: -1 }]) {
        for (const [ring, off] of [[0, 0], [1, 45]] as const) {
          c.sprite(SHAPES.arc(), {
            x: sd.x + sd.dx * ring * 0.12, y: sd.y - ring * 0.04, w: 0.2 + ring * 0.06, D: 900, delay: 20 + off,
            frames: [
              ...jitter(0, 800, 90, i => ({ r: sd.r, x: sd.dx * (i % 2 ? 0.03 : 0), o: i % 2 ? 0.25 : 1, sc: i % 2 ? 0.92 : 1 })),
              { t: 900, r: sd.r, x: sd.dx * 0.06, o: 0 },
            ],
          });
        }
      }
    },
  },

  // Il s'étire vers le haut, garde la pose, retombe et s'ébroue ; un souffle s'échappe.
  "🥱": {
    D: 2300,
    play(c) {
      c.body([
        { t: 0 }, { t: 200, sx: 1.02, sy: 0.98 }, { t: 700, sx: 0.93, sy: 1.15, y: -0.03 }, { t: 1150, sx: 0.94, sy: 1.13, y: -0.03, e: "ease-in" },
        { t: 1350, sx: 1.05, sy: 0.94, y: 0.01 }, { t: 1550 }, { t: 2300 },
      ], "50% 95%");
      c.face([{ t: 0 }, { t: 700, r: -7 }, { t: 1150, r: -6 }, { t: 1350 }, { t: 1650, r: 3 }, { t: 1750, r: -3 }, { t: 1850, r: 2 }, { t: 1950 }, { t: 2300 }], "50% 85%");
      for (const [d, w] of [[650, 0.3], [830, 0.24]] as const) {
        c.sprite("", {
          cls: "rfx-puff", x: 0.64, y: 0.6, w, D: 900, delay: d,
          frames: [{ t: 0, sc: 0.3, o: 0, e: "ease-out" }, { t: 180, x: 0.08, y: -0.08, sc: 0.7, o: 0.8 }, { t: 900, x: 0.34, y: -0.36, sc: 1.3, o: 0 }],
        });
      }
    },
  },

  // Il penche la tête, perplexe, sur le « hein ? » ; trois « ? » surgissent et se dandinent.
  "🦧": {
    D: 2000,
    play(c) {
      c.face([
        { t: 0 }, { t: 380, r: -3, y: 0.01 }, { t: 480, r: 12, y: -0.06, e: "ease-out" }, { t: 620, r: 10, y: -0.02 }, { t: 900, r: 10 },
        { t: 1150, r: -6, y: -0.02 }, { t: 1450, r: 4 }, { t: 1700 }, { t: 2000 },
      ], "50% 80%");
      for (const [x, y, w, r0, d] of [[0.6, -0.16, 0.36, 10, 470], [0.95, 0.0, 0.24, 22, 620], [0.22, -0.06, 0.22, -18, 780]] as const) {
        const D = 1900 - d;
        c.sprite(SHAPES.qmark(), {
          x, y, w, D, delay: d,
          frames: [
            { t: 0, sc: 0, o: 0, y: 0.06, r: r0 - 20, e: "ease-out" }, { t: 130, sc: 1.2, o: 1, y: -0.02, r: r0 + 6 }, { t: 230, sc: 1, o: 1, r: r0 },
            { t: 500, o: 1, r: r0 - 8 }, { t: 700, o: 1, r: r0 + 6 }, { t: 900, o: 1, r: r0 }, { t: D, sc: 0.8, o: 0, y: -0.08, r: r0 },
          ],
        });
      }
    },
  },

  // Un petit recul, puis un coup de tête complice ; une étoile dorée près de l'œil.
  "😉": {
    D: 2000,
    play(c) {
      c.face([{ t: 0 }, { t: 420, r: -4, y: 0.02 }, { t: 540, r: 12, y: -0.07, e: "ease-out" }, { t: 700, r: 8 }, { t: 850, r: 10, y: -0.02 }, { t: 1100 }, { t: 2000 }], "50% 85%");
      sparkleAt(c, C.gold, 0.84, 0.3, 0.32, 540, 700);
      sparkleAt(c, C.gold, 1.0, 0.1, 0.16, 660, 520);
    },
  },

  // Il fait la moue, envoie le baiser ; un cœur et deux petits s'envolent.
  "😘": {
    D: 2300,
    play(c) {
      c.body([{ t: 0 }, { t: 260, sx: 0.92, sy: 1.05 }, { t: 620, sx: 0.9, sy: 1.06, r: 4 }, { t: 700, sx: 1.14, sy: 1.1, r: -6, e: "ease-out" }, { t: 950, sc: 1.04, r: -2 }, { t: 1200 }, { t: 2300 }], "50% 60%");
      const heart = (w: number, d: number, D: number, frames: Pose[]) => c.sprite(SHAPES.heart(), { x: 0.84, y: 0.76, w, D, delay: d, frames });
      heart(0.34, 690, 1400, [
        { t: 0, sc: 0.2, o: 0, e: "ease-out" }, { t: 150, x: 0.1, y: -0.08, sc: 1.15, o: 1, r: -8 }, { t: 500, x: 0.2, y: -0.34, sc: 1, o: 1, r: 10 },
        { t: 900, x: 0.26, y: -0.6, o: 1, r: -8 }, { t: 1400, x: 0.32, y: -0.88, sc: 0.9, o: 0, r: 6 },
      ]);
      heart(0.18, 860, 1150, [
        { t: 0, sc: 0.2, o: 0, e: "ease-out" }, { t: 150, x: 0.14, y: -0.02, sc: 1.1, o: 1 }, { t: 600, x: 0.36, y: -0.2, o: 1, r: 12 },
        { t: 1150, x: 0.5, y: -0.4, sc: 0.8, o: 0, r: -6 },
      ]);
      heart(0.14, 1000, 1100, [
        { t: 0, sc: 0.2, o: 0, e: "ease-out" }, { t: 150, x: 0.02, y: -0.1, sc: 1.1, o: 1 }, { t: 600, x: 0.08, y: -0.42, o: 1, r: -12 },
        { t: 1100, x: 0.14, y: -0.72, sc: 0.8, o: 0, r: 8 },
      ]);
    },
  },

  // Deux petits sauts de joie ; une couronne de rayons dorés s'allume et s'éteint.
  "😊": {
    D: 2100,
    play(c) {
      c.body([{ t: 0 }, { t: 120, sx: 1.06, sy: 0.92 }, { t: 280, y: -0.08, sx: 0.96, sy: 1.06 }, { t: 430, sx: 1.05, sy: 0.94 }, { t: 600, y: -0.05 }, { t: 760, sx: 1.03, sy: 0.97 }, { t: 900 }, { t: 2100 }], "50% 95%");
      c.face([{ t: 0 }, { t: 900 }, { t: 1200, r: -3 }, { t: 1600, r: 3 }, { t: 1900 }, { t: 2100 }]);
      for (let k = 0; k < 8; k++) {
        const a = k * 45 - 90;
        const ux = Math.cos(rad(a));
        const uy = Math.sin(rad(a));
        c.sprite(SHAPES.dash(C.gold), {
          x: 0.5, y: 0.5, w: 0.2, D: 1300, delay: 150 + k * 25,
          frames: [
            { t: 0, x: ux * 0.46, y: uy * 0.46, r: a, sc: 0.2, o: 0, e: "ease-out" }, { t: 220, x: ux * 0.66, y: uy * 0.66, r: a, sc: 1, o: 1 },
            { t: 600, x: ux * 0.69, y: uy * 0.69, r: a, sc: 0.8, o: 0.85 }, { t: 900, x: ux * 0.69, y: uy * 0.69, r: a, sc: 1, o: 1 },
            { t: 1300, x: ux * 0.8, y: uy * 0.8, r: a, sc: 0.4, o: 0 },
          ],
        });
      }
    },
  },

  // Le cotillon recule en éclatant, souffle deux fois ; confettis aux couleurs des sièges.
  "🎉": {
    D: 2300,
    seed: 5,
    play(c) {
      c.body([
        { t: 0, sc: 0.9 }, { t: 60, sx: 0.86, sy: 0.86, r: -8 }, { t: 160, sx: 1.1, sy: 1.1, r: 7, e: "ease-out" }, { t: 300 },
        { t: 340, sx: 0.95, sy: 1.05, r: -3 }, { t: 440 }, { t: 580, sx: 0.95, sy: 1.05, r: -3 }, { t: 720, sc: 1.02, r: 1 }, { t: 870 }, { t: 2300 },
      ], "25% 85%");
      const colors = [C.red, C.blue, C.green, C.orange, C.gold];
      for (let i = 0; i < 16; i++) {
        const a = rad(-108 + (i / 15) * 112 + (c.rnd() - 0.5) * 10);
        const v = 1.1 + c.rnd() * 0.8;
        const T = 1.25 + c.rnd() * 0.4;
        const spin = (c.rnd() < 0.5 ? -1 : 1) * (360 + c.rnd() * 360);
        const pts = arc({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, k: 2.6, fall: 0.5, T, n: 7 });
        c.sprite("", {
          cls: "rfx-conf", x: 0.62, y: 0.36, w: 0.1, h: 0.055, D: T * 1000, delay: 40 + c.rnd() * 60, css: { background: colors[i % 5]! },
          frames: pts.map((p, j) => ({ ...p, r: (spin * j) / 7, sc: j === 0 ? 0.4 : 1, o: j === 0 || j === 7 ? 0 : 1 })),
        });
      }
    },
  },

  // Il claque en grand et tremble ; onde de choc, éclats projetés, fumée derrière.
  "💥": {
    D: 1900,
    seed: 3,
    play(c) {
      c.body([{ t: 0, sc: 0.35 }, { t: 90, sc: 1.3, e: "ease-out" }, { t: 200, sc: 0.9 }, { t: 320, sc: 1.06 }, { t: 460 }, { t: 1900 }]);
      c.face([
        { t: 0 }, ...jitter(80, 560, 35, (i, u) => ({ x: (i % 2 ? 1 : -1) * 0.035 * (1 - u), y: ((i % 3) - 1) * 0.025 * (1 - u) })), { t: 620 }, { t: 1900 },
      ], "50% 50%", "linear");
      c.sprite("", {
        cls: "rfx-ring", x: 0.5, y: 0.5, w: 1, D: 460, delay: 40, css: { "border-color": C.orange, "border-width": `${c.s * 0.07}px` },
        frames: [{ t: 0, sc: 0.25, o: 1, e: "cubic-bezier(.2,.8,.3,1)" }, { t: 460, sc: 1.75, o: 0 }],
      });
      c.sprite("", {
        cls: "rfx-ring", x: 0.5, y: 0.5, w: 0.9, D: 520, delay: 110, css: { "border-color": C.edge, "border-width": `${c.s * 0.05}px` },
        frames: [{ t: 0, sc: 0.3, o: 0.9, e: "cubic-bezier(.2,.8,.3,1)" }, { t: 520, sc: 1.9, o: 0 }],
      });
      const chunkColors = [C.orange, C.gold, C.ink];
      for (let i = 0; i < 10; i++) {
        const a = rad(i * 36 + (c.rnd() - 0.5) * 20);
        const d = 0.75 + c.rnd() * 0.3;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const sp = (c.rnd() < 0.5 ? -1 : 1) * (200 + c.rnd() * 160);
        c.sprite("", {
          cls: "rfx-chunk", x: 0.5, y: 0.5, w: 0.08 + c.rnd() * 0.04, D: 720, delay: 30, css: { background: chunkColors[i % 3]! },
          frames: [
            { t: 0, x: ux * 0.18, y: uy * 0.18, o: 0 }, { t: 60, x: ux * 0.3, y: uy * 0.3, o: 1, r: sp * 0.1 },
            { t: 360, x: ux * d * 0.85, y: uy * d * 0.85 + 0.05, o: 1, r: sp * 0.6 }, { t: 720, x: ux * d, y: uy * d + 0.2, sc: 0.6, o: 0, r: sp },
          ],
        });
      }
      for (let i = 0; i < 5; i++) {
        const a = rad(-90 + (i - 2) * 50);
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        c.sprite("", {
          cls: "rfx-puff rfx-smoke", under: true, x: 0.5 + ux * 0.3, y: 0.5 + uy * 0.3, w: 0.4, D: 1300, delay: 120 + i * 35,
          frames: [
            { t: 0, sc: 0.3, o: 0, e: "ease-out" }, { t: 220, x: ux * 0.15, y: uy * 0.15, sc: 0.9, o: 0.85 },
            { t: 1300, x: ux * 0.4, y: uy * 0.4 - 0.25, sc: 1.5, o: 0 },
          ],
        });
      }
    },
  },

  // À chaque note il baisse un peu plus ; les notes tombent du pavillon, la dernière tremble.
  "🎺": {
    D: 2700,
    play(c) {
      c.face([
        { t: 0 }, { t: 20, sc: 1.06, r: 2 }, { t: 140, r: -3 }, { t: 420, sc: 1.06, r: -2 }, { t: 540, r: -7 }, { t: 820, sc: 1.06, r: -6 }, { t: 940, r: -11 },
        { t: 1220, sc: 1.08, r: -10 }, { t: 1350, r: -15 },
        ...jitter(1420, 2340, 70, (i, u) => ({ r: -16 + (i % 2 ? 2.5 : -2.5) * (1 - u * 0.5), y: 0.02 + u * 0.04 })),
        { t: 2450, r: -17, y: 0.06 }, { t: 2700 },
      ], "72% 28%");
      [20, 420, 820, 1220].forEach((d, k) => {
        const last = k === 3;
        const D = last ? 1300 : 900;
        const frames: Pose[] = [{ t: 0, sc: 0.3, o: 0, r: -10, e: "ease-out" }, { t: 150, x: -0.14, y: -0.06 + 0.03 * k, sc: 1, o: 1, r: 8 }];
        if (last) {
          frames.push(...jitter(260, 1100, 110, (i, u) => ({ x: -0.18 - u * 0.3, y: 0.06 + u * 0.2 + (i % 2 ? 0.03 : -0.03), o: 1, r: i % 2 ? -10 : 10 })));
        } else {
          frames.push({ t: 450, x: -0.32, y: -0.02 + 0.06 * k, o: 1, r: -8 });
        }
        frames.push({ t: D, x: last ? -0.5 : -0.48, y: last ? 0.34 : 0.04 + 0.1 * k, sc: 0.85, o: 0, r: 6 });
        c.sprite(SHAPES.note(), { x: 0.14, y: 0.84, w: last ? 0.34 : 0.26, D, delay: d, frames });
      });
    },
  },
};

// ── Lecture ──────────────────────────────────────────────────────────────────

/** Durée de la mise en scène d'une réaction, en ms. */
export function reactionFxDuration(emoji: ReactionEmoji): number {
  return FX[emoji].D;
}

/** Arrête la mise en scène en cours sur une scène et retire ses éléments dessinés. */
export function stopReactionFx(stage: HTMLElement): void {
  stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
  stage.querySelectorAll(".rfx, .rfx-clip").forEach(el => el.remove());
}

/**
 * Joue la mise en scène d'une réaction sur une scène (voir ReactionFxComponent :
 * `.rfx-mad` > `.rfx-glyph`). Relancer pendant une lecture repart de zéro.
 * Sous « mouvement réduit », rien ne bouge. Renvoie la durée, 0 si rien ne joue.
 */
export function playReactionFx(stage: HTMLElement, emoji: ReactionEmoji): number {
  const def = FX[emoji];
  stopReactionFx(stage);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  const mad = stage.querySelector<HTMLElement>(".rfx-mad");
  const face = stage.querySelector<HTMLElement>(".rfx-glyph");
  // offsetWidth ignore les transformations : la taille de la scène, même
  // pendant l'enfoncement du hublot ou l'apparition d'une réaction en partie.
  const s = stage.offsetWidth;
  if (!mad || !face || s === 0) return 0;

  const animate = (el: HTMLElement, points: Pose[], origin?: string, ease?: string) => {
    el.style.transformOrigin = origin ?? "50% 50%";
    el.animate(keyframes(points, def.D, s, false, ease ?? "ease-in-out"), { duration: def.D });
  };

  def.play({
    s,
    rnd: rng(def.seed ?? 7),
    body: (points, origin, ease) => animate(mad, points, origin, ease),
    face: (points, origin, ease) => animate(face, points, origin, ease),
    sprite(html, o) {
      const el = document.createElement("span");
      el.className = "rfx" + (o.cls ? " " + o.cls : "");
      const w = o.w * s;
      const h = (o.h ?? o.w) * s;
      el.style.left = `${o.x * s - w / 2}px`;
      el.style.top = `${o.y * s - h / 2}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      if (o.css) for (const [k, v] of Object.entries(o.css)) el.style.setProperty(k, v);
      if (html) el.innerHTML = html;
      // Un reflet ne sort pas du visage : il passe dans un disque de sa taille.
      let host: HTMLElement = stage;
      if (o.clip) {
        host = document.createElement("span");
        host.className = "rfx-clip";
        stage.append(host);
      }
      if (o.under) host.prepend(el);
      else host.append(el);
      const a = el.animate(keyframes(o.frames, o.D, s, true), {
        duration: o.D,
        delay: o.delay ?? 0,
        fill: "backwards",
        easing: o.easing ?? "linear",
      });
      const done = () => (host === stage ? el : host).remove();
      a.onfinish = done;
      a.oncancel = done;
    },
  });
  return def.D;
}
