# Keezen

Implémentation du jeu de société **Tock/Keezen** en TypeScript, avec un backend WebSocket et un frontend Angular/Ionic.

---

## Structure du projet

```
keezen/
├── packages/
│   └── shared/                  ← Package partagé (types, constantes, config plateau)
│       ├── src/
│       │   ├── index.ts         ← Barrel export (point d'entrée unique)
│       │   ├── types.ts         ← Toutes les interfaces TypeScript
│       │   ├── board-config.ts  ← Géométrie du plateau (positions, chemins)
│       │   └── constants.ts     ← Durées d'animation, règles, config générale
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── backend/                 ← Serveur Express + WebSocket (Node.js)
│   │   ├── src/
│   │   │   ├── index.ts         ← Point d'entrée HTTP + WS
│   │   │   ├── game/
│   │   │   │   ├── game.ts      ← Boucle de jeu principale
│   │   │   │   ├── board.ts     ← Logique de déplacement sur le plateau
│   │   │   │   ├── player.ts    ← Logique joueur (humain / IA)
│   │   │   │   └── deck.ts      ← Gestion du paquet de cartes
│   │   │   └── utils/
│   │   │       └── utils.ts     ← Fonctions utilitaires
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                ← Application Angular 17 + Ionic
│       ├── src/
│       │   └── app/
│       │       ├── home/
│       │       │   ├── home.page.ts
│       │       │   ├── home.page.html
│       │       │   ├── components/
│       │       │   │   ├── board/
│       │       │   │   │   ├── board.component.ts
│       │       │   │   │   ├── board.component.html
│       │       │   │   │   └── board.component.scss
│       │       │   │   └── table/
│       │       │   │       ├── table.component.ts
│       │       │   │       ├── table.component.html
│       │       │   │       └── table.component.scss
│       │       │   └── services/
│       │       │       └── game-state.service.ts
│       │       └── shared/
│       │           └── tock-card.component.ts
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                 ← Workspace root (npm workspaces)
└── README.md
```

---

## Package partagé : `@keezen/shared`

### Pourquoi ?

Le frontend et le backend partagent naturellement :
- Les **types TypeScript** (Card, Player, Action, GameState…)
- La **géométrie du plateau** (positions des cases, homes, starts, arrivées)
- Les **constantes** (durée du tour, durées d'animation, règles)

Sans package partagé, ces données sont dupliquées et divergent — ce qui provoque des bugs difficiles à tracer. Avec `@keezen/shared`, il y a **une seule source de vérité**.

### Ce que contient chaque fichier

| Fichier | Contenu |
|---|---|
| `types.ts` | Toutes les interfaces et types TypeScript (`Card`, `Player`, `Action`, `GameState`, messages WebSocket…) |
| `board-config.ts` | Positions du plateau : cases affichées, chemin principal, homes, starts, arrivées, cases ignorées. Helpers : `getStartPosition()`, `hasWon()`, etc. |
| `constants.ts` | Durées d'animation des pions, durée du tour, config d'affichage, règles (`ENTER_CARDS`, `CARDS_PER_HAND`…) |
| `index.ts` | Barrel export — importer toujours depuis `@keezen/shared` |

---

## Installation et démarrage

### Prérequis

- Node.js ≥ 18
- npm ≥ 8 (workspaces)

### Installation

```bash
# À la racine du projet — installe toutes les dépendances (shared + apps)
npm install
```

### Build du package partagé

Le package partagé doit être **buildé avant** de démarrer le frontend ou le backend.

```bash
# Build unique
npm run build --workspace=packages/shared

# Ou en mode watch (développement)
npm run build:watch --workspace=packages/shared
```

### Démarrage

```bash
# Backend
npm run dev --workspace=apps/backend

# Frontend (dans un autre terminal)
npm run start --workspace=apps/frontend
```

---

