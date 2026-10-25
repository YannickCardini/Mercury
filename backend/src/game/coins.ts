import {
  COINS_PER_ALLY_CAPTURE,
  COINS_PER_CAPTURE,
  MAX_COINS_PER_WIN,
  MIN_COINS_PER_WIN,
  PAIR_BONUS_COINS,
  hasBoost,
  type CoinParts,
} from '@mercury/shared';

/**
 * Pièces gagnées par chaque vainqueur : l'écart de pions rentrés entre les deux
 * camps. En 2v2 le camp gagnant en a toujours 8, donc le gain vaut 8 moins le
 * total du camp adverse (exemple de référence : 8 - 6 = 2).
 *
 * Les bornes couvrent la victoire par forfait (declareLastConnectedWinner), où
 * l'écart peut être nul ou négatif alors qu'une victoire doit toujours payer.
 * Les perdants ne reçoivent rien.
 */
export function computeWinCoins(winnersArrived: number, losersArrived: number): number {
  const raw = winnersArrived - losersArrived;
  return Math.min(MAX_COINS_PER_WIN, Math.max(MIN_COINS_PER_WIN, raw));
}

/** Ce qu'un siège a accompli pendant la partie, pour les boosters qui paient en jeu. */
export interface SeatTally {
  /** Pions adverses capturés (Bounty). */
  captures: number;
  /** Pions de son propre camp capturés : le sien ou le coéquipier (malus Bounty). */
  allyCaptures: number;
  /** Actions qui ont rentré deux pions du camp (Homecoming). */
  pairHomes: number;
  /** Actions qui ont capturé deux pions adverses (Double Strike). */
  pairCaptures: number;
}

export function emptyTally(): SeatTally {
  return { captures: 0, allyCaptures: 0, pairHomes: 0, pairCaptures: 0 };
}

/**
 * Origine des pièces de fin de partie d'un joueur, avant Double Coins : seuls
 * les boosters qu'il a équipés transforment ses compteurs en pièces. La
 * variation finale est endGameCoinDelta (shop-catalog.ts), partagée avec
 * l'écran de fin.
 */
export function computeCoinParts(victory: number, tally: SeatTally, boosts: readonly string[]): CoinParts {
  const bounty = hasBoost(boosts, 'capture_coins');
  return {
    victory,
    captures: bounty ? tally.captures * COINS_PER_CAPTURE : 0,
    allyPenalty: bounty ? tally.allyCaptures * COINS_PER_ALLY_CAPTURE : 0,
    pairHome: hasBoost(boosts, 'pair_home') ? tally.pairHomes * PAIR_BONUS_COINS : 0,
    pairCapture: hasBoost(boosts, 'pair_capture') ? tally.pairCaptures * PAIR_BONUS_COINS : 0,
  };
}
