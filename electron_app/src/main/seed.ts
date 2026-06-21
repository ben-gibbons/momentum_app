// seed.ts
// Dev-only fixture seed. Populates the DB with the design data contract
// (design_system/interactive-flows/data.js) plus the task-step content the home screen depends
// on, so every screen has realistic data without a live monitoring run. Runs once, only when the
// DB is empty (guarded by an empty settings table). Never runs in production builds — index.ts
// calls it behind is.dev. Idempotent: a second call is a no-op once data exists.
import { getDb } from './db'
import { startOfDay, weekStartMonday } from './repositories/util'

const DAY = 86400
const MIN = 60

// ---- Catalog / reference data (from data.js) ----

const RISK_FACTORS = [
  'Sleep',
  'Water',
  'Food',
  'Medication',
  'Exercise',
  'Social connection',
  'Going outside',
  'Fun activities',
  'Sense of accomplishment'
]

const DISTORTIONS = [
  'All-or-nothing thinking',
  'Overgeneralization',
  'Mental filter',
  'Disqualifying the positive',
  'Jumping to conclusions',
  'Magnification or minimization',
  'Emotional reasoning',
  'Should statements',
  'Labeling and mislabeling',
  'Personalization'
]

// data.js weekly[] / daily[]
const WEEKLY = [
  { key: 'w1', title: 'Ship the daily task UI', category: 'work', completed: 0 },
  { key: 'w2', title: 'Write the database overview doc', category: 'work', completed: 1 },
  { key: 'w3', title: 'Call the dentist', category: 'personal', completed: 0 },
  { key: 'w4', title: 'Practice guitar — 3 sessions', category: 'hobby', completed: 0 },
  { key: 'w5', title: 'Draft the quarterly goals', category: 'goal', completed: 0 },
  { key: 'w6', title: 'Grocery run', category: 'personal', completed: 0 }
]

// daily[]: due stored as a Unix timestamp today; parentKey links to a weekly task where it exists.
const DAILY = [
  { title: 'Ship the daily task UI', category: 'work', dueHour: 16, completed: 0, parentKey: 'w1' },
  {
    title: 'Reply to design feedback',
    category: 'work',
    dueHour: null,
    completed: 1,
    parentKey: null
  },
  { title: 'Practice guitar', category: 'hobby', dueHour: null, completed: 0, parentKey: 'w4' }
]

// Task steps (home screen "Steps" disclosure). data.js has none — representative content keyed
// to the daily task titles so the disclosure + "next" highlight + Start button are exercised.
const STEPS: Record<string, { text: string; mins: number; done: number }[]> = {
  'Ship the daily task UI': [
    { text: 'Sketch the task row layout from the design file', mins: 10, done: 1 },
    { text: 'Wire the checkbox toggle to SQLite', mins: 20, done: 0 },
    { text: 'Build the steps disclosure animation', mins: 20, done: 0 },
    { text: 'Hook up the "Add a task" row', mins: 15, done: 0 }
  ],
  'Practice guitar': [
    { text: 'Tune up and warm up the fingers', mins: 5, done: 0 },
    { text: 'Run through scales', mins: 15, done: 0 },
    { text: 'Work the new song section', mins: 20, done: 0 }
  ]
}

// data.js week[] (Mon..Sun) minutes per classification — used for the 6 non-today weekdays.
const WEEK = [
  { productive: 214, unproductive: 58, notsure: 40 },
  { productive: 188, unproductive: 92, notsure: 33 },
  { productive: 252, unproductive: 36, notsure: 51 },
  { productive: 142, unproductive: 110, notsure: 60 },
  { productive: 198, unproductive: 44, notsure: 28 },
  { productive: 64, unproductive: 22, notsure: 18 },
  { productive: 90, unproductive: 12, notsure: 30 }
]

// data.js logs[] — created_at parsed from their labels (DD/MM/YY HH:mm).
const LOGS = [
  {
    label: 'Procrastination · 14/06/26 09:42',
    source: 'popup',
    emotion: 'overwhelmed',
    at: Date.UTC(2026, 5, 14, 9, 42)
  },
  {
    label: 'Procrastination · 13/06/26 15:08 · lack of sleep',
    source: 'risk_factor',
    emotion: 'anxious',
    at: Date.UTC(2026, 5, 13, 15, 8)
  },
  {
    label: 'Procrastination · 12/06/26 11:20',
    source: 'manual',
    emotion: 'fear of quality',
    at: Date.UTC(2026, 5, 12, 11, 20)
  }
]

function insertSession(start: number, classification: number, mins: number): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (app, url, classification, start_time, end_time, total_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run('Seed', null, classification, start, start + mins * MIN, mins * MIN)
}

export function seedDevFixtures(): void {
  const db = getDb()
  const count = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }
  if (count.n > 0) return // already seeded

  db.transaction(() => {
    // Settings
    const settings: [string, string][] = [
      ['user_name', 'Ben'],
      ['threshold_unproductive', '120'],
      ['threshold_notsure', '300'],
      ['strict_mode', '0'],
      ['break_down_mode', '1']
    ]
    const setStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    for (const [k, v] of settings) setStmt.run(k, v)

    // Catalogs
    const rfStmt = db.prepare(
      'INSERT INTO risk_factor_catalog (label, is_custom, created_at) VALUES (?, 0, NULL)'
    )
    for (const f of RISK_FACTORS) rfStmt.run(f)
    const dStmt = db.prepare('INSERT INTO distortions (ordinal, label) VALUES (?, ?)')
    DISTORTIONS.forEach((label, i) => dStmt.run(i + 1, label))

    // Weekly tasks (current week)
    const weekStart = weekStartMonday()
    const weeklyIds: Record<string, number> = {}
    const wStmt = db.prepare(
      `INSERT INTO tasks (type, week_start, title, category, completed, completed_at)
       VALUES ('weekly', ?, ?, ?, ?, ?)`
    )
    for (const w of WEEKLY) {
      const res = wStmt.run(
        weekStart,
        w.title,
        w.category,
        w.completed,
        w.completed ? startOfDay() : null
      )
      weeklyIds[w.key] = res.lastInsertRowid as number
    }

    // Daily tasks (today) + their steps
    const today = startOfDay()
    const stepStmt = db.prepare(
      'INSERT INTO task_steps (task_id, ordinal, text, est_minutes, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const dStmtTask = db.prepare(
      `INSERT INTO tasks (type, date, parent_task_id, title, category, due_date, completed, completed_at)
       VALUES ('daily', ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const d of DAILY) {
      const due = d.dueHour == null ? null : today + d.dueHour * 3600
      // Every daily has a weekly parent. A written-in daily (no parentKey) gets an auto-created
      // weekly task carrying its completion — mirroring tasks.create() and the weekly-list rule.
      let parentId = d.parentKey ? weeklyIds[d.parentKey] : null
      if (parentId == null) {
        parentId = wStmt.run(
          weekStart,
          d.title,
          d.category,
          d.completed,
          d.completed ? startOfDay() : null
        ).lastInsertRowid as number
      }
      // Completion lives on the weekly parent; the daily row's own flag stays 0.
      const res = dStmtTask.run(today, parentId, d.title, d.category, due, 0, null)
      const taskId = res.lastInsertRowid as number
      const steps = STEPS[d.title]
      if (steps)
        steps.forEach((s, i) =>
          stepStmt.run(taskId, i + 1, s.text, s.mins, s.done, s.done ? today : null)
        )
    }

    // Sessions backing trends + current session.
    const todayIdx = Math.floor((today - weekStart) / DAY)
    // Non-today weekdays: one session per classification from data.js week[].
    WEEK.forEach((w, i) => {
      if (i === todayIdx) return
      const dayStart = weekStart + i * DAY + 9 * 3600 // ~9am
      insertSession(dayStart, 1, w.productive)
      insertSession(dayStart + w.productive * MIN, 2, w.unproductive)
      insertSession(dayStart + (w.productive + w.unproductive) * MIN, 3, w.notsure)
    })
    // Today: crafted sequence so totals match data.js session (161/42/37) and the trailing
    // productive run is 38 min (the "Toward a break" ring shows 38/50).
    let t = today + 8 * 3600
    insertSession(t, 1, 123)
    t += 123 * MIN
    insertSession(t, 2, 42)
    t += 42 * MIN
    insertSession(t, 3, 37)
    t += 37 * MIN
    insertSession(t, 1, 38)

    // Procrastination logs (+ a couple of steps on the first).
    const logStmt = db.prepare(
      'INSERT INTO procrastination_logs (created_at, label, source, emotion) VALUES (?, ?, ?, ?)'
    )
    const logStepStmt = db.prepare(
      `INSERT INTO log_steps (log_id, step_number, description, predicted_difficulty, predicted_time_mins, predicted_satisfaction)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    LOGS.forEach((l, idx) => {
      const res = logStmt.run(Math.floor(l.at / 1000), l.label, l.source, l.emotion)
      if (idx === 0) {
        const logId = res.lastInsertRowid as number
        logStepStmt.run(logId, 1, 'Open the doc and reread the brief', 30, 10, 60)
        logStepStmt.run(logId, 2, 'Draft the first paragraph', 50, 20, 70)
      }
    })
  })()

  console.log('[seed] dev fixtures inserted')
}
