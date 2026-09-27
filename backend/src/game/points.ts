export interface PlayerRating {
  userId: string;
  points: number;
  isWinner: boolean;
  /** Siège tenu par un agent IA externe (bot-login) — gagne moins qu'un vrai joueur. */
  isBot?: boolean;
  /** Facteur du booster Double Points (1 sans booster). S'applique au gain
   *  comme à la perte : c'est le pari que le joueur a acheté. */
  multiplier?: number;
}

export interface PointsDelta {
  userId: string;
  delta: number;
}

const WIN_DELTA = 4;
const WIN_DELTA_BOT = 2;
const LOSS_DELTA = -1;

export function computeEndGamePointsDeltas(players: PlayerRating[]): PointsDelta[] {
  return players.map(player => {
    const base = player.isWinner ? (player.isBot ? WIN_DELTA_BOT : WIN_DELTA) : LOSS_DELTA;
    return { userId: player.userId, delta: base * (player.multiplier ?? 1) };
  });
}
