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
  created_at: number | null // NULL only on rows older than migration v8's backfill
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
  carried_to: number | null
  scheduled: number // has a live daily
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
  created_at?: number | null // a copy / generated day keeps its source's; default = now
}

const TASK_COLS = `id, type, week_start, date, parent_task_id, title, category, due_date,
  reminder_time, completed, completed_at, repeat_days, repeat_until, carried_from, risk_factor_id,
  created_at`

const DAILY_SELECT = `
  SELECT t.*, p.repeat_days AS parent_repeat_days, p.risk_factor_id AS parent_risk_factor_id,
         rf.factor,
         (SELECT MIN(c.date) FROM tasks c WHERE c.carried_from = t.id) AS carried_to
  FROM tasks t
  LEFT JOIN tasks p ON p.id = t.parent_task_id
  LEFT JOIN risk_factors rf ON rf.id = p.risk_factor_id`

// ---- helpers ----

// A daily `d` that was carried onward (a copy points at it) is superseded by that copy: it is
// neither open nor done for its weekly.
const NOT_CARRIED = 'NOT EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = d.id)'

// ts's local time of day on another day (null passes through). Done through Date so a due time
// keeps reading "4:00 PM" across a DST change rather than drifting an hour.
function atTimeOf(ts: number | null, dayStart: number): number | null {
  if (ts == null) return null
  const src = new Date(ts * 1000)
  const d = new Date(dayStart * 1000)
  d.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), 0)
  return Math.floor(d.getTime() / 1000)
}

// The first masked day on or after `from`, never in the past (a back-dated start would count
// days that can't be done). Used for a series' start on create and when its start is moved.
function firstOccurrence(from: number, mask: number, today: number): number {
  const start = Math.max(from, today)
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i)
    if (mask & weekdayBit(d)) return d
  }
  return start
}

// A single-entry weekly's current day: its latest daily that hasn't been carried onward (a
// carried original is superseded by its copy). Undefined when it has no day.
function liveDaily(weeklyId: number): number | undefined {
  const r = getDb()
    .prepare(
      `SELECT d.id FROM tasks d WHERE d.parent_task_id = ? AND ${NOT_CARRIED}
       ORDER BY d.date DESC, d.id DESC LIMIT 1`
    )
    .get(weeklyId) as { id: number } | undefined
  return r?.id
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
                          reminder_time, repeat_days, repeat_until, carried_from, risk_factor_id,
                          created_at)
       VALUES (@type, @week_start, @date, @parent_task_id, @title, @category, @due_date,
               @reminder_time, @repeat_days, @repeat_until, @carried_from, @risk_factor_id,
               @created_at)`
    )
    .run({
      created_at: r.created_at ?? nowSecs(),
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
// series, the masked days from its latest weekly row's week on that have no real row yet, as
// read-only rows with no id. Only days from today on are projected — a week the routine never
// ran for (app closed) has no rows and stays empty rather than showing phantom occurrences in
// the past.
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
  // A series' own week is projected too (a series created on Saturday for Mon–Fri has its row in
  // next week with no days yet); a day that already has a real row is not shown twice.
  const realDays = new Set(real.map((t) => `${t.parentTaskId}:${t.date}`))
  const projected: DailyTask[] = []
  for (const w of latest) {
    for (const day of projectedDays(seriesOf(w), projectFrom, to)) {
      if (realDays.has(`${w.id}:${day}`)) continue
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
              (SELECT MIN(c.week_start) FROM tasks c
                WHERE c.carried_from = w.id AND c.type = 'weekly') AS carried_to,
              EXISTS (SELECT 1 FROM tasks d WHERE d.parent_task_id = w.id AND ${NOT_CARRIED})
                AS scheduled
       FROM tasks w
       LEFT JOIN risk_factors rf ON rf.id = w.risk_factor_id
       WHERE w.type = 'weekly' AND w.week_start = ? ORDER BY w.id`
    )
    .all(weekStartMonday(weekStart)) as WeeklyRow[]
  return rows.map((r) => {
    // A series' next-week row also uses carried_from (continuation), which is not a carry-over.
    const single = !isRecurring(r.repeat_days)
    return {
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
      carried: single && r.carried_from != null,
      carriedTo: single ? r.carried_to : null,
      scheduled: !!r.scheduled
    }
  })
}

// The edit dialog's view of a task. A single-entry weekly that has a live day IS that day (the
// weekly is only its mirror in the weekly list), so it is returned as the daily: one dialog, the
// day's steps, its due date movable, Delete removes both. A single-entry weekly with no day
// reports date null (unscheduled; saving a date gives it one). A series reports its start — or,
// on a continued week's row, that week's first occurrence — which the dialog can move.
export function get(taskId: number): TaskDetail | null {
  const row = getRow(taskId)
  if (!row) return null
  const singleWeekly = row.type === 'weekly' && !isRecurring(row.repeat_days)
  if (singleWeekly) {
    const live = liveDaily(taskId)
    if (live != null) return get(live)
  }
  const date = singleWeekly
    ? null
    : row.type === 'weekly'
      ? (row.date ?? seriesDays(seriesOf(row))[0] ?? row.week_start)
      : row.date
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
    date,
    dueDate: row.due_date,
    reminderTime: row.reminder_time,
    completed: !!row.completed,
    parentTaskId: row.parent_task_id,
    repeatDays: series?.repeat_days ?? 0,
    repeatUntil: series?.repeat_until ?? null,
    startsOn: series?.date ?? null,
    riskFactor: factor,
    carriedFrom: row.carried_from,
    createdAt: row.created_at,
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
      const date = firstOccurrence(startOfDay(input.date ?? undefined), input.repeatDays!, today)
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
    // A new unticked day under an already-completed weekly reopens it.
    if (parentTaskId != null) recomputeWeekly(parentTaskId)
    return id
  })()
}

// Edit a task in one transaction. Title / category on a weekly also apply to its dailies from
// today on, and on a single-entry daily to its weekly mirror (the same task, one name; a series
// day keeps its own). `date` moves a single-entry daily; on a single-entry weekly it moves its
// day (or gives it one); on a series it moves the start; on a series day it moves that one
// occurrence (moveSeriesDay). A non-zero repeatDays on a one-off daily turns its weekly
// into a series starting that day. Repeat changes on a series apply across
// its chain of weekly rows (every week it was continued into): an end date goes on every row, a
// new mask on this row and later ones; each row then drops the unfinished days from today the
// series no longer covers, generates any new ones, and disappears if it is left with no days and
// no history. Turning repeating off (repeatDays 0) on a series is "Stop repeating": the series
// becomes a one-off task — see stopRepeating().
export function update(taskId: number, patch: TaskPatch): void {
  getDb().transaction(() => {
    const db = getDb()
    const row = getRow(taskId)
    if (!row) throw new Error(`Task ${taskId} not found`)
    const stopping = row.type === 'weekly' && isRecurring(row.repeat_days) && patch.repeatDays === 0
    const today = startOfDay()
    const parent = row.parent_task_id == null ? undefined : getRow(row.parent_task_id)

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
    if (row.type === 'weekly' && !stopping) {
      field('repeat_days', 'repeatDays')
      field('repeat_until', 'repeatUntil')
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params)
    }

    const renamed = patch.title !== undefined || patch.category !== undefined
    const title = patch.title ?? row.title
    const category = patch.category !== undefined ? patch.category : row.category // null clears it
    if (row.type === 'weekly' && renamed) {
      db.prepare(
        `UPDATE tasks SET title = ?, category = ?
         WHERE type = 'daily' AND parent_task_id = ? AND date >= ?`
      ).run(title, category, taskId, today)
    }
    if (row.type === 'daily' && renamed && parent && !isRecurring(parent.repeat_days)) {
      db.prepare('UPDATE tasks SET title = ?, category = ? WHERE id = ?').run(
        title,
        category,
        parent.id
      )
    }

    if (patch.steps) syncSteps(taskId, patch.steps)

    let startMoved = false
    const mask = patch.repeatDays ?? row.repeat_days // the mask the row has after this patch
    // A stop settles the series' days itself; the start date the dialog sends along with it is
    // not a move (treating it as one would drag the last day onto the start day).
    if (patch.date !== undefined && !stopping) {
      const newDay = startOfDay(patch.date)
      if (row.type === 'daily') {
        if (!isRecurring(parent?.repeat_days ?? 0)) moveDaily(taskId, newDay)
        else moveSeriesDay(getRow(taskId)!, newDay)
      } else if (!isRecurring(mask)) {
        // The weekly is its day: move it, or schedule one when it had none (the weekly follows
        // into that day's week so the weekly list stays in step).
        const live = liveDaily(taskId)
        if (live != null) moveDaily(live, newDay)
        else {
          db.prepare('UPDATE tasks SET week_start = ? WHERE id = ?').run(
            weekStartMonday(newDay),
            taskId
          )
          addToDaily(taskId, newDay)
        }
      } else {
        // A series' start: its first occurrence on or after the new day, in that day's week. The
        // prune below drops the unfinished days it no longer covers and generates the new ones.
        const start = firstOccurrence(newDay, mask, today)
        if (start !== row.date || weekStartMonday(start) !== row.week_start) {
          db.prepare('UPDATE tasks SET date = ?, week_start = ? WHERE id = ?').run(
            start,
            weekStartMonday(start),
            taskId
          )
          startMoved = true
        }
      }
    }

    const repeatChanged = patch.repeatDays !== undefined || patch.repeatUntil !== undefined
    if (row.type === 'daily' && parent && !isRecurring(parent.repeat_days) && isRecurring(mask)) {
      // Repeat switched on for a one-off task (the dialog edits the day, not its mirror): the
      // weekly becomes a series starting on this day; this day is its first occurrence.
      update(parent.id, {
        repeatDays: mask,
        repeatUntil: patch.repeatUntil ?? null,
        date: getRow(taskId)!.date ?? today
      })
    } else if (stopping) {
      stopRepeating(taskId, today)
    } else if (row.type === 'weekly' && (repeatChanged || startMoved)) {
      const weekStart = seriesOf(getRow(taskId)!).weekStart
      const setUntil = db.prepare('UPDATE tasks SET repeat_until = ? WHERE id = ?')
      const setMask = db.prepare('UPDATE tasks SET repeat_days = ? WHERE id = ?')
      for (const r of seriesChain(taskId)) {
        if (patch.repeatUntil !== undefined) setUntil.run(patch.repeatUntil, r.id)
        if (patch.repeatDays !== undefined && seriesOf(r).weekStart >= weekStart) {
          setMask.run(patch.repeatDays, r.id)
        }
        pruneSeriesRow(r.id, today)
      }
    }
  })()
}

// Move a single-entry daily to another day. Due and reminder keep their time of day; a weekly
// mirror with no other dailies follows into the new day's week so the weekly list stays in step.
function moveDaily(id: number, newDay: number): void {
  const db = getDb()
  const current = getRow(id)!
  db.prepare('UPDATE tasks SET date = ?, due_date = ?, reminder_time = ? WHERE id = ?').run(
    newDay,
    atTimeOf(current.due_date, newDay),
    atTimeOf(current.reminder_time, newDay),
    id
  )
  if (current.parent_task_id != null) {
    const others = db
      .prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ? AND id != ?')
      .get(current.parent_task_id, id) as { n: number }
    if (others.n === 0) {
      db.prepare('UPDATE tasks SET week_start = ? WHERE id = ?').run(
        weekStartMonday(newDay),
        current.parent_task_id
      )
    }
  }
}

// Move one day of a series. The day's row stays on its date as the slot the series already
// covers — so the series neither generates it again nor counts it (NOT_CARRIED) — superseded by a
// copy on the new day, exactly like a carried-over task; steps and the reminder go with the copy.
// A day that was already moved just moves again.
function moveSeriesDay(row: TaskRow, newDay: number): void {
  if (row.date === newDay) return
  const db = getDb()
  const move = db.prepare('UPDATE tasks SET date = ?, due_date = ?, reminder_time = ? WHERE id = ?')
  if (row.carried_from != null) {
    move.run(newDay, atTimeOf(row.due_date, newDay), atTimeOf(row.reminder_time, newDay), row.id)
    return
  }
  const id = insertRow({
    type: 'daily',
    date: newDay,
    parent_task_id: row.parent_task_id,
    title: row.title,
    category: row.category,
    due_date: atTimeOf(row.due_date, newDay),
    reminder_time: atTimeOf(row.reminder_time, newDay),
    carried_from: row.id,
    created_at: row.created_at
  })
  db.prepare('UPDATE task_steps SET task_id = ? WHERE task_id = ?').run(id, row.id)
  db.prepare('UPDATE tasks SET reminder_time = NULL WHERE id = ?').run(row.id)
  if (row.parent_task_id != null) recomputeWeekly(row.parent_task_id)
}

// Every weekly row of the series `id` belongs to: the rows it was continued from (carried_from,
// backwards), the rows continued from it (forwards), and itself — oldest week first. Empty when
// the row is not a series.
function seriesChain(id: number): TaskRow[] {
  const db = getDb()
  const next = db.prepare("SELECT id FROM tasks WHERE carried_from = ? AND type = 'weekly'")
  const found = new Map<number, TaskRow>()
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (found.has(cur)) continue
    const r = getRow(cur)
    if (!r || r.type !== 'weekly' || !isRecurring(r.repeat_days)) continue
    found.set(cur, r)
    if (r.carried_from != null) queue.push(r.carried_from)
    for (const n of next.all(cur) as { id: number }[]) queue.push(n.id)
  }
  return [...found.values()].sort((a, b) => seriesOf(a).weekStart - seriesOf(b).weekStart)
}

// "Stop repeating": the series turns into a one-off task. Its live row (the latest week of the
// chain — the one future days come from) drops its unfinished days after today, keeps today's
// and every ticked one, and loses its mask, so it reads as a single task from here on; every
// earlier row of the chain is closed at its own Sunday so nothing continues or projects from it.
// A live row left with no days at all (a series that hadn't started yet) is removed.
function stopRepeating(id: number, today: number): void {
  const db = getDb()
  const chain = seriesChain(id)
  const live = chain[chain.length - 1]
  if (!live) return
  const later = db
    .prepare('SELECT id FROM tasks WHERE parent_task_id = ? AND date > ? AND completed = 0')
    .all(live.id, today) as { id: number }[]
  deleteRows(later.map((d) => d.id))
  db.prepare('UPDATE tasks SET repeat_days = 0, repeat_until = NULL WHERE id = ?').run(live.id)
  const closeAt = db.prepare(
    'UPDATE tasks SET repeat_until = MIN(COALESCE(repeat_until, ?), ?) WHERE id = ?'
  )
  for (const r of chain) {
    if (r.id === live.id) continue
    const sunday = addDays(seriesOf(r).weekStart, 6)
    closeAt.run(sunday, sunday, r.id)
  }
  tidyMirror(live.id)
}

// Bring one series row in line with its (changed) mask / end: unfinished days from today that
// the series no longer covers go (a day the user moved — carried_from set — is kept where they
// put it), days it now owes this week are generated, the row itself goes when it has no days and
// no dailies left, otherwise its completion is recomputed.
function pruneSeriesRow(id: number, today: number): void {
  const db = getDb()
  const r = getRow(id)
  if (!r) return
  const keep = new Set(seriesDays(seriesOf(r)))
  const stale = db
    .prepare(
      `SELECT id, date FROM tasks
       WHERE type = 'daily' AND parent_task_id = ? AND completed = 0 AND date >= ?
         AND carried_from IS NULL`
    )
    .all(id, today) as { id: number; date: number }[]
  deleteRows(stale.filter((d) => !keep.has(d.date)).map((d) => d.id))
  const remaining = db
    .prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ?')
    .get(id) as { n: number }
  if (keep.size === 0 && remaining.n === 0) {
    deleteRows([id])
    return
  }
  generateWeek(id, today)
  recomputeWeekly(id)
}

// Delete a series (A5 as amended at Gate 1) across its chain: every unfinished day goes, whatever
// its date; a week's row with no ticked day goes with them; a row that keeps ticked days becomes
// a plain, done task (repeat_days 0, no continuation link) — ticked days are the only history
// worth keeping, and "N of M" on a series that no longer exists is noise. Shared by remove() and
// the risk-factor re-selection.
function removeSeries(id: number, today: number): void {
  const db = getDb()
  const chain = seriesChain(id)
  if (chain.length === 0) return
  const ids = chain.map((r) => r.id)
  const ph = ids.map(() => '?').join(',')
  const unfinished = db
    .prepare(`SELECT id FROM tasks WHERE parent_task_id IN (${ph}) AND completed = 0`)
    .all(...ids) as { id: number }[]
  deleteRows(unfinished.map((d) => d.id))
  const toPlain = db.prepare(
    'UPDATE tasks SET repeat_days = 0, repeat_until = NULL, carried_from = NULL WHERE id = ?'
  )
  const count = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ?')
  for (const r of chain) {
    if ((count.get(r.id) as { n: number }).n === 0) deleteRows([r.id])
    else {
      toPlain.run(r.id)
      recomputeWeekly(r.id)
    }
  }
  // Deleting a risk factor's series is opting out of that factor: close its recur window too,
  // otherwise the routine would start the series again (a series with no history leaves no row).
  const factor = chain.find((r) => r.risk_factor_id != null)
  if (factor) {
    db.prepare(
      `UPDATE risk_factors SET recur_until = ?
       WHERE recur_until >= ? AND (id = ? OR factor = ?)`
    ).run(addDays(today, -1), today, factor.risk_factor_id, factor.title)
  }
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

// A single-entry task's carry-over history: the rows it was copied from (D1 / D5), following
// carried_from back to the first one. A series row's carried_from is its continuation link, not
// a carry, so the walk stops there.
function carryOrigins(id: number): TaskRow[] {
  const out: TaskRow[] = []
  let cur = getRow(id)?.carried_from ?? null
  while (cur != null) {
    const r = getRow(cur)
    if (!r || isRecurring(r.repeat_days)) break
    out.push(r)
    cur = r.carried_from
  }
  return out
}

// A single-entry weekly is the same task as its daily(s): left with none it goes too, otherwise
// its completion recomputes.
function tidyMirror(id: number): void {
  const r = getRow(id)
  if (!r || isRecurring(r.repeat_days)) return
  const n = (
    getDb().prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ?').get(id) as {
      n: number
    }
  ).n
  if (n === 0) deleteRows([id])
  else recomputeWeekly(id)
}

// Delete single-entry dailies together with their carry-over history — the originals are
// unfinished past rows that the routine would otherwise carry again — then tidy every weekly
// they hung under.
function removeDailies(rows: TaskRow[]): void {
  const all = rows.flatMap((r) => [r, ...carryOrigins(r.id)])
  const parents = new Set(all.map((r) => r.parent_task_id).filter((p) => p != null))
  deleteRows(all.map((r) => r.id))
  for (const p of parents) tidyMirror(p)
}

// Delete a task (A5), one transaction. Daily: that row and the rows it was carried from; its
// weekly mirror goes with it when no other day is left (a series day can't be deleted on its own
// — the series would regenerate it). Single-entry weekly: it, its dailies, and the weeklies it
// was carried from. Series weekly: the whole series (every week's row), see removeSeries().
export function remove(taskId: number): void {
  getDb().transaction(() => {
    const db = getDb()
    const row = getRow(taskId)
    if (!row) return
    if (row.type === 'daily') {
      const parent = row.parent_task_id == null ? undefined : getRow(row.parent_task_id)
      if (parent && isRecurring(parent.repeat_days)) throw new Error(SERIES_DAY_MESSAGE)
      removeDailies([row])
      return
    }
    if (!isRecurring(row.repeat_days)) {
      const dailies = db
        .prepare(`SELECT ${TASK_COLS} FROM tasks WHERE parent_task_id = ?`)
        .all(taskId) as TaskRow[]
      const origins = carryOrigins(taskId)
      removeDailies(dailies) // tidyMirror drops this row once it has no dailies
      if (getRow(taskId)) deleteRows([taskId])
      for (const o of origins) tidyMirror(o.id)
      return
    }
    removeSeries(taskId, startOfDay())
  })()
}

// Give a weekly task its day (today, or the given day); a due time on the weekly lands at that
// time of day. A task has one day: with one already, move it (update date) instead.
export function addToDaily(weeklyId: number, date: number = startOfDay()): number {
  const weekly = getDb()
    .prepare("SELECT title, category, due_date FROM tasks WHERE id = ? AND type = 'weekly'")
    .get(weeklyId) as
    | { title: string; category: Category | null; due_date: number | null }
    | undefined
  if (!weekly) throw new Error(`Weekly task ${weeklyId} not found`)
  if (liveDaily(weeklyId) != null) throw new Error('This task already has a day')
  const day = startOfDay(date)
  return create({
    type: 'daily',
    title: weekly.title,
    category: weekly.category,
    date: day,
    dueDate: atTimeOf(weekly.due_date, day),
    parentTaskId: weeklyId
  })
}

// Weekly completion follows its dailies: done when the completed count reaches the target (a
// target of 0 — a series with no days this week — is never "done").
function recomputeWeekly(weeklyId: number): void {
  const db = getDb()
  const row = getRow(weeklyId)
  if (!row) return
  const { done, open } = db
    .prepare(
      `SELECT SUM(completed) AS done, SUM(completed = 0 AND ${NOT_CARRIED}) AS open
       FROM tasks d WHERE parent_task_id = ?`
    )
    .get(weeklyId) as { done: number | null; open: number | null }
  const target = targetForWeek(seriesOf(row))
  // Done when the count is reached and no day is still open (a single-entry weekly can have
  // several dailies: a new unticked one reopens it).
  const next = target > 0 && (done ?? 0) >= target && (open ?? 0) === 0 ? 1 : 0
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
    // The weekly is the task; its dailies (one, or several via addToDaily) follow it — except
    // one already carried to a later day, which stays as it was.
    setCompleted(taskId, next)
    getDb()
      .prepare(
        `UPDATE tasks SET completed = ?, completed_at = ? WHERE id IN
           (SELECT d.id FROM tasks d WHERE d.parent_task_id = ? AND ${NOT_CARRIED})`
      )
      .run(next ? 1 : 0, next ? nowSecs() : null, taskId)
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
      reminder_time: atTimeOf(w.reminder_time, day),
      created_at: w.created_at
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
      carried_from: w.id,
      created_at: w.created_at
    })
    copySteps(w.id, id, false)
  }
}

// The most recent weekly series row for a risk factor: linked to this risk_factors row, or any
// risk-factor series with the same label (one series per factor, whatever row created it).
const LATEST_FACTOR_SERIES = `
  SELECT ${TASK_COLS} FROM tasks
  WHERE type = 'weekly' AND repeat_days != 0
    AND (risk_factor_id = ? OR (risk_factor_id IS NOT NULL AND title = ?))
  ORDER BY week_start DESC, id DESC LIMIT 1`

function insertRiskFactorSeries(
  f: { id: number; factor: string },
  today: number,
  untilDay: number
): number {
  return insertRow({
    type: 'weekly',
    week_start: weekStartMonday(today),
    date: today,
    title: f.factor,
    repeat_days: ALL_DAYS,
    repeat_until: untilDay,
    risk_factor_id: f.id
  })
}

// Routine step 1b (D9): a selected risk factor still within its recur window gets a daily series
// (starting today, ending on recur_until) — but only if no series for that factor exists in ANY
// week. Once it exists, its life is the series' own: continueSeries() carries it into new weeks
// while its repeat_until allows, and a user who stopped or deleted it is not overridden here.
// Re-selecting a factor goes through reselectRiskFactorSeries().
export function ensureRiskFactorSeries(today: number): void {
  const db = getDb()
  const factors = db
    .prepare('SELECT id, factor, recur_until FROM risk_factors WHERE recur_until >= ? ORDER BY id')
    .all(today) as { id: number; factor: string; recur_until: number }[]
  const latest = db.prepare(LATEST_FACTOR_SERIES)
  for (const f of factors) {
    if (latest.get(f.id, f.factor)) continue
    insertRiskFactorSeries(f, today, startOfDay(f.recur_until))
  }
}

// riskFactors.select(recur) selected a factor whose window now ends on untilDay. With no series
// yet (first selection, or the old one was deleted without history) one starts today. If the
// series is untouched (its end is still the day the previous window ended, and in the future)
// the whole chain follows the new end; if the user stopped or deleted it, the old chain is closed
// as of today and a fresh series starts today.
export function reselectRiskFactorSeries(
  f: { id: number; factor: string },
  previousUntilDay: number | null,
  untilDay: number,
  today: number = startOfDay()
): void {
  const db = getDb()
  const latest = db.prepare(LATEST_FACTOR_SERIES).get(f.id, f.factor) as TaskRow | undefined
  if (!latest) {
    generateWeek(insertRiskFactorSeries(f, today, untilDay), today)
    return
  }
  const untouched =
    latest.repeat_until != null &&
    latest.repeat_until === previousUntilDay &&
    latest.repeat_until >= today
  if (untouched) {
    const setUntil = db.prepare(
      'UPDATE tasks SET repeat_until = ?, risk_factor_id = ? WHERE id = ?'
    )
    for (const r of seriesChain(latest.id)) {
      setUntil.run(untilDay, f.id, r.id)
      pruneSeriesRow(r.id, today)
    }
    return
  }
  removeSeries(latest.id, today)
  generateWeek(insertRiskFactorSeries(f, today, untilDay), today)
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
      carried_from: w.id,
      created_at: w.created_at
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
      carried_from: row.id,
      created_at: row.created_at
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
