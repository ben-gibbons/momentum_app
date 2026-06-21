// repositories/logs.ts
// Procrastination (CBT) log persistence. The full reflective record lives in procrastination_logs
// + log_steps so the user can reopen and review any past log. list() returns the lightweight
// projection (the shape design_system/data.js calls `logs`) for the logs landing page.
import { getDb } from '../db'
import type {
  LogInput,
  LogListItem,
  LogSource,
  LogStep,
  ProcrastinationLog
} from '../../shared/types'
import { nowSecs } from './util'

interface LogRow {
  id: number
  created_at: number
  label: string
  source: LogSource | null
  task_text: string | null
  emotion: string | null
  tempting_thought: string | null
  belief_before: number | null
  distortion: string | null
  self_control_thought: string | null
  belief_self_control: number | null
  belief_after: number | null
  takeaways: string | null
  risk_factor: string | null
}

interface StepRow {
  id: number
  step_number: number
  description: string | null
  predicted_difficulty: number | null
  predicted_time_mins: number | null
  predicted_satisfaction: number | null
  actual_difficulty: number | null
  actual_time_mins: number | null
  actual_satisfaction: number | null
}

// "Procrastination · MM/DD/YY h:mm AM/PM" (12-hour, app-wide date/time format).
function defaultLabel(ts: number, riskFactor?: string | null): string {
  const d = new Date(ts * 1000)
  const p = (n: number): string => n.toString().padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  const hr = d.getHours() % 12 || 12
  const base = `Procrastination · ${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(
    d.getFullYear() % 100
  )} ${hr}:${p(d.getMinutes())} ${ampm}`
  return riskFactor ? `${base} · lack of ${riskFactor.toLowerCase()}` : base
}

export function list(): LogListItem[] {
  const rows = getDb()
    .prepare(
      'SELECT id, created_at, label, source, emotion FROM procrastination_logs ORDER BY created_at DESC'
    )
    .all() as Pick<LogRow, 'id' | 'created_at' | 'label' | 'source' | 'emotion'>[]
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    source: r.source,
    emotion: r.emotion,
    createdAt: r.created_at
  }))
}

export function get(id: number): ProcrastinationLog | null {
  const r = getDb().prepare('SELECT * FROM procrastination_logs WHERE id = ?').get(id) as
    | LogRow
    | undefined
  if (!r) return null
  const stepRows = getDb()
    .prepare('SELECT * FROM log_steps WHERE log_id = ? ORDER BY step_number')
    .all(id) as StepRow[]
  return {
    id: r.id,
    createdAt: r.created_at,
    label: r.label,
    source: r.source,
    taskText: r.task_text,
    emotion: r.emotion,
    temptingThought: r.tempting_thought,
    beliefBefore: r.belief_before,
    distortion: r.distortion,
    selfControlThought: r.self_control_thought,
    beliefSelfControl: r.belief_self_control,
    beliefAfter: r.belief_after,
    takeaways: r.takeaways,
    riskFactor: r.risk_factor,
    steps: stepRows.map((s) => ({
      id: s.id,
      stepNumber: s.step_number,
      description: s.description,
      predictedDifficulty: s.predicted_difficulty,
      predictedTimeMins: s.predicted_time_mins,
      predictedSatisfaction: s.predicted_satisfaction,
      actualDifficulty: s.actual_difficulty,
      actualTimeMins: s.actual_time_mins,
      actualSatisfaction: s.actual_satisfaction
    }))
  }
}

function insertSteps(logId: number, steps: LogStep[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO log_steps
       (log_id, step_number, description, predicted_difficulty, predicted_time_mins,
        predicted_satisfaction, actual_difficulty, actual_time_mins, actual_satisfaction)
     VALUES (@log_id, @step_number, @description, @predicted_difficulty, @predicted_time_mins,
        @predicted_satisfaction, @actual_difficulty, @actual_time_mins, @actual_satisfaction)`
  )
  for (const s of steps) {
    stmt.run({
      log_id: logId,
      step_number: s.stepNumber,
      description: s.description ?? null,
      predicted_difficulty: s.predictedDifficulty ?? null,
      predicted_time_mins: s.predictedTimeMins ?? null,
      predicted_satisfaction: s.predictedSatisfaction ?? null,
      actual_difficulty: s.actualDifficulty ?? null,
      actual_time_mins: s.actualTimeMins ?? null,
      actual_satisfaction: s.actualSatisfaction ?? null
    })
  }
}

export function create(input: LogInput): number {
  const db = getDb()
  const createdAt = nowSecs()
  const label = input.label ?? defaultLabel(createdAt, input.riskFactor)
  const result = db
    .prepare(
      `INSERT INTO procrastination_logs
         (created_at, label, source, task_text, emotion, tempting_thought, belief_before,
          distortion, self_control_thought, belief_self_control, belief_after, takeaways, risk_factor)
       VALUES (@created_at, @label, @source, @task_text, @emotion, @tempting_thought, @belief_before,
          @distortion, @self_control_thought, @belief_self_control, @belief_after, @takeaways, @risk_factor)`
    )
    .run({
      created_at: createdAt,
      label,
      source: input.source ?? 'manual',
      task_text: input.taskText ?? null,
      emotion: input.emotion ?? null,
      tempting_thought: input.temptingThought ?? null,
      belief_before: input.beliefBefore ?? null,
      distortion: input.distortion ?? null,
      self_control_thought: input.selfControlThought ?? null,
      belief_self_control: input.beliefSelfControl ?? null,
      belief_after: input.beliefAfter ?? null,
      takeaways: input.takeaways ?? null,
      risk_factor: input.riskFactor ?? null
    })
  const logId = result.lastInsertRowid as number
  if (input.steps?.length) insertSteps(logId, input.steps)
  return logId
}

// Update mutable fields and replace the step set (steps are rewritten wholesale when provided).
export function update(id: number, input: LogInput): void {
  const db = getDb()
  db.prepare(
    `UPDATE procrastination_logs SET
       label = COALESCE(@label, label),
       source = COALESCE(@source, source),
       task_text = @task_text, emotion = @emotion, tempting_thought = @tempting_thought,
       belief_before = @belief_before, distortion = @distortion,
       self_control_thought = @self_control_thought, belief_self_control = @belief_self_control,
       belief_after = @belief_after, takeaways = @takeaways, risk_factor = @risk_factor
     WHERE id = @id`
  ).run({
    id,
    label: input.label ?? null,
    source: input.source ?? null,
    task_text: input.taskText ?? null,
    emotion: input.emotion ?? null,
    tempting_thought: input.temptingThought ?? null,
    belief_before: input.beliefBefore ?? null,
    distortion: input.distortion ?? null,
    self_control_thought: input.selfControlThought ?? null,
    belief_self_control: input.beliefSelfControl ?? null,
    belief_after: input.beliefAfter ?? null,
    takeaways: input.takeaways ?? null,
    risk_factor: input.riskFactor ?? null
  })
  if (input.steps) {
    db.prepare('DELETE FROM log_steps WHERE log_id = ?').run(id)
    insertSteps(id, input.steps)
  }
}
