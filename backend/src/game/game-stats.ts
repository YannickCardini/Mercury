// Journalisation des stats de partie en CSV (mode entraînement bot uniquement).
// Activé via TRAIN_MODE. Une ligne par partie, écrite à la fin (gameEnded).
// Chemin configurable via TRAIN_STATS_CSV (défaut : game-stats.csv à la racine
// du process backend). Branche TRAIN_BOT — ne pas merger dans main.
import fs from 'node:fs';
import { isTrainMode } from '../train-mode.js';

const CSV_PATH = process.env['TRAIN_STATS_CSV'] ?? 'game-stats.csv';
const HEADER = 'timestamp,game_id,duration_s,winner,reason,rounds,turns\n';

export interface GameStats {
    gameId: string;
    durationMs: number;
    winner: string | null;
    reason: string;
    rounds: number;
    turns: number;
}

export function logGameStats(stats: GameStats): void {
    if (!isTrainMode()) return;
    try {
        if (!fs.existsSync(CSV_PATH)) {
            fs.writeFileSync(CSV_PATH, HEADER);
        }
        const row = [
            new Date().toISOString(),
            stats.gameId,
            (stats.durationMs / 1000).toFixed(2),
            stats.winner ?? '',
            stats.reason,
            stats.rounds,
            stats.turns,
        ].join(',') + '\n';
        fs.appendFileSync(CSV_PATH, row);
    } catch (err) {
        console.error('❌ Échec écriture stats CSV:', err);
    }
}
