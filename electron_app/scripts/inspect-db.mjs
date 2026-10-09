// scripts/inspect-db.mjs
// Dev-only diagnostic: prints the migration state of the dev DB (%APPDATA%\momentum_app\momentum.db)
// — user_version, classification_rules, the sessions columns/indexes. Written for the Phase 0
// gate check. Run from electron_app/ with:
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
