// session-manager.ts
// Translates the 10s poll stream from read_window into SQLite session rows.
// Keeps one in-memory ActiveSession. On each poll: if the app/URL changed, close the
// outgoing row (write end_time + total_seconds) and open a new one. If unchanged, do
// nothing — the session is still running. A 60s safety flush updates total_seconds on
// the open row so a crash loses at most 60s of data.
// classify() is a stub returning not_sure (3) until allowed/disallowed lists are added.
import { getDb } from './db'
import type { MonitorData } from './read_window'

interface ActiveSession {
  id: number
  app: string
  url: string | undefined
  startTime: number
}

let activeSession: ActiveSession | null = null
let flushTimer: NodeJS.Timeout | null = null

function nowSecs(): number {
  return Math.floor(Date.now() / 1000)
}

// V1: no allowed/disallowed lists yet — everything is not_sure
function classify(_app: string, _url?: string): 1 | 2 | 3 {
  return 3
}

function openSession(app: string, url: string | undefined): void {
  const now = nowSecs()
  const result = getDb()
    .prepare('INSERT INTO sessions (app, url, classification, start_time) VALUES (?, ?, ?, ?)')
    .run(app, url ?? null, classify(app, url), now)
  activeSession = { id: result.lastInsertRowid as number, app, url, startTime: now }
}

function closeSession(): void {
  if (!activeSession) return
  const now = nowSecs()
  getDb()
    .prepare('UPDATE sessions SET end_time = ?, total_seconds = ? WHERE id = ?')
    .run(now, now - activeSession.startTime, activeSession.id)
  activeSession = null
}

function safetyFlush(): void {
  if (!activeSession) return
  getDb()
    .prepare('UPDATE sessions SET total_seconds = ? WHERE id = ?')
    .run(nowSecs() - activeSession.startTime, activeSession.id)
}

export function onPoll(data: MonitorData[]): void {
  if (data.length === 0) return
  const { app, url } = data[0]
  if (!activeSession) {
    openSession(app, url)
    return
  }
  if (app !== activeSession.app || url !== activeSession.url) {
    closeSession()
    openSession(app, url)
  }
}

export function startSessionManager(): void {
  flushTimer = setInterval(safetyFlush, 60_000)
}

export function stopSessionManager(): void {
  if (flushTimer) clearInterval(flushTimer)
  closeSession()
}
