// db.ts
// Lowest-level database module. getDb() opens the SQLite file on first call and returns
// the same connection every time after that (lazy singleton). On first call it runs
// initSchema() (the frozen v0 baseline; CREATE TABLE IF NOT EXISTS makes it idempotent) and
// then migrate(), which applies any MIGRATIONS steps newer than the file's PRAGMA user_version.
// Fresh and existing DBs take the identical path. All other modules access the DB through
// getDb() — nothing touches the file directly, and all SQL lives in db.ts (schema) or
// src/main/repositories/* (queries).
//
// Schema authority is docs/database-overview.md (sessions, tasks, procrastination_logs,
// log_steps, risk_factors). Three tables are additions driven by the design handoff and the
// V1 task UI: task_steps (per-task 20-minute breakdown shown on the home screen),
// risk_factor_catalog (selectable default list + user-created custom factors), distortions
// (static Burns reference list), and settings (greeting name, popup thresholds, toggles).
// Everything after the v0 baseline arrives via MIGRATIONS below (classification_rules, sessions.host
// and app_key, the default lists, the per-class cooldown settings, the static risk-factor catalog
// and distortion list, procrastination_logs.completed) — see docs/database-overview.md "Migrations".
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { hostOf } from './classifier'

let db: Database.Database

// Create every baseline (v0) table. Idempotent: safe to call on every launch. Frozen — schema
// changes after v0 go in MIGRATIONS below, never here. Exported (with migrate) only for db.test.ts.
export function initSchema(database: Database.Database): void {
  database.exec(`
    -- Raw monitoring rows: one per contiguous foreground app/site session.
    CREATE TABLE IF NOT EXISTS sessions (
      id             INTEGER PRIMARY KEY,
      app            TEXT    NOT NULL,
      url            TEXT,
      classification INTEGER NOT NULL CHECK (classification IN (1, 2, 3)),
                                          -- 1=productive, 2=unproductive, 3=not_sure
      start_time     INTEGER NOT NULL,    -- Unix seconds
      end_time       INTEGER,             -- NULL while session is open
      total_seconds  INTEGER
    );

    -- Weekly + daily tasks. Daily rows reference their weekly origin via parent_task_id.
    -- Completion is canonical on the weekly row; a parent-less (written-in) daily task
    -- carries its own completion. See repositories/tasks.ts for the read rule.
    CREATE TABLE IF NOT EXISTS tasks (
      id             INTEGER PRIMARY KEY,
      type           TEXT    NOT NULL CHECK (type IN ('weekly', 'daily')),
      week_start     INTEGER,             -- Unix seconds, Monday of the week (weekly tasks)
      date           INTEGER,             -- Unix seconds for the day (daily tasks)
      parent_task_id INTEGER REFERENCES tasks(id),
      title          TEXT    NOT NULL,
      category       TEXT    CHECK (category IN ('work', 'personal', 'hobby', 'goal')),
      due_date       INTEGER,             -- Unix seconds
      reminder_time  INTEGER,
      completed      INTEGER NOT NULL DEFAULT 0,
      completed_at   INTEGER
    );

    -- AI-generated 20-minute breakdown of a task (home screen "Steps" disclosure).
    -- The "next" step is computed at query time (first incomplete by ordinal), not stored.
    CREATE TABLE IF NOT EXISTS task_steps (
      id           INTEGER PRIMARY KEY,
      task_id      INTEGER NOT NULL REFERENCES tasks(id),
      ordinal      INTEGER NOT NULL,      -- easiest-first order
      text         TEXT    NOT NULL,
      est_minutes  INTEGER,               -- "~10 min"
      completed    INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER
    );

    -- A completed CBT procrastination log (the full reflective record).
    CREATE TABLE IF NOT EXISTS procrastination_logs (
      id                   INTEGER PRIMARY KEY,
      created_at           INTEGER NOT NULL,
      label                TEXT    NOT NULL,  -- "Procrastination - DD/MM/YY hh:mm"
      source               TEXT    CHECK (source IN ('manual', 'popup', 'risk_factor')),
      task_text            TEXT,
      emotion              TEXT,
      tempting_thought     TEXT,
      belief_before        INTEGER,           -- 0-100
      distortion           TEXT,              -- Burns list item
      self_control_thought TEXT,
      belief_self_control  INTEGER,           -- 0-100
      belief_after         INTEGER,           -- 0-100
      takeaways            TEXT,
      risk_factor          TEXT               -- NULL unless source = 'risk_factor'
    );

    -- Task-breakdown steps inside a procrastination log (predicted vs actual).
    CREATE TABLE IF NOT EXISTS log_steps (
      id                     INTEGER PRIMARY KEY,
      log_id                 INTEGER NOT NULL REFERENCES procrastination_logs(id),
      step_number            INTEGER NOT NULL,
      description            TEXT,
      predicted_difficulty   INTEGER,         -- 0-100
      predicted_time_mins    INTEGER,
      predicted_satisfaction INTEGER,         -- 0-100
      actual_difficulty      INTEGER,
      actual_time_mins       INTEGER,
      actual_satisfaction    INTEGER          -- 0-100
    );

    -- Selected risk factors that spawn a recurring daily task for ~2 weeks.
    CREATE TABLE IF NOT EXISTS risk_factors (
      id          INTEGER PRIMARY KEY,
      factor      TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      recur_until INTEGER NOT NULL           -- Unix seconds; 14 days from created_at
    );

    -- Selectable catalog of risk factors: seeded defaults + user-created custom entries.
    CREATE TABLE IF NOT EXISTS risk_factor_catalog (
      id         INTEGER PRIMARY KEY,
      label      TEXT    NOT NULL UNIQUE,
      is_custom  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );

    -- Static Burns cognitive-distortion list, selectable in the CBT log.
    CREATE TABLE IF NOT EXISTS distortions (
      id      INTEGER PRIMARY KEY,
      ordinal INTEGER NOT NULL,
      label   TEXT    NOT NULL
    );

    -- Minimal key/value app settings (greeting name, popup thresholds, toggles).
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

// MIGRATIONS[i] upgrades the schema from user_version i to i+1. Append only — never edit a
// shipped step. Each step runs inside a transaction and the version bump is part of it, so a
// failed step leaves the file untouched at its previous version. A step that rebuilds a table
// other tables reference is wrapped as { ownTransaction: true, run } — migrate() then turns
// foreign-key enforcement off around its transaction (the pragma is a no-op inside one) and
// checks every reference before the bump.
type Step = (database: Database.Database) => void
const MIGRATIONS: (Step | { ownTransaction: true; run: Step })[] = [
  // v0 → v1: productive/unproductive rules, sessions.host, start_time index.
  (database) => {
    database.exec(`
      -- User's productive (1) / unproductive (2) list. pattern is lowercase; a site pattern is the
      -- bare hostname (no scheme/path/www.) matched at a dot boundary by the classifier.
      CREATE TABLE IF NOT EXISTS classification_rules (
        id             INTEGER PRIMARY KEY,
        kind           TEXT    NOT NULL CHECK (kind IN ('app', 'site')),
        pattern        TEXT    NOT NULL,
        classification INTEGER NOT NULL CHECK (classification IN (1, 2)),
        created_at     INTEGER NOT NULL,
        UNIQUE (kind, pattern)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions (start_time);
    `)
    // Lowercase hostname of url (NULL if none). SQLite has no hostname function and
    // LIKE '%youtube.com%' would match notyoutube.com, so it is written once at insert and
    // makes the retroactive reclassify UPDATE and the not-sure GROUP BY exact. ALTER has no
    // IF NOT EXISTS, so guard it for a file where the column exists but the version bump didn't land.
    const cols = database.pragma('table_info(sessions)') as { name: string }[]
    if (!cols.some((c) => c.name === 'host')) {
      database.exec('ALTER TABLE sessions ADD COLUMN host TEXT')
    }

    // Backfill host for rows recorded before this column existed (hostname parsing is JS-only).
    const rows = database.prepare('SELECT id, url FROM sessions WHERE url IS NOT NULL').all() as {
      id: number
      url: string
    }[]
    const setHost = database.prepare('UPDATE sessions SET host = ? WHERE id = ?')
    for (const r of rows) {
      const host = hostOf(r.url)
      if (host) setHost.run(host, r.id)
    }
  },
  // v1 → v2: (unshipped dev step that cleared an earlier seed) — kept as a no-op so dev DBs already
  // at version 2 line up with fresh ones.
  () => {},
  // v2 → v3: seed the default Productive / Unproductive lists. Users rarely realise which sites
  // eat their focus beyond their top few, and an unlisted site on a side monitor would otherwise
  // read as not-sure, so both lists ship with a starter set. INSERT OR IGNORE: a user who removed
  // one isn't re-seeded, and a DB that already has any of these keeps its own classification.
  (database) => {
    const insert = database.prepare(
      `INSERT OR IGNORE INTO classification_rules (kind, pattern, classification, created_at)
       VALUES (?, ?, ?, ?)`
    )
    const now = Math.floor(Date.now() / 1000)
    for (const [kind, pattern] of DEFAULT_PRODUCTIVE) insert.run(kind, pattern, 1, now)
    for (const [kind, pattern] of DEFAULT_UNPRODUCTIVE) insert.run(kind, pattern, 2, now)
  },
  // v3 → v4: sessions.app_key — the app name lowercased in JS at insert. SQLite's lower() is
  // ASCII-only (no ICU), so `lower(app) = ?` could never match a JS-lowercased rule pattern for
  // names with non-ASCII capitals ("Éditeur"). App matching in SQL (reclassify, the not-sure
  // grouping) goes through this column; `app` keeps the display casing.
  (database) => {
    const cols = database.pragma('table_info(sessions)') as { name: string }[]
    if (!cols.some((c) => c.name === 'app_key')) {
      database.exec('ALTER TABLE sessions ADD COLUMN app_key TEXT')
    }
    const rows = database.prepare('SELECT id, app FROM sessions WHERE app_key IS NULL').all() as {
      id: number
      app: string
    }[]
    const set = database.prepare('UPDATE sessions SET app_key = ? WHERE id = ?')
    for (const r of rows) set.run(r.app.toLowerCase(), r.id)
  },
  // v4 → v5: Momentum's own window becomes a normal, productive-by-default app named
  // "Momentum App" (it was previously forced to not-sure). Rename the rows the old poller
  // recorded under the exe name and reclassify the not-sure ones, as rules.add() would.
  (database) => {
    database
      .prepare(
        `INSERT OR IGNORE INTO classification_rules (kind, pattern, classification, created_at)
         VALUES ('app', 'momentum app', 1, ?)`
      )
      .run(Math.floor(Date.now() / 1000))
    database
      .prepare(
        `UPDATE sessions SET app = 'Momentum App', app_key = 'momentum app'
         WHERE app_key IN ('electron', 'momentum')`
      )
      .run()
    database
      .prepare(
        `UPDATE sessions SET classification = 1
         WHERE classification = 3 AND app_key = 'momentum app'`
      )
      .run()
  },
  // v5 → v6: the single popup_cooldown setting splits into one per classification. Carry the old
  // value into both so an existing user keeps their choice; the renamed key is dropped.
  (database) => {
    const old = database
      .prepare("SELECT value FROM settings WHERE key = 'popup_cooldown'")
      .get() as { value: string } | undefined
    if (old) {
      const ins = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
      ins.run('cooldown_unproductive', old.value)
      ins.run('cooldown_notsure', old.value)
      database.prepare("DELETE FROM settings WHERE key = 'popup_cooldown'").run()
    }
  },
  // v6 → v7: rebuild `tasks` for V1 item 5 (carry-over, repeats, reminders, risk-factor tasks).
  // SQLite can't drop a CHECK or add a column with a REFERENCES clause in place, so this is the
  // documented 12-step rebuild: copy into tasks_new (ids preserved, so task_steps.task_id and
  // parent_task_id still line up), drop the old table, rename. task_steps' REFERENCES tasks(id)
  // keeps pointing at the renamed table; the runner's foreign_key_check proves it. What changes:
  //   - category loses its fixed CHECK: free text, NULL = no category (D13; validated in TS).
  //   - repeat_days / repeat_until: a weekly row with a non-zero weekday mask is a series (D4);
  //     a weekly row's `date` is the series start day (A2).
  //   - carried_from: the row a copy was carried / continued from (D1, D5, A1).
  //   - risk_factor_id: the risk factor a series was generated from (D9).
  //   - Completion now lives on every daily row (D3) — the weekly row shows "N of target" from
  //     its dailies — so a daily whose weekly parent was already done is backfilled as done.
  // Indexes cover the per-day / per-week lists, the parent join, the "already carried" EXISTS,
  // and the next-reminder lookup.
  {
    ownTransaction: true,
    run: (database) => {
      const cols = database.pragma('table_info(tasks)') as { name: string }[]
      if (!cols.some((c) => c.name === 'repeat_days')) {
        // A leftover tasks_new from an aborted attempt would make the CREATE fail: the old
        // `tasks` is still in place, so start the rebuild over.
        database.exec(`
          DROP TABLE IF EXISTS tasks_new;
          CREATE TABLE tasks_new (
            id             INTEGER PRIMARY KEY,
            type           TEXT    NOT NULL CHECK (type IN ('weekly', 'daily')),
            week_start     INTEGER,             -- Unix seconds, Monday of the week (weekly rows)
            date           INTEGER,             -- daily: the day; weekly series: start day (A2)
            parent_task_id INTEGER REFERENCES tasks(id),
            title          TEXT    NOT NULL,
            category       TEXT,                -- free text, NULL = none (D13); no CHECK
            due_date       INTEGER,             -- Unix seconds
            reminder_time  INTEGER,
            completed      INTEGER NOT NULL DEFAULT 0,
            completed_at   INTEGER,
            repeat_days    INTEGER NOT NULL DEFAULT 0, -- weekday mask, weekly rows; 0 = once (D4)
            repeat_until   INTEGER,             -- local midnight of the last day; NULL = never
            carried_from   INTEGER REFERENCES tasks(id), -- copy → the row it was carried / continued from
            risk_factor_id INTEGER REFERENCES risk_factors(id)
          );
          INSERT INTO tasks_new (id, type, week_start, date, parent_task_id, title, category,
                                 due_date, reminder_time, completed, completed_at)
            SELECT id, type, week_start, date, parent_task_id, title, category,
                   due_date, reminder_time, completed, completed_at FROM tasks;
          DROP TABLE tasks;
          ALTER TABLE tasks_new RENAME TO tasks;
        `)
      }
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_type_date ON tasks (type, date);
        CREATE INDEX IF NOT EXISTS idx_tasks_type_week ON tasks (type, week_start);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks (parent_task_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_carried   ON tasks (carried_from);
        CREATE INDEX IF NOT EXISTS idx_tasks_reminder  ON tasks (reminder_time);
      `)
      // D3 backfill: a daily whose weekly parent is done was done. Takes the parent's
      // completed_at; falls back to now for a parent that was marked done without a time.
      database
        .prepare(
          `UPDATE tasks SET completed = 1,
             completed_at = COALESCE(
               (SELECT p.completed_at FROM tasks p WHERE p.id = tasks.parent_task_id), ?)
           WHERE type = 'daily' AND completed = 0
             AND parent_task_id IN (SELECT id FROM tasks WHERE type = 'weekly' AND completed = 1)`
        )
        .run(Math.floor(Date.now() / 1000))
    }
  },
  // v7 → v8: tasks.created_at — when the task was first written, shown as "Created on" in the
  // edit dialog (a carried-over task keeps its original's). Existing rows take the day they were
  // for (date, else week_start) since nothing better was recorded; rows older than that stay NULL.
  (database) => {
    database.exec(`
      ALTER TABLE tasks ADD COLUMN created_at INTEGER;
      UPDATE tasks SET created_at = COALESCE(date, week_start);
    `)
  },
  // v8 → v9: static reference data ships with the app instead of the dev-only seed, so a fresh
  // packaged install has a risk-factor catalog and the distortion dropdown isn't empty (P3-3).
  // The catalog label is UNIQUE, so INSERT OR IGNORE; distortions has no unique column, so it is
  // filled only when empty (a dev DB already has the rows from the old seed).
  (database) => {
    const rf = database.prepare(
      'INSERT OR IGNORE INTO risk_factor_catalog (label, is_custom, created_at) VALUES (?, 0, NULL)'
    )
    for (const label of RISK_FACTOR_CATALOG) rf.run(label)
    const count = database.prepare('SELECT COUNT(*) AS n FROM distortions').get() as { n: number }
    if (count.n === 0) {
      const d = database.prepare('INSERT INTO distortions (ordinal, label) VALUES (?, ?)')
      DISTORTIONS.forEach((label, i) => d.run(i + 1, label))
    }
  },
  // v9 → v10: the V1 default Productive list grew (P3-1: Outlook, Teams, Slack, Zoom, LinkedIn).
  // Same shape as migration 3 (OR IGNORE: a user who already sorted one of these keeps their own
  // classification), and like migration 5 / rules.add() a rule that did land reclassifies the
  // not-sure sessions it covers, so past Trends totals and the "Not sure yet" list agree with it.
  (database) => {
    const insert = database.prepare(
      `INSERT OR IGNORE INTO classification_rules (kind, pattern, classification, created_at)
       VALUES (?, ?, 1, ?)`
    )
    // Same match semantics as the classifier (see rules.add): exact app_key, or host at a dot
    // boundary. The bound site patterns contain no LIKE wildcards, so no escaping is needed.
    const reclassifyApp = database.prepare(
      'UPDATE sessions SET classification = 1 WHERE classification = 3 AND app_key = ?'
    )
    const reclassifySite = database.prepare(
      `UPDATE sessions SET classification = 1
       WHERE classification = 3 AND (host = ? OR host LIKE '%.' || ?)`
    )
    const now = Math.floor(Date.now() / 1000)
    for (const [kind, pattern] of PRODUCTIVE_ADDED_V10) {
      if (insert.run(kind, pattern, now).changes === 0) continue // user's own rule wins
      if (kind === 'app') reclassifyApp.run(pattern)
      else reclassifySite.run(pattern, pattern)
    }
  },
  // v10 → v11: procrastination_logs.completed — a log closed part-way through the flow (after at
  // least one step) is saved as in-progress (0) so it can be resumed from the Logs list; Finish
  // sets 1. Every log that already exists was saved by Finish, hence DEFAULT 1.
  (database) => {
    database.exec(
      'ALTER TABLE procrastination_logs ADD COLUMN completed INTEGER NOT NULL DEFAULT 1'
    )
  }
]

// Static reference data, inserted by migration 9 (and so present in a packaged install).
// Selectable risk factors (the user adds custom ones on top) and Burns' ten cognitive distortions
// in list order, from the design data contract (design_system/interactive-flows/data.js).
const RISK_FACTOR_CATALOG = [
  'Sleep',
  'Water',
  'Food',
  'Medication',
  'Exercise',
  'Social connection',
  'Going outside',
  'Fun activities',
  'Sense of accomplishment'
]
const DISTORTIONS = [
  'All-or-nothing thinking',
  'Overgeneralization',
  'Mental filter',
  'Disqualifying the positive',
  'Jumping to conclusions',
  'Magnification or minimization',
  'Emotional reasoning',
  'Should statements',
  'Labeling and mislabeling',
  'Personalization'
]

// The V1 default Productive / Unproductive lists (decided 2026-10-27) = the migration-3 starter
// set below plus PRODUCTIVE_ADDED_V10, written by migration 10 (every DB, fresh or existing, runs
// both; a shipped step's data is never edited). Site patterns are bare hosts; app patterns are
// the lowercase get-windows owner.name — the exe's FileDescription, which is why Zoom is "zoom
// meetings" and both Outlook spellings are listed.
const DEFAULT_PRODUCTIVE: [kind: 'app' | 'site', pattern: string][] = [
  ['app', 'momentum app'], // Momentum itself (see migration 5)
  ['app', 'visual studio code'],
  ['app', 'microsoft word'],
  ['app', 'microsoft excel'],
  ['app', 'microsoft powerpoint'],
  ['app', 'microsoft onenote'],
  ['site', 'github.com'],
  ['site', 'docs.google.com'],
  ['site', 'stackoverflow.com']
]
const PRODUCTIVE_ADDED_V10: [kind: 'app' | 'site', pattern: string][] = [
  ['app', 'outlook'],
  ['app', 'microsoft outlook'],
  ['app', 'microsoft teams'],
  ['app', 'slack'],
  ['app', 'zoom meetings'],
  ['site', 'linkedin.com']
]
const DEFAULT_UNPRODUCTIVE: [kind: 'app' | 'site', pattern: string][] = [
  ['site', 'youtube.com'],
  ['site', 'netflix.com'],
  ['site', 'twitch.tv'],
  ['site', 'reddit.com'],
  ['site', 'x.com'],
  ['site', 'twitter.com'],
  ['site', 'facebook.com'],
  ['site', 'instagram.com'],
  ['site', 'tiktok.com']
]

// Apply every migration step newer than the file's user_version, bumping it after each.
export function migrate(database: Database.Database): void {
  let version = database.pragma('user_version', { simple: true }) as number
  while (version < MIGRATIONS.length) {
    const entry = MIGRATIONS[version]
    const next = version + 1
    if (typeof entry === 'function') {
      database.transaction(() => {
        entry(database)
        database.pragma(`user_version = ${next}`)
      })()
    } else {
      // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it outside. With
      // enforcement off a DROP TABLE doesn't cascade and the rebuild's dangling moment is
      // allowed; foreign_key_check then has to come back empty before the version bump, so a
      // reference the rebuild broke rolls the whole step back instead of shipping.
      database.pragma('foreign_keys = OFF')
      try {
        database.transaction(() => {
          entry.run(database)
          const broken = database.pragma('foreign_key_check') as unknown[]
          if (broken.length > 0) {
            throw new Error(`step ${next} left ${broken.length} broken foreign key reference(s)`)
          }
          database.pragma(`user_version = ${next}`)
        })()
      } finally {
        database.pragma('foreign_keys = ON')
      }
    }
    version = next
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const path = join(app.getPath('userData'), 'momentum.db')
    const database = new Database(path)
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    initSchema(database)
    try {
      migrate(database)
    } catch (err) {
      // Close the handle so a retrying caller doesn't leak a connection per call. A failed
      // migration fails every launch; in dev the fix is deleting this file (fixtures
      // regenerate), so name it.
      database.close()
      throw new Error(`Database migration failed for ${path}: ${(err as Error).message}`)
    }
    db = database
  }
  return db
}
