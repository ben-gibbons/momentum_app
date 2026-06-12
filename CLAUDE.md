# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Momentum** is a Windows desktop productivity app (Electron/Node.js) that monitors active app and website usage, detects distraction, and prompts CBT-based interventions. The core monitoring loop is: detect foreground app → if Edge, read URL → classify as productive/unproductive/not-sure → trigger interventions at thresholds.

For the full problem statement, core concept, and V1–V4 feature scope, see [`docs/brainstorm-session-2026-05-15.md`](docs/brainstorm-session-2026-05-15.md). For the framework architecture decision (Electron), see [`docs/adr-001-electron-framework.md`](docs/adr-001-electron-framework.md). For an entry-level overview of the full stack and how the processes communicate, see [`docs/full-stack-overview.md`](docs/full-stack-overview.md). For the database schema, write strategy, and SQLite configuration, see [`docs/database-overview.md`](docs/database-overview.md).

The repo is currently in **build phase**. Both POC tests have passed. The Electron app scaffold is complete. SQLite storage is wired up. Next step: Daily/Weekly Task UI.

## Electron App Structure

The Electron app lives in `electron_app/`. Key source files in `src/main/`:

- **`index.ts`** — main process entry point. Creates the window, starts the monitoring loop, starts/stops the session manager.
- **`read_window.ts`** — polls visible windows every 10s using `get-windows` + `koffi` (`IsIconic`). Also spawns the Python sidecar and owns the `edgeUrls` map. Exports `readWindow(onPoll)`.
- **`read-edge-url.py`** — Python sidecar spawned by `read_window.ts`. Reads the Edge address bar via UI Automation, emits `{handle, url}` JSON lines to stdout. Copied from `poc/` — the original is retained there for reference.
- **`db.ts`** — opens the SQLite DB (lazy singleton), creates tables on first launch. All DB access goes through `getDb()`.
- **`session-manager.ts`** — translates the poll stream into SQLite session rows. Detects app-switches, writes rows, runs a 60s safety flush.

The renderer (`src/renderer/src/`) uses React + Tailwind CSS v4 (via `@tailwindcss/vite`). IPC from main to renderer goes through `src/preload/index.ts` via contextBridge.

## Running the POC

### Test 1 — Foreground app detection (Node.js)
```
cd poc
npm install
node test-active-win.mjs
```

### Test 2 — Edge URL reading (Python)
```
pip install pywinauto
python poc/inspect-edge-tree.py   # Step 1: find address bar AutomationId
python poc/read-edge-url.py       # Step 2: poll URLs
```

Run `inspect-edge-tree.py` first to confirm `ADDRESS_BAR_AUTO_ID` (`view_1021` by default) on the target machine.

## Architecture Decisions (do not revisit without PM approval)

- **Framework**: Electron (Node.js + TypeScript + React). See [`docs/adr-001-electron-framework.md`](docs/adr-001-electron-framework.md) for full rationale.
- **Browser monitoring approach**: Window enumeration via `get-windows` + `koffi` (`IsIconic`) for visibility, and a Python sidecar (`pywinauto`) for Edge URL reading. Window title alone was insufficient — it returns the page title, not the URL, making classification ambiguous. The Python sidecar runs as a persistent subprocess, polls the Edge address bar via UI Automation every 10s (with a 5s initial offset so it fires at the midpoint of each Node.js poll interval), and emits JSON lines `{handle, url}` to Node.js via stdout.
- **Browser support**: Edge only in V1
- **Polling interval**: 10 seconds (confirmed V1). Range 1–10s under evaluation; default starts at 10s and may be tuned based on feel. Tracking granularity is second-level — 10s polling captures micro-distractions (attention breaks under 30s) that matter for CBT intervention.
- **Classification priority**: Unproductive always overrides Productive or Not-Sure. If multiple Edge windows are open and any is on a disallowed site, the poll interval is recorded as Unproductive.
- **Monitoring lifecycle**: The monitoring loop runs whenever the Momentum app process is open — including when the window is minimized or behind other windows. Polling stops only when the user exits the app. There is no persistent system tray process; exit = stop.
- **Not-Sure scope (V1)**: Not-Sure applies only to apps/sites not on either the allowed or disallowed list (with Strict Mode off). Inactivity-based Not-Sure (no mouse/keyboard input on an allowed site → flip to Not-Sure) is deferred to V4 — do not implement in V1–V3.
- **No AI in the monitoring layer**: Algorithmic threshold rules only in V1
- **No website hard-blocking in V1**

## Key POC Implementation Details

**Window detection**: Edge's window title contains a zero-width space (U+200B) between "Microsoft" and "Edge", so exact string matching fails. In `test-active-win.mjs`, `isEdge()` uses `includes('msedge')` on the exe path to avoid this. In `read-edge-url.py` and `inspect-edge-tree.py`, filtering uses `'microsoft' in title.lower() and 'edge' in title.lower()`.

**Visibility check**: A window is polled only if it is not minimized AND is the topmost window at its own center point. In `test-active-win.mjs`, minimized detection uses `koffi` + `IsIconic` (Win32) — `get-windows` returns restored bounds regardless of minimized state, so the `-32000` sentinel position approach is unreliable. Occlusion is detected via a pure-JS z-order bounds check (`isCovered`). In `read-edge-url.py`, the same checks are done via `ctypes` `IsIconic` and `WindowFromPoint` + `GetAncestor`.

**Address bar lookup**: Located by `AutomationId` (`view_1021`), not by title — the title changes to the live URL. `UIAWrapper` objects from `desktop.windows()` don't support `child_window()`; convert to `WindowSpecification` first via `desktop.window(handle=w.handle)`.

**`ADDRESS_BAR_AUTO_ID` resilience**: `view_1021` is hardcoded in `read-edge-url.py`. If Edge URL polling ever stops returning values after an Edge update, this is the first thing to check — run `inspect-edge-tree.py` to find the new AutomationId and update the constant. In the full Electron app, verify the address bar is reachable on startup and surface a clear error if not. **Open decision:** determine whether `inspect-edge-tree.py` logic should be bundled into the app as an auto-diagnostic that detects and recovers from AutomationId changes without requiring an app update.

**`inspect-edge-tree.py`** is a dev-only diagnostic tool — not part of the app. Run it when `read-edge-url.py` stops working to identify the current address bar AutomationId. It is not a required step during normal setup.

**Python sidecar polling**: `read-edge-url.py` uses a 5s initial delay then polls every 10s — one sample per Node.js poll window, timed at the midpoint. This avoids a race condition where Python and Node.js fire simultaneously and Node.js reads a stale value, while keeping CPU cost minimal (one `pywinauto` call per 10s window).

## Key Electron App Implementation Details

**Monitoring implementation**: `read_window.ts` + `read-edge-url.py` sidecar is a direct port of the POC (`test-active-win.mjs` + `poc/read-edge-url.py`). The logic is identical — adapted to TypeScript with types added.

**Zero-bounds shell window filter**: `openWindows()` returns Windows shell windows (desktop background, taskbar) with `bounds: {width: 0, height: 0}`. These are not minimized so `IsIconic` doesn't catch them. Filter them out with `w.bounds.width > 0 && w.bounds.height > 0` before the `IsIconic` check in `read_window.ts`.

**tsconfig.web.json**: The scaffold template shipped with `"baseUrl": "."` which is deprecated in TypeScript 5.0+. This has been removed — `paths` entries use explicit `./` prefixes instead (`"@renderer/*": ["./src/renderer/src/*"]`). Do not re-add `baseUrl`.

**Native module rebuild**: `get-windows` and `better-sqlite3` are native modules that must be rebuilt for Electron's Node.js ABI using `npx @electron/rebuild` from `electron_app/`. Requires Visual Studio Build Tools with the "Desktop development with C++" workload installed. Re-run after any Electron version upgrade. `koffi` uses N-API and does not need rebuilding.

## SQLite Write Strategy

Do not write to SQLite on every poll. At 10s intervals that is ~2,880 writes per 8-hour day before any V4 LLM overhead — unnecessary volume.

**Correct pattern:**
- Maintain an in-memory session object: `{ app, start_time, accumulated_seconds }`
- Write to SQLite on **app-switch**: close the outgoing session row, open a new one
- **Periodic safety flush** every 60–120 seconds to protect against crashes (upsert the open session row)
- Schema: one row per contiguous session — not one row per poll

**Aggregation:** Roll up to minutes at **query time** (for trends views and popup thresholds), not at write time. This keeps raw session data intact for future analysis while keeping the write volume low regardless of polling cadence.

For full detail on how the polling layers feed into SQLite, what triggers a session close, and how exit is handled cleanly, see the Write Strategy section in [`docs/database-overview.md`](docs/database-overview.md).

## Database Schema

Full schema (all tables, columns, constraints, write strategy) is in [`docs/database-overview.md`](docs/database-overview.md).

**Key rules:**
- All timestamps are Unix seconds (INTEGER). In Node.js: `Math.floor(Date.now() / 1000)`.
- Completion status lives only on the weekly task row. Daily task rows read it via `parent_task_id` join — one source of truth, no manual syncing.

## Task Tracking

All upcoming work items and next steps are tracked in `docs/to_do/project_next_steps.md`. Personal tasks unrelated to the project are tracked in `docs/to_do/personal_tasks.md`. Do not add "What Comes Next" lists to this file — keep CLAUDE.md focused on architecture, decisions, and implementation guidance.

## Session Start

At the start of every session, before doing anything else:

1. Read `.claude/last-good-morning.txt`
2. If the file doesn't exist, or the date inside it is not today's date, run `/good-morning` and then write today's date (YYYY-MM-DD) to `.claude/last-good-morning.txt`
3. If today's date is already in the file, skip `/good-morning` and proceed normally

This ensures `/good-morning` runs automatically on the first session of each day and is skipped on subsequent sessions.
