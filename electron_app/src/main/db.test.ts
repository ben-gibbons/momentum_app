// db.test.ts
// Migration test: builds a v0 schema in an in-memory SQLite DB with seed-like task rows, runs
// migrate(), and checks the v6 → v7 tasks rebuild (ids preserved, steps still attached, new
// columns + indexes, the category CHECK gone, the D3 completion backfill, foreign keys back on,
// and a second migrate() being a no-op).
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

describe.skipIf(open === null)('migrate (v0 → v7)', () => {
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

  it('bumps user_version to 7', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(7)
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
    expect(db.pragma('user_version', { simple: true })).toBe(7)
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual(before)
  })
})
