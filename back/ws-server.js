const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Jeu de 52 cartes
const DECK = [
    // ♥ Cœur (Hearts)
    { id: '1', suit: '♥', value: 'A' },
    { id: '2', suit: '♥', value: '2' },
    { id: '3', suit: '♥', value: '3' },
    { id: '4', suit: '♥', value: '4' },
    { id: '5', suit: '♥', value: '5' },
    { id: '6', suit: '♥', value: '6' },
    { id: '7', suit: '♥', value: '7' },
    { id: '8', suit: '♥', value: '8' },
    { id: '9', suit: '♥', value: '9' },
    { id: '10', suit: '♥', value: '10' },
    { id: '11', suit: '♥', value: 'J' },
    { id: '12', suit: '♥', value: 'Q' },
    { id: '13', suit: '♥', value: 'K' },

    // ♦ Carreau (Diamonds)
    { id: '14', suit: '♦', value: 'A' },
    { id: '15', suit: '♦', value: '2' },
    { id: '16', suit: '♦', value: '3' },
    { id: '17', suit: '♦', value: '4' },
    { id: '18', suit: '♦', value: '5' },
    { id: '19', suit: '♦', value: '6' },
    { id: '20', suit: '♦', value: '7' },
    { id: '21', suit: '♦', value: '8' },
    { id: '22', suit: '♦', value: '9' },
    { id: '23', suit: '♦', value: '10' },
    { id: '24', suit: '♦', value: 'J' },
    { id: '25', suit: '♦', value: 'Q' },
    { id: '26', suit: '♦', value: 'K' },

    // ♣ Trèfle (Clubs)
    { id: '27', suit: '♣', value: 'A' },
    { id: '28', suit: '♣', value: '2' },
    { id: '29', suit: '♣', value: '3' },
    { id: '30', suit: '♣', value: '4' },
    { id: '31', suit: '♣', value: '5' },
    { id: '32', suit: '♣', value: '6' },
    { id: '33', suit: '♣', value: '7' },
    { id: '34', suit: '♣', value: '8' },
    { id: '35', suit: '♣', value: '9' },
    { id: '36', suit: '♣', value: '10' },
    { id: '37', suit: '♣', value: 'J' },
    { id: '38', suit: '♣', value: 'Q' },
    { id: '39', suit: '♣', value: 'K' },

    // ♠ Pique (Spades)
    { id: '40', suit: '♠', value: 'A' },
    { id: '41', suit: '♠', value: '2' },
    { id: '42', suit: '♠', value: '3' },
    { id: '43', suit: '♠', value: '4' },
    { id: '44', suit: '♠', value: '5' },
    { id: '45', suit: '♠', value: '6' },
    { id: '46', suit: '♠', value: '7' },
    { id: '47', suit: '♠', value: '8' },
    { id: '48', suit: '♠', value: '9' },
    { id: '49', suit: '♠', value: '10' },
    { id: '50', suit: '♠', value: 'J' },
    { id: '51', suit: '♠', value: 'Q' },
    { id: '52', suit: '♠', value: 'K' },
];

// Fonction pour mélanger les cartes
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Fonction pour générer des positions aléatoires pour les billes (4 positions entre 0 et 63)
function generateRandomMarblePositions(color) {
    switch (color) {
        case 'red':
            return [3, 18, 33, 48];
        case 'green':
            return [13, 28, 43, 58];
        case 'orange':
            return [178, 193, 208, 223];
        case 'blue':
            return [168, 183, 198, 213];
        default:
            return [0, 1, 2, 3]; // Par défaut pour éviter les erreurs
    }
    // return Array.from({ length: 4 }, () => Math.floor(Math.random() * 220));
}

// Fonction pour piocher N cartes aléatoires
function drawCards(count) {
    const shuffled = shuffleDeck(DECK);
    return shuffled.slice(0, count);
}

// Fonction pour générer un Player
function generatePlayer(name, color, isConnected = true) {
    return {
        isConnected: isConnected,
        name: name,
        color: color,
        marblePositions: generateRandomMarblePositions(color)
    };
}

// Fonction pour générer un GameState aléatoire
function generateGameState() {
    const colors = ['red', 'green', 'blue', 'orange'];
    const currentTurn = colors[Math.floor(Math.random() * colors.length)];

    // Génération des 4 joueurs
    const players = [
        generatePlayer('Player 1', 'red', true),
        generatePlayer('Player 2', 'green', true),
        generatePlayer('Player 3', 'orange', true),
        generatePlayer('Player 4', 'blue', true)
    ];

    return {
        players: players,
        isConnected: true,
        currentTurn: currentTurn,
        hand: drawCards(5),
        discardedCards: drawCards(Math.floor(Math.random() * 6)) // 0 à 5 cartes défaussées
    };
}

wss.on('connection', (ws) => {
    console.log('✅ Client connecté');

    // Envoie un message de bienvenue avec le GameState initial
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connexion réussie!',
        timestamp: new Date().toISOString(),
        gameState: generateGameState()
    }));

    // Envoie un nouveau GameState toutes les 30 secondes
    const interval = setInterval(() => {
        ws.send(JSON.stringify({
            type: 'gameState',
            gameState: generateGameState(),
            timestamp: new Date().toISOString()
        }));
    }, 30000);

    // Écoute les messages du client
    ws.on('message', (message) => {
        console.log('📩 Message reçu:', message.toString());

        // Renvoie une réponse avec un nouveau GameState
        ws.send(JSON.stringify({
            type: 'response',
            echo: message.toString(),
            gameState: generateGameState(),
            timestamp: new Date().toISOString()
        }));
    });

    ws.on('close', () => {
        console.log('❌ Client déconnecté');
        clearInterval(interval);
    });
});

console.log('🚀 Serveur WebSocket démarré sur ws://localhost:8080');
console.log('🃏 Jeu de 52 cartes chargé');