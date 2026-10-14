// routine.test.ts
// The daily routine against a real in-memory SQLite DB: daily and weekly carry-over, series
// continuation into a new week, risk-factor series, and the last_routine_day idempotency guard.
// `./db` is mocked so getDb() hands every repository the same :memory: database (migrated from
// v0); the routine and repositories run unmodified. Dates are built with `new Date(y, m, d)`
// around Wed 2026-10-14 so expectations are exact in any zone.
//
// better-sqlite3 is rebuilt for Electron's ABI, which plain Node (`npm test`) cannot load, so the
// suite skips itself there. Run it with `npm run test:electron` (scripts/test-electron.mjs).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { addDays } from '../shared/dates'

let loadable = false
try {
  // The native binding is only loaded on the first `new Database`, so probe with one.
  const mod = await import('better-sqlite3')
  new mod.default(':memory:').close()
  loadable = true
} catch {
  loadable = false
}

// Lazy: the factory only runs when './db' is first imported, which the skipped suite never does.
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>()
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  actual.initSchema(db)
  actual.migrate(db)
  return { ...actual, getDb: () => db }
})

const day = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m, d).getTime() / 1000)

const LAST_MON = day(2026, 9, 5)
const MON = day(2026, 9, 12)
const YESTERDAY = day(2026, 9, 13)
const TODAY = day(2026, 9, 14) // Wednesday
const SUN = day(2026, 9, 18)
const MON_BIT = 1
const WED_BIT = 4

describe.skipIf(!loadable)('runDailyRoutine', () => {
  let db: Database.Database
  let routine: typeof import('./routine')
  let tasks: typeof import('./repositories/tasks')

  beforeEach(async () => {
    db = (await import('./db')).getDb()
    routine = await import('./routine')
    tasks = await import('./repositories/tasks')
    db.exec(
      `DELETE FROM task_steps; DELETE FROM tasks; DELETE FROM risk_factors; DELETE FROM settings;
       DELETE FROM risk_factor_catalog; DELETE FROM procrastination_logs`
    )
  })

  // Minimal row inserts; everything not given is NULL / 0.
  function weekly(cols: Record<string, unknown>): number {
    return insert({ type: 'weekly', ...cols })
  }
  function daily(cols: Record<string, unknown>): number {
    return insert({ type: 'daily', ...cols })
  }
  function insert(cols: Record<string, unknown>): number {
    const keys = Object.keys(cols)
    return db
      .prepare(
        `INSERT INTO tasks (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`
      )
      .run(cols).lastInsertRowid as number
  }
  function count(where: string, ...args: unknown[]): number {
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${where}`).get(...args) as { n: number }
    ).n
  }

  it('runs once per day (last_routine_day)', () => {
    expect(routine.runDailyRoutine(TODAY)).toBe(true)
    expect(routine.runDailyRoutine(TODAY)).toBe(false)
    expect(db.prepare("SELECT value FROM settings WHERE key = 'last_routine_day'").get()).toEqual({
      value: String(TODAY)
    })
    expect(routine.runDailyRoutine(SUN)).toBe(true)
  })

  it("carries yesterday's incomplete single-entry daily to today, once", () => {
    const w = weekly({ week_start: MON, title: 'Old' })
    const d = daily({
      date: YESTERDAY,
      parent_task_id: w,
      title: 'Old',
      category: 'work',
      due_date: YESTERDAY + 16 * 3600,
      reminder_time: YESTERDAY + 15 * 3600
    })
    db.prepare(
      "INSERT INTO task_steps (task_id, ordinal, text, completed, completed_at) VALUES (?, 1, 'Step', 1, ?)"
    ).run(d, YESTERDAY)
    const done = daily({ date: YESTERDAY, parent_task_id: w, title: 'Done', completed: 1 })

    expect(routine.runDailyRoutine(TODAY)).toBe(true)

    const today = tasks.listDaily(TODAY)
    expect(today).toHaveLength(1)
    const copy = today[0]
    expect(copy).toMatchObject({
      title: 'Old',
      category: 'work',
      date: TODAY,
      parentTaskId: w, // the parent is in this week, so it was not re-parented
      carriedFrom: d,
      carried: false,
      reminderTime: null, // a stale reminder must not fire
      recurring: false
    })
    expect(new Date(copy.dueDate! * 1000).getHours()).toBe(16) // time of day kept
    expect(copy.steps).toEqual([expect.objectContaining({ text: 'Step', completed: true })])

    const yesterday = tasks.listDaily(YESTERDAY)
    expect(yesterday.find((t) => t.id === d)).toMatchObject({ carried: true, carriedTo: TODAY })
    expect(yesterday.find((t) => t.id === done)).toMatchObject({ carried: false })

    // A second run the same day is a no-op; a forced re-run finds the copy and adds nothing.
    expect(routine.runDailyRoutine(TODAY)).toBe(false)
    db.exec('DELETE FROM settings')
    expect(routine.runDailyRoutine(TODAY)).toBe(true)
    expect(count("type = 'daily'")).toBe(3)
  })

  it('never carries a recurring daily; it generates the rest of the week instead', () => {
    const s = weekly({ week_start: MON, date: MON, title: 'Stretch', repeat_days: 127 })
    const missed = daily({ date: YESTERDAY, parent_task_id: s, title: 'Stretch' })

    routine.runDailyRoutine(TODAY)

    expect(count('carried_from = ?', missed)).toBe(0)
    // Yesterday's row + Wed..Sun generated; Monday is not back-filled.
    expect(count('parent_task_id = ?', s)).toBe(6)
    expect(count('parent_task_id = ? AND date = ?', s, MON)).toBe(0)
    expect(tasks.listDaily(TODAY)).toEqual([
      expect.objectContaining({ title: 'Stretch', recurring: true, carriedFrom: null })
    ])
  })

  it("copies last week's incomplete single-entry weekly into this week (Monday carry)", () => {
    const old = weekly({
      week_start: LAST_MON,
      title: 'Last week',
      due_date: day(2026, 9, 9) + 10 * 3600
    })
    weekly({ week_start: LAST_MON, title: 'Finished', completed: 1 })
    db.prepare(
      "INSERT INTO task_steps (task_id, ordinal, text, completed) VALUES (?, 1, 'S1', 1)"
    ).run(old)

    routine.runDailyRoutine(TODAY)

    const thisWeek = tasks.listWeekly(MON)
    expect(thisWeek).toHaveLength(1)
    expect(thisWeek[0]).toMatchObject({
      title: 'Last week',
      carried: true, // this row is the copy
      carriedTo: null,
      target: 1,
      doneCount: 0
    })
    const copy = db.prepare('SELECT id, due_date FROM tasks WHERE carried_from = ?').get(old) as {
      id: number
      due_date: number
    }
    expect(copy.due_date).toBe(day(2026, 9, 16) + 10 * 3600) // same weekday (Fri) + time
    expect(tasks.get(copy.id)!.steps).toEqual([
      expect.objectContaining({ text: 'S1', completed: true })
    ])
    expect(tasks.listWeekly(LAST_MON).find((t) => t.id === old)).toMatchObject({
      carried: false,
      carriedTo: MON // the original says where it went
    })

    // A daily of the carried weekly is re-parented onto the copy.
    const d = daily({ date: YESTERDAY, parent_task_id: old, title: 'Last week' })
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(TODAY)
    expect(tasks.listDaily(TODAY)).toEqual([
      expect.objectContaining({ carriedFrom: d, parentTaskId: copy.id })
    ])
    expect(count('carried_from = ?', old)).toBe(1) // the weekly was not copied twice
  })

  it('continues an active series into the new week with its template steps', () => {
    const s0 = weekly({
      week_start: LAST_MON,
      date: LAST_MON,
      title: 'Gym',
      repeat_days: MON_BIT | WED_BIT
    })
    db.prepare(
      "INSERT INTO task_steps (task_id, ordinal, text, est_minutes) VALUES (?, 1, 'Warm up', 10)"
    ).run(s0)
    weekly({
      week_start: LAST_MON,
      date: LAST_MON,
      title: 'Ended',
      repeat_days: 127,
      repeat_until: day(2026, 9, 11)
    })

    routine.runDailyRoutine(TODAY)

    const thisWeek = tasks.listWeekly(MON)
    expect(thisWeek).toHaveLength(1)
    expect(thisWeek[0]).toMatchObject({
      title: 'Gym',
      repeatDays: MON_BIT | WED_BIT,
      startsOn: null,
      target: 2,
      doneCount: 0,
      carried: false, // a continuation is not a carry-over
      carriedTo: null
    })
    const s1 = thisWeek[0].id
    expect(db.prepare('SELECT carried_from FROM tasks WHERE id = ?').get(s1)).toEqual({
      carried_from: s0
    })
    // Only today (Wed) is generated: Monday passed, and the template steps come along fresh.
    const todays = tasks.listDaily(TODAY)
    expect(todays).toHaveLength(1)
    expect(todays[0]).toMatchObject({ title: 'Gym', parentTaskId: s1, recurring: true })
    expect(todays[0].steps).toEqual([
      expect.objectContaining({ text: 'Warm up', estMinutes: 10, completed: false })
    ])
    expect(count('parent_task_id = ?', s1)).toBe(1)

    // Re-running does not continue it again.
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(TODAY)
    expect(count("type = 'weekly' AND week_start = ?", MON)).toBe(1)
  })

  it('starts a daily series for each risk factor still in its window', () => {
    const recurUntil = TODAY + 13 * 86400 + 5 * 3600
    db.prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)').run(
      'Sleep',
      TODAY,
      recurUntil
    )
    db.prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)').run(
      'Expired',
      LAST_MON,
      YESTERDAY
    )

    routine.runDailyRoutine(TODAY)

    const thisWeek = tasks.listWeekly(MON)
    expect(thisWeek).toHaveLength(1)
    expect(thisWeek[0]).toMatchObject({
      title: 'Sleep',
      riskFactor: 'Sleep',
      repeatDays: 127,
      startsOn: TODAY,
      target: 5, // Wed..Sun
      doneCount: 0
    })
    expect(tasks.listDaily(TODAY)).toEqual([
      expect.objectContaining({ title: 'Sleep', riskFactor: 'Sleep', recurring: true })
    ])
    expect(count('parent_task_id = ?', thisWeek[0].id)).toBe(5)
    expect(db.prepare('SELECT repeat_until FROM tasks WHERE id = ?').get(thisWeek[0].id)).toEqual({
      repeat_until: day(2026, 9, 27)
    })

    // Forced re-run: no second series, no duplicate days.
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(TODAY)
    expect(count("type = 'weekly'")).toBe(1)
    expect(count("type = 'daily'")).toBe(5)
  })

  // ---- regressions from the Phase 0 code review ----

  it('a deleted series is not resurrected from the row it continued from', () => {
    const s0 = weekly({
      week_start: LAST_MON,
      date: LAST_MON,
      title: 'Gym',
      repeat_days: MON_BIT | WED_BIT
    })
    routine.runDailyRoutine(TODAY)
    const s1 = tasks.listWeekly(MON)[0].id
    // remove() judges "unfinished from today" by the real clock; whichever side of 2026-10-14
    // that falls, nothing may be continued or generated afterwards.
    tasks.remove(s1)
    // The predecessor had no history, so the chain delete takes it too; if it did survive, it
    // must be ended before this week.
    const pred = db.prepare('SELECT repeat_until FROM tasks WHERE id = ?').get(s0) as
      | { repeat_until: number }
      | undefined
    if (pred) expect(pred.repeat_until).toBeLessThanOrEqual(addDays(MON, -1))
    const weeklies = count("type = 'weekly'")
    const dailies = count("type = 'daily'")
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(addDays(TODAY, 1))
    expect(count("type = 'weekly'")).toBe(weeklies)
    expect(count("type = 'daily'")).toBe(dailies)
  })

  // Re-selection (riskFactors.select) works off the real clock; it is covered in
  // repositories/tasks.test.ts, which runs against the real today.

  it('makes one series per factor label even with duplicate risk_factors rows', () => {
    const ins = db.prepare(
      'INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)'
    )
    const first = ins.run('Sleep', LAST_MON, TODAY + 5 * 86400).lastInsertRowid as number
    ins.run('Sleep', TODAY, TODAY + 13 * 86400)
    routine.runDailyRoutine(TODAY)
    const series = db
      .prepare("SELECT risk_factor_id, repeat_until FROM tasks WHERE type = 'weekly'")
      .all()
    // The first row's series stands; the routine never rewrites an existing series' end.
    expect(series).toEqual([{ risk_factor_id: first, repeat_until: addDays(TODAY, 5) }])
    expect(count("type = 'daily'")).toBe(5)
  })

  it('never resurrects a risk-factor series the user deleted or stopped', () => {
    db.prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)').run(
      'Sleep',
      TODAY,
      TODAY + 13 * 86400
    )
    routine.runDailyRoutine(TODAY)
    const series = tasks.listWeekly(MON)[0].id
    // "Stop repeating" at this Sunday: the end stays put and nothing new appears next week.
    tasks.update(series, { repeatUntil: SUN })
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(addDays(TODAY, 1))
    expect(db.prepare('SELECT repeat_until FROM tasks WHERE id = ?').get(series)).toEqual({
      repeat_until: SUN
    })
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(addDays(MON, 7))
    expect(count("type = 'weekly'")).toBe(1)
    expect(count("type = 'daily' AND date >= ?", addDays(MON, 7))).toBe(0)
  })
})
