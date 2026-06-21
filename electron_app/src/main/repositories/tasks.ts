// repositories/tasks.ts
// All task + task-step queries. Maps the tasks/task_steps tables to the renderer DTOs.
//
// Completion rule (per docs/database-overview.md): completion is canonical on the weekly row.
// Every daily task has a weekly parent (written-in dailies auto-create one in create()), so a
// daily always reads/writes completion on its parent. Weekly tasks toggle themselves.
import { getDb } from '../db'
import type { Category, DailyTask, TaskInput, TaskStep, WeeklyTask } from '../../shared/types'
import { formatDue, nowSecs, startOfDay, weekStartMonday } from './util'

interface TaskRow {
  id: number
  title: string
  category: Category | null
  due_date: number | null
  completed: number
}

interface StepRow {
  id: number
  task_id: number
  text: string
  est_minutes: number | null
  completed: number
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

export function listDaily(date: number = startOfDay()): DailyTask[] {
  const day = startOfDay(date)
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.title, t.category, t.due_date,
              COALESCE(p.completed, t.completed) AS completed
       FROM tasks t
       LEFT JOIN tasks p ON p.id = t.parent_task_id
       WHERE t.type = 'daily' AND t.date = ?
       ORDER BY t.id`
    )
    .all(day) as TaskRow[]

  const steps = loadSteps(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    due: formatDue(r.due_date),
    completed: !!r.completed,
    steps: steps.get(r.id) ?? []
  }))
}

export function listWeekly(weekStart: number = weekStartMonday()): WeeklyTask[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, category, completed
       FROM tasks WHERE type = 'weekly' AND week_start = ? ORDER BY id`
    )
    .all(weekStartMonday(weekStart)) as TaskRow[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    completed: !!r.completed
  }))
}

// Toggle completion on the canonical row (parent when present, else the task itself).
export function toggleComplete(taskId: number): { completed: boolean } {
  const db = getDb()
  const task = db
    .prepare('SELECT id, type, parent_task_id, completed FROM tasks WHERE id = ?')
    .get(taskId) as
    | { id: number; type: string; parent_task_id: number | null; completed: number }
    | undefined
  if (!task) throw new Error(`Task ${taskId} not found`)

  const canonicalId = task.parent_task_id ?? task.id
  const current = db.prepare('SELECT completed FROM tasks WHERE id = ?').get(canonicalId) as {
    completed: number
  }
  const next = current.completed ? 0 : 1
  db.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?').run(
    next,
    next ? nowSecs() : null,
    canonicalId
  )
  return { completed: !!next }
}

export function create(input: TaskInput): number {
  let parentTaskId = input.parentTaskId ?? null
  // Every daily task has a weekly parent so completion always lives on the weekly row. A
  // written-in daily (no parent given) auto-creates a matching weekly task in its own week and
  // links to it — so it also appears in the weekly list. No separate own-row completion path.
  if (input.type === 'daily' && parentTaskId == null) {
    parentTaskId = create({
      type: 'weekly',
      title: input.title,
      category: input.category ?? null,
      weekStart: weekStartMonday(input.date ?? undefined)
    })
  }

  const result = getDb()
    .prepare(
      `INSERT INTO tasks (type, week_start, date, parent_task_id, title, category, due_date, reminder_time)
       VALUES (@type, @week_start, @date, @parent_task_id, @title, @category, @due_date, @reminder_time)`
    )
    .run({
      type: input.type,
      week_start: input.weekStart ?? null,
      date: input.date ?? null,
      parent_task_id: parentTaskId,
      title: input.title,
      category: input.category ?? null,
      due_date: input.dueDate ?? null,
      reminder_time: input.reminderTime ?? null
    })
  return result.lastInsertRowid as number
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
