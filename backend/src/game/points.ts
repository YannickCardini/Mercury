/**
 * End-of-game points computation, weighted by opponent standing.
 *
 * Pure, side-effect-free — kept separate from `Game` so it can be unit-tested
 * in isolation. The actual DB writes (`updateUserPoints` / `recomputeRankings`)
 * happen in `Game.applyEndGamePoints`.
 *
 * Formula (Elo-like):
 *   - Each player's "rating" is their current `points` total.
 *   - `expectedScore` is the classic Elo expectation of the player against the
 *     average rating of the other humans in the game.
 *   - Winner gains `K_WIN * (1 - expected)`  → beating stronger fields pays more.
 *   - Loser  loses `K_LOSS * expected`       → losing to weaker fields hurts more.
 *   - Both are rounded and clamped to keep swings reasonable.
 */

/** Winner gain is clamped to this inclusive range. */
const WIN_MIN = 1;
const WIN_MAX = 6;
/** Loser loss is clamped to this inclusive range (negative). */
const LOSS_MIN = -3;
const LOSS_MAX = -1;
/** Elo-style scaling factors. */
const K_WIN = WIN_MAX;   // 6 — full gain when the field is far stronger
const K_LOSS = 4;        // tuned so a neutral field (expected 0.5) costs -2

export interface PlayerRating {
  userId: string;
  /** Current points total — used as the Elo rating. */
  points: number;
  isWinner: boolean;
}

export interface PointsDelta {
  userId: string;
  delta: number;
}

/** Classic Elo expected score of `rating` against `opponentAvg`. */
function expectedScore(rating: number, opponentAvg: number): number {
  return 1 / (1 + Math.pow(10, (opponentAvg - rating) / 400));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute the signed points delta for every human player at game end.
 *
 * `players` should contain exactly the non-penalized humans with a `userId`
 * (penalized disconnects/abandons are handled separately with a flat penalty).
 * Exactly one entry is expected to have `isWinner: true`.
 */
export function computeEndGamePointsDeltas(players: PlayerRating[]): PointsDelta[] {
  return players.map(player => {
    const opponents = players.filter(p => p.userId !== player.userId);
    // With no human opponents (e.g. 1 human vs 3 AI), fall back to a neutral
    // field — the player's own rating — so expectedScore resolves to 0.5.
    const opponentAvg = opponents.length > 0
      ? opponents.reduce((sum, p) => sum + p.points, 0) / opponents.length
      : player.points;

    const expected = expectedScore(player.points, opponentAvg);

    const delta = player.isWinner
      ? clamp(Math.round(K_WIN * (1 - expected)), WIN_MIN, WIN_MAX)
      : clamp(Math.round(-K_LOSS * expected), LOSS_MIN, LOSS_MAX);

    return { userId: player.userId, delta };
  });
}
