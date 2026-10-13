// repositories/sessions.ts
// Read-side aggregations over the raw sessions table. Per docs/database-overview.md, session
// and trend totals are computed at query time (not stored) so the raw per-session rows remain
// the single source of truth. classification codes: see Classification in shared/types.
// Day / week / month boundaries come from shared/dates (local midnights via Date arithmetic),
// never start + n * 86400, so a DST day buckets correctly.
import { getDb } from '../db'
import {
  Classification,
  type BreakdownItem,
  type DayBreakdown,
  type SessionTotals,
  type TodayFocus,
  type TrendDay,
  type TrendWeek
} from '../../shared/types'
import { nowSecs, startOfDay, weekStartMonday } from './util'
import { addDays, dayBoundaries, monthWeeks, startOfMonth } from '../../shared/dates'

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
  if (classification === Classification.PRODUCTIVE) totals.productive += mins
  else if (classification === Classification.UNPRODUCTIVE) totals.unproductive += mins
  else totals.notsure += mins
}

function roundTotals(t: SessionTotals): SessionTotals {
  return {
    productive: Math.round(t.productive),
    unproductive: Math.round(t.unproductive),
    notsure: Math.round(t.notsure)
  }
}

// Session rows starting in [from, to), ordered by start.
function sessionsIn(from: number, to: number): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT classification, start_time, total_seconds
       FROM sessions WHERE start_time >= ? AND start_time < ? ORDER BY start_time`
    )
    .all(from, to) as SessionRow[]
}

// Bucket rows (all within [bounds[0], bounds[last])) into the consecutive ranges
// [bounds[i], bounds[i + 1]) and total each (minutes).
function bucketTotals(rows: SessionRow[], bounds: number[]): SessionTotals[] {
  const buckets = bounds.slice(0, -1).map(() => emptyTotals())
  for (const r of rows) {
    let i = 0
    while (i + 1 < buckets.length && r.start_time >= bounds[i + 1]) i++
    addSecs(buckets[i], r.classification, durationOf(r))
  }
  return buckets.map(roundTotals)
}

// Totals (minutes) for one day.
export function getDay(dayStart: number): SessionTotals {
  const totals = emptyTotals()
  for (const r of sessionsIn(dayStart, addDays(dayStart, 1))) {
    addSecs(totals, r.classification, durationOf(r))
  }
  return roundTotals(totals)
}

// Totals (minutes) for the current session — defined as today's activity for V1.
export function getCurrent(): SessionTotals {
  return getDay(startOfDay())
}

// "Focused today" pill + progress toward a break (trailing run of productive sessions today).
export function getTodayFocus(): TodayFocus {
  const today = startOfDay()
  const rows = sessionsIn(today, addDays(today, 1))

  let focusedSecs = 0
  let streakSecs = 0
  for (const r of rows) {
    const d = durationOf(r)
    if (r.classification === Classification.PRODUCTIVE) {
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

// 7-day trends (Mon..Sun of the week starting at weekStart), minutes per classification.
export function getWeek(weekStart: number = weekStartMonday()): TrendDay[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const bounds = dayBoundaries(weekStartMonday(weekStart), 7) // any ts in the week works
  const buckets = bucketTotals(sessionsIn(bounds[0], bounds[7]), bounds)
  return labels.map((day, i) => ({ day, date: bounds[i], ...buckets[i] }))
}

// One bar per Mon–Sun week touching the month (A6), minutes per classification.
export function getMonth(monthStart: number): TrendWeek[] {
  const weeks = monthWeeks(startOfMonth(monthStart)) // any ts in the month works
  const bounds = [...weeks, addDays(weeks[weeks.length - 1], 7)]
  const buckets = bucketTotals(sessionsIn(bounds[0], bounds[bounds.length - 1]), bounds)
  return weeks.map((weekStart, i) => ({ weekStart, weekEnd: addDays(weekStart, 6), ...buckets[i] }))
}

// Apps (host-less rows, grouped by app_key) and sites (grouped by host) ranked by minutes within
// each classification for one day. Labels are what the rows recorded (A7): the app name,
// "Desktop", or the host. Separate from rules.listNotSure(), which is a 30-day Settings view.
export function getDayBreakdown(dayStart: number): DayBreakdown {
  const now = nowSecs()
  const from = dayStart
  const to = addDays(dayStart, 1)
  const rows = getDb()
    .prepare(
      `SELECT classification, 'app' AS kind, MAX(app) AS label,
              SUM(COALESCE(total_seconds, ? - start_time)) AS secs
         FROM sessions WHERE start_time >= ? AND start_time < ? AND host IS NULL
         GROUP BY classification, app_key
       UNION ALL
       SELECT classification, 'site', host, SUM(COALESCE(total_seconds, ? - start_time))
         FROM sessions WHERE start_time >= ? AND start_time < ? AND host IS NOT NULL
         GROUP BY classification, host
       ORDER BY classification, secs DESC`
    )
    .all(now, from, to, now, from, to) as {
    classification: number
    kind: 'app' | 'site'
    label: string
    secs: number
  }[]
  const out: DayBreakdown = { productive: [], unproductive: [], notsure: [] }
  for (const r of rows) {
    const item: BreakdownItem = { kind: r.kind, label: r.label, minutes: Math.round(r.secs / 60) }
    if (r.classification === Classification.PRODUCTIVE) out.productive.push(item)
    else if (r.classification === Classification.UNPRODUCTIVE) out.unproductive.push(item)
    else out.notsure.push(item)
  }
  return out
}
