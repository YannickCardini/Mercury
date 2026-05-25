# Mercury

Implémentation multijoueur en temps réel du jeu de société **Tock / Keezen**, en TypeScript de bout en bout.

- **Backend** : Node.js + WebSocket (Express), authoritative server, persistance Postgres
- **Frontend** : Angular 17 + Ionic (web + Android via Capacitor)
- **Code partagé** : monorepo npm workspaces avec un package `@mercury/shared` (types, géométrie du plateau, constantes)
- **Matchmaking** : file d'attente publique avec **complétion automatique par des bots IA** — voir [Agent IA externe](#agent-ia-externe--complétion-automatique-du-matchmaking)

---

## Structure du projet

```
mercury/
├── packages/
│   └── shared/                       ← Source de vérité partagée frontend/backend
│       └── src/
│           ├── types.ts              ← Interfaces (Card, Player, Action, GameState, messages WS…)
│           ├── board-config.ts       ← Géométrie du plateau (positions, chemins, helpers)
│           ├── constants.ts          ← Durées d'animation, règles, config générale
│           └── index.ts              ← Barrel export
│
├── backend/                          ← Serveur Express + WebSocket (Node.js, ESM)
│   └── src/
│       ├── index.ts                  ← Point d'entrée HTTP + WS
│       ├── db.ts                     ← Accès Postgres
│       ├── auth/                     ← Authentification (Google OAuth, sessions)
│       ├── game/                     ← Moteur de jeu (board, deck, players, boucle de tour)
│       ├── messages/                 ← Sérialisation des messages WebSocket
│       ├── session/
│       │   ├── matchmaking-manager.ts    ← File d'attente publique + dispatch agent IA
│       │   ├── custom-game-manager.ts    ← Parties privées (lobby invité)
│       │   ├── session-manager.ts        ← Sessions utilisateur
│       │   ├── presence-manager.ts       ← Présence en ligne
│       │   └── game-registry.ts          ← Registre des parties actives
│       └── utils/
│
├── frontend/                         ← Application Angular 17 + Ionic
│   └── src/app/
│       ├── home/                     ← Accueil + lobby
│       ├── game/                     ← Page de jeu
│       │   ├── components/
│       │   │   ├── board/            ← Rendu du plateau et des pions
│       │   │   ├── table/            ← Joueurs adverses, mains, indicateurs
│       │   │   ├── seven-overlay/    ← UX dédiée à la carte 7 (split de mouvement)
│       │   │   ├── tutorial-overlay/ ← Tutoriel interactif
│       │   │   ├── victory-overlay/  ← Écran de fin de partie
│       │   │   └── emoji-reactions/  ← Réactions en temps réel
│       │   └── services/             ← game-state, tab-lock…
│       ├── profile/                  ← Profil utilisateur
│       ├── leaderboard/              ← Classement
│       └── services/                 ← presence, auth, websocket…
│
├── package.json                      ← Workspace root (npm workspaces)
└── README.md
```

---

## Package partagé : `@mercury/shared`

### Pourquoi ?

Le frontend et le backend partagent naturellement :
- Les **types TypeScript** (Card, Player, Action, GameState…)
- La **géométrie du plateau** (positions des cases, homes, starts, arrivées)
- Les **constantes** (durée du tour, durées d'animation, règles)

Sans package partagé, ces données sont dupliquées et divergent — ce qui provoque des bugs difficiles à tracer. Avec `@mercury/shared`, il y a **une seule source de vérité**, garantie à la compilation par TypeScript des deux côtés du WebSocket.

### Contenu

| Fichier | Contenu |
|---|---|
| `types.ts` | Interfaces et types (`Card`, `Player`, `Action`, `GameState`, messages WebSocket…) |
| `board-config.ts` | Positions du plateau : cases affichées, chemin principal, homes, starts, arrivées. Helpers : `getStartPosition()`, `hasWon()`, etc. |
| `constants.ts` | Durées d'animation, durée du tour, config d'affichage, règles (`ENTER_CARDS`, `CARDS_PER_HAND`…) |
| `index.ts` | Barrel export — importer toujours depuis `@mercury/shared` |

---

## Agent IA externe — complétion automatique du matchmaking

Mercury est un jeu **à quatre joueurs obligatoires**. Pour éviter qu'un joueur seul dans la file d'attente publique attende indéfiniment qu'un humain le rejoigne, le matchmaking fait appel à un **service d'agents IA externes** déployé séparément, qui rejoignent la file pour compléter la partie.

### Architecture

L'agent IA vit dans un **projet séparé**, déployé comme un service indépendant. Il est entraîné à partir d'un **LLM** et joue au Tock comme un véritable joueur connecté en WebSocket — il reçoit les mêmes messages, joue ses cartes, et abandonne la partie comme un humain. Pour le moteur de jeu, **un bot est strictement indistinguable d'un humain**.

```
┌──────────────┐         HTTP POST /dispatch          ┌────────────────────┐
│  Mercury     │ ───────────────────────────────────▶ │  Agent IA service  │
│  backend     │      (X-Bot-Secret, body: {})        │  (projet séparé,   │
│              │ ◀─────────────────────────────────── │   LLM-driven)      │
│ matchmaking- │      200 OK / 503 (occupé)           └──────────┬─────────┘
│ manager.ts   │                                                 │
│              │                                                 │ se connecte
│              │ ◀──── WebSocket join (bot userId) ──────────────┘
└──────────────┘
```

- **Découplage total** : le backend Mercury ne sait rien des modèles, prompts ou pondérations utilisés. Il connaît uniquement un endpoint HTTP `POST /dispatch` et un secret partagé.
- **Authentification** : header `X-Bot-Secret` pour empêcher tout client non autorisé d'invoquer le pool de bots.
- **Backpressure** : si tous les bots du pool sont déjà occupés sur d'autres parties, le service répond `503` — Mercury continue d'attendre et retentera.
- **Scalabilité indépendante** : le service IA peut être scalé (nombre de bots concurrents) sans toucher au backend de jeu.

### Algorithme de dispatch (probabiliste, croissant)

Implémenté dans [backend/src/session/matchmaking-manager.ts](backend/src/session/matchmaking-manager.ts) :

- Tant qu'**au moins un humain** attend dans la file (et que la partie n'est pas pleine), un tick d'1 seconde évalue s'il faut invoquer l'agent.
- À chaque tick la probabilité de dispatch **augmente de +1 %** (`BOT_DISPATCH_CHANCE_STEP`).
- Quand un dispatch est déclenché, la probabilité est **divisée par 2**, puis recommence à monter.

Conséquence : un joueur seul est très probablement rejoint par un bot dans la première minute, mais si plusieurs humains arrivent en rafale, les bots ne se précipitent pas — le système **laisse sa chance à une partie 100 % humaine** sans jamais laisser un joueur poireauter.

### Configuration

Deux variables d'environnement côté backend :

```bash
AGENT_URL=https://agent-service.example.com   # endpoint du service IA
BOT_SECRET=<shared-secret>                    # auth du dispatch
```

Si l'une des deux manque, le dispatch est désactivé (le backend log un warning, la partie continue normalement et attend des humains).

---

## Installation et démarrage

### Prérequis

- Node.js ≥ 18
- npm ≥ 8 (workspaces)
- Postgres (pour la persistance des utilisateurs, parties, leaderboard)

### Installation

```bash
# À la racine — installe toutes les dépendances (shared + backend + frontend)
npm install
```

### Build du package partagé

Le package partagé doit être **buildé avant** de démarrer le frontend ou le backend.

```bash
# Build unique
npm run build:shared

# Ou en mode watch (développement)
npm run build --workspace=packages/shared -- --watch
```

### Démarrage

```bash
# Backend (port 3000 par défaut)
npm run dev:backend

# Frontend (port 8100 par défaut, autre terminal)
npm run dev:frontend
```

### Build de production

```bash
npm run build:all
```

---
