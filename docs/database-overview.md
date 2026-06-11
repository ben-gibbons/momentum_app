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

The database lives in Electron's `userData` directory:
- **Windows path**: `%APPDATA%\momentum\momentum.db`
- Set via `app.getPath('userData')` in `db.ts`
- Survives app updates and is not wiped on reinstall
- `getDb()` in `db.ts` is lazy — opens the DB on first call, returns the same instance after that

---

## Configuration

**WAL (Write-Ahead Logging) mode** (`PRAGMA journal_mode = WAL`) is enabled on init:
- Reads don't block writes
- More crash-resilient than the default rollback journal
- Better fit for a desktop app with a persistent background polling loop

---

## Write Strategy

Do not write on every poll. At 10s intervals that's ~2,880 writes per 8-hour day.

**Correct pattern:**
- Maintain an in-memory session: `{ app, url, classification, start_time }`
- Write to SQLite on **app-switch**: close the outgoing session row (write `end_time` + `total_seconds`), open a new one
- **Safety flush** every 60s: update `total_seconds` on the open row — crash loses at most 60s of data
- One row per contiguous session — not one row per poll

**Aggregation** for trends/thresholds happens at query time, not write time. Raw session data stays intact.

## Session Manager (`session-manager.ts`)

Translates the poll stream from `read_window` into SQLite session rows. On each poll it checks whether the app or URL changed. If unchanged, the session is still running — do nothing. If changed, close the outgoing row and open a new one.

`startSessionManager()` starts the 60s flush timer — call on app launch. `stopSessionManager()` cancels the timer and closes the open session row cleanly — call on `before-quit`.

**`classify()`** is a stub returning `3` (not_sure) for everything. In V1 this is where allowed/disallowed list logic will live. Classification priority: unproductive always overrides productive or not_sure.

**URL edge case**: if Edge is freshly opened and the Python sidecar hasn't read the URL yet, the first poll produces `url=null`. The second poll (10s later) produces the real URL and triggers an app-switch, creating a short orphan row with no URL. Acceptable for V1 — refineable later.

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

---

## Adding Tables

Only `sessions` is created at app init currently (`db.ts`). Remaining tables will be added to `db.ts` as their features are built out.
