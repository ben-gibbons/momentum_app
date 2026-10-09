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

This split is intentional: dev/test data never bleeds into the installed app. Note the packaged app runs with `is.dev === false`, so the dev fixture seed (`seed.ts`) does **not** run — a fresh install starts with an empty DB apart from what the migrations write (the default Productive / Unproductive lists; see Migrations), which is correct production behavior. Other notes:
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

1. **Node.js (`read_window.ts`)** enumerates every on-screen window (non-zero bounds, not minimized) and hands the session manager **all visible windows, front-most first** — not just the front one. A window is visible if no higher-z-order window covers its centre point. Windows shell windows (anything under `%WINDIR%\SystemApps\` or `%WINDIR%\ImmersiveControlPanel\` — Start, Search, Settings) take part in the occlusion check (a maximized Settings covering Edge means the user isn't looking at Edge) but are then dropped from the list, so time in them reads as "no visible window". Momentum's own window is tracked like any other app under the stable name **"Momentum App"** (the exe reports `Electron` in dev and `Momentum` packaged). Edge windows get a `url` key filled from a shared map that the Python sidecar keeps populated; the key is `undefined` until the sidecar has read that window.
2. **Python (`read-edge-url.py`)** runs as a persistent subprocess, sleeping 5s on startup then polling every 10s — offset to fire at the midpoint of each Node.js window, avoiding a race where both sample simultaneously and Node.js reads a stale URL. It matches Edge by **process image** (`msedge.exe`), not window title (an Edge Workspace window is titled by the workspace name), skips minimized and covered windows using the same centre-point rule as Node, and reads the address bar via UI Automation, piping `{handle, url}` JSON lines to stdout. A window with no address bar (a site saved as an Edge app, picture-in-picture, undocked DevTools) is reported as `noOmnibox` and skipped from then on — confirmed on the first miss when the title identifies it (`" | AppName"`, "Picture in picture", "DevTools"), otherwise only after three consecutive misses so one slow read can't mislabel a normal window; skipped windows are re-probed every five minutes. An empty address bar is reported as `emptyOmnibox` (the New Tab page). On the Node side: a `noOmnibox` window is recorded as a plain app named from its title ("Hulu - App | Hulu" → "Hulu", or "Edge - Picture in picture" / "Edge - DevTools"); an `emptyOmnibox` window is the app "Edge - New tab"; a read `error` keeps the last good URL for up to three consecutive failures, then drops it (so an Edge update that breaks the lookup degrades that window to not-sure rather than freezing it on its last site). Every Edge channel (Beta/Dev/Canary report their own names) is recorded as "Microsoft Edge". A sidecar that exits within seconds of starting three times in a row (pywinauto missing) is not respawned again that session; one clear error names the fix.
3. **SQLite (`session-manager.ts`)** receives the `MonitorData[]` list from each poll, classifies it (`classifier.ts`), and decides whether to write.

### What triggers a write

Every poll is classified (settings and rules are re-read each time — two trivial queries — so a Settings edit takes effect at the next poll with no cache). The result is a single `(app, url, classification)` for the poll. SQLite is written only when that **identity differs from the open row** on any of the three fields: the outgoing row is closed (`end_time` + `total_seconds` written) and a new one opened. This is not "app exited" vs "app switched" — both look identical: whatever was in front is no longer in front.

Because classification is part of the identity, a **rule edit self-heals** at the next poll: the same app/site now classifies differently, so the open row is closed and a fresh row opens under the new classification. Nothing is rewritten in place for the live row.

An **empty poll** (no visible window — bare desktop, or only shell windows on screen) opens a row with `app = 'Desktop'`, `url = NULL`, classification not-sure. `Desktop` is excluded from the Settings reclassify list.

If nothing changed, no write occurs. At 10s intervals with typical usage, this keeps writes far below the ~2,880/day that polling every interval would produce.

A **60s safety flush** runs independently — it updates `total_seconds` on the currently open row so a crash loses at most 60s of data.

One row per contiguous session, never one row per poll. Aggregation for trends and thresholds happens at query time, not write time — raw session data stays intact.

### On app exit

`stopSessionManager()` is called on Electron's `before-quit` event. It cancels the 60s flush timer and calls `closeSession()`, which writes `end_time` + `total_seconds` to the open row and sets `activeSession` to null. This ensures the session in progress at exit is closed cleanly rather than left as an open row with no `end_time`.

### Lock, sleep, crashes

A row is only ever closed by `closeSession()`, so three paths exist for the cases where the normal exit hook doesn't run:

- **Lock screen / sleep** (`index.ts`, via Electron's `powerMonitor`): `lock-screen` and `suspend` both close the open row at that moment and stop everything — the session manager ignores polls (`suspendMonitoring`), the 10s window enumeration stops, and the Python sidecar is killed (`pauseMonitoring`). The window list doesn't change behind a lock screen, so without this the front app would keep accruing. Resume restarts polling and spawns a fresh sidecar — but `locked` outranks sleep: a laptop that was locked, slept, and woke is still locked, so `resume` (wake) does nothing while locked and only `unlock-screen` restarts monitoring. Lock followed by sleep is one pause, not two.
- **Silent poll gap** (`session-manager.ts` `onPoll`): belt and braces for a sleep the OS didn't announce. If more than `MAX_GAP_SECS` (60 s, shared with the threshold detector) passed since the last poll, the open row is closed **at the last poll's timestamp**, not now, so the gap isn't billed to whatever was in front when the machine went away.
- **Orphan cleanup at startup** (`closeOrphanRows()`, called from `startSessionManager`): a crash, `taskkill`, or a dev reload skips `before-quit` and leaves a row with `end_time IS NULL`. Today's totals treat an open row as "running until now", so a leftover one from yesterday would read as hours of phantom time. On every startup, each row with `end_time IS NULL` is closed at `start_time + COALESCE(total_seconds, 0)` — i.e. at its last safety flush, or at its start if it never flushed (at most 60 s lost).

### Other notes

**Classification** (`classifier.ts`, pure — no Electron or DB imports, unit-tested with vitest). One window is classified in this order:

1. **Site rule** — the URL's lowercase hostname (minus `www.`) matched against `site` rules by suffix at a dot boundary: `host === pattern` or `host.endsWith('.' + pattern)`, so `x.com` does not match `netflix.com`. The **longest matching pattern wins**, so `music.youtube.com → productive` can override `youtube.com → unproductive`.
2. **App rule** — exact match of the lowercase app name against `app` rules.
3. **Browser window with no readable host** — sidecar lag, an `edge://` URL, or the address bar mid-typing. Always not-sure, even in strict mode; "unknown" is not "unlisted". These rows never count toward a nudge and are excluded from "Not sure yet" (the only thing to sort them as would be the browser itself, which `rules.add()` refuses). The New Tab page and address-bar-less Edge windows are *not* in this group — they are recorded as apps ("Edge - New tab", "Hulu", "Edge - Picture in picture") and classify, nudge and sort like any app.
4. **Unlisted** — unproductive if strict mode is on, otherwise not-sure.

Across the whole poll, **any unproductive window anywhere wins** (the spec's "unproductive always overrides"), and that window's app/url become the row's identity. Otherwise the **front window decides** — an unlisted site in front stays not-sure even with a productive app visible on another monitor, so it accrues toward the not-sure nudge and surfaces in "Not sure yet".

**Reclassifying** (`repositories/classificationRules.ts` `add()`): adding a rule — from the Settings lists or from the "Not sure yet" list — upserts the rule and, in the same transaction, rewrites every past **not-sure** session row that matches it (`app_key = pattern` for app rules; `host = pattern OR host LIKE '%.' || pattern` for site rules, with `%`/`_` escaped). Removing a rule never reverts rows. `listNotSure()` only looks back 30 days (`NOT_SURE_WINDOW_DAYS`) and excludes `Desktop` and the browser's host-less rows (an app rule for Edge would whitelist every unlisted site).

**URL edge case**: if Edge is freshly opened and the Python sidecar hasn't read the URL yet, the first poll produces `url=null` (a host-less browser row, not-sure). The second poll (10s later) produces the real URL and triggers a session change, creating a short row with no URL. Acceptable for V1 — refineable later.

---

## Schema

All timestamps are **Unix seconds (INTEGER)**. In Node.js: `Math.floor(Date.now() / 1000)`.

### `sessions`
```sql
CREATE TABLE sessions (
  id             INTEGER PRIMARY KEY,
  app            TEXT    NOT NULL,    -- display casing; 'Desktop' when nothing is visible
  url            TEXT,                -- NULL for non-Edge apps
  classification INTEGER NOT NULL CHECK (classification IN (1, 2, 3)),
                                      -- 1=productive, 2=unproductive, 3=not_sure
  start_time     INTEGER NOT NULL,    -- Unix seconds
  end_time       INTEGER,             -- NULL while session is open
  total_seconds  INTEGER,             -- written on close or safety flush
  host           TEXT,                -- added by migration 1 (ALTER TABLE)
  app_key        TEXT                 -- added by migration 4 (ALTER TABLE)
);
CREATE INDEX idx_sessions_start_time ON sessions (start_time);   -- migration 1
```

`host` is the lowercase hostname of `url` minus `www.` (NULL when there is none), written once at insert by `hostOf()`. SQLite has no hostname function, and `url LIKE '%youtube.com%'` would match `notyoutube.com`, so this column is what makes the retroactive reclassify `UPDATE` and the not-sure `GROUP BY host` exact. Migration 1 backfills it for older rows.

`app_key` is `app` lowercased **in JS** at insert. SQLite's `lower()` is ASCII-only (no ICU), so `lower(app) = ?` could never match a JS-lowercased rule pattern for a name with non-ASCII capitals ("Éditeur"). All app matching in SQL (reclassify, the not-sure grouping) goes through `app_key`; `app` keeps the display casing. Migration 4 backfills it.

`idx_sessions_start_time` bounds the 30-day scan behind "Not sure yet" and the today/trends queries.

### `classification_rules`
The user's Productive (1) / Unproductive (2) lists, read by the classifier on every poll. Created by migration 1; the default starter lists are inserted by migration 3. `pattern` is stored lowercase (`normalizePattern()`): a site pattern is the bare hostname (no scheme/path/`www.`/leading `*.`) matched at a dot boundary; an app pattern is the lowercase `get-windows` owner name. `UNIQUE (kind, pattern)` lets `add()` upsert, so re-adding an existing pattern flips its classification instead of duplicating it.
```sql
CREATE TABLE IF NOT EXISTS classification_rules (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('app', 'site')),
  pattern        TEXT    NOT NULL,
  classification INTEGER NOT NULL CHECK (classification IN (1, 2)),
  created_at     INTEGER NOT NULL,
  UNIQUE (kind, pattern)
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
Minimal key/value app settings (greeting name, distraction-popup thresholds and cooldowns, feature toggles). Keys: `user_name`, `threshold_unproductive` (120 s), `threshold_notsure` (300 s), `cooldown_unproductive` (240 s), `cooldown_notsure` (600 s), `strict_mode` (`0`/`1`), `monitoring_enabled` (`0`/`1`, default on — the Settings "Distraction popup" switch; off stops polling, the sidecar, session rows and nudges entirely, see `monitoring.ts`), `break_down_mode`. Values are stored as strings. `getAll()` also clamps durations (thresholds ≥ 10 s, each cooldown ≥ its threshold) so no writer — the Settings UI, DevTools, a hand-edited DB — can produce a cooldown that re-fires every poll. Rows are **not** required to exist: `settings.getAll()` fills any missing or unparsable key from `DEFAULTS` in `repositories/settings.ts` (the values in brackets above), so a packaged build — which has no seeded rows — behaves sensibly. Only dev fixtures (`seed.ts`) write the full set up front; a user's Settings edit upserts just the key that changed. Migration 6 split the old single `popup_cooldown` key into the two `cooldown_*` keys.
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Migrations

`getDb()` runs two steps on first call, in order, and fresh and existing DB files take the identical path:

1. **`initSchema()`** — the frozen **v0 baseline**: idempotent `CREATE TABLE IF NOT EXISTS` for `sessions`, `tasks`, `task_steps`, `procrastination_logs`, `log_steps`, `risk_factors`, `risk_factor_catalog`, `distortions`, `settings`. Nothing is ever added here.
2. **`migrate()`** — reads `PRAGMA user_version` (0 on a fresh file) and applies `MIGRATIONS[i]` for every `i >= user_version`, bumping the version after each. Each step runs inside a single transaction **with the version bump**, so a failed step leaves the file untouched at its previous version. A failed migration fails every launch; `getDb()` closes the handle and throws an error naming the file (in dev the fix is deleting it — fixtures regenerate).

The six shipped steps (`user_version` after each in brackets):

| Step | What it does |
|---|---|
| 0 → 1 | Creates `classification_rules`, adds `sessions.host` (guarded `ALTER TABLE` — SQLite has no `ADD COLUMN IF NOT EXISTS`), creates `idx_sessions_start_time`, backfills `host` from `url` for existing rows. |
| 1 → 2 | No-op. An unshipped dev step that cleared an earlier seed; kept so dev DBs already at version 2 line up with fresh ones. |
| 2 → 3 | Seeds the default Productive / Unproductive starter lists into `classification_rules` with `INSERT OR IGNORE` (a user who removed one isn't re-seeded; an existing pattern keeps its own classification). Contents are a placeholder pending the product decision in `docs/roadmap.md`. |
| 3 → 4 | Adds `sessions.app_key` (guarded `ALTER TABLE`) and backfills it with the JS-lowercased `app`. |
| 4 → 5 | Momentum's own window becomes a normal app named "Momentum App": adds the `('app', 'momentum app') → productive` rule, renames rows the old poller recorded under `electron` / `momentum`, and reclassifies their not-sure rows to productive. |
| 5 → 6 | Splits the single `popup_cooldown` setting into `cooldown_unproductive` and `cooldown_notsure` (both carry the old value) and deletes the old key. |

**The rule**: never edit the baseline or a shipped step. Any schema change — a new table, a new column, a data fix, a seed — is a new function **appended** to `MIGRATIONS`. `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`, so guard it with `PRAGMA table_info` as steps 1 and 4 do.

---

## Adding Tables

New tables and columns go in a new `MIGRATIONS` step in `db.ts`, not in `initSchema()` (see Migrations above). All SQL lives in `db.ts` (schema) or `src/main/repositories/*` (queries) — nothing else touches the DB.

**Dev seeds**: in dev, `seed.ts` populates fixture data on first launch (guarded by an empty `settings` table), after `getDb()` has already run the migrations. Its not-sure session fixtures use `app = 'Desktop'` (excluded from the Settings reclassify list, so dev isn't asked to classify "Seed"); productive/unproductive fixtures keep the `Seed` marker. The default Productive / Unproductive lists are **not** seeded here — migration 3 inserts them, so they exist in packaged builds too.
