// recurrence.ts
// Pure rules for repeating tasks (V1 item 5). A weekly row with a non-zero repeat_days mask is a
// *series*: it repeats on the masked weekdays every week until repeat_until (NULL = until
// stopped). This module answers, for one weekly row, which days of its week are occurrences,
// how many of them count toward "N of target", which still need a daily row generated, and
// which future days a Calendar range should show as read-only projections. It also holds the
// carry-over filter for incomplete single-entry dailies. No DB or Electron imports so it can be
// unit-tested; the repositories and the daily routine call it. Masks: bit 0 = Mon … bit 6 = Sun.
import { addDays, weekStartMonday, weekdayBit } from '../shared/dates'

// Every weekday set: the "Daily" repeat preset.
export const ALL_DAYS = 127

// The repeat-relevant columns of one weekly row. startsOn is the dialog date the series was
// created on (tasks.date on a weekly row); days of the first week before it are not occurrences.
export interface SeriesRow {
  id: number
  weekStart: number
  startsOn: number | null
  repeatDays: number
  repeatUntil: number | null
}

export function isRecurring(mask: number): boolean {
  return mask !== 0
}

// Local midnights in s.weekStart's week (Mon..Sun) whose weekday bit is set, on or after
// startsOn and on or before repeatUntil.
export function seriesDays(s: SeriesRow): number[] {
  const out: number[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(s.weekStart, i)
    if ((s.repeatDays & weekdayBit(d)) === 0) continue
    if (s.startsOn != null && d < s.startsOn) continue
    if (s.repeatUntil != null && d > s.repeatUntil) continue
    out.push(d)
  }
  return out
}

// The "N of target" denominator for the weekly row: its occurrences this week, or 1 for a
// single-entry task.
export function targetForWeek(s: SeriesRow): number {
  return isRecurring(s.repeatDays) ? seriesDays(s).length : 1
}

// Occurrences that still fall in [today, this Sunday] — the days the routine / create path
// materialises as daily rows. Past days of the week are never back-filled (a missed day stays
// missed), and a row from an earlier week yields nothing.
export function daysToGenerate(s: SeriesRow, today: number): number[] {
  const sunday = addDays(weekStartMonday(today), 6)
  return seriesDays(s).filter((d) => d >= today && d <= sunday)
}

// Whether the series still has occurrences in (or after) the week starting at weekStart, i.e.
// whether the routine should continue it into that week.
export function seriesActiveInWeek(s: SeriesRow, weekStart: number): boolean {
  return s.repeatUntil == null || s.repeatUntil >= weekStart
}

// Occurrences in [from, to) in the weeks *after* s.weekStart — the read-only rows a Calendar
// range shows beyond the latest week that has real rows (D15). s's own week is excluded because
// its occurrences are (or will be) real rows.
export function projectedDays(s: SeriesRow, from: number, to: number): number[] {
  const out: number[] = []
  // Start at whichever is later: the week after s's week, or the week containing `from`.
  const firstWeek = Math.max(addDays(s.weekStart, 7), weekStartMonday(from))
  for (let ws = firstWeek; ws < to; ws = addDays(ws, 7)) {
    if (!seriesActiveInWeek(s, ws)) break
    for (const d of seriesDays({ ...s, weekStart: ws, startsOn: null })) {
      if (d >= from && d < to) out.push(d)
    }
  }
  return out
}

// What the daily carry-over (D1) needs to know about a daily row and its weekly parent.
export interface CarryRow {
  date: number | null
  completed: boolean
  repeatDays: number // the parent's mask
  riskFactorId: number | null // the parent's link
  carried: boolean // a copy with carried_from = this row already exists
}

// The D1 filter: incomplete single-entry dailies from a past date that have no copy yet. Drops
// recurring occurrences (a missed day stays missed), risk-factor dailies (the routine regenerates
// those), rows already carried, and anything dated today or later.
export function carryCandidates<T extends CarryRow>(rows: T[], today: number): T[] {
  return rows.filter(
    (r) =>
      r.date != null &&
      r.date < today &&
      !r.completed &&
      !isRecurring(r.repeatDays) &&
      r.riskFactorId == null &&
      !r.carried
  )
}
