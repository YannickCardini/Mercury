# Project Instructions — Mercury

## 📌 Project Overview
Mercury is a real-time multiplayer board game (similar to Tock / Keezen) played with cards and marbles.
- Requires exactly 4 players per board (solo, custom room or matchmaking). It is always played as 2v2 teams (unnamed teams: red+blue vs green+orange).
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

**Versioning rule**: whenever you modify any file in `packages/shared`, before finishing your task, increment the **patch** version in `packages/shared/package.json` (e.g. `2.2.10` -> `2.2.11`). Do it once per task, not once per edited file.

- **`packages/shared/src/`** — code shared verbatim by client and server: `types.ts` (WebSocket protocol messages, `ClientMessage`/`ServerMessage`), `board-config.ts`, `move-validator.ts`, `teams.ts`, `constants.ts`. Game **rules** live here so client-side UI checks and server-side authority can't drift apart. It does **not** hold user/account types — those are declared separately (and currently duplicated) in `backend/src/auth/auth-router.ts` and `frontend/src/app/services/auth.service.ts` / `frontend/src/app/profile/profile.page.ts`.

- **`backend/`** — Node/Express + `ws` (raw WebSocket, no socket.io), TypeScript, run via `tsx` in dev / compiled to `dist` for prod.
  - `src/index.ts` — HTTP server + WebSocket upgrade handling, top-level routing of WS "setup" messages (`joinMatchmaking`, `createCustomRoom`, `joinCustomRoom`, `registerPresence`, `joinGame`), CORS/origin allowlist, per-IP connection cap, heartbeat/zombie-socket cleanup.
  - `src/game/` — the game engine itself: `game.ts` (turn/move/win logic), `deck.ts`, `player.ts`, `player-strategy.ts` + `ai-strategy.ts`/`human-strategy.ts` (bot decision-making), `game-messenger.ts` (per-player WS fan-out), `game-snapshot.ts`, `points.ts` (Elo-like scoring). Has the only real unit test suite in the repo (`*.test.ts`, run with `node --test` via `tsx`).
  - `src/session/` — everything above a single game: `session-manager.ts` (entry point used by `index.ts`), `matchmaking-manager.ts`, `custom-game-manager.ts`, `game-registry.ts` (in-memory `gameId → Game`), `reconnect-registry.ts` (guest/user → active game, survives socket drops), `presence-manager.ts` (userId → open sockets, for pushing invites), `bot-dispatch.ts`, `game-restore.ts` (rehydrates `GameRegistry` from blob snapshots on boot).
  - `src/auth/` — `auth-router.ts` (Google/bot/worker login, profile CRUD, avatar upload, leaderboard — all under `/api/auth`), `session-token.ts` (hand-rolled HS256 JWT, no external JWT lib).
  - `src/storage/` — `blob.ts` (Azure Blob: avatars), `snapshot-store.ts` (Azure Blob: per-turn game snapshots for crash/redeploy recovery).
  - `src/db.ts` — the only file that touches Cosmos DB; owns all three containers (`users`, `messages`, `guests`) and all cross-cutting user-document writes (points, ranking, activity). Prefer adding a function here over reading/writing `Container` objects ad hoc elsewhere.
  - `src/messages/` — simple inbox/DM feature (`messages-router.ts`), separate Cosmos container.
  - `src/train-mode.ts` — server-wide training/debug mode switch.

- **`frontend/`** — Angular (standalone components) + Ionic, deployed both as a responsive web app and, via Capacitor, as the Android app (`frontend/android/`).
  - `src/app/home/`, `src/app/game/`, `src/app/profile/`, `src/app/leaderboard/`, `src/app/delete-account/`, `src/app/privacy/` — one folder per route/page.
  - `src/app/services/` — `auth.service.ts` (Google sign-in, session token storage in `localStorage`, profile CRUD calls), `presence.service.ts` (the always-on WS used for cross-device invites while idle on home), plus the WS client(s) used inside an active game.
  - `src/app/shared/`, `src/app/styles/` — shared UI components and the `--m-*`/`$c-*` design tokens (see project memory on design identity — tokens described in docs are not fully reflected in code yet).
  - `frontend/content/` — a **separate**, non-Angular static site for SEO (landing pages, `/rules/*`), built by `content/build.mjs`, not part of the Angular app bundle.

### Persistence — Azure only, no SQL
- **Cosmos DB (SQL/Core API)**, not Table Storage: database `mercury-db`, containers `users` (partition key `/id`), `messages` (partition key `/toUserId`) and `guests` (partition key `/id`, one record per guest installation keyed by its `browser_id`, deleted by a 90-day TTL that restarts at each guest game). Local dev uses the Cosmos emulator via Azurite-compatible connection string (`COSMOS_CONNECTION_STRING`), TLS verification disabled outside `NODE_ENV=production`.
- **Azure Blob Storage** for binary/large state: avatar images (`avatars` container, public blob read) and per-turn game snapshots (used to rehydrate `GameRegistry` after a restart, see project memory on snapshot persistence).
- Write style matters here: prefer targeted Cosmos `patch` ops over read-then-`replace()` of the whole user document — a full replace from a stale read can silently clobber fields (`points`, `ranking`, `lastSeenAt`, …) written concurrently by another request (e.g. `recomputeRankings()` runs after every game end/disconnect/abandon and touches every user document).

### Realtime protocol
Single raw `WebSocket` per client (no socket.io/Engine.IO). Message shape is the discriminated-union `ClientMessage`/`ServerMessage` from `@mercury/shared`. Auth on the socket is per-message, not at the HTTP upgrade: most setup messages carry an `authToken` verified via `verifyAuth()` (accepts either the backend's own long-lived session token or, as a fallback, a fresh Google ID token); `joinGame` (reconnection) instead trusts the server-side `ReconnectRegistry`, since the reconnecting client may not have a token handy.

---

> **Before creating or editing ANY overlay, modal, popover or full-screen scrim, read the next section ("Known trap: one-frame overlay flash on Android") and apply its checklist. This bug has regressed several times and cannot be seen in a browser.**

## ⚠️ Known trap: one-frame overlay flash on Android (regressed several times)

**Symptom.** On the Android app only (Capacitor WebView), a modal/popover/overlay opens fine, then roughly 0.3 s later, right when its entrance transition ends, the page behind it shows at full brightness for ONE frame (about 33 ms at 30 fps), as if the scrim were removed or the page remounted. The overlay itself does not flicker. Web and desktop are unaffected, so it is never visible in a browser. Fixed for the rules modal on 2026-10-13 (confirmed on device). It has already come back several times after overlays were restyled, so treat it as a known trap.

**Root cause (compositing layers).** An entrance transition on `opacity` and `transform` gives the scrim and the card their own compositing layers while it runs. When it ends, nothing keeps those layers (opacity is 1, `transform` is `none` or identity), so the WebView drops them and re-merges scrim and card background into a new layer, and re-rasterizes the card body. For a tall card with scrolling content this does not fit in one frame, and the WebView presents a frame whose new layer is still empty. Desktop Chrome waits for the pixels, so the bug exists only on Android. Heavier cards (long scrolling body) and any restyle that adds a transform end state make it worse, which is why it returns after design changes.

**Rules for any new or modified overlay, modal or popover.**
1. A full-screen overlay that fades in (`opacity` transition) with a card that animates `transform`/`opacity` must keep both layers alive while open. Add the native-only block at the end of its stylesheet:
   ```scss
   :host(.is-native) .my-overlay.active {
     will-change: opacity;
     .my-card { will-change: transform, opacity; }
   }
   ```
   and the host class in the component: `host: { "[class.is-native]": "isNative" }` with `readonly isNative = Capacitor.isNativePlatform();`. Reference implementation: `frontend/src/app/shared/game-rules-modal.component.{ts,scss}`.
2. Set `will-change` on the OPEN state only (`.active`), so nothing is kept alive while closed. Never gate it on a delay or JS timer.
3. Never create or destroy a layer mid-animation: no toggling `filter`/`backdrop-filter`, no adding `will-change` after the transition starts, no `mix-blend-mode` inside the overlay. `backdrop-filter` is banned on overlays (scrims use `m.scrim`, no blur).
4. Keep Android-only fixes under `:host(.is-native)` so web/desktop stay untouched.
5. Do not apply this to tiny non-scrolling elements (toasts); the cost is memory, the benefit is only for full-screen scrims with cards.

**Where it is applied today:** rules modal, all home modals (`.modal-overlay` in `home.page.scss`: profile, About, matchmaking, custom game), update-available modal. Not applied, by choice: the profile page and shop confirmation modals (opacity-only, small card, no transform; add the same block if a flash is reported there), and in-game overlays handled by their own fixes (`table.component.scss` `:host(.is-native)`, emoji and boost-dock stable layers).

**How to recognize it.** The user reports a one-frame flash on Android, found by frame-stepping a screen recording, shortly after an overlay finishes opening; only the overlay's page behind it flashes. Check first: did a recent commit change the overlay's transition, its end `transform`, its scrim, or its card height or content? Check that its stylesheet still contains the `:host(.is-native)` block above.

**Review checklist (run it on every overlay change, even a pure restyle):** (a) the overlay's stylesheet still has the `:host(.is-native)` `will-change` block; (b) the host class `is-native` is still bound in its component; (c) no `backdrop-filter`, `filter` toggle or `mix-blend-mode` was added; (d) a NEW overlay got the block from the start. If you add a new overlay and skip this, the flash will return.

**Quick fix if it shows up again.** Add the block from rule 1 to the overlay's stylesheet and the `is-native` host class to its component, build, and have the user test on device (open and close it several times). Do not try JS timers, `translateZ(0)` on the card, or restructuring the DOM first.

Related, same family of Android compositing flashes already fixed in the game screens: see the `is-native` blocks and "stable layer" comments in `board.component.scss`, `table.component.scss`, `emoji-reactions.component.scss`, `boost-dock.component.scss`.

---

## 📝 Content Generation Rules
- **No Em Dash**: Do NOT use the em dash character (`—`) in generated user-facing text content.
- **Language**: Default to English for all content, unless explicitly requested otherwise or required by a specific use case.
- **Tone**: Maintain an informative, neutral, and objective tone. Do not use promotional or sales-oriented language.

---

## ⛔ Execution Limits (Important)
- **NEVER run the application locally** (no `npm run dev`, no E2E tests, no screenshots).
- You are **only allowed** to execute light syntax verification or build commands (e.g., `npx tsc`, `npm run build:shared`) to check for errors in your code.