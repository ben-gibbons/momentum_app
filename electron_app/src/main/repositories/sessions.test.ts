// sessions.test.ts
// The sessions repository's range queries against a real in-memory SQLite DB: getWeek / getMonth
// accept any timestamp inside the week / month (normalised like listWeekly), and bucket by local
// day. Same ./db mock as tasks.test.ts.
//
// better-sqlite3 is rebuilt for Electron's ABI, which plain Node (`npm test`) cannot load, so the
// suite skips itself there. Run it with `npm run test:electron` (scripts/test-electron.mjs).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { addDays, startOfDay, startOfMonth, weekStartMonday } from '../../shared/dates'

let loadable = false
try {
  const mod = await import('better-sqlite3')
  new mod.default(':memory:').close()
  loadable = true
} catch {
  loadable = false
}

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  actual.initSchema(db)
  actual.migrate(db)
  return { ...actual, getDb: () => db }
})

const MON = weekStartMonday(startOfDay())

describe.skipIf(!loadable)('sessions repository', () => {
  let db: Database.Database
  let sessions: typeof import('./sessions')

  beforeEach(async () => {
    db = (await import('../db')).getDb()
    sessions = await import('./sessions')
    db.exec('DELETE FROM sessions')
    // A closed 30-minute productive session at 10:00 on Monday.
    db.prepare(
      `INSERT INTO sessions (app, app_key, classification, start_time, end_time, total_seconds)
       VALUES ('Seed', 'seed', 1, ?, ?, 1800)`
    ).run(MON + 10 * 3600, MON + 10 * 3600 + 1800)
  })

  it('getWeek accepts any timestamp in the week', () => {
    const byMonday = sessions.getWeek(MON)
    expect(byMonday[0]).toMatchObject({ day: 'Mon', date: MON, productive: 30 })
    expect(byMonday.map((d) => d.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(MON, i)))
    expect(sessions.getWeek(addDays(MON, 2) + 3600)).toEqual(byMonday)
  })

  it('getMonth accepts any timestamp in the month', () => {
    const monthStart = startOfMonth(MON)
    const byFirst = sessions.getMonth(monthStart)
    expect(byFirst[0].weekStart).toBe(weekStartMonday(monthStart))
    expect(byFirst.find((w) => w.weekStart === MON)).toMatchObject({
      weekEnd: addDays(MON, 6),
      productive: 30
    })
    expect(sessions.getMonth(monthStart + 3 * 86400 + 7200)).toEqual(byFirst)
  })
})
