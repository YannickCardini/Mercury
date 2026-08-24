# Mercury

Real-time multiplayer implementation of the **Tock / Keezen** board game, written end-to-end in TypeScript.

🎮 **Play now: [https://mercury-game.online](https://mercury-game.online)**

- **Backend**: Node.js + WebSocket (Express), authoritative server, persistence via Azure Cosmos DB
- **Frontend**: Angular + Ionic (web + Android via Capacitor)
- **Shared code**: npm workspaces monorepo with a `@mercury/shared` package (types, board geometry, constants)
- **Matchmaking**: public queue with **automatic completion by AI bots** — see [External AI agent](#external-ai-agent--automatic-matchmaking-completion)

---

## Shared package: `@mercury/shared`

### Why?

The frontend and backend naturally share:
- **TypeScript types** (Card, Player, Action, GameState…)
- **Board geometry** (cell positions, homes, starts, finish lines)
- **Move validation** (same logic applied client-side for instant feedback)
- **Constants** (turn duration, animation durations, rules)

Without a shared package, this data gets duplicated and drifts apart — causing hard-to-trace bugs. With `@mercury/shared`, there is a **single source of truth**, guaranteed at compile time by TypeScript on both sides of the WebSocket.

### Contents

| File | Contents |
|---|---|
| `types.ts` | Interfaces and types (`Card`, `Player`, `Action`, `GameState`, WebSocket messages…) |
| `board-config.ts` | Board positions: displayed cells, main path, homes, starts, finish lines. Helpers: `getStartPosition()`, `hasWon()`, etc. |
| `move-validator.ts` | Legal move validation — shared for immediate client-side feedback and authoritative server-side verification. |
| `constants.ts` | Animation durations, turn duration, display config, rules (`ENTER_CARDS`, `CARDS_PER_HAND`…) |
| `index.ts` | Barrel export — always import from `@mercury/shared` |

---

## External AI agent — automatic matchmaking completion

Mercury is a game that **requires exactly four players**. To prevent a lone player in the public queue from waiting indefinitely for a human to join, matchmaking relies on an **external AI agent service** deployed separately, which joins the queue to complete the game.

### Architecture

The AI agent lives in a **separate project**, deployed as an independent service. It is trained on top of an **LLM** and plays Tock like a genuine WebSocket-connected player — it receives the same messages, plays its cards, and forfeits the game like a human would. From the game engine's perspective, **a bot is strictly indistinguishable from a human**.

```
┌──────────────┐         HTTP POST /dispatch          ┌────────────────────┐
│  Mercury     │ ───────────────────────────────────▶ │  AI agent service  │
│  backend     │      (X-Bot-Secret, body: {})        │  (separate project,│
│              │ ◀─────────────────────────────────── │   LLM-driven)      │
│ matchmaking- │      200 OK / 503 (busy)              └──────────┬─────────┘
│ manager.ts   │                                                 │
│              │                                                 │ connects
│              │ ◀──── WebSocket join (bot userId) ──────────────┘
└──────────────┘
```

- **Full decoupling**: the Mercury backend knows nothing about the models, prompts, or weights used. It only knows an `POST /dispatch` HTTP endpoint and a shared secret.
- **Authentication**: `X-Bot-Secret` header to prevent any unauthorized client from invoking the bot pool.
- **Backpressure**: if all bots in the pool are already busy on other games, the service responds `503` — Mercury keeps waiting and retries later.
- **Independent scalability**: the AI service can be scaled (number of concurrent bots) without touching the game backend.

### Dispatch algorithm (probabilistic, increasing)

Implemented in [backend/src/session/matchmaking-manager.ts](backend/src/session/matchmaking-manager.ts):

- As long as **at least one human** is waiting in the queue (and the game isn't full), a 1-second tick evaluates whether to invoke the agent.
- On each tick, the dispatch probability **increases by +1%** (`BOT_DISPATCH_CHANCE_STEP`).
- When a dispatch is triggered, the probability is **halved**, then starts climbing again.

Result: a lone player is very likely joined by a bot within the first minute, but if several humans arrive in a burst, the bots don't rush in — the system **gives an all-human game a chance** without ever leaving a player hanging.

### Configuration

```bash
AGENT_URL=https://agent-service.example.com   # AI service endpoint
BOT_SECRET=<shared-secret>                    # dispatch auth
```

If either is missing, dispatch is disabled (the backend logs a warning, the game continues normally and waits for humans).

### Bot WebSocket authentication

Since the WebSocket layer authenticates player identity, a `userId` sent
by the client is **no longer ever accepted as-is**. The flow on the AI agent side is:

1. `POST /api/auth/bot` with `{ secret, botId }` → the response now contains a
   **`sessionToken`** field (a JWT signed by the backend).
2. The bot includes this token in its join message: `{ type: 'joinMatchmaking',
   authToken: <sessionToken>, … }` — the server derives the verified `userId` from it.

A bot that omits `authToken` joins the queue **as a guest** (no account, no points):
matchmaking won't recognize it as a bot (`BOT_USER_IDS`), which may trigger
extra dispatches. Update the agent service accordingly.

---

## Installation and setup

### Requirements

- Node.js ≥ 18
- npm ≥ 8 (workspaces)
- Azure Cosmos DB (for user, points, and leaderboard persistence) — or the local Cosmos emulator via `COSMOS_CONNECTION_STRING_LOCAL`

### Installation

```bash
# From the repo root — installs all dependencies (shared + backend + frontend)
npm install

# Then create the .env file at the root from the template
cp .env.example .env   # and fill in the values
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_AUDIENCE_WEB` | yes | Google OAuth Client ID (web) |
| `GOOGLE_AUDIENCE_ANDROID` | yes | Google OAuth Client ID (Android) |
| `COSMOS_CONNECTION_STRING` | prod | Azure Cosmos DB connection string |
| `COSMOS_CONNECTION_STRING_LOCAL` | dev | Local Cosmos emulator |
| `SESSION_JWT_SECRET` | yes | HS256 secret for session tokens (≥ 32 chars) |
| `AZURE_STORAGE_CONNECTION_STRING` | yes | Azure Blob Storage (avatars) |
| `AVATARS_CONTAINER` | no | Blob container name (default: `avatars`) |
| `BOT_SECRET` | no | Shared secret with the AI agent service |
| `AGENT_URL` | no | AI agent service endpoint — empty = dispatch disabled |
| `ALLOWED_ORIGINS` | prod | Allowed CORS origins, comma-separated |
| `DEBUG` | no | `true` = enables test routes and debug joinMatchmaking vs 3 local bots |
| `TRAIN_MODE` | no | `true` = self-play without dispatching external agents |
| `LATEST_VERSION_CODE` | no | Overrides `versionCode` without redeploying |
| `LATEST_VERSION_NAME` | no | Overrides `versionName` without redeploying |
| `MIN_VERSION_CODE` | no | Minimum code before forced update (future use) |
| `STORE_URL` | no | Play Store URL shown in the update popup |
| `WORKER_USERNAME` | no | Staff account credentials (Google Play review) |
| `WORKER_PASSWORD` | no | Staff account credentials (Google Play review) |

> **Production**: `ALLOWED_ORIGINS` must list the deployed frontend's URL. Without this variable, only `localhost` (dev) and `capacitor://localhost` are allowed.

### Building the shared package

The shared package must be **built before** starting the frontend or backend.

```bash
# One-off build
npm run build:shared

# Or in watch mode (development)
npm run build --workspace=packages/shared -- --watch
```

### Running

```bash
# Backend (port 3000 by default)
npm run dev:backend

# Frontend (port 8100 by default, separate terminal)
npm run dev:frontend
```

### Production build

```bash
npm run build:all
```

---

## Android release

### 1. Bump the version in `build.gradle`

Open [`frontend/android/app/build.gradle`](frontend/android/app/build.gradle) and edit the `defaultConfig` block:

```groovy
defaultConfig {
    versionCode 11         // integer — increment by 1 on each release
    versionName "0.11"     // string shown in the Play Store
    …
}
```

> `versionCode` must be **strictly greater** than the previous version on the Play Store.

### 2. Update the values in the backend

Open [`backend/src/version/version-router.ts`](backend/src/version/version-router.ts) and update the `LATEST_VERSION_CODE` and `LATEST_VERSION_NAME` constants so they exactly match the values in `build.gradle`.

The `GET /api/version` endpoint exposes these values to the mobile app, which compares them against its embedded version to detect that an update is available.

These constants can also be overridden without redeploying via the backend's **environment variables**:

```bash
LATEST_VERSION_CODE=11
LATEST_VERSION_NAME=0.11
```

### 3. Build the release bundle

From the repo root:

```bash
cd frontend
rm -rf www                          # purge the previous Angular build
npm run build                       # build Angular → www/
npx cap sync android                # sync www/ + plugins into the Android project
cd android
./gradlew bundleRelease             # produces the signed .aab
```

> `www/` is the Angular output directory consumed by Capacitor (defined by `webDir` in [`frontend/capacitor.config.ts`](frontend/capacitor.config.ts)).

### 4. Retrieve the artifact and publish

The generated bundle is located at:

```
frontend/android/app/build/outputs/bundle/release/app-release.aab
```

This `.aab` file is what you upload to the **Google Play Console** (*Production* tab → *Create release*).

---

