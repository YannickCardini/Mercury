export interface PlayerRating {
  userId: string;
  points: number;
  isWinner: boolean;
}

export interface PointsDelta {
  userId: string;
  delta: number;
}

const WIN_DELTA = 4;
const LOSS_DELTA = -1;

export function computeEndGamePointsDeltas(players: PlayerRating[]): PointsDelta[] {
  return players.map(player => ({
    userId: player.userId,
    delta: player.isWinner ? WIN_DELTA : LOSS_DELTA,
  }));
}
