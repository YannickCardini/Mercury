import { DOUBLE_POINTS_BOOST_ID, getBoostMultiplier } from '@mercury/shared';

export interface PlayerRating {
  userId: string;
  points: number;
  isWinner: boolean;
  /** True if the "double points" boost is armed for this player on this game. */
  boosted?: boolean;
}

export interface PointsDelta {
  userId: string;
  delta: number;
}

const WIN_DELTA = 4;
const LOSS_DELTA = -1;

export function computeEndGamePointsDeltas(players: PlayerRating[]): PointsDelta[] {
  return players.map(player => {
    const base = player.isWinner ? WIN_DELTA : LOSS_DELTA;
    const multiplier = player.boosted ? getBoostMultiplier(DOUBLE_POINTS_BOOST_ID) : 1;
    return { userId: player.userId, delta: base * multiplier };
  });
}
