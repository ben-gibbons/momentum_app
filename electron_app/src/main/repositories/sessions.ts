// repositories/sessions.ts
// Read-side aggregations over the raw sessions table. Per docs/database-overview.md, session
// and trend totals are computed at query time (not stored) so the raw per-session rows remain
// the single source of truth. classification: 1=productive, 2=unproductive, 3=not_sure.
import { getDb } from '../db'
import type { SessionTotals, TodayFocus, TrendDay } from '../../shared/types'
import { nowSecs, startOfDay, weekStartMonday } from './util'

const DAY_SECS = 86400
const BREAK_TARGET_MINS = 50

interface SessionRow {
  classification: number
  start_time: number
  total_seconds: number | null
}

// Effective duration of a session row: total_seconds, or for a still-open row, elapsed so far.
function durationOf(r: SessionRow): number {
  return r.total_seconds ?? Math.max(0, nowSecs() - r.start_time)
}

function emptyTotals(): SessionTotals {
  return { productive: 0, unproductive: 0, notsure: 0 }
}

function addSecs(totals: SessionTotals, classification: number, secs: number): void {
  const mins = secs / 60
  if (classification === 1) totals.productive += mins
  else if (classification === 2) totals.unproductive += mins
  else totals.notsure += mins
}

function roundTotals(t: SessionTotals): SessionTotals {
  return {
    productive: Math.round(t.productive),
    unproductive: Math.round(t.unproductive),
    notsure: Math.round(t.notsure)
  }
}

// Today's session rows, ordered by start. Shared by the current-session + focus views so they
// aggregate identically (both count an open session's elapsed time via durationOf).
function todaysSessions(): SessionRow[] {
  const dayStart = startOfDay()
  return getDb()
    .prepare(
      `SELECT classification, start_time, total_seconds
       FROM sessions WHERE start_time >= ? AND start_time < ? ORDER BY start_time`
    )
    .all(dayStart, dayStart + DAY_SECS) as SessionRow[]
}

// Totals (minutes) for the current session — defined as today's activity for V1.
export function getCurrent(): SessionTotals {
  const totals = emptyTotals()
  for (const r of todaysSessions()) addSecs(totals, r.classification, durationOf(r))
  return roundTotals(totals)
}

// "Focused today" pill + progress toward a break (trailing run of productive sessions today).
export function getTodayFocus(): TodayFocus {
  const rows = todaysSessions()

  let focusedSecs = 0
  let streakSecs = 0
  for (const r of rows) {
    const d = durationOf(r)
    if (r.classification === 1) {
      focusedSecs += d
      streakSecs += d // accumulate the trailing productive run...
    } else {
      streakSecs = 0 // ...reset on any non-productive session
    }
  }
  return {
    focusedMinutes: Math.round(focusedSecs / 60),
    breakProgressMinutes: Math.min(Math.round(streakSecs / 60), BREAK_TARGET_MINS),
    breakTargetMinutes: BREAK_TARGET_MINS
  }
}

// 7-day trends (Mon..Sun of the current week), minutes per classification.
export function getWeek(): TrendDay[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekStart = weekStartMonday()
  const buckets: SessionTotals[] = labels.map(() => emptyTotals())

  const rows = getDb()
    .prepare(
      `SELECT classification, start_time, total_seconds
       FROM sessions WHERE start_time >= ? AND start_time < ?`
    )
    .all(weekStart, weekStart + 7 * DAY_SECS) as SessionRow[]

  for (const r of rows) {
    const dayIndex = Math.floor((r.start_time - weekStart) / DAY_SECS)
    if (dayIndex < 0 || dayIndex > 6) continue
    addSecs(buckets[dayIndex], r.classification, durationOf(r))
  }

  return labels.map((day, i) => ({ day, ...roundTotals(buckets[i]) }))
}
