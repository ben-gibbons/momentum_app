// tasks.test.ts
// The tasks repository's write rules against a real in-memory SQLite DB: series creation and
// generation, per-daily completion rolling up to the weekly (D3), the series-delete rule (A5),
// repeat edits, and projected rows (D15). Same ./db mock as routine.test.ts. These use the real
// "today" (create / update / remove / toggleComplete default to it), so expectations are
// relative to startOfDay().
//
// better-sqlite3 is rebuilt for Electron's ABI, which plain Node (`npm test`) cannot load, so the
// suite skips itself there. Run it with `npm run test:electron` (scripts/test-electron.mjs).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { addDays, startOfDay, weekStartMonday, weekdayBit } from '../../shared/dates'
import { ALL_DAYS } from '../recurrence'

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

const TODAY = startOfDay()
const MON = weekStartMonday(TODAY)
const SUN = addDays(MON, 6)
const DAYS_LEFT = Math.round((SUN - TODAY) / 86400) + 1 // today..Sunday

describe.skipIf(!loadable)('tasks repository', () => {
  let db: Database.Database
  let tasks: typeof import('./tasks')

  beforeEach(async () => {
    db = (await import('../db')).getDb()
    tasks = await import('./tasks')
    db.exec(
      'DELETE FROM task_steps; DELETE FROM tasks; DELETE FROM risk_factors; DELETE FROM settings'
    )
  })

  function count(where: string, ...args: unknown[]): number {
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${where}`).get(...args) as { n: number }
    ).n
  }

  it('a written-in daily gets a weekly mirror; ticking either completes both', () => {
    const d = tasks.create({
      type: 'daily',
      title: 'Reply',
      date: TODAY,
      steps: [{ text: 'Open' }]
    })
    const w = tasks.listWeekly(MON)
    expect(w).toEqual([expect.objectContaining({ title: 'Reply', target: 1, doneCount: 0 })])
    expect(tasks.listDaily(TODAY)[0]).toMatchObject({
      id: d,
      parentTaskId: w[0].id,
      recurring: false
    })

    expect(tasks.toggleComplete(d)).toEqual({ completed: true })
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ completed: true, doneCount: 1 })
    expect(tasks.toggleComplete(w[0].id)).toEqual({ completed: false }) // mirrors onto the daily
    expect(tasks.listDaily(TODAY)[0].completed).toBe(false)
  })

  it('a series creates its weekly row and the remaining days of this week', () => {
    const id = tasks.create({
      type: 'daily',
      title: 'Stretch',
      date: TODAY,
      dueDate: TODAY + 16 * 3600,
      repeatDays: ALL_DAYS,
      steps: [{ text: 'Hamstrings', estMinutes: 5 }]
    })
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({
        id,
        title: 'Stretch',
        target: DAYS_LEFT,
        doneCount: 0,
        startsOn: TODAY
      })
    ])
    expect(count('parent_task_id = ?', id)).toBe(DAYS_LEFT)
    const today = tasks.listDaily(TODAY)[0]
    expect(today).toMatchObject({ recurring: true, due: '4:00 PM', parentTaskId: id })
    expect(today.steps).toEqual([expect.objectContaining({ text: 'Hamstrings', estMinutes: 5 })])
    // The detail of a daily carries its parent's repeat fields.
    expect(tasks.get(today.id!)).toMatchObject({
      type: 'daily',
      repeatDays: ALL_DAYS,
      startsOn: TODAY
    })
  })

  it('a series completes through its days; the weekly cannot be ticked directly', () => {
    // Started Monday so the target is 7 whatever today is.
    const id = db
      .prepare(
        "INSERT INTO tasks (type, week_start, date, title, repeat_days) VALUES ('weekly', ?, ?, 'Daily', ?)"
      )
      .run(MON, MON, ALL_DAYS).lastInsertRowid as number
    tasks.generateWeek(id)
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ target: 7, doneCount: 0 })
    expect(() => tasks.toggleComplete(id)).toThrow('Recurring tasks complete through their days')

    const today = tasks.listDaily(TODAY)[0]
    tasks.toggleComplete(today.id!)
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ doneCount: 1, completed: false })
    // Tick every generated day: the weekly completes only when the count reaches the target.
    for (const d of tasks.listDailyRange(addDays(TODAY, 1), addDays(SUN, 1))) {
      if (d.id != null) tasks.toggleComplete(d.id)
    }
    expect(tasks.listWeekly(MON)[0]).toMatchObject({
      doneCount: DAYS_LEFT,
      completed: DAYS_LEFT >= 7
    })
  })

  it('deleting a series keeps ticked days, drops unfinished ones, and ends the series', () => {
    const id = tasks.create({ type: 'daily', title: 'Run', date: TODAY, repeatDays: ALL_DAYS })
    const today = tasks.listDaily(TODAY)[0]
    tasks.toggleComplete(today.id!)
    tasks.remove(id)
    expect(count('parent_task_id = ?', id)).toBe(1)
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({ id, doneCount: 1, target: 1, repeatUntil: TODAY })
    ])
    // Nothing ticked: the row goes too.
    const id2 = tasks.create({ type: 'daily', title: 'Swim', date: TODAY, repeatDays: ALL_DAYS })
    tasks.remove(id2)
    expect(count('id = ?', id2)).toBe(0)
    expect(count('parent_task_id = ?', id2)).toBe(0)
  })

  it('deleting a single-entry weekly removes its daily and steps; a daily removes only itself', () => {
    const d = tasks.create({ type: 'daily', title: 'One', date: TODAY, steps: [{ text: 'a' }] })
    const w = tasks.listWeekly(MON)[0].id
    tasks.remove(w)
    expect(count('id IN (?, ?)', d, w)).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_steps').get()).toEqual({ n: 0 })

    const d2 = tasks.create({ type: 'daily', title: 'Two', date: TODAY })
    tasks.remove(d2)
    expect(count("type = 'weekly'")).toBe(1)
    expect(tasks.listDaily(TODAY)).toEqual([])
  })

  it('"stop repeating" keeps this week; a narrower mask drops the unfinished days it no longer covers', () => {
    const id = tasks.create({ type: 'daily', title: 'Read', date: TODAY, repeatDays: ALL_DAYS })
    tasks.update(id, { repeatUntil: SUN })
    expect(count('parent_task_id = ?', id)).toBe(DAYS_LEFT)
    expect(tasks.listDailyRange(addDays(SUN, 1), addDays(SUN, 8))).toEqual([]) // no projection
    // Only Sundays from now on: every other remaining day goes, Sunday stays.
    tasks.update(id, { repeatDays: 64, title: 'Read more' })
    const left = db.prepare('SELECT date, title FROM tasks WHERE parent_task_id = ?').all(id)
    expect(left).toEqual([{ date: SUN, title: 'Read more' }])
  })

  it('moving a single-entry daily takes a lone weekly mirror into the new week', () => {
    const nextWeekDay = addDays(MON, 8) // next Tuesday
    const lone = tasks.create({
      type: 'daily',
      title: 'Lone',
      date: TODAY,
      dueDate: TODAY + 9 * 3600
    })
    const loneParent = tasks.listWeekly(MON)[0].id
    tasks.update(lone, { date: nextWeekDay })
    expect(tasks.listDaily(nextWeekDay)[0]).toMatchObject({
      id: lone,
      dueDate: nextWeekDay + 9 * 3600
    })
    expect(tasks.listWeekly(MON)).toEqual([])
    expect(tasks.listWeekly(addDays(MON, 7))).toEqual([expect.objectContaining({ id: loneParent })])

    // A parent with another daily stays in its week; a series day does not move at all.
    const shared = tasks.create({ type: 'daily', title: 'Shared', date: TODAY })
    const sharedParent = tasks.listWeekly(MON)[0].id
    tasks.addToDaily(sharedParent, addDays(TODAY, 1))
    tasks.update(shared, { date: nextWeekDay })
    expect(tasks.listWeekly(MON).map((w) => w.id)).toEqual([sharedParent])
    const series = tasks.create({
      type: 'daily',
      title: 'Series',
      date: TODAY,
      repeatDays: ALL_DAYS
    })
    const day = tasks.listDaily(TODAY).find((t) => t.parentTaskId === series)!
    tasks.update(day.id!, { date: nextWeekDay })
    expect(tasks.listDaily(TODAY).some((t) => t.id === day.id)).toBe(true)
  })

  it('projects next week for an active series, read-only', () => {
    const id = tasks.create({ type: 'daily', title: 'Plan', date: TODAY, repeatDays: 1 | 64 })
    const nextMon = addDays(MON, 7)
    const rows = tasks.listDailyRange(nextMon, addDays(nextMon, 7))
    expect(rows).toEqual([
      expect.objectContaining({ id: null, projected: true, date: nextMon, parentTaskId: id }),
      expect.objectContaining({ id: null, projected: true, date: addDays(nextMon, 6) })
    ])
  })

  it('steps can be added, synced by id, and removed', () => {
    const d = tasks.create({ type: 'daily', title: 'Steps', date: TODAY, steps: [{ text: 'a' }] })
    const a = tasks.get(d)!.steps[0]
    tasks.toggleStep(a.id)
    tasks.addStep(d, 'b', 15)
    tasks.update(d, { steps: [{ id: a.id, text: 'a2' }, { text: 'c' }] })
    const after = tasks.get(d)!.steps
    expect(after.map((s) => [s.text, s.completed])).toEqual([
      ['a2', true],
      ['c', false]
    ])
    expect(after.find((s) => s.text === 'b')).toBeUndefined() // not in the synced list: deleted
    tasks.removeStep(after[1].id)
    expect(tasks.get(d)!.steps).toHaveLength(1)
  })

  // ---- regressions from the Phase 0 code review ----

  it('clearing a series category clears it on its days too', () => {
    const id = tasks.create({
      type: 'daily',
      title: 'Cat',
      date: TODAY,
      category: 'work',
      repeatDays: ALL_DAYS
    })
    tasks.update(id, { category: null })
    expect(tasks.listWeekly(MON)[0].category).toBeNull()
    expect(tasks.listDaily(TODAY)[0].category).toBeNull()
  })

  it('a series day cannot be deleted on its own', () => {
    const id = tasks.create({ type: 'daily', title: 'Day', date: TODAY, repeatDays: ALL_DAYS })
    const day = tasks.listDaily(TODAY).find((t) => t.parentTaskId === id)!
    expect(() => tasks.remove(day.id!)).toThrow('Series days are managed by the series')
    expect(count('id = ?', day.id)).toBe(1)
  })

  it('deleting a ticked daily reopens its weekly so it carries over', async () => {
    const routine = await import('../routine')
    const d = tasks.create({ type: 'daily', title: 'Undo', date: TODAY })
    const w = tasks.listWeekly(MON)[0].id
    tasks.toggleComplete(d)
    expect(tasks.listWeekly(MON)[0].completed).toBe(true)
    tasks.remove(d)
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ completed: false, doneCount: 0 })
    const nextMon = addDays(MON, 7)
    routine.runDailyRoutine(nextMon)
    expect(tasks.listWeekly(nextMon)).toEqual([expect.objectContaining({ title: 'Undo' })])
    expect(db.prepare('SELECT carried_from FROM tasks WHERE week_start = ?').get(nextMon)).toEqual({
      carried_from: w
    })
  })

  it('a series starts in the week of its first occurrence, never in the past', () => {
    // Only yesterday's weekday: the first occurrence is six days from today (maybe next week).
    const next = addDays(TODAY, 6)
    const id = tasks.create({
      type: 'daily',
      title: 'Weekly',
      date: TODAY,
      repeatDays: weekdayBit(next)
    })
    expect(db.prepare('SELECT week_start FROM tasks WHERE id = ?').get(id)).toEqual({
      week_start: weekStartMonday(next)
    })
    expect(tasks.listWeekly(weekStartMonday(next)).find((t) => t.id === id)).toMatchObject({
      target: 1,
      startsOn: next
    })
    expect(count('parent_task_id = ?', id)).toBe(weekStartMonday(next) === MON ? 1 : 0)

    // A back-dated daily series starts today: this week, today..Sunday generated.
    const id2 = tasks.create({
      type: 'daily',
      title: 'Back',
      date: addDays(TODAY, -7),
      repeatDays: ALL_DAYS
    })
    expect(tasks.listWeekly(MON).find((t) => t.id === id2)).toMatchObject({
      target: DAYS_LEFT,
      startsOn: TODAY
    })
    expect(count('parent_task_id = ?', id2)).toBe(DAYS_LEFT)
  })

  it('a series weekly is never ticked directly, and 0 of 0 is not done', () => {
    const id = db
      .prepare(
        `INSERT INTO tasks (type, week_start, date, title, repeat_days, repeat_until)
         VALUES ('weekly', ?, ?, 'Ended', ?, ?)`
      )
      .run(MON, MON, ALL_DAYS, addDays(MON, -1)).lastInsertRowid as number
    expect(tasks.listWeekly(MON)[0].target).toBe(0)
    expect(() => tasks.toggleComplete(id)).toThrow('Recurring tasks complete through their days')
    const d = db
      .prepare(
        "INSERT INTO tasks (type, date, parent_task_id, title) VALUES ('daily', ?, ?, 'Ended')"
      )
      .run(TODAY, id).lastInsertRowid as number
    tasks.toggleComplete(d)
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ completed: false, doneCount: 1 })
  })
})
