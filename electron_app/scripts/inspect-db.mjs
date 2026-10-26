// scripts/inspect-db.mjs
// Dev-only diagnostic: prints the migration state of the dev DB (%APPDATA%\momentum_app\momentum.db)
// — user_version, classification_rules, the sessions columns/indexes, and (V1 item 5) the rebuilt
// tasks table: columns, indexes, last_routine_day, counts by type / week, and this week's rows.
// Written for the Phase 0 gate check. Run from electron_app/ with:
//   npx electron scripts/inspect-db.mjs
// It must run under Electron (not plain node) because better-sqlite3 in node_modules is rebuilt
// for Electron's ABI.
import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'

app.whenReady().then(() => {
  const path = join(process.env.APPDATA, 'momentum_app', 'momentum.db')
  const db = new Database(path, { readonly: true })
  console.log('db:', path)
  console.log('user_version:', db.pragma('user_version', { simple: true }))
  console.log(
    'classification_rules count:',
    db.prepare('SELECT COUNT(*) AS n FROM classification_rules').get().n
  )
  console.log(
    'rules:',
    db
      .prepare('SELECT kind, pattern, classification FROM classification_rules ORDER BY id')
      .all()
      .map((r) => `${r.kind}:${r.pattern}=${r.classification}`)
      .join(', ')
  )
  console.log(
    'sessions columns:',
    db.pragma('table_info(sessions)').map((c) => c.name)
  )
  console.log(
    'sessions indexes:',
    db.pragma('index_list(sessions)').map((i) => i.name)
  )
  console.log(
    'sessions with host:',
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE host IS NOT NULL').get().n
  )
  console.log(
    'not-sure apps:',
    db
      .prepare('SELECT app, COUNT(*) AS n FROM sessions WHERE classification = 3 GROUP BY app')
      .all()
      .map((r) => `${r.app}(${r.n})`)
      .join(', ')
  )
  console.log(
    'settings:',
    db
      .prepare('SELECT key, value FROM settings ORDER BY key')
      .all()
      .map((r) => `${r.key}=${r.value}`)
      .join(', ')
  )

  // V1 item 5 gate check: the rebuilt tasks table and the daily routine's state.
  // Unix seconds → local date / time strings ('-' for NULL). Object properties rather than
  // `const f = () =>` so the TS return-type lint rule (which also runs on .mjs) doesn't apply.
  const fmt = {
    day: (secs) => (secs == null ? '-' : new Date(secs * 1000).toLocaleDateString()),
    time: (secs) => (secs == null ? '-' : new Date(secs * 1000).toLocaleTimeString())
  }
  const { day, time } = fmt
  console.log(
    'tasks columns:',
    db.pragma('table_info(tasks)').map((c) => c.name)
  )
  console.log(
    'tasks indexes:',
    db.pragma('index_list(tasks)').map((i) => i.name)
  )
  const lastRun = db.prepare("SELECT value FROM settings WHERE key = 'last_routine_day'").get()
  console.log(
    'last_routine_day:',
    lastRun ? `${lastRun.value} (${day(Number(lastRun.value))})` : 'never'
  )
  console.log('tasks by type / week:')
  for (const r of db
    .prepare(
      `SELECT type, COALESCE(week_start, (SELECT p.week_start FROM tasks p WHERE p.id = t.parent_task_id)) AS ws,
              COUNT(*) AS n, SUM(completed) AS done
       FROM tasks t GROUP BY type, ws ORDER BY ws, type`
    )
    .all()) {
    console.log(`  ${r.type.padEnd(6)} week of ${day(r.ws)}: ${r.n} rows, ${r.done} done`)
  }
  // Monday 00:00 local of the current week, as repositories/util weekStartMonday() computes it.
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const weekStart = Math.floor(monday.getTime() / 1000)
  console.log(`this week's tasks (week of ${day(weekStart)}):`)
  for (const r of db
    .prepare(
      `SELECT t.id, t.type, t.title, t.category, t.date, t.due_date, t.reminder_time, t.completed,
              t.parent_task_id, t.repeat_days, t.repeat_until, t.carried_from, t.risk_factor_id
       FROM tasks t
       WHERE t.week_start = ? OR t.date >= ? AND t.date < ? + 7 * 86400
       ORDER BY t.type DESC, t.date, t.id`
    )
    .all(weekStart, weekStart, weekStart)) {
    const flags = [
      r.repeat_days
        ? `repeat=${r.repeat_days}${r.repeat_until ? ` until ${day(r.repeat_until)}` : ''}`
        : null,
      r.carried_from ? `carried_from=#${r.carried_from}` : null,
      r.risk_factor_id ? `risk_factor=#${r.risk_factor_id}` : null,
      r.reminder_time ? `reminder=${time(r.reminder_time)}` : null
    ]
      .filter(Boolean)
      .join(' ')
    console.log(
      `  #${r.id} ${r.type.padEnd(6)} ${r.completed ? '[x]' : '[ ]'} ${r.title}${r.category ? ` (${r.category})` : ''}` +
        `${r.type === 'daily' ? ` date=${day(r.date)} parent=#${r.parent_task_id}` : r.date ? ` starts=${day(r.date)}` : ''}` +
        `${r.due_date ? ` due=${time(r.due_date)}` : ''}${flags ? ` ${flags}` : ''}`
    )
  }
  // Phase 1 gate check: the most recent session rows with their real classification + host.
  console.log('recent sessions:')
  for (const r of db
    .prepare(
      'SELECT id, app, host, classification, start_time, total_seconds FROM sessions ORDER BY start_time DESC LIMIT 5'
    )
    .all()) {
    const start = new Date(r.start_time * 1000).toLocaleTimeString()
    console.log(
      `  #${r.id} ${r.app}${r.host ? ` (${r.host})` : ''} class=${r.classification} start=${start} secs=${r.total_seconds ?? 'open'}`
    )
  }
  // Rows never closed (end_time NULL). More than one means a force-kill/crash left orphans, and
  // until startup cleanup runs each one reads as "still running" in today's totals.
  const open = db
    .prepare(
      'SELECT id, app, start_time, total_seconds FROM sessions WHERE end_time IS NULL ORDER BY id'
    )
    .all()
  const now = Math.floor(Date.now() / 1000)
  console.log(`open rows: ${open.length}`)
  for (const r of open) {
    const live = now - r.start_time
    console.log(
      `  #${r.id} ${r.app} started ${new Date(r.start_time * 1000).toLocaleString()} flushed=${r.total_seconds ?? 'never'} live=${Math.round(live / 60)}m`
    )
  }
  db.close()
  app.quit()
})
