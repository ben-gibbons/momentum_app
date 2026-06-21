// db.ts
// Lowest-level database module. getDb() opens the SQLite file on first call and returns
// the same connection every time after that (lazy singleton). On first call it runs
// initSchema() to create every table; CREATE TABLE IF NOT EXISTS makes this idempotent on
// subsequent launches. All other modules access the DB through getDb() — nothing touches
// the file directly, and all SQL lives in db.ts (schema) or src/main/repositories/* (queries).
//
// Schema authority is docs/database-overview.md (sessions, tasks, procrastination_logs,
// log_steps, risk_factors). Three tables are additions driven by the design handoff and the
// V1 task UI: task_steps (per-task 20-minute breakdown shown on the home screen),
// risk_factor_catalog (selectable default list + user-created custom factors), distortions
// (static Burns reference list), and settings (greeting name, popup thresholds, toggles).
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

// Create every table. Idempotent: safe to call on every launch.
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

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(join(app.getPath('userData'), 'momentum.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}
