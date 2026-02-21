import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http'; // INDISPENSABLE
import { WebSocketServer, WebSocket } from 'ws';

// 1. Initialise Express
const app = express();
app.use(cors());

// 2. Crée le serveur HTTP "parent"
const server = createServer(app);

// 3. Initialise WebSocket en le liant au serveur HTTP (SANS donner de port !)
const wss = new WebSocketServer({ server }); 

const PORT = process.env.PORT || 8080;

app.get('/', (req: Request, res: Response) => {
    res.send({ message: 'Keezen API est en ligne avec WebSockets !' });
});


// WebSocket Server


// Jeu de 52 cartes
const DECK: Card[] = [
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
function shuffleDeck(deck: Card[]): Card[] {
    const shuffled: Card[] = [...deck];
    return shuffled;
}

// Fonction pour générer des positions aléatoires pour les billes
function generateRandomMarblePositions(color: 'red' | 'green' | 'blue' | 'orange', turn: number = 1): number[] {
    switch (color) {
        case 'red':
            return generatedRedTurnPosition(turn);
        case 'green':
            return generatedGreenTurnPosition(turn);
        case 'orange':
            return [175, 193, 208, 223];
        case 'blue':
            return [168, 183, 198, 213];
        default:
            return [0, 1, 2, 3];
    }
}

function generatedRedTurnPosition(turn: number): number[] {
    switch (turn) {
        case 1:
            return [3, 18, 33, 48];
        case 2:
            return [9, 18, 33, 48];
        case 3:
            return [9, 18, 33, 48];
        case 4:
            return [135, 18, 33, 48];
        case 5:
            return [135, 18, 33, 48];
        case 6:
            return [38, 18, 33, 48];
        case 7:
            return [38, 18, 33, 48];
        default:
            return [3, 18, 33, 48];
    }
}

function generatedGreenTurnPosition(turn: number): number[] {
    switch (turn) {
        case 3:
            return [135, 28, 43, 58];
        case 4:
            return [9, 28, 43, 58];
        case 5:
            return [70, 28, 43, 58];
        case 6:
            return [70, 28, 43, 58];
        case 7:
            return [38, 28, 43, 58];
        default:
            return [13, 28, 43, 58];
    }
}

// Fonction pour piocher N cartes aléatoires
function drawCards(count: number): Card[] {
    const shuffled = shuffleDeck(DECK);
    return shuffled.slice(0, count);
}

// Fonction pour générer un Player
function generatePlayer(name: string, color: 'red' | 'green' | 'blue' | 'orange', isConnected: boolean = true, turn: number = 1): Player {
    return {
        isConnected,
        name,
        color,
        marblePositions: generateRandomMarblePositions(color, turn)
    };
}

function generateCurrentTurn(turn: number = 1): CurrentTurn {
    const colors: Array<'red' | 'green' | 'blue' | 'orange'> = ['red', 'green', 'blue', 'orange'];
    switch (turn) {
        case 2:
            return {
                color: 'red',
                lastAction: {
                    type: 'enter',
                    from: 3,
                    to: 9
                },
                lastCardPlayed: drawCards(1)[0]
            };
        case 3:
            return {
                color: 'green',
                lastAction: {
                    type: 'enter',
                    from: 13,
                    to: 135
                },
                lastCardPlayed: drawCards(1)[0]
            };
        case 4:
            return {
                color: 'red',
                lastAction: {
                    type: 'swap',
                    from: 9,
                    to: 135
                },
                lastCardPlayed: drawCards(1)[0]
            };
        case 5:
            return {
                color: 'green',
                lastAction: {
                    type: 'move',
                    from: 9,
                    to: 70
                },
                lastCardPlayed: drawCards(1)[0]
            };
        case 6:
            return {
                color: 'red',
                lastAction: {
                    type: 'promote',
                    from: 135,
                    to: 38
                },
                lastCardPlayed: drawCards(1)[0]
            };
        case 7:
            return {
                color: 'green',
                lastAction: {
                    type: 'capture',
                    from: 70,
                    to: 38
                },
                lastCardPlayed: drawCards(1)[0]
            };
        default:
            return {
                color: colors[Math.floor(Math.random() * colors.length)] || 'red',
                lastAction: {
                    type: 'enter',
                    from: 48,
                    to: 9
                },
                lastCardPlayed: drawCards(1)[0]
            };
    }
}

// Fonction pour générer un GameState aléatoire
function generateGameState(turn: number = 1): GameState {
    const currentTurn = generateCurrentTurn(turn);
    const timer = TIMER_DURATION;

    // Génération des 4 joueurs
    const players: Player[] = [
        generatePlayer('Player 1', 'red', true, turn),
        generatePlayer('Player 2', 'green', true, turn),
        generatePlayer('Player 3', 'orange', true, turn),
        generatePlayer('Player 4', 'blue', true, turn)
    ];

    return {
        players,
        isConnected: true,
        currentTurn,
        hand: drawCards(5),
        timer,
        discardedCards: drawCards(Math.floor(Math.random() * 6))
    };
}

wss.on('connection', (ws: WebSocket) => {
    console.log('✅ Client connecté');
    let turn: number = 1;

    // Envoie un message de bienvenue avec le GameState initial
    const welcomeMessage: WelcomeMessage = {
        type: 'welcome',
        message: 'Connexion réussie!',
        timestamp: new Date().toISOString(),
        gameState: generateGameState(turn)
    };
    ws.send(JSON.stringify(welcomeMessage));

    // Envoie un nouveau GameState toutes les 30 secondes
    const interval = setInterval(() => {
        turn++;
        const gameStateMessage: GameStateMessage = {
            type: 'gameState',
            gameState: generateGameState(turn),
            timestamp: new Date().toISOString(),
            message: 'New turn generated'
        };
        ws.send(JSON.stringify(gameStateMessage));
    }, TIMER_DURATION * 1000);

    // Écoute les messages du client
    ws.on('message', (message) => {
        console.log('📩 Message reçu:', message.toString());

        // Renvoie une réponse avec un nouveau GameState
        const responseMessage: ResponseMessage = {
            type: 'response',
            echo: message.toString(),
            gameState: generateGameState(),
            timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(responseMessage));
    });

    ws.on('close', () => {
        console.log('❌ Client déconnecté');
        clearInterval(interval);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Serveur hybride (HTTP + WS) prêt sur le port ${PORT}`);
});
console.log('🃏 Jeu de 52 cartes chargé');
