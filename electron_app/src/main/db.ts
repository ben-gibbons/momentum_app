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
// and app_key, the default lists, the per-class cooldown settings) — see docs/database-overview.md
// "Migrations".
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { hostOf } from './classifier'

let db: Database.Database

// Create every baseline (v0) table. Idempotent: safe to call on every launch. Frozen — schema
// changes after v0 go in MIGRATIONS below, never here.
function initSchema(database: Database.Database): void {
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
// failed step leaves the file untouched at its previous version.
const MIGRATIONS: ((database: Database.Database) => void)[] = [
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
  }
]

// Starter lists seeded by migration 3. PLACEHOLDER CONTENTS — the final set is an open product
// decision (see docs/roadmap.md, V1 item 1). Site patterns are bare hosts; app patterns are the
// lowercase get-windows owner.name.
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
function migrate(database: Database.Database): void {
  let version = database.pragma('user_version', { simple: true }) as number
  while (version < MIGRATIONS.length) {
    const step = MIGRATIONS[version]
    const next = version + 1
    database.transaction(() => {
      step(database)
      database.pragma(`user_version = ${next}`)
    })()
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
