// Mode entraînement bot (self-play). Activé via TRAIN_MODE=true.
// Court-circuite tous les délais conçus pour le rendu visuel humain
// (animations, dispatch de bots externes) sans toucher aux règles ni à
// l'autorité serveur. Branche TRAIN_BOT uniquement — ne pas merger dans main.
//
// Exporté comme fonction (et non comme `const` figé à l'import) parce que
// `dotenv.config()` est appelé dans index.ts APRÈS l'évaluation des imports :
// une constante figée resterait à false même avec TRAIN_MODE=true dans .env.
// La fonction relit process.env à chaque appel, donc voit la valeur correcte
// dès le premier message reçu (bien après dotenv.config).
export function isTrainMode(): boolean {
    return process.env['TRAIN_MODE'] === 'true';
}
