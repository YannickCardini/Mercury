import { MAX_COINS_PER_WIN, MIN_COINS_PER_WIN } from '@mercury/shared';

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
