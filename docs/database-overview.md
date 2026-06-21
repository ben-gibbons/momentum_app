# Database Overview

## Stack

**better-sqlite3** — synchronous SQLite bindings for Node.js. Chosen over async alternatives because synchronous writes are simpler in an Electron main process and SQLite on a local disk is fast enough that blocking is not a concern.

**Rebuild requirement**: `better-sqlite3` is a native module and must be rebuilt for Electron's Node.js ABI after install and after any Electron version upgrade:
```
npx @electron/rebuild
```
Run from `electron_app/`. Requires Visual Studio Build Tools with "Desktop development with C++" workload.

---

## DB File Location

The database lives in Electron's `userData` directory, set via `app.getPath('userData')` in `db.ts`. The folder name is the Electron app name, so **dev and the packaged app use separate databases**:
- **Dev** (`npm run dev`): `%APPDATA%\momentum_app\momentum.db` — app name comes from package.json `"name": "momentum_app"`.
- **Packaged app**: `%APPDATA%\Momentum\momentum.db` — app name comes from electron-builder `productName: Momentum`.

This split is intentional: dev/test data never bleeds into the installed app. Note the packaged app runs with `is.dev === false`, so the dev fixture seed (`seed.ts`) does **not** run — a fresh install starts with an empty DB (correct production behavior). Other notes:
- Survives app updates and is not wiped on reinstall.
- `getDb()` in `db.ts` is lazy — opens the DB on first call, returns the same instance after that.

---

## Configuration

**WAL (Write-Ahead Logging) mode** (`PRAGMA journal_mode = WAL`) is enabled on init:
- Reads don't block writes — instead of locking the whole database file during a write, WAL appends changes to a separate log file, so reads can continue against the last committed state uninterrupted
- More crash-resilient than the default rollback journal — SQLite's default mode modifies the database file in place and keeps a temporary backup; WAL writes to the log first, so the main file is never partially modified
- Better fit for a desktop app with a persistent background polling loop — the monitoring loop and the UI are always running concurrently; WAL is designed for this kind of mixed read/write workload
- In Momentum's case: the monitoring loop writes session data every app-switch while the renderer may be reading it to update the UI — WAL lets both happen at the same time without either waiting
- If the app crashes mid-write, WAL recovers cleanly on next open; the incomplete write is discarded and the last committed state is preserved

---

## Write Strategy

### How the poll reaches SQLite

Three layers work together every 10 seconds:

1. **Node.js (`read_window.ts`)** polls all visible (non-minimized, non-covered) windows and picks the front-most one. For Edge windows it pulls the URL from a shared map that the Python sidecar keeps populated.
2. **Python (`read-edge-url.py`)** runs as a persistent subprocess, sleeping 5s on startup then polling every 10s — offset to fire at the midpoint of each Node.js window, avoiding a race where both sample simultaneously and Node.js reads a stale URL. It reads the Edge address bar via UI Automation and pipes `{handle, url}` JSON to stdout.
3. **SQLite (`session-manager.ts`)** receives the `{ app, url }` result from each poll and decides whether to write.

### What triggers a write

SQLite is only written when the **foreground window changes** — meaning `data[0]` (the front-most visible window) has a different `app` or `url` than the previous poll. This is not "app exited" vs "app switched" — both look identical: whatever was in front is no longer in front. The outgoing session row is closed (`end_time` + `total_seconds` written) and a new one is opened.

If nothing changed, no write occurs. At 10s intervals with typical usage, this keeps writes far below the ~2,880/day that polling every interval would produce.

A **60s safety flush** runs independently — it updates `total_seconds` on the currently open row so a crash loses at most 60s of data.

One row per contiguous session, never one row per poll. Aggregation for trends and thresholds happens at query time, not write time — raw session data stays intact.

### On app exit

`stopSessionManager()` is called on Electron's `before-quit` event. It cancels the 60s flush timer and calls `closeSession()`, which writes `end_time` + `total_seconds` to the open row and sets `activeSession` to null. This ensures the session in progress at exit is closed cleanly rather than left as an open row with no `end_time`.

### Other notes

**`classify()`** is a stub returning `3` (not_sure) for everything. In V1 this is where allowed/disallowed list logic will live. Classification priority: unproductive always overrides productive or not_sure.

**URL edge case**: if Edge is freshly opened and the Python sidecar hasn't read the URL yet, the first poll produces `url=null`. The second poll (10s later) produces the real URL and triggers a session change, creating a short orphan row with no URL. Acceptable for V1 — refineable later.

---

## Schema

All timestamps are **Unix seconds (INTEGER)**. In Node.js: `Math.floor(Date.now() / 1000)`.

### `sessions`
```sql
CREATE TABLE sessions (
  id             INTEGER PRIMARY KEY,
  app            TEXT    NOT NULL,
  url            TEXT,                -- NULL for non-Edge apps
  classification INTEGER NOT NULL CHECK (classification IN (1, 2, 3)),
                                      -- 1=productive, 2=unproductive, 3=not_sure
  start_time     INTEGER NOT NULL,    -- Unix seconds
  end_time       INTEGER,             -- NULL while session is open
  total_seconds  INTEGER              -- written on close or safety flush
);
```

### `tasks`
```sql
CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY,
  type           TEXT    NOT NULL CHECK (type IN ('weekly', 'daily')),
  week_start     INTEGER,             -- Unix seconds, Monday of that week (weekly tasks)
  date           INTEGER,             -- Unix seconds for the day (daily tasks)
  parent_task_id INTEGER REFERENCES tasks(id),
  title          TEXT    NOT NULL,
  category       TEXT    CHECK (category IN ('work', 'personal', 'hobby', 'goal')),
  due_date       INTEGER,
  reminder_time  INTEGER,
  completed      INTEGER NOT NULL DEFAULT 0,
  completed_at   INTEGER
);
```

Completion lives on the **weekly task row** only. Daily task rows reference it via `parent_task_id`. Both views join on the weekly task to read completion state — one source of truth.

**Every daily task has a weekly parent.** A daily promoted from the weekly list links to its origin. A *written-in* daily task (typed directly into the daily list) auto-creates a matching weekly task in its own week and links to it — so it also appears in the weekly list. This keeps the invariant that completion always lives on a weekly row; there is no parent-less daily completion path. (Implemented in `repositories/tasks.ts` `create()`.)

### `task_steps`
The AI-generated ~20-minute breakdown of a task, surfaced by the home screen's "Steps" disclosure. Added for the V1 task UI / design handoff (not in the original schema). Steps attach to the **daily** task row they are shown under.
```sql
CREATE TABLE task_steps (
  id           INTEGER PRIMARY KEY,
  task_id      INTEGER NOT NULL REFERENCES tasks(id),
  ordinal      INTEGER NOT NULL,    -- easiest-first order
  text         TEXT    NOT NULL,
  est_minutes  INTEGER,             -- "~10 min"
  completed    INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER
);
```
The "next" step (highlighted with a Start button in the design) is the first incomplete step by `ordinal` — **computed at query time, not stored**.

### `procrastination_logs`
```sql
CREATE TABLE procrastination_logs (
  id                   INTEGER PRIMARY KEY,
  created_at           INTEGER NOT NULL,
  label                TEXT    NOT NULL,  -- e.g. "Procrastination - DD/MM/YY hh:mm"
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

### `log_steps`
```sql
CREATE TABLE log_steps (
  id                    INTEGER PRIMARY KEY,
  log_id                INTEGER NOT NULL REFERENCES procrastination_logs(id),
  step_number           INTEGER NOT NULL,
  description           TEXT,
  predicted_difficulty  INTEGER,           -- 0–100
  predicted_time_mins   INTEGER,
  predicted_satisfaction INTEGER,          -- 0–100
  actual_difficulty     INTEGER,
  actual_time_mins      INTEGER,
  actual_satisfaction   INTEGER            -- 0–100
);
```

### `risk_factors`
```sql
CREATE TABLE risk_factors (
  id          INTEGER PRIMARY KEY,
  factor      TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  recur_until INTEGER NOT NULL   -- Unix seconds; 14 days from created_at
);
```

Each morning the app checks `risk_factors` for rows where `recur_until >= today` and creates a task row in `tasks` if one doesn't already exist for that day.

A `risk_factors` instance is created **only when the user opts into recurrence** while selecting a factor (`repositories/riskFactors.ts` `select(catalogId, recur)`). Selecting a factor without recurrence just opens a seeded procrastination log and writes no `risk_factors` row.

### `risk_factor_catalog`
The selectable list of risk factors: a seeded set of defaults plus user-created custom entries. Distinct from `risk_factors` above (which holds *selected recurring instances*). Added for the V1 risk-factors UI.
```sql
CREATE TABLE risk_factor_catalog (
  id         INTEGER PRIMARY KEY,
  label      TEXT    NOT NULL UNIQUE,
  is_custom  INTEGER NOT NULL DEFAULT 0,   -- 0 = seeded default, 1 = user-created
  created_at INTEGER
);
```

### `distortions`
Static Burns cognitive-distortion list, selectable in the procrastination log flow. Seeded once at init; not user-editable. Added for the V1 CBT log UI.
```sql
CREATE TABLE distortions (
  id      INTEGER PRIMARY KEY,
  ordinal INTEGER NOT NULL,
  label   TEXT    NOT NULL
);
```

### `settings`
Minimal key/value app settings (greeting name, distraction-popup thresholds, feature toggles). Seeded with defaults: `user_name`, `threshold_unproductive` (120s), `threshold_notsure` (300s), `strict_mode` (0), `break_down_mode` (1).
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Adding Tables

All tables are created at app init by `initSchema()` in `db.ts` (idempotent `CREATE TABLE IF NOT EXISTS`): `sessions`, `tasks`, `task_steps`, `procrastination_logs`, `log_steps`, `risk_factors`, `risk_factor_catalog`, `distortions`, `settings`. All SQL lives in `db.ts` (schema) or `src/main/repositories/*` (queries) — nothing else touches the DB. In dev, `seed.ts` populates fixture data on first launch (when the `settings` table is empty).
