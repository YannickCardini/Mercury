# Project Instructions — Mercury

## 📌 Project Overview
Mercury is a real-time multiplayer board game (similar to Tock / Keezen) played with cards and marbles.
- Requires exactly 4 players per board (solo, custom room or matchmaking); a 2v2 team mode also exists (unnamed teams: red+blue vs green+orange), toggled server-side via `GAME_MODE`.
- Frontend ships as a web app and as a native Android app (Capacitor).

---

## 🧭 Context
- **Who plays**: signed in with Google (or as a guest, browser-id only, no account). Bots (AI opponents) also authenticate as regular accounts via a dedicated bot-login endpoint and can fill empty seats.
- **How a game is reached**: solo vs bots, matchmaking (random opponents), or a custom room (shareable code, invite friends). All three converge on the same `Game` engine and `WebSocket` messenger.
- **State model**: the server is authoritative. All game state lives in memory per-process (`GameRegistry`) and is snapshotted to Azure Blob Storage every turn so a restart/redeploy can rehydrate in-flight games without losing them.
- **Sessions are long-lived by design**: once a player signs in with Google, the backend issues its own long-lived session token (~27 years) so the client never needs to silently refresh via Google. This has real implications: any "freshness" signal (e.g. last-seen, last-login) must be updated from actual authenticated activity, not from the login/auth endpoint alone, since that endpoint may only ever fire once per device.
- **No local testing**: nobody runs `npm run dev`/serves the app during a Claude session (see Execution Limits below) — the user tests changes themselves on their own Android device. Treat `tsc`/`build`/unit tests as the full verification loop available in-session.

---

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- **State your assumptions explicitly.** If uncertain, ask.
- **If multiple interpretations exist, present them** — don't pick silently.
- **If a simpler approach exists, say so.** Push back when warranted.
- **If something is unclear, stop.** Name what's confusing. Ask.

---

## 🛠️ Architecture & Conventions

### Monorepo layout
npm workspaces: `packages/shared`, `backend`, `frontend`. Build order matters — `packages/shared` compiles to JS that both other workspaces import as `@mercury/shared`, so it must be built first (`npm run build:shared` at the repo root) whenever its source changes, before `tsc`/`ng build` in `backend` or `frontend` will pick up the new types.

- **`packages/shared/src/`** — code shared verbatim by client and server: `types.ts` (WebSocket protocol messages, `ClientMessage`/`ServerMessage`), `board-config.ts`, `move-validator.ts`, `teams.ts`, `constants.ts`. Game **rules** live here so client-side UI checks and server-side authority can't drift apart. It does **not** hold user/account types — those are declared separately (and currently duplicated) in `backend/src/auth/auth-router.ts` and `frontend/src/app/services/auth.service.ts` / `frontend/src/app/profile/profile.page.ts`.

- **`backend/`** — Node/Express + `ws` (raw WebSocket, no socket.io), TypeScript, run via `tsx` in dev / compiled to `dist` for prod.
  - `src/index.ts` — HTTP server + WebSocket upgrade handling, top-level routing of WS "setup" messages (`joinMatchmaking`, `createCustomRoom`, `joinCustomRoom`, `registerPresence`, `joinGame`), CORS/origin allowlist, per-IP connection cap, heartbeat/zombie-socket cleanup.
  - `src/game/` — the game engine itself: `game.ts` (turn/move/win logic), `deck.ts`, `player.ts`, `player-strategy.ts` + `ai-strategy.ts`/`human-strategy.ts` (bot decision-making), `game-messenger.ts` (per-player WS fan-out), `game-snapshot.ts`, `points.ts` (Elo-like scoring). Has the only real unit test suite in the repo (`*.test.ts`, run with `node --test` via `tsx`).
  - `src/session/` — everything above a single game: `session-manager.ts` (entry point used by `index.ts`), `matchmaking-manager.ts`, `custom-game-manager.ts`, `game-registry.ts` (in-memory `gameId → Game`), `reconnect-registry.ts` (guest/user → active game, survives socket drops), `presence-manager.ts` (userId → open sockets, for pushing invites), `bot-dispatch.ts`, `game-restore.ts` (rehydrates `GameRegistry` from blob snapshots on boot).
  - `src/auth/` — `auth-router.ts` (Google/bot/worker login, profile CRUD, avatar upload, leaderboard — all under `/api/auth`), `session-token.ts` (hand-rolled HS256 JWT, no external JWT lib).
  - `src/storage/` — `blob.ts` (Azure Blob: avatars), `snapshot-store.ts` (Azure Blob: per-turn game snapshots for crash/redeploy recovery).
  - `src/db.ts` — the only file that touches Cosmos DB; owns both containers (`users`, `messages`) and all cross-cutting user-document writes (points, ranking, activity). Prefer adding a function here over reading/writing `Container` objects ad hoc elsewhere.
  - `src/messages/` — simple inbox/DM feature (`messages-router.ts`), separate Cosmos container.
  - `src/game-mode.ts` / `train-mode.ts` — server-wide mode switches (2v2 teams, training/debug mode).

- **`frontend/`** — Angular (standalone components) + Ionic, deployed both as a responsive web app and, via Capacitor, as the Android app (`frontend/android/`).
  - `src/app/home/`, `src/app/game/`, `src/app/profile/`, `src/app/leaderboard/`, `src/app/delete-account/`, `src/app/privacy/` — one folder per route/page.
  - `src/app/services/` — `auth.service.ts` (Google sign-in, session token storage in `localStorage`, profile CRUD calls), `presence.service.ts` (the always-on WS used for cross-device invites while idle on home), plus the WS client(s) used inside an active game.
  - `src/app/shared/`, `src/app/styles/` — shared UI components and the `--m-*`/`$c-*` design tokens (see project memory on design identity — tokens described in docs are not fully reflected in code yet).
  - `frontend/content/` — a **separate**, non-Angular static site for SEO (landing pages, `/rules/*`), built by `content/build.mjs`, not part of the Angular app bundle.

### Persistence — Azure only, no SQL
- **Cosmos DB (SQL/Core API)**, not Table Storage: database `mercury-db`, containers `users` (partition key `/id`) and `messages` (partition key `/toUserId`). Local dev uses the Cosmos emulator via Azurite-compatible connection string (`COSMOS_CONNECTION_STRING`), TLS verification disabled outside `NODE_ENV=production`.
- **Azure Blob Storage** for binary/large state: avatar images (`avatars` container, public blob read) and per-turn game snapshots (used to rehydrate `GameRegistry` after a restart, see project memory on snapshot persistence).
- Write style matters here: prefer targeted Cosmos `patch` ops over read-then-`replace()` of the whole user document — a full replace from a stale read can silently clobber fields (`points`, `ranking`, `lastSeenAt`, …) written concurrently by another request (e.g. `recomputeRankings()` runs after every game end/disconnect/abandon and touches every user document).

### Realtime protocol
Single raw `WebSocket` per client (no socket.io/Engine.IO). Message shape is the discriminated-union `ClientMessage`/`ServerMessage` from `@mercury/shared`. Auth on the socket is per-message, not at the HTTP upgrade: most setup messages carry an `authToken` verified via `verifyAuth()` (accepts either the backend's own long-lived session token or, as a fallback, a fresh Google ID token); `joinGame` (reconnection) instead trusts the server-side `ReconnectRegistry`, since the reconnecting client may not have a token handy.

---

## 📝 Content Generation Rules
- **No Em Dash**: Do NOT use the em dash character (`—`) in generated user-facing text content.
- **Language**: Default to English for all content, unless explicitly requested otherwise or required by a specific use case.
- **Tone**: Maintain an informative, neutral, and objective tone. Do not use promotional or sales-oriented language.

---

## ⛔ Execution Limits (Important)
- **NEVER run the application locally** (no `npm run dev`, no E2E tests, no screenshots).
- You are **only allowed** to execute light syntax verification or build commands (e.g., `npx tsc`, `npm run build:shared`) to check for errors in your code.