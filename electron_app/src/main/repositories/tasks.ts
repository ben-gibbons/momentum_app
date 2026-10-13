// repositories/tasks.ts
// All task + task-step queries. Maps the tasks/task_steps tables to the renderer DTOs, and holds
// the SQL the daily routine (routine.ts) runs — carry-over, series continuation, risk-factor
// series, and generating a series' daily rows — so no SQL lives outside repositories/.
//
// Model (V1 item 5; docs/database-overview.md, plan decisions D1–D5, D9, D13, D15):
//   - Every daily row has a weekly parent. A single-entry daily auto-creates a weekly mirror in
//     its week so the weekly list is complete. A weekly row with repeat_days != 0 is a *series*:
//     its dailies are generated for the masked weekdays (this week only; later weeks are
//     projected read-only until the routine creates them). The series row's `date` is the day it
//     started (A2) and its steps are the template copied onto each generated daily (A9).
//   - Completion lives on every daily row (D3). A weekly shows doneCount / target and is
//     auto-completed when the count is reached; a target-1 weekly can be ticked directly and
//     mirrors onto its daily.
//   - carried_from links a copy to the row it was carried (D1/D5) or continued (series, next
//     week) from; repeat_days != 0 tells the two apart (A1).
import { getDb } from '../db'
import type {
  Category,
  DailyTask,
  TaskDetail,
  TaskInput,
  TaskPatch,
  TaskStep,
  TaskStepInput,
  WeeklyTask
} from '../../shared/types'
import { formatDue, nowSecs, startOfDay, weekStartMonday } from './util'
import { addDays, weekdayBit } from '../../shared/dates'
import {
  ALL_DAYS,
  carryCandidates,
  daysToGenerate,
  isRecurring,
  projectedDays,
  seriesDays,
  targetForWeek,
  type SeriesRow
} from '../recurrence'

// A full tasks row as stored.
interface TaskRow {
  id: number
  type: 'weekly' | 'daily'
  week_start: number | null
  date: number | null
  parent_task_id: number | null
  title: string
  category: Category | null
  due_date: number | null
  reminder_time: number | null
  completed: number
  completed_at: number | null
  repeat_days: number
  repeat_until: number | null
  carried_from: number | null
  risk_factor_id: number | null
}

// A daily row joined to its parent's series fields (LEFT JOIN: a parent-less row still lists).
interface DailyRow extends TaskRow {
  parent_repeat_days: number | null
  parent_risk_factor_id: number | null
  factor: string | null
  carried_to: number | null
}

interface WeeklyRow extends TaskRow {
  factor: string | null
  done_count: number
  carried: number
}

interface StepRow {
  id: number
  task_id: number
  text: string
  est_minutes: number | null
  completed: number
}

// Columns a new row can set; everything omitted is NULL / 0.
interface NewRow {
  type: 'weekly' | 'daily'
  week_start?: number | null
  date?: number | null
  parent_task_id?: number | null
  title: string
  category?: Category | null
  due_date?: number | null
  reminder_time?: number | null
  repeat_days?: number
  repeat_until?: number | null
  carried_from?: number | null
  risk_factor_id?: number | null
}

const TASK_COLS = `id, type, week_start, date, parent_task_id, title, category, due_date,
  reminder_time, completed, completed_at, repeat_days, repeat_until, carried_from, risk_factor_id`

const DAILY_SELECT = `
  SELECT t.*, p.repeat_days AS parent_repeat_days, p.risk_factor_id AS parent_risk_factor_id,
         rf.factor,
         (SELECT MIN(c.date) FROM tasks c WHERE c.carried_from = t.id) AS carried_to
  FROM tasks t
  LEFT JOIN tasks p ON p.id = t.parent_task_id
  LEFT JOIN risk_factors rf ON rf.id = p.risk_factor_id`

// ---- helpers ----

// ts's local time of day on another day (null passes through). Done through Date so a due time
// keeps reading "4:00 PM" across a DST change rather than drifting an hour.
function atTimeOf(ts: number | null, dayStart: number): number | null {
  if (ts == null) return null
  const src = new Date(ts * 1000)
  const d = new Date(dayStart * 1000)
  d.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), 0)
  return Math.floor(d.getTime() / 1000)
}

function seriesOf(r: TaskRow): SeriesRow {
  return {
    id: r.id,
    weekStart: r.week_start ?? weekStartMonday(r.date ?? undefined),
    startsOn: r.date,
    repeatDays: r.repeat_days,
    repeatUntil: r.repeat_until
  }
}

function getRow(id: number): TaskRow | undefined {
  return getDb().prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined
}

function insertRow(r: NewRow): number {
  const result = getDb()
    .prepare(
      `INSERT INTO tasks (type, week_start, date, parent_task_id, title, category, due_date,
                          reminder_time, repeat_days, repeat_until, carried_from, risk_factor_id)
       VALUES (@type, @week_start, @date, @parent_task_id, @title, @category, @due_date,
               @reminder_time, @repeat_days, @repeat_until, @carried_from, @risk_factor_id)`
    )
    .run({
      type: r.type,
      week_start: r.week_start ?? null,
      date: r.date ?? null,
      parent_task_id: r.parent_task_id ?? null,
      title: r.title,
      category: r.category ?? null,
      due_date: r.due_date ?? null,
      reminder_time: r.reminder_time ?? null,
      repeat_days: r.repeat_days ?? 0,
      repeat_until: r.repeat_until ?? null,
      carried_from: r.carried_from ?? null,
      risk_factor_id: r.risk_factor_id ?? null
    })
  return result.lastInsertRowid as number
}

function insertSteps(taskId: number, steps: TaskStepInput[]): void {
  const ins = getDb().prepare(
    'INSERT INTO task_steps (task_id, ordinal, text, est_minutes) VALUES (?, ?, ?, ?)'
  )
  steps.forEach((s, i) => ins.run(taskId, i + 1, s.text, s.estMinutes ?? null))
}

// Copy one task's steps onto another; keepState carries each step's completion (a carried
// task keeps its progress), otherwise the copy starts fresh (a generated series day).
function copySteps(fromId: number, toId: number, keepState: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO task_steps (task_id, ordinal, text, est_minutes, completed, completed_at)
       SELECT ?, ordinal, text, est_minutes,
              ${keepState ? 'completed, completed_at' : '0, NULL'}
       FROM task_steps WHERE task_id = ? ORDER BY ordinal`
    )
    .run(toId, fromId)
}

// Delete task rows with their steps. No FK has ON DELETE, so a copy's carried_from link to a
// deleted row is cleared first (the copy stays; it just no longer points at history).
function deleteRows(ids: number[]): void {
  if (ids.length === 0) return
  const ph = ids.map(() => '?').join(',')
  const db = getDb()
  db.prepare(`DELETE FROM task_steps WHERE task_id IN (${ph})`).run(...ids)
  db.prepare(`UPDATE tasks SET carried_from = NULL WHERE carried_from IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).run(...ids)
}

// Load steps for a set of task ids, grouped by task_id, with isNext computed
// (first incomplete step by ordinal within each task).
function loadSteps(taskIds: number[]): Map<number, TaskStep[]> {
  const grouped = new Map<number, TaskStep[]>()
  if (taskIds.length === 0) return grouped

  const placeholders = taskIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT id, task_id, text, est_minutes, completed
       FROM task_steps WHERE task_id IN (${placeholders}) ORDER BY task_id, ordinal`
    )
    .all(...taskIds) as StepRow[]

  for (const r of rows) {
    const list = grouped.get(r.task_id) ?? []
    list.push({
      id: r.id,
      text: r.text,
      estMinutes: r.est_minutes,
      completed: !!r.completed,
      isNext: false
    })
    grouped.set(r.task_id, list)
  }
  // Mark the first incomplete step in each task as the "next" step.
  for (const steps of grouped.values()) {
    const next = steps.find((s) => !s.completed)
    if (next) next.isNext = true
  }
  return grouped
}

function toDaily(rows: DailyRow[]): DailyTask[] {
  const steps = loadSteps(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    date: r.date ?? 0,
    due: formatDue(r.due_date),
    dueDate: r.due_date,
    reminderTime: r.reminder_time,
    completed: !!r.completed,
    steps: steps.get(r.id) ?? [],
    parentTaskId: r.parent_task_id,
    recurring: isRecurring(r.parent_repeat_days ?? 0),
    riskFactor: r.factor,
    carried: r.carried_to != null,
    carriedTo: r.carried_to,
    carriedFrom: r.carried_from,
    projected: false
  }))
}

// ---- reads ----

export function listDaily(date: number = startOfDay()): DailyTask[] {
  const rows = getDb()
    .prepare(
      `${DAILY_SELECT}
       WHERE t.type = 'daily' AND t.date = ?
       ORDER BY t.due_date IS NULL, t.due_date, t.id`
    )
    .all(startOfDay(date)) as DailyRow[]
  return toDaily(rows)
}

// Daily rows with from <= date < to, followed by projected occurrences (D15): for every active
// series, the masked days in the weeks after its latest weekly row, as read-only rows with no
// id. Only days from today on are projected — a week the routine never ran for (app closed) has
// no rows and stays empty rather than showing phantom occurrences in the past.
export function listDailyRange(from: number, to: number): DailyTask[] {
  const db = getDb()
  const rows = db
    .prepare(
      `${DAILY_SELECT}
       WHERE t.type = 'daily' AND t.date >= ? AND t.date < ?
       ORDER BY t.date, t.due_date IS NULL, t.due_date, t.id`
    )
    .all(from, to) as DailyRow[]
  const real = toDaily(rows)

  // Latest row of each series = a series row no later weekly row continues from.
  const latest = db
    .prepare(
      `SELECT w.*, rf.factor FROM tasks w
       LEFT JOIN risk_factors rf ON rf.id = w.risk_factor_id
       WHERE w.type = 'weekly' AND w.repeat_days != 0 AND w.week_start < ?
         AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = w.id AND c.type = 'weekly')
       ORDER BY w.id`
    )
    .all(to) as (TaskRow & { factor: string | null })[]
  const projectFrom = Math.max(from, startOfDay())
  const projected: DailyTask[] = []
  for (const w of latest) {
    for (const day of projectedDays(seriesOf(w), projectFrom, to)) {
      projected.push({
        id: null,
        title: w.title,
        category: w.category,
        date: day,
        due: formatDue(w.due_date),
        dueDate: atTimeOf(w.due_date, day),
        reminderTime: null,
        completed: false,
        steps: [],
        parentTaskId: w.id,
        recurring: true,
        riskFactor: w.factor,
        carried: false,
        carriedTo: null,
        carriedFrom: null,
        projected: true
      })
    }
  }
  return real.concat(projected)
}

export function listWeekly(weekStart: number = weekStartMonday()): WeeklyTask[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*, rf.factor,
              (SELECT COUNT(*) FROM tasks d WHERE d.parent_task_id = w.id AND d.completed = 1)
                AS done_count,
              EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = w.id) AS carried
       FROM tasks w
       LEFT JOIN risk_factors rf ON rf.id = w.risk_factor_id
       WHERE w.type = 'weekly' AND w.week_start = ? ORDER BY w.id`
    )
    .all(weekStartMonday(weekStart)) as WeeklyRow[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    completed: !!r.completed,
    doneCount: r.done_count,
    target: targetForWeek(seriesOf(r)),
    repeatDays: r.repeat_days,
    repeatUntil: r.repeat_until,
    startsOn: r.date,
    riskFactor: r.factor,
    // A series' next-week row also uses carried_from (continuation), which is not a carry-over.
    carried: !!r.carried && !isRecurring(r.repeat_days)
  }))
}

export function get(taskId: number): TaskDetail | null {
  const row = getRow(taskId)
  if (!row) return null
  // A daily reports its parent's repeat fields so the dialog knows it belongs to a series.
  const series =
    row.type === 'daily' && row.parent_task_id != null ? getRow(row.parent_task_id) : row
  const riskFactorId = series?.risk_factor_id ?? null
  const factor =
    riskFactorId == null
      ? null
      : ((
          getDb().prepare('SELECT factor FROM risk_factors WHERE id = ?').get(riskFactorId) as
            | { factor: string }
            | undefined
        )?.factor ?? null)
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    weekStart: row.week_start,
    date: row.date,
    dueDate: row.due_date,
    reminderTime: row.reminder_time,
    completed: !!row.completed,
    parentTaskId: row.parent_task_id,
    repeatDays: series?.repeat_days ?? 0,
    repeatUntil: series?.repeat_until ?? null,
    startsOn: series?.date ?? null,
    riskFactor: factor,
    carriedFrom: row.carried_from,
    steps: loadSteps([row.id]).get(row.id) ?? []
  }
}

// ---- writes ----

// Create a task in one transaction. A non-zero repeatDays creates a series: the weekly row (its
// steps are the template) plus this week's daily rows from `date` on; returns the weekly id.
// Otherwise a daily (with an auto-created weekly mirror when no parent is given) or a plain
// weekly; returns the created row's id.
export function create(input: TaskInput): number {
  return getDb().transaction(() => {
    const steps = input.steps ?? []
    if (isRecurring(input.repeatDays ?? 0)) {
      const today = startOfDay()
      // The series starts on its first real occurrence: the first masked day on or after the
      // dialog date, never in the past (a back-dated start would count days that can't be done).
      // The weekly row goes in that day's week so a series created on Saturday for Mon–Fri shows
      // up next week with target 5 instead of an empty row this week.
      const from = Math.max(startOfDay(input.date ?? undefined), today)
      let date = from
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i)
        if (input.repeatDays! & weekdayBit(d)) {
          date = d
          break
        }
      }
      const id = insertRow({
        type: 'weekly',
        week_start: weekStartMonday(date),
        date,
        title: input.title,
        category: input.category,
        due_date: input.dueDate,
        reminder_time: input.reminderTime,
        repeat_days: input.repeatDays,
        repeat_until: input.repeatUntil
      })
      insertSteps(id, steps)
      generateWeek(id)
      return id
    }

    let parentTaskId = input.parentTaskId ?? null
    // Every daily has a weekly parent so the weekly list is complete: a written-in daily (no
    // parent given) auto-creates a matching weekly in its own week and links to it.
    if (input.type === 'daily' && parentTaskId == null) {
      parentTaskId = insertRow({
        type: 'weekly',
        week_start: weekStartMonday(input.date ?? undefined),
        title: input.title,
        category: input.category
      })
    }
    const id = insertRow({
      type: input.type,
      week_start: input.weekStart,
      date: input.date,
      parent_task_id: parentTaskId,
      title: input.title,
      category: input.category,
      due_date: input.dueDate,
      reminder_time: input.reminderTime
    })
    insertSteps(id, steps)
    return id
  })()
}

// Edit a task in one transaction. Title / category on a weekly also apply to its dailies from
// today on (the same task, one name). `date` moves a single-entry daily. Repeat changes on a
// series drop the unfinished days from today that the new mask / end no longer covers and
// generate any new ones; "Stop repeating" is a patch with repeatUntil = the series week's Sunday.
export function update(taskId: number, patch: TaskPatch): void {
  getDb().transaction(() => {
    const db = getDb()
    const row = getRow(taskId)
    if (!row) throw new Error(`Task ${taskId} not found`)
    const today = startOfDay()

    const sets: string[] = []
    const params: Record<string, unknown> = { id: taskId }
    const field = (col: string, key: keyof TaskPatch): void => {
      if (patch[key] !== undefined) {
        sets.push(`${col} = @${col}`)
        params[col] = patch[key]
      }
    }
    field('title', 'title')
    field('category', 'category')
    field('due_date', 'dueDate')
    field('reminder_time', 'reminderTime')
    if (row.type === 'weekly') {
      field('repeat_days', 'repeatDays')
      field('repeat_until', 'repeatUntil')
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params)
    }

    if (row.type === 'weekly' && (patch.title !== undefined || patch.category !== undefined)) {
      db.prepare(
        `UPDATE tasks SET title = ?, category = ?
         WHERE type = 'daily' AND parent_task_id = ? AND date >= ?`
      ).run(
        patch.title ?? row.title,
        patch.category !== undefined ? patch.category : row.category, // null clears it
        taskId,
        today
      )
    }

    if (patch.steps) syncSteps(taskId, patch.steps)

    // Move a single-entry daily to another day (a series day stays where its mask put it). Due
    // and reminder keep their time of day; a weekly mirror with no other dailies follows into the
    // new day's week so the weekly list stays in step.
    const parent = row.parent_task_id == null ? undefined : getRow(row.parent_task_id)
    if (
      patch.date !== undefined &&
      row.type === 'daily' &&
      !isRecurring(parent?.repeat_days ?? 0)
    ) {
      const newDay = startOfDay(patch.date)
      const current = getRow(taskId)!
      db.prepare('UPDATE tasks SET date = ?, due_date = ?, reminder_time = ? WHERE id = ?').run(
        newDay,
        atTimeOf(current.due_date, newDay),
        atTimeOf(current.reminder_time, newDay),
        taskId
      )
      if (parent) {
        const others = db
          .prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ? AND id != ?')
          .get(parent.id, taskId) as { n: number }
        if (others.n === 0) {
          db.prepare('UPDATE tasks SET week_start = ? WHERE id = ?').run(
            weekStartMonday(newDay),
            parent.id
          )
        }
      }
    }

    const repeatChanged = patch.repeatDays !== undefined || patch.repeatUntil !== undefined
    if (row.type === 'weekly' && repeatChanged) {
      const updated = getRow(taskId)!
      const keep = new Set(seriesDays(seriesOf(updated)))
      const stale = db
        .prepare(
          `SELECT id, date FROM tasks
           WHERE type = 'daily' AND parent_task_id = ? AND completed = 0 AND date >= ?`
        )
        .all(taskId, today) as { id: number; date: number }[]
      deleteRows(stale.filter((d) => !keep.has(d.date)).map((d) => d.id))
      if (isRecurring(updated.repeat_days)) generateWeek(taskId)
    }
  })()
}

// Replace a task's step list: steps with an id are updated in place (keeping their completion),
// new ones are inserted, and existing steps not in the list are deleted.
function syncSteps(taskId: number, steps: TaskStepInput[]): void {
  const db = getDb()
  const keptIds = steps.filter((s) => s.id != null).map((s) => s.id as number)
  const ph = keptIds.map(() => '?').join(',')
  db.prepare(
    `DELETE FROM task_steps WHERE task_id = ?${keptIds.length ? ` AND id NOT IN (${ph})` : ''}`
  ).run(taskId, ...keptIds)
  const upd = db.prepare(
    'UPDATE task_steps SET ordinal = ?, text = ?, est_minutes = ? WHERE id = ? AND task_id = ?'
  )
  const ins = db.prepare(
    'INSERT INTO task_steps (task_id, ordinal, text, est_minutes) VALUES (?, ?, ?, ?)'
  )
  steps.forEach((s, i) => {
    if (s.id != null) upd.run(i + 1, s.text, s.estMinutes ?? null, s.id, taskId)
    else ins.run(taskId, i + 1, s.text, s.estMinutes ?? null)
  })
}

export const SERIES_DAY_MESSAGE =
  'Series days are managed by the series — use Stop repeating or Delete series'

// Delete a task (A5), one transaction. Daily: that row (its weekly recomputes; a series day can't
// be deleted on its own — the series would regenerate it). Single-entry weekly: it and its
// dailies. Series weekly: completed days are history and stay; unfinished days from today go;
// the series ends on the last day that still has a row (today if today's was ticked, else
// yesterday at the latest) so the target recomputes to the days that happened; the row itself
// goes only when no dailies are left. The row it continued from is ended too — no later than the
// day before this row's week — so the routine doesn't pick it up as the series' latest row and
// start it again next Monday.
export function remove(taskId: number): void {
  getDb().transaction(() => {
    const db = getDb()
    const row = getRow(taskId)
    if (!row) return
    if (row.type === 'daily') {
      const parent = row.parent_task_id == null ? undefined : getRow(row.parent_task_id)
      if (parent && isRecurring(parent.repeat_days)) throw new Error(SERIES_DAY_MESSAGE)
      deleteRows([taskId])
      if (parent) recomputeWeekly(parent.id)
      return
    }
    const childIds = (sql: string, ...args: unknown[]): number[] =>
      (db.prepare(sql).all(...args) as { id: number }[]).map((r) => r.id)
    if (!isRecurring(row.repeat_days)) {
      deleteRows(childIds('SELECT id FROM tasks WHERE parent_task_id = ?', taskId))
      deleteRows([taskId])
      return
    }
    const today = startOfDay()
    deleteRows(
      childIds(
        'SELECT id FROM tasks WHERE parent_task_id = ? AND date >= ? AND completed = 0',
        taskId,
        today
      )
    )
    const last = db
      .prepare('SELECT MAX(date) AS d FROM tasks WHERE parent_task_id = ?')
      .get(taskId) as { d: number | null }
    const end = last.d ?? addDays(today, -1)
    const setEnd = db.prepare('UPDATE tasks SET repeat_until = ? WHERE id = ?')
    setEnd.run(end, taskId)
    if (row.carried_from != null) {
      setEnd.run(Math.min(end, addDays(seriesOf(row).weekStart, -1)), row.carried_from)
    }
    if (last.d == null) deleteRows([taskId])
    else recomputeWeekly(taskId)
  })()
}

// Promote a weekly task into today's (or the given day's) daily list.
export function addToDaily(weeklyId: number, date: number = startOfDay()): number {
  const weekly = getDb()
    .prepare("SELECT title, category FROM tasks WHERE id = ? AND type = 'weekly'")
    .get(weeklyId) as { title: string; category: Category | null } | undefined
  if (!weekly) throw new Error(`Weekly task ${weeklyId} not found`)
  return create({
    type: 'daily',
    title: weekly.title,
    category: weekly.category,
    date: startOfDay(date),
    parentTaskId: weeklyId
  })
}

// Weekly completion follows its dailies: done when the completed count reaches the target (a
// target of 0 — a series with no days this week — is never "done").
function recomputeWeekly(weeklyId: number): void {
  const db = getDb()
  const row = getRow(weeklyId)
  if (!row) return
  const done = db
    .prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ? AND completed = 1')
    .get(weeklyId) as { n: number }
  const target = targetForWeek(seriesOf(row))
  const next = target > 0 && done.n >= target ? 1 : 0
  if (next === row.completed) return
  db.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?').run(
    next,
    next ? nowSecs() : null,
    weeklyId
  )
}

function setCompleted(id: number, completed: boolean): void {
  getDb()
    .prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?')
    .run(completed ? 1 : 0, completed ? nowSecs() : null, id)
}

// Daily: flip its own flag, then recompute the parent. Weekly: only a single-entry one (a series
// completes through its days, whatever its target); flips itself and mirrors onto its latest daily.
export function toggleComplete(taskId: number): { completed: boolean } {
  return getDb().transaction(() => {
    const row = getRow(taskId)
    if (!row) throw new Error(`Task ${taskId} not found`)
    const next = !row.completed
    if (row.type === 'daily') {
      setCompleted(taskId, next)
      if (row.parent_task_id != null) recomputeWeekly(row.parent_task_id)
      return { completed: next }
    }
    if (isRecurring(row.repeat_days)) {
      throw new Error('Recurring tasks complete through their days')
    }
    setCompleted(taskId, next)
    const latest = getDb()
      .prepare('SELECT id FROM tasks WHERE parent_task_id = ? ORDER BY date DESC LIMIT 1')
      .get(taskId) as { id: number } | undefined
    if (latest) setCompleted(latest.id, next)
    return { completed: next }
  })()
}

// ---- steps ----

export function addStep(taskId: number, text: string, estMinutes?: number | null): number {
  const result = getDb()
    .prepare(
      `INSERT INTO task_steps (task_id, ordinal, text, est_minutes)
       VALUES (?, (SELECT COALESCE(MAX(ordinal), 0) + 1 FROM task_steps WHERE task_id = ?), ?, ?)`
    )
    .run(taskId, taskId, text, estMinutes ?? null)
  return result.lastInsertRowid as number
}

export function removeStep(stepId: number): void {
  getDb().prepare('DELETE FROM task_steps WHERE id = ?').run(stepId)
}

export function toggleStep(stepId: number): { completed: boolean } {
  const db = getDb()
  const step = db.prepare('SELECT completed FROM task_steps WHERE id = ?').get(stepId) as
    | { completed: number }
    | undefined
  if (!step) throw new Error(`Task step ${stepId} not found`)
  const next = step.completed ? 0 : 1
  db.prepare('UPDATE task_steps SET completed = ?, completed_at = ? WHERE id = ?').run(
    next,
    next ? nowSecs() : null,
    stepId
  )
  return { completed: !!next }
}

// ---- series generation + the daily routine's steps (routine.ts) ----

// Create the daily rows a series still owes this week: every occurrence from today to Sunday
// that has no (parent, date) row yet, with the due / reminder time of day on that date and a
// fresh copy of the series' template steps. Idempotent.
export function generateWeek(weeklyId: number, today: number = startOfDay()): void {
  const db = getDb()
  const w = getRow(weeklyId)
  if (!w || !isRecurring(w.repeat_days)) return
  const exists = db.prepare(
    "SELECT 1 FROM tasks WHERE type = 'daily' AND parent_task_id = ? AND date = ?"
  )
  for (const day of daysToGenerate(seriesOf(w), today)) {
    if (exists.get(weeklyId, day)) continue
    const id = insertRow({
      type: 'daily',
      date: day,
      parent_task_id: weeklyId,
      title: w.title,
      category: w.category,
      due_date: atTimeOf(w.due_date, day),
      reminder_time: atTimeOf(w.reminder_time, day)
    })
    copySteps(weeklyId, id, false)
  }
}

// Routine step 1a: every active series whose latest weekly row is in an earlier week gets a
// weekly row for thisWeek, linked by carried_from and carrying the template steps.
export function continueSeries(thisWeek: number): void {
  const rows = getDb()
    .prepare(
      `SELECT ${TASK_COLS} FROM tasks w
       WHERE type = 'weekly' AND repeat_days != 0 AND week_start < ?
         AND (repeat_until IS NULL OR repeat_until >= ?)
         AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = w.id AND c.type = 'weekly')
       ORDER BY id`
    )
    .all(thisWeek, thisWeek) as TaskRow[]
  for (const w of rows) {
    const id = insertRow({
      type: 'weekly',
      week_start: thisWeek,
      title: w.title,
      category: w.category,
      due_date: w.due_date,
      reminder_time: w.reminder_time,
      repeat_days: w.repeat_days,
      repeat_until: w.repeat_until,
      risk_factor_id: w.risk_factor_id,
      carried_from: w.id
    })
    copySteps(w.id, id, false)
  }
}

// Routine step 1b (D9): a selected risk factor still within its recur window becomes a daily
// series for thisWeek (starting today, ending on recur_until). One series per factor *label*:
// a week that already has a risk-factor series with that title keeps it, re-pointed at this
// risk_factors row with its end extended to the row's recur_until (re-selecting a factor extends
// its window, see riskFactors.select()).
export function ensureRiskFactorSeries(today: number, thisWeek: number): void {
  const db = getDb()
  const factors = db
    .prepare('SELECT id, factor, recur_until FROM risk_factors WHERE recur_until >= ? ORDER BY id')
    .all(today) as { id: number; factor: string; recur_until: number }[]
  const existing = db.prepare(
    `SELECT id FROM tasks
     WHERE type = 'weekly' AND week_start = ? AND risk_factor_id IS NOT NULL AND title = ?`
  )
  const extend = db.prepare('UPDATE tasks SET risk_factor_id = ?, repeat_until = ? WHERE id = ?')
  for (const f of factors) {
    const series = existing.get(thisWeek, f.factor) as { id: number } | undefined
    if (series) {
      extend.run(f.id, startOfDay(f.recur_until), series.id)
      continue
    }
    insertRow({
      type: 'weekly',
      week_start: thisWeek,
      date: today,
      title: f.factor,
      repeat_days: ALL_DAYS,
      repeat_until: startOfDay(f.recur_until),
      risk_factor_id: f.id
    })
  }
}

// Routine step 2 (D5): incomplete single-entry weeklies from earlier weeks that have no copy yet
// are copied into thisWeek (same weekday + time for a due date; steps keep their state).
export function carryWeeklies(thisWeek: number): void {
  const rows = getDb()
    .prepare(
      `SELECT ${TASK_COLS} FROM tasks w
       WHERE type = 'weekly' AND completed = 0 AND repeat_days = 0 AND risk_factor_id IS NULL
         AND week_start < ?
         AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = w.id)
       ORDER BY id`
    )
    .all(thisWeek) as TaskRow[]
  for (const w of rows) {
    const dueDay =
      w.due_date == null || w.week_start == null
        ? null
        : addDays(thisWeek, Math.round((startOfDay(w.due_date) - w.week_start) / 86400) % 7)
    const id = insertRow({
      type: 'weekly',
      week_start: thisWeek,
      title: w.title,
      category: w.category,
      due_date: dueDay == null ? null : atTimeOf(w.due_date, dueDay),
      carried_from: w.id
    })
    copySteps(w.id, id, true)
  }
}

// Routine step 3 (D1, A4): incomplete single-entry dailies from any past date with no copy yet
// are copied to today — due time kept, reminder dropped, steps with their state — under this
// week's copy of their weekly when it was carried, else their original parent.
export function carryDailies(today: number, thisWeek: number): void {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT t.*, COALESCE(p.repeat_days, 0) AS repeat_days_p, p.risk_factor_id AS rf_p,
              EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = t.id) AS carried
       FROM tasks t LEFT JOIN tasks p ON p.id = t.parent_task_id
       WHERE t.type = 'daily' AND t.date < ? AND t.completed = 0
       ORDER BY t.date, t.id`
    )
    .all(today) as (TaskRow & { repeat_days_p: number; rf_p: number | null; carried: number })[]
  const candidates = carryCandidates(
    rows.map((r) => ({
      row: r,
      date: r.date,
      completed: !!r.completed,
      repeatDays: r.repeat_days_p,
      riskFactorId: r.rf_p,
      carried: !!r.carried
    })),
    today
  )
  const copyOfParent = db.prepare(
    "SELECT id FROM tasks WHERE type = 'weekly' AND carried_from = ? AND week_start = ?"
  )
  for (const { row } of candidates) {
    const parentCopy =
      row.parent_task_id == null
        ? undefined
        : (copyOfParent.get(row.parent_task_id, thisWeek) as { id: number } | undefined)
    const id = insertRow({
      type: 'daily',
      date: today,
      parent_task_id: parentCopy?.id ?? row.parent_task_id,
      title: row.title,
      category: row.category,
      due_date: atTimeOf(row.due_date, today),
      carried_from: row.id
    })
    copySteps(row.id, id, true)
  }
}

// Routine step 4: generate today's (and the rest of this week's) days for every series row in
// this week — including the risk-factor series just created.
export function generateThisWeek(today: number, thisWeek: number): void {
  const ids = getDb()
    .prepare("SELECT id FROM tasks WHERE type = 'weekly' AND week_start = ? AND repeat_days != 0")
    .all(thisWeek) as { id: number }[]
  for (const { id } of ids) generateWeek(id, today)
}

// ---- reminders (reminders.ts) ----

export interface ReminderRow {
  id: number
  title: string
  reminder_time: number
  date: number | null
  week_start: number | null
}

// Series rows are excluded: their reminder_time is the template that generateWeek() copies onto
// each day's daily, which is the row that fires.
const REMINDER_WHERE = 'completed = 0 AND repeat_days = 0'

// The next unfired reminder after `after`, or undefined.
export function nextReminder(after: number): ReminderRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, title, reminder_time, date, week_start FROM tasks
       WHERE reminder_time > ? AND ${REMINDER_WHERE} ORDER BY reminder_time LIMIT 1`
    )
    .get(after) as ReminderRow | undefined
}

// Reminders that came due in (after, until] on unfinished tasks.
export function dueReminders(after: number, until: number): ReminderRow[] {
  return getDb()
    .prepare(
      `SELECT id, title, reminder_time, date, week_start FROM tasks
       WHERE reminder_time > ? AND reminder_time <= ? AND ${REMINDER_WHERE} ORDER BY reminder_time`
    )
    .all(after, until) as ReminderRow[]
}
