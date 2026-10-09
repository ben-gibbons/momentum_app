// session-manager.ts
// Translates the 10s poll stream from read_window into SQLite session rows and drives the
// distraction-threshold detector. Each poll: re-read settings + rules (two trivial queries, so
// a Settings edit takes effect at the next poll with no cache), classify the poll, and if the
// (app, url, classification) identity changed, close the outgoing row (end_time + total_seconds)
// and open a new one — so a rule edit self-heals into a fresh row. An empty poll opens a
// "Desktop" not-sure session. A 60s safety flush updates total_seconds on the open row so a
// crash loses at most 60s. The threshold step runs after the row bookkeeping and hands a
// DistractionEvent to the onDistraction callback; the Electron side (window, toast, push) lives
// in distraction.ts so this file stays free of electron imports.
import { getDb } from './db'
import type { MonitorData } from './read_window'
import { classifyPoll, DESKTOP_APP } from './classifier'
import * as classificationRules from './repositories/classificationRules'
import * as settings from './repositories/settings'
import { nowSecs } from './repositories/util'
import { initialState, MAX_GAP_SECS, step, type ThresholdState } from './threshold'
import type { Classification, DistractionEvent } from '../shared/types'

interface ActiveSession {
  id: number
  app: string
  url: string | null
  host: string | null
  classification: Classification
  startTime: number
}

let activeSession: ActiveSession | null = null
let flushTimer: NodeJS.Timeout | null = null
let thresholdState: ThresholdState = initialState(nowSecs())
let onDistraction: ((e: DistractionEvent) => void) | null = null

function openSession(
  app: string,
  url: string | null,
  host: string | null,
  classification: Classification,
  now: number // the poll's timestamp, so a gap-close at lastPollAt never precedes the next open
): void {
  const result = getDb()
    .prepare(
      `INSERT INTO sessions (app, app_key, url, host, classification, start_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    // app_key: JS-lowercased so SQL app matching agrees with the classifier (SQLite lower() is ASCII-only).
    .run(app, app.toLowerCase(), url, host, classification, now)
  activeSession = {
    id: result.lastInsertRowid as number,
    app,
    url,
    host,
    classification,
    startTime: now
  }
  console.log(
    `[session] open #${activeSession.id} ${app}${host ? ` (${host})` : ''} class=${classification}`
  )
}

// Close the open row as of `at` (defaults to now). A gap-close passes the last poll time so a
// sleep / lock isn't billed to whatever was in front when the machine went away.
function closeSession(at: number = nowSecs()): void {
  if (!activeSession) return
  const total = Math.max(0, at - activeSession.startTime)
  getDb()
    .prepare('UPDATE sessions SET end_time = ?, total_seconds = ? WHERE id = ?')
    .run(at, total, activeSession.id)
  console.log(`[session] close #${activeSession.id} after ${total}s`)
  activeSession = null
}

// A silence longer than MAX_GAP_SECS (shared with the threshold detector) means the process was
// suspended (sleep) or we were told to stop (lock screen).
let lastPollAt = 0
let suspended = false

// Lock screen / sleep: close the open row now and ignore any poll until resume (index.ts also
// stops the poll loop itself; this guard covers the window between the two and any straggler).
// The window enumeration still reports the user's desktop windows behind the lock screen, which
// would otherwise accrue as if in use.
export function suspendMonitoring(reason: string, quiet = false): void {
  if (suspended) return
  suspended = true
  closeSession()
  if (!quiet) console.log(`[session] monitoring paused (${reason})`)
}

export function resumeMonitoring(reason: string): void {
  if (!suspended) return
  suspended = false
  // Fresh run clock, but the nudge cooldown survives — a lock/unlock must not re-arm a nudge the
  // user was just promised quiet from.
  thresholdState = { ...initialState(nowSecs()), cooldownUntil: thresholdState.cooldownUntil }
  console.log(`[session] monitoring resumed (${reason})`)
}

function safetyFlush(): void {
  if (!activeSession) return
  getDb()
    .prepare('UPDATE sessions SET total_seconds = ? WHERE id = ?')
    .run(nowSecs() - activeSession.startTime, activeSession.id)
}

export function onPoll(data: MonitorData[]): void {
  if (suspended) return
  const now = nowSecs()
  // Belt and braces for a sleep the OS didn't announce: if polls stopped for a while, the open
  // row ends at the last poll we actually saw, not now.
  if (activeSession && lastPollAt > 0 && now - lastPollAt > MAX_GAP_SECS) {
    console.log(`[session] poll gap of ${now - lastPollAt}s — closing row at last poll`)
    closeSession(lastPollAt)
  }
  lastPollAt = now

  const cfg = settings.getAll()
  const rules = classificationRules.list()
  const r = classifyPoll(data, rules, cfg.strictMode)

  if (
    !activeSession ||
    r.app !== activeSession.app ||
    r.url !== activeSession.url ||
    r.classification !== activeSession.classification
  ) {
    closeSession()
    openSession(r.app, r.url, r.host, r.classification, now)
  }

  const t = step(thresholdState, r, now, {
    unproductiveSecs: cfg.thresholdUnproductive,
    notSureSecs: cfg.thresholdNotSure,
    cooldownUnproductiveSecs: cfg.cooldownUnproductive,
    cooldownNotSureSecs: cfg.cooldownNotSure
  })
  thresholdState = t.state
  if (t.fire && onDistraction) {
    // The nudge names the site when there is one, otherwise the app; Desktop reads naturally.
    const label = r.host ?? (r.app === DESKTOP_APP ? 'your desktop' : r.app)
    console.log(
      `[session] threshold fired: ${label} class=${t.fire.classification} run=${t.fire.runSeconds}s`
    )
    onDistraction({
      classification: t.fire.classification,
      app: r.app,
      url: r.url,
      label,
      runSeconds: t.fire.runSeconds
    })
  }
}

// A row is only closed by closeSession(); a crash or force-kill (taskkill, a dev reload) skips
// before-quit and leaves it open, and an open row reads as "running until now" in today's totals
// — hours of phantom time. On startup, end every leftover open row at its last safety flush
// (start + total_seconds), or at its start if it never flushed (at most 60s lost).
function closeOrphanRows(): void {
  const r = getDb()
    .prepare(
      `UPDATE sessions
       SET total_seconds = COALESCE(total_seconds, 0),
           end_time = start_time + COALESCE(total_seconds, 0)
       WHERE end_time IS NULL`
    )
    .run()
  if (r.changes > 0) console.log(`[session] closed ${r.changes} orphan row(s) from a previous run`)
}

export function startSessionManager(opts: {
  onDistraction: (e: DistractionEvent) => void
}): void {
  onDistraction = opts.onDistraction
  closeOrphanRows()
  flushTimer = setInterval(safetyFlush, 60_000)
}

export function stopSessionManager(): void {
  if (flushTimer) clearInterval(flushTimer)
  closeSession()
}
