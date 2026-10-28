// db.test.ts
// Migration test: builds a v0 schema in an in-memory SQLite DB with seed-like task rows, runs
// migrate(), and checks the v6 → v7 tasks rebuild (ids preserved, steps still attached, new
// columns + indexes, the category CHECK gone, the D3 completion backfill, foreign keys back on,
// and a second migrate() being a no-op), the v8 created_at backfill, the v9 / v10 static seeds and
// the v11 completed column.
//
// better-sqlite3 is rebuilt for Electron's ABI (postinstall), which plain Node — and so `npm test`
// — cannot load, so the suite skips itself there. Run it under Electron's own Node:
//   ELECTRON_RUN_AS_NODE=1 npx electron node_modules/vitest/vitest.mjs run src/main/db.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

let open: ((path: string) => Database.Database) | null = null
try {
  // The native binding is only loaded on the first `new Database`, so probe with one; the ABI
  // error lands here instead of failing the file.
  const mod = await import('better-sqlite3')
  new mod.default(':memory:').close()
  open = (path) => new mod.default(path)
} catch {
  open = null
}

describe.skipIf(open === null)('migrate (v0 → v11)', () => {
  let db: Database.Database
  const WEEK = 1_760_227_200 // some Monday midnight; the value doesn't matter
  const DAY = WEEK + 86_400

  beforeAll(async () => {
    // db.ts imports `electron` for getDb(); under Electron-as-Node that import is inert.
    const { initSchema, migrate } = await import('./db')
    db = open!(':memory:')
    db.pragma('foreign_keys = ON')
    initSchema(db)
    db.exec(`
      INSERT INTO tasks (id, type, week_start, title, category, completed, completed_at)
        VALUES (1, 'weekly', ${WEEK}, 'Ship the plan', 'work', 1, 123);
      INSERT INTO tasks (id, type, date, parent_task_id, title, category, completed)
        VALUES (2, 'daily', ${DAY}, 1, 'Ship the plan', 'work', 0);
      INSERT INTO tasks (id, type, date, title, completed)
        VALUES (3, 'daily', ${DAY}, 'Written-in, no parent', 0);
      INSERT INTO task_steps (id, task_id, ordinal, text) VALUES (10, 2, 1, 'Open the doc');
    `)
    migrate(db)
  })

  it('bumps user_version to 11', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(11)
  })

  it('v11 adds procrastination_logs.completed, defaulting existing logs to complete', () => {
    db.prepare("INSERT INTO procrastination_logs (created_at, label) VALUES (1, 'old')").run()
    expect(db.prepare('SELECT completed FROM procrastination_logs').get()).toEqual({ completed: 1 })
  })

  it('v9 / v10 seed the static reference data and the added Productive rules', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM distortions').get()).toEqual({ n: 10 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM risk_factor_catalog').get()).toEqual({ n: 9 })
    expect(
      db
        .prepare(
          "SELECT classification FROM classification_rules WHERE kind = 'site' AND pattern = 'linkedin.com'"
        )
        .get()
    ).toEqual({ classification: 1 })
  })

  it('v8 adds created_at, backfilled from the day the row was for', () => {
    const rows = db.prepare('SELECT id, created_at FROM tasks WHERE id <= 3 ORDER BY id').all()
    expect(rows).toEqual([
      { id: 1, created_at: WEEK },
      { id: 2, created_at: DAY },
      { id: 3, created_at: DAY }
    ])
  })

  it('adds the item-5 columns and drops the category CHECK', () => {
    const cols = (db.pragma('table_info(tasks)') as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining(['repeat_days', 'repeat_until', 'carried_from', 'risk_factor_id'])
    )
    expect(() =>
      db
        .prepare("INSERT INTO tasks (type, title, category) VALUES ('weekly', 'x', 'errands')")
        .run()
    ).not.toThrow()
  })

  it('creates the five indexes', () => {
    const names = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks'")
        .all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(names.sort()).toEqual([
      'idx_tasks_carried',
      'idx_tasks_parent',
      'idx_tasks_reminder',
      'idx_tasks_type_date',
      'idx_tasks_type_week'
    ])
  })

  it('preserves ids and keeps steps attached', () => {
    const titles = db.prepare('SELECT id, title FROM tasks WHERE id <= 3 ORDER BY id').all()
    expect(titles).toEqual([
      { id: 1, title: 'Ship the plan' },
      { id: 2, title: 'Ship the plan' },
      { id: 3, title: 'Written-in, no parent' }
    ])
    const step = db
      .prepare('SELECT s.text FROM task_steps s JOIN tasks t ON t.id = s.task_id WHERE s.id = 10')
      .get()
    expect(step).toEqual({ text: 'Open the doc' })
  })

  it('backfills completion onto a daily whose weekly parent was done (D3)', () => {
    const child = db.prepare('SELECT completed, completed_at FROM tasks WHERE id = 2').get()
    expect(child).toEqual({ completed: 1, completed_at: 123 })
    const loner = db.prepare('SELECT completed, completed_at FROM tasks WHERE id = 3').get()
    expect(loner).toEqual({ completed: 0, completed_at: null })
  })

  it('leaves foreign keys enforced and pointing at the rebuilt table', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(() =>
      db.prepare("INSERT INTO task_steps (task_id, ordinal, text) VALUES (999, 1, 'orphan')").run()
    ).toThrow(/FOREIGN KEY/)
  })

  it('is a no-op the second time', async () => {
    const { migrate } = await import('./db')
    const before = db.prepare('SELECT COUNT(*) AS n FROM tasks').get()
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(11)
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual(before)
  })
})

// Migration 10 on an *existing* DB: a rule the user already sorted is kept (and its sessions left
// alone), while a rule that lands reclassifies the not-sure sessions it covers. The DB is put at
// v9 by hand with just the tables step 10 touches (steps 1–9 are exercised above).
describe.skipIf(open === null)('migrate (v9 → v10 on an existing DB)', () => {
  let db: Database.Database

  beforeAll(async () => {
    const { initSchema, migrate } = await import('./db')
    db = open!(':memory:')
    initSchema(db)
    db.exec(`
      CREATE TABLE classification_rules (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, pattern TEXT NOT NULL,
        classification INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE (kind, pattern));
      ALTER TABLE sessions ADD COLUMN host TEXT;
      ALTER TABLE sessions ADD COLUMN app_key TEXT;
      INSERT INTO classification_rules (kind, pattern, classification, created_at)
        VALUES ('app', 'slack', 2, 1);
      INSERT INTO sessions (id, app, app_key, host, classification, start_time)
        VALUES (1, 'Slack', 'slack', NULL, 3, 1),
               (2, 'Microsoft Edge', 'microsoft edge', 'www.linkedin.com', 3, 2),
               (3, 'Microsoft Edge', 'microsoft edge', 'notlinkedin.com', 3, 3),
               (4, 'Microsoft Teams', 'microsoft teams', NULL, 3, 4);
      PRAGMA user_version = 9;
    `)
    migrate(db)
  })

  it('keeps a rule the user already sorted, and leaves its sessions alone', () => {
    expect(
      db.prepare("SELECT classification FROM classification_rules WHERE pattern = 'slack'").get()
    ).toEqual({ classification: 2 })
    expect(db.prepare('SELECT classification FROM sessions WHERE id = 1').get()).toEqual({
      classification: 3
    })
  })

  it('adds the other rules and reclassifies the not-sure sessions they cover', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM classification_rules').get()).toEqual({ n: 6 })
    const cls = db.prepare('SELECT id, classification FROM sessions WHERE id > 1 ORDER BY id').all()
    expect(cls).toEqual([
      { id: 2, classification: 1 }, // www.linkedin.com — subdomain match
      { id: 3, classification: 3 }, // notlinkedin.com — not a dot-boundary match
      { id: 4, classification: 1 } // microsoft teams — app_key match
    ])
    expect(db.pragma('user_version', { simple: true })).toBe(11)
  })
})
