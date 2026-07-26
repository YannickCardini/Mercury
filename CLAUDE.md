# Project Instructions — Mercury

## 📌 Project Overview
Mercury is a real-time multiplayer board game (similar to Tock / Keezen) played with cards and marbles.
- Requires exactly 4 players per board.

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
- **Monorepo**: npm workspaces (`packages/shared`, `backend`, `frontend`).

---

## ⛔ Execution Limits (Important)
- **NEVER run the application locally** (no `npm run dev`, no E2E tests, no screenshots).
- You are **only allowed** to execute light syntax verification or build commands (e.g., `npx tsc`, `npm run build:shared`) to check for errors in your code.