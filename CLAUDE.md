# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Momentum** is a Windows desktop productivity app (Electron/Node.js) that monitors active app and website usage, detects distraction, and prompts CBT-based interventions. The core monitoring loop is: detect foreground app → if Edge, read URL → classify as productive/unproductive/not-sure → trigger interventions at thresholds.

For the full problem statement, core concept, and V1–V4 feature scope, see [`docs/brainstorm-session-2026-05-15.md`](docs/brainstorm-session-2026-05-15.md). For the framework architecture decision (Electron), see [`docs/adr-001-electron-framework.md`](docs/adr-001-electron-framework.md).

The repo is currently in **build phase**. Both POC tests have passed. The Electron app scaffold is complete. Next step: local data storage (SQLite).

## Electron App Structure

The Electron app lives in `electron_app/`. Key source files in `src/main/`:

- **`index.ts`** — main process entry point. Creates the window, starts the monitoring loop.
- **`read_window.ts`** — polls visible windows every 10s using `get-windows` + `koffi` (`IsIconic`). Also spawns the Python sidecar and owns the `edgeUrls` map. Exports `readWindow(onPoll)`.
- **`read-edge-url.py`** — Python sidecar spawned by `read_window.ts`. Reads the Edge address bar via UI Automation, emits `{handle, url}` JSON lines to stdout. Copied from `poc/` — the original is retained there for reference.

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

- **Framework**: Electron (Node.js + TypeScript + React). Chosen because UI quality is a core retention mechanism for a distraction-prone user base — the full web design stack (Tailwind, Framer Motion, React component libraries, direct Figma handoff) is required to reach premium UI in V4+. Chromium performance overhead is the accepted trade-off; migrate to Tauri only if overhead proves a real user-facing problem, with the known caveat that Tauri uses WebKit on Mac (vs. Chromium on Windows), creating cross-platform rendering inconsistencies.
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

**Native module rebuild**: `get-windows` is a native module that must be rebuilt for Electron's Node.js ABI using `npx @electron/rebuild` from `electron_app/`. Requires Visual Studio Build Tools with the "Desktop development with C++" workload installed. Re-run after any Electron version upgrade. `koffi` uses N-API and does not need rebuilding.

## SQLite Write Strategy

Do not write to SQLite on every poll. At 10s intervals that is ~2,880 writes per 8-hour day before any V4 LLM overhead — unnecessary volume.

**Correct pattern:**
- Maintain an in-memory session object: `{ app, start_time, accumulated_seconds }`
- Write to SQLite on **app-switch**: close the outgoing session row, open a new one
- **Periodic safety flush** every 60–120 seconds to protect against crashes (upsert the open session row)
- Schema: one row per contiguous session — not one row per poll

**Aggregation:** Roll up to minutes at **query time** (for trends views and popup thresholds), not at write time. This keeps raw session data intact for future analysis while keeping the write volume low regardless of polling cadence.

## Database Schema

All timestamps are stored as **Unix seconds (INTEGER)**. SQLite's date functions use seconds by default, and Momentum's precision needs (sessions in seconds, 10s polling) do not require milliseconds. In Node.js, use `Math.floor(Date.now() / 1000)` when writing timestamps.

### `sessions` — monitoring data
```sql
CREATE TABLE sessions (
  id             INTEGER PRIMARY KEY,
  app            TEXT    NOT NULL,
  url            TEXT,                -- NULL for non-Edge apps
  classification INTEGER NOT NULL CHECK (classification IN (1, 2, 3)),
                                      -- 1 = productive, 2 = unproductive, 3 = not_sure
  start_time     INTEGER NOT NULL,    -- Unix seconds
  end_time       INTEGER,             -- NULL while session is open
  total_seconds  INTEGER              -- written on close or safety flush
);
```

### `tasks` — weekly and daily tasks
```sql
CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY,
  type           TEXT    NOT NULL CHECK (type IN ('weekly', 'daily')),
  week_start     INTEGER,             -- Unix seconds for Monday of that week (weekly tasks)
  date           INTEGER,             -- Unix seconds for the day (daily tasks)
  parent_task_id INTEGER REFERENCES tasks(id), -- daily task → weekly task
  title          TEXT    NOT NULL,
  category       TEXT    CHECK (category IN ('work', 'personal', 'hobby', 'goal')),
  due_date       INTEGER,
  reminder_time  INTEGER,
  completed      INTEGER NOT NULL DEFAULT 0,   -- 0 or 1; source of truth lives on the weekly task row
  completed_at   INTEGER
);
```

**Sync rule:** Completion status is stored only on the weekly task row. Daily task rows reference weekly tasks via `parent_task_id`. When a task is marked complete on either the daily or weekly view, write `completed = 1` to the weekly task row. Both views join on the weekly task to read completion state — one source of truth, no manual syncing required.

### `procrastination_logs` — CBT thought records
```sql
CREATE TABLE procrastination_logs (
  id                   INTEGER PRIMARY KEY,
  created_at           INTEGER NOT NULL,  -- Unix seconds
  label                TEXT    NOT NULL,  -- display name, e.g. "Procrastination - DD/MM/YY hh:mm"
  source               TEXT    CHECK (source IN ('manual', 'popup', 'risk_factor')),
  task_text            TEXT,
  emotion              TEXT,
  tempting_thought     TEXT,
  belief_before        INTEGER,           -- 0–100
  distortion           TEXT,              -- Burns list item
  self_control_thought TEXT,
  belief_self_control  INTEGER,           -- 0–100
  belief_after         INTEGER,           -- 0–100
  takeaways            TEXT,
  risk_factor          TEXT               -- NULL unless source = 'risk_factor'
);
```

### `log_steps` — task breakdown steps (1–3 per log)
```sql
CREATE TABLE log_steps (
  id                    INTEGER PRIMARY KEY,
  log_id                INTEGER NOT NULL REFERENCES procrastination_logs(id),
  step_number           INTEGER NOT NULL,  -- 1, 2, or 3
  description           TEXT,
  predicted_difficulty  INTEGER,           -- 0–100
  predicted_time_mins   INTEGER,
  predicted_satisfaction INTEGER,          -- 0–100
  actual_difficulty     INTEGER,           -- filled on return after work
  actual_time_mins      INTEGER,
  actual_satisfaction   INTEGER            -- 0–100
);
```

### `risk_factors` — recurring daily tasks auto-created from Risk Factors page
```sql
CREATE TABLE risk_factors (
  id          INTEGER PRIMARY KEY,
  factor      TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,  -- Unix seconds
  recur_until INTEGER NOT NULL   -- Unix seconds; 14 days from created_at
);
```

Each morning the app checks `risk_factors` for rows where `recur_until >= today` and generates that day's task row in the `tasks` table if one doesn't already exist.

## Task Tracking

All upcoming work items and next steps are tracked in `docs/to_do/project_next_steps.md`. Personal tasks unrelated to the project are tracked in `docs/to_do/personal_tasks.md`. Do not add "What Comes Next" lists to this file — keep CLAUDE.md focused on architecture, decisions, and implementation guidance.

## Session Start

At the start of every session, before doing anything else:

1. Read `.claude/last-good-morning.txt`
2. If the file doesn't exist, or the date inside it is not today's date, run `/good-morning` and then write today's date (YYYY-MM-DD) to `.claude/last-good-morning.txt`
3. If today's date is already in the file, skip `/good-morning` and proceed normally

This ensures `/good-morning` runs automatically on the first session of each day and is skipped on subsequent sessions.
