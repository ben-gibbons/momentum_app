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
      `DELETE FROM task_steps; DELETE FROM tasks; DELETE FROM risk_factors; DELETE FROM settings;
       DELETE FROM risk_factor_catalog; DELETE FROM procrastination_logs`
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

  it('deleting a series keeps ticked days as a plain done task and drops everything else', () => {
    const id = tasks.create({ type: 'daily', title: 'Run', date: TODAY, repeatDays: ALL_DAYS })
    const today = tasks.listDaily(TODAY)[0]
    tasks.toggleComplete(today.id!)
    tasks.remove(id)
    expect(count('parent_task_id = ?', id)).toBe(1)
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({ id, repeatDays: 0, repeatUntil: null, completed: true })
    ])
    expect(tasks.listDaily(TODAY)).toEqual([
      expect.objectContaining({ id: today.id, completed: true, recurring: false })
    ])
    // Nothing ticked: the row goes too.
    const id2 = tasks.create({ type: 'daily', title: 'Swim', date: TODAY, repeatDays: ALL_DAYS })
    tasks.remove(id2)
    expect(count('id = ?', id2)).toBe(0)
    expect(count('parent_task_id = ?', id2)).toBe(0)
  })

  it('deleting a single-entry weekly removes its daily and steps; deleting the daily removes its mirror', () => {
    const d = tasks.create({ type: 'daily', title: 'One', date: TODAY, steps: [{ text: 'a' }] })
    const w = tasks.listWeekly(MON)[0].id
    tasks.remove(w)
    expect(count('id IN (?, ?)', d, w)).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_steps').get()).toEqual({ n: 0 })

    // The mirror is the same task: with its only day gone it leaves the weekly list too.
    const d2 = tasks.create({ type: 'daily', title: 'Two', date: TODAY })
    tasks.remove(d2)
    expect(count("type = 'weekly'")).toBe(0)
    expect(tasks.listDaily(TODAY)).toEqual([])
    // A task has one day: a second is refused (it is moved from its dialog instead).
    tasks.create({ type: 'daily', title: 'Three', date: TODAY })
    const w3 = tasks.listWeekly(MON)[0]
    expect(w3.scheduled).toBe(true)
    expect(() => tasks.addToDaily(w3.id, addDays(TODAY, 1))).toThrow(/already has a day/)
  })

  it('deleting a carried-over copy deletes its original too, so it is not carried again', async () => {
    const routine = await import('../routine')
    const yesterday = addDays(TODAY, -1)
    const old = tasks.create({ type: 'daily', title: 'Old', date: yesterday })
    routine.runDailyRoutine(TODAY)
    const copy = tasks.listDaily(TODAY)[0]
    expect(copy).toMatchObject({ title: 'Old', carriedFrom: old })
    // The carried original is superseded: it neither blocks nor counts toward its weekly.
    tasks.toggleComplete(copy.id!)
    expect(tasks.listWeekly(MON)).toEqual([expect.objectContaining({ completed: true })])
    tasks.toggleComplete(copy.id!)

    tasks.remove(copy.id!)
    expect(count("type = 'daily'")).toBe(0)
    expect(count("type = 'weekly'")).toBe(0)
    db.exec("DELETE FROM settings WHERE key = 'last_routine_day'")
    routine.runDailyRoutine(TODAY)
    expect(tasks.listDaily(TODAY)).toEqual([])
  })

  it('an end date this Sunday keeps this week; a narrower mask drops the unfinished days it no longer covers', () => {
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
  })

  it('moving a day of a series leaves its slot superseded and the copy counts for the week', () => {
    const series = tasks.create({
      type: 'daily',
      title: 'Series',
      date: TODAY,
      repeatDays: ALL_DAYS
    })
    const day = tasks.listDaily(TODAY).find((t) => t.parentTaskId === series)!
    const target = addDays(SUN, 3) // next Wednesday: outside this week, so clearly the user's day
    tasks.update(day.id!, { date: target, steps: [{ text: 'warm up' }] })
    // The old row stays as the slot (so the series neither regenerates nor counts it)…
    expect(tasks.listDaily(TODAY).find((t) => t.id === day.id)).toMatchObject({
      carried: true,
      carriedTo: target,
      recurring: true
    })
    // …and the copy is the live day, with the steps.
    const moved = tasks.listDaily(target).find((t) => t.parentTaskId === series)!
    expect(moved).toMatchObject({ carriedFrom: day.id, recurring: true })
    expect(moved.steps.map((s) => s.text)).toEqual(['warm up'])
    expect(count('parent_task_id = ?', series)).toBe(DAYS_LEFT + 1)
    // A series edit neither regenerates the slot nor prunes the moved day.
    tasks.update(series, { repeatUntil: SUN })
    expect(count('parent_task_id = ?', series)).toBe(DAYS_LEFT + 1)
    // Ticking the moved day (and the rest of the week) completes the week.
    tasks.toggleComplete(moved.id!)
    expect(tasks.listWeekly(MON).find((t) => t.id === series)).toMatchObject({ doneCount: 1 })
    for (const t of tasks.listDailyRange(addDays(TODAY, 1), addDays(SUN, 1))) {
      if (t.parentTaskId === series && t.id != null) tasks.toggleComplete(t.id)
    }
    expect(tasks.listWeekly(MON).find((t) => t.id === series)).toMatchObject({
      doneCount: DAYS_LEFT,
      completed: true
    })
    // Moving it again just moves the copy.
    tasks.update(moved.id!, { date: addDays(target, 1) })
    expect(count('parent_task_id = ?', series)).toBe(DAYS_LEFT + 1)
    expect(tasks.listDaily(addDays(target, 1)).map((t) => t.id)).toEqual([moved.id])
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

  it('deleting a ticked daily takes its weekly with it, so nothing carries over', async () => {
    const routine = await import('../routine')
    const d = tasks.create({ type: 'daily', title: 'Undo', date: TODAY })
    tasks.toggleComplete(d)
    expect(tasks.listWeekly(MON)[0].completed).toBe(true)
    tasks.remove(d)
    expect(tasks.listWeekly(MON)).toEqual([])
    const nextMon = addDays(MON, 7)
    routine.runDailyRoutine(nextMon)
    expect(tasks.listWeekly(nextMon)).toEqual([])
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

  // ---- regressions from the Phase 1 code review (series lifecycle) ----

  // A risk factor selected now (window = today + 14 days), with its catalog entry and the series
  // the routine makes for it.
  async function selectedFactor(label: string): Promise<{ catalogId: number; series: number }> {
    const routine = await import('../routine')
    const catalogId = db
      .prepare('INSERT INTO risk_factor_catalog (label, is_custom) VALUES (?, 0)')
      .run(label).lastInsertRowid as number
    db.prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)').run(
      label,
      TODAY + 3600,
      TODAY + 3600 + 14 * 86400
    )
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(TODAY)
    const series = tasks.listWeekly(MON).find((w) => w.riskFactor === label)!.id
    return { catalogId, series }
  }

  it('a deleted risk-factor series stays deleted on later days', async () => {
    const routine = await import('../routine')
    const { series } = await selectedFactor('Sleep')
    tasks.remove(series)
    for (const day of [addDays(TODAY, 1), addDays(MON, 7)]) {
      db.exec('DELETE FROM settings')
      routine.runDailyRoutine(day)
    }
    expect(count("type = 'weekly' AND risk_factor_id IS NOT NULL")).toBe(0)
    expect(count("type = 'daily' AND date > ?", TODAY)).toBe(0)
  })

  it('re-selecting a stopped risk factor starts a fresh series today', async () => {
    const riskFactors = await import('./riskFactors')
    const { catalogId, series } = await selectedFactor('Water')
    tasks.update(series, { repeatUntil: SUN }) // stop repeating
    riskFactors.select(catalogId, true)
    const rows = tasks.listWeekly(MON).filter((w) => w.riskFactor === 'Water')
    expect(rows).toHaveLength(1)
    // A fresh series (the stopped one, with no history, is gone — SQLite may reuse its id, so
    // the proof is the end date: the window's, not this Sunday).
    expect(rows[0]).toMatchObject({
      startsOn: TODAY,
      target: DAYS_LEFT,
      repeatUntil: startOfDay(Math.floor(Date.now() / 1000) + 14 * 86400)
    })
    expect(count('parent_task_id = ?', rows[0].id)).toBe(DAYS_LEFT)
    expect(count("type = 'weekly'")).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM risk_factors').get()).toEqual({ n: 1 })
  })

  it('a first selection starts the series right away; a deleted one restarts on re-select', async () => {
    const riskFactors = await import('./riskFactors')
    const catalogId = db
      .prepare("INSERT INTO risk_factor_catalog (label, is_custom) VALUES ('Sleep', 0)")
      .run().lastInsertRowid as number
    riskFactors.select(catalogId, true)
    const first = tasks.listWeekly(MON).filter((w) => w.riskFactor === 'Sleep')
    expect(first).toHaveLength(1)
    expect(count('parent_task_id = ?', first[0].id)).toBe(DAYS_LEFT)
    tasks.remove(first[0].id)
    expect(count("type = 'weekly'")).toBe(0)
    // Its recur window is closed, so the routine leaves it deleted…
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM risk_factors WHERE recur_until >= ?').get(TODAY)
    ).toEqual({ n: 0 })
    // …and re-selecting opens a new window with a new series.
    riskFactors.select(catalogId, true)
    expect(tasks.listWeekly(MON).filter((w) => w.riskFactor === 'Sleep')).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM risk_factors').get()).toEqual({ n: 2 })
  })

  it('re-selecting an untouched risk factor extends its series instead', async () => {
    const riskFactors = await import('./riskFactors')
    const { catalogId, series } = await selectedFactor('Food')
    riskFactors.select(catalogId, true)
    const rows = tasks.listWeekly(MON).filter((w) => w.riskFactor === 'Food')
    expect(rows.map((w) => w.id)).toEqual([series])
    expect(rows[0].repeatUntil).toBe(startOfDay(Math.floor(Date.now() / 1000) + 14 * 86400))
    expect(db.prepare('SELECT COUNT(*) AS n FROM risk_factors').get()).toEqual({ n: 1 }) // extended, not added
  })

  it('stopping or deleting an earlier week of a chain reaches the continuation', async () => {
    const routine = await import('../routine')
    const lastMon = addDays(MON, -7)
    const mk = (): number =>
      db
        .prepare(
          "INSERT INTO tasks (type, week_start, date, title, repeat_days) VALUES ('weekly', ?, ?, 'Chain', ?)"
        )
        .run(lastMon, lastMon, ALL_DAYS).lastInsertRowid as number
    // Stop on R1 as of last Sunday: R2's unfinished days go, R2 goes, nothing comes back.
    const r1 = mk()
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(TODAY)
    const r2 = db.prepare('SELECT id FROM tasks WHERE carried_from = ?').get(r1) as { id: number }
    expect(count('parent_task_id = ?', r2.id)).toBe(DAYS_LEFT)
    tasks.update(r1, { repeatUntil: addDays(MON, -1) })
    expect(count('parent_task_id = ?', r2.id)).toBe(0)
    expect(count('id = ?', r2.id)).toBe(0)
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(addDays(TODAY, 1))
    expect(count("type = 'weekly'")).toBe(1)
    expect(count("type = 'daily'")).toBe(0)

    // Delete via R1 after ticking today on R2: the ticked day stays and R2 becomes a plain done
    // task with no link back (R1, with no history, is gone).
    db.exec('DELETE FROM tasks; DELETE FROM settings')
    const r1b = mk()
    routine.runDailyRoutine(TODAY)
    const r2b = (
      db.prepare('SELECT id FROM tasks WHERE carried_from = ?').get(r1b) as { id: number }
    ).id
    tasks.toggleComplete(tasks.listDaily(TODAY)[0].id!)
    tasks.remove(r1b)
    expect(count('parent_task_id = ?', r2b)).toBe(1)
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({
        id: r2b,
        doneCount: 1,
        target: 1,
        completed: true,
        repeatDays: 0,
        repeatUntil: null,
        carried: false
      })
    ])
    expect(count('id = ?', r1b)).toBe(0) // no history of its own: gone
    db.exec('DELETE FROM settings')
    routine.runDailyRoutine(addDays(MON, 7))
    expect(count("type = 'weekly'")).toBe(1)
    expect(count("type = 'daily'")).toBe(1)
  })

  it('renaming a daily renames its single-entry weekly mirror, not a series', () => {
    const d = tasks.create({ type: 'daily', title: 'Old', date: TODAY, category: 'work' })
    tasks.update(d, { title: 'New', category: 'goal' })
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ title: 'New', category: 'goal' })
    const s = tasks.create({ type: 'daily', title: 'Series', date: TODAY, repeatDays: ALL_DAYS })
    const day = tasks.listDaily(TODAY).find((t) => t.parentTaskId === s)!
    tasks.update(day.id!, { title: 'Just today' })
    expect(tasks.get(s)!.title).toBe('Series')
  })

  it('"stop repeating" turns the series into a one-off task: later unfinished days go, today stays', () => {
    const s = tasks.create({ type: 'daily', title: 'Keep', date: TODAY, repeatDays: ALL_DAYS })
    tasks.update(s, { repeatDays: 0, title: 'Kept' })
    expect(db.prepare('SELECT date, title FROM tasks WHERE parent_task_id = ?').all(s)).toEqual([
      { date: TODAY, title: 'Kept' }
    ])
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({ id: s, repeatDays: 0, repeatUntil: null, target: 1 })
    ])
    expect(tasks.listDaily(TODAY)[0].recurring).toBe(false)
    expect(tasks.listDailyRange(addDays(SUN, 1), addDays(SUN, 8))).toEqual([]) // no projection
    // Ticking today now completes it like any single task.
    tasks.toggleComplete(tasks.listDaily(TODAY)[0].id!)
    expect(tasks.listWeekly(MON)[0].completed).toBe(true)
  })

  it('"stop repeating" on an earlier week of a chain closes it and settles the live row', async () => {
    const routine = await import('../routine')
    const s = tasks.create({ type: 'daily', title: 'Chain', date: TODAY, repeatDays: ALL_DAYS })
    const nextMon = addDays(MON, 7)
    routine.runDailyRoutine(nextMon) // continues the series into next week with its days
    expect(tasks.listWeekly(nextMon)).toHaveLength(1)
    tasks.update(s, { repeatDays: 0 })
    // Next week's row had only unfinished future days: it is gone, and this week's row is
    // closed at its Sunday so nothing continues from it.
    expect(tasks.listWeekly(nextMon)).toEqual([])
    expect(tasks.listWeekly(MON)).toEqual([expect.objectContaining({ id: s, repeatUntil: SUN })])
    db.exec("DELETE FROM settings WHERE key = 'last_routine_day'")
    routine.runDailyRoutine(nextMon)
    expect(tasks.listWeekly(nextMon)).toEqual([])
  })

  it('projects a series own week until its days are generated, without duplicates', async () => {
    // Only yesterday's weekday: the first occurrence is six days from today.
    const next = addDays(TODAY, 6)
    const ws = weekStartMonday(next)
    const id = tasks.create({
      type: 'daily',
      title: 'Soon',
      date: TODAY,
      repeatDays: weekdayBit(next)
    })
    const before = tasks.listDailyRange(ws, addDays(ws, 7)).filter((t) => t.parentTaskId === id)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ date: next, projected: ws !== MON })
    // Monday's routine materialises it; the projection then yields to the real row.
    tasks.generateThisWeek(next, ws)
    const after = tasks.listDailyRange(ws, addDays(ws, 7)).filter((t) => t.parentTaskId === id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ date: next, projected: false })
  })

  it('a weekly carried from an earlier week is the one flagged carried', async () => {
    const routine = await import('../routine')
    const lastMon = addDays(MON, -7)
    const old = db
      .prepare("INSERT INTO tasks (type, week_start, title) VALUES ('weekly', ?, 'Old')")
      .run(lastMon).lastInsertRowid as number
    routine.runDailyRoutine(TODAY)
    expect(tasks.listWeekly(lastMon)[0]).toMatchObject({ id: old, carried: false, carriedTo: MON })
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ carried: true, carriedTo: null })
  })

  it('giving a day to a ticked day-less weekly reopens it', () => {
    const w = tasks.create({ type: 'weekly', title: 'Again', weekStart: MON })
    tasks.toggleComplete(w)
    expect(tasks.listWeekly(MON)[0]).toMatchObject({ completed: true, scheduled: false })
    tasks.addToDaily(w, addDays(TODAY, 1))
    expect(tasks.listWeekly(MON)[0]).toMatchObject({
      completed: false,
      doneCount: 0,
      target: 1,
      scheduled: true
    })
  })

  it('get() on a single-entry weekly opens its day; with no day its date is empty', () => {
    const d = tasks.create({ type: 'daily', title: 'Day', date: TODAY, steps: [{ text: 's' }] })
    const w = tasks.listWeekly(MON)[0].id
    // The weekly is only the mirror: editing it is editing the day (id, steps and all).
    expect(tasks.get(w)).toMatchObject({ id: d, type: 'daily', date: TODAY })
    expect(tasks.get(w)!.steps).toHaveLength(1)

    const bare = tasks.create({ type: 'weekly', title: 'Bare', weekStart: MON })
    expect(tasks.get(bare)).toMatchObject({ id: bare, type: 'weekly', date: null })
    // A series reports its start.
    const s = tasks.create({ type: 'daily', title: 'S', date: TODAY, repeatDays: ALL_DAYS })
    expect(tasks.get(s)).toMatchObject({ id: s, type: 'weekly', date: TODAY })
  })

  it('a due date on a single-entry weekly schedules its day, or moves the one it has', () => {
    const w = tasks.create({ type: 'weekly', title: 'Plan', weekStart: MON })
    const nextWeekDay = addDays(MON, 9) // next Wednesday
    tasks.update(w, { date: nextWeekDay })
    // It got a day in that week and followed it there.
    expect(tasks.listDaily(nextWeekDay)).toEqual([
      expect.objectContaining({ title: 'Plan', parentTaskId: w, date: nextWeekDay })
    ])
    expect(tasks.listWeekly(MON)).toEqual([])
    expect(tasks.listWeekly(addDays(MON, 7)).map((t) => t.id)).toEqual([w])
    // Now it has a day: another date moves that day instead of adding one.
    tasks.update(w, { date: TODAY })
    expect(count('parent_task_id = ?', w)).toBe(1)
    expect(tasks.listDaily(TODAY).map((t) => t.parentTaskId)).toEqual([w])
    expect(tasks.listWeekly(MON).map((t) => t.id)).toEqual([w])
  })

  it('a due date on a series moves its start: earlier unfinished days go, the target follows', () => {
    const s = tasks.create({ type: 'daily', title: 'Run', date: TODAY, repeatDays: ALL_DAYS })
    expect(count('parent_task_id = ?', s)).toBe(DAYS_LEFT)
    tasks.toggleComplete(tasks.listDaily(TODAY)[0].id!) // today's day is history and stays
    const later = addDays(TODAY, 2)
    tasks.update(s, { date: later })
    const left = db
      .prepare('SELECT date, completed FROM tasks WHERE parent_task_id = ? ORDER BY date')
      .all(s) as { date: number; completed: number }[]
    expect(left[0]).toEqual({ date: TODAY, completed: 1 })
    expect(left.slice(1).every((d) => d.date >= later && d.completed === 0)).toBe(true)
    // The row sits in the new start's week (next week when the start crossed Sunday).
    expect(tasks.get(s)!.date).toBe(later)
    const week = weekStartMonday(later)
    expect(tasks.listWeekly(week).find((t) => t.id === s)).toMatchObject({
      startsOn: later,
      target: Math.round((addDays(week, 6) - later) / 86400) + 1
    })
    // A back-dated start is clamped to today, like create.
    tasks.update(s, { date: addDays(TODAY, -10) })
    expect(tasks.get(s)!.date).toBe(TODAY)
  })

  it('repeat on a one-off day turns its task into a series from that day', () => {
    const d = tasks.create({ type: 'daily', title: 'Once', date: TODAY, dueDate: TODAY + 3600 })
    const w = tasks.listWeekly(MON)[0].id
    tasks.update(d, { repeatDays: ALL_DAYS, repeatUntil: null })
    expect(tasks.listWeekly(MON)).toEqual([
      expect.objectContaining({ id: w, repeatDays: ALL_DAYS, startsOn: TODAY, target: DAYS_LEFT })
    ])
    // Today's row is the first occurrence (kept, not duplicated); the rest of the week follows.
    expect(count('parent_task_id = ?', w)).toBe(DAYS_LEFT)
    expect(tasks.listDaily(TODAY)).toEqual([expect.objectContaining({ id: d, recurring: true })])
    expect(tasks.get(w)).toMatchObject({ id: w, type: 'weekly', date: TODAY })
    // A day added to a weekly with a due time lands at that time of day.
    const w2 = tasks.create({ type: 'weekly', title: 'Due', weekStart: MON, dueDate: MON + 7200 })
    const d2 = tasks.addToDaily(w2, addDays(MON, 3))
    expect(tasks.get(d2)).toMatchObject({ dueDate: addDays(MON, 3) + 7200 })
  })

  it('"stop repeating" from the dialog (start date sent along) leaves exactly one day', () => {
    const s = tasks.create({ type: 'daily', title: 'Stretch', date: TODAY, repeatDays: ALL_DAYS })
    // The dialog sends the form as a whole: Repeat off plus the (unchanged) start date.
    tasks.update(s, { repeatDays: 0, repeatUntil: null, date: TODAY, title: 'Stretch' })
    expect(db.prepare('SELECT date FROM tasks WHERE parent_task_id = ?').all(s)).toEqual([
      { date: TODAY }
    ])
    expect(tasks.listDaily(TODAY)).toHaveLength(1)
  })

  it('saving a series with its unchanged start (as the dialog does) does not move the start', () => {
    const yesterday = addDays(TODAY, -1)
    const ws = weekStartMonday(yesterday)
    const id = db
      .prepare(
        "INSERT INTO tasks (type, week_start, date, title, repeat_days) VALUES ('weekly', ?, ?, 'Old', ?)"
      )
      .run(ws, yesterday, ALL_DAYS).lastInsertRowid as number
    expect(tasks.get(id)!.date).toBe(yesterday)
    tasks.update(id, { title: 'Older', date: yesterday })
    expect(db.prepare('SELECT date, week_start, title FROM tasks WHERE id = ?').get(id)).toEqual({
      date: yesterday,
      week_start: ws,
      title: 'Older'
    })
    // A changed date still moves it (clamped to today, like create).
    tasks.update(id, { date: addDays(TODAY, -3) })
    expect(tasks.get(id)!.date).toBe(TODAY)
  })

  it('repeat switched on makes the day the template: its time and steps reach every generated day', () => {
    const d = tasks.create({
      type: 'daily',
      title: 'Run',
      date: TODAY,
      dueDate: TODAY + 16 * 3600,
      steps: [{ text: 'laces' }]
    })
    const w = tasks.listWeekly(MON)[0].id
    tasks.update(d, { repeatDays: ALL_DAYS })
    for (const t of tasks.listDailyRange(TODAY, addDays(SUN, 1))) {
      expect(t.dueDate).toBe(t.date + 16 * 3600)
      expect(t.steps.map((s) => s.text)).toEqual(['laces'])
    }
    expect(tasks.get(w)).toMatchObject({ id: w, dueDate: TODAY + 16 * 3600 })
    expect(tasks.get(w)!.steps.map((s) => s.text)).toEqual(['laces'])

    // A mask that leaves out the day's own weekday still keeps the row being edited.
    const d2 = tasks.create({ type: 'daily', title: 'Keep me', date: TODAY })
    const w2 = tasks.listWeekly(MON).find((t) => t.title === 'Keep me')!.id
    tasks.update(d2, { repeatDays: ALL_DAYS & ~weekdayBit(TODAY) })
    expect(count('id = ?', d2)).toBe(1)
    expect(tasks.listWeekly(MON).find((t) => t.id === w2)!.repeatDays).toBe(ALL_DAYS)
  })

  it("editing a series' time or steps reaches this week's unfinished days, not ticked ones", () => {
    const s = tasks.create({
      type: 'daily',
      title: 'Read',
      date: TODAY,
      repeatDays: ALL_DAYS,
      dueDate: TODAY + 16 * 3600,
      steps: [{ text: 'old' }]
    })
    const todayRow = tasks.listDaily(TODAY)[0].id!
    tasks.toggleComplete(todayRow)
    tasks.update(s, { dueDate: TODAY + 17 * 3600, steps: [{ text: 'new' }] })
    for (const t of tasks.listDailyRange(TODAY, addDays(SUN, 1))) {
      const hour = t.id === todayRow ? 16 : 17
      expect(t.dueDate).toBe(t.date + hour * 3600)
      expect(t.steps.map((x) => x.text)).toEqual([t.id === todayRow ? 'old' : 'new'])
    }
  })

  it('"stop repeating" keeps completed days from earlier weeks', async () => {
    const routine = await import('../routine')
    const s = tasks.create({ type: 'daily', title: 'Keep', date: TODAY, repeatDays: ALL_DAYS })
    const todayRow = tasks.listDaily(TODAY)[0].id!
    tasks.toggleComplete(todayRow)
    const nextMon = addDays(MON, 7)
    routine.runDailyRoutine(nextMon)
    const live = tasks.listWeekly(nextMon)[0].id
    tasks.toggleComplete(tasks.listDaily(nextMon)[0].id!)
    tasks.update(live, { repeatDays: 0 })
    // Last week's ticked day and its row are untouched; the live row keeps its ticked Monday.
    expect(db.prepare('SELECT completed FROM tasks WHERE id = ?').get(todayRow)).toEqual({
      completed: 1
    })
    expect(tasks.listWeekly(MON).find((t) => t.id === s)).toMatchObject({ doneCount: 1 })
    expect(tasks.listWeekly(nextMon)).toEqual([
      expect.objectContaining({ id: live, repeatDays: 0, doneCount: 1 })
    ])
  })
})
