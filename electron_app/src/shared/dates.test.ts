// dates.test.ts
// Unit tests for the pure local-calendar helpers (vitest, run with `npm test`). Dates are built
// with `new Date(y, m, d)` (local time) so every expectation is exact in any zone; the process is
// pinned to America/New_York so the two US DST transitions (2026-03-08, 2026-11-01) are real
// 23- and 25-hour days rather than a no-op in a zone without DST.
import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dayBoundaries,
  monthWeeks,
  startOfDay,
  startOfMonth,
  weekStartMonday,
  weekdayBit
} from './dates'

process.env.TZ = 'America/New_York'

// Local midnight of y-m-d (m is 0-based like the Date constructor) in Unix seconds.
const day = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m, d).getTime() / 1000)

describe('startOfDay / weekStartMonday', () => {
  it('floors to local midnight', () => {
    const noon = Math.floor(new Date(2026, 9, 12, 12, 30).getTime() / 1000)
    expect(startOfDay(noon)).toBe(day(2026, 9, 12))
    expect(startOfDay(day(2026, 9, 12))).toBe(day(2026, 9, 12))
  })
  it('finds the Monday of the week, including for a Sunday', () => {
    expect(weekStartMonday(day(2026, 9, 12))).toBe(day(2026, 9, 12)) // Monday
    expect(weekStartMonday(day(2026, 9, 14))).toBe(day(2026, 9, 12)) // Wednesday
    expect(weekStartMonday(day(2026, 9, 18))).toBe(day(2026, 9, 12)) // Sunday
  })
})

describe('addDays', () => {
  it('runs in a zone with DST', () => {
    // Spring forward: Mar 8 is 23h long; fall back: Nov 1 is 25h long.
    expect(day(2026, 2, 9) - day(2026, 2, 8)).toBe(23 * 3600)
    expect(day(2026, 10, 2) - day(2026, 10, 1)).toBe(25 * 3600)
  })
  it('lands on local midnight across the spring-forward week', () => {
    const monday = day(2026, 2, 2)
    for (let i = 0; i <= 7; i++) expect(addDays(monday, i)).toBe(day(2026, 2, 2 + i))
    expect(weekStartMonday(day(2026, 2, 8))).toBe(monday)
  })
  it('lands on local midnight across the fall-back week', () => {
    const monday = day(2026, 9, 26)
    for (let i = 0; i <= 7; i++) expect(addDays(monday, i)).toBe(day(2026, 9, 26 + i))
    expect(addDays(day(2026, 10, 1), -1)).toBe(day(2026, 9, 31))
    expect(weekStartMonday(day(2026, 10, 1))).toBe(monday)
  })
  it('crosses month and year ends in both directions', () => {
    expect(addDays(day(2026, 0, 31), 1)).toBe(day(2026, 1, 1))
    expect(addDays(day(2026, 11, 31), 1)).toBe(day(2027, 0, 1))
    expect(addDays(day(2027, 0, 1), -1)).toBe(day(2026, 11, 31))
    expect(addDays(day(2026, 2, 1), -1)).toBe(day(2026, 1, 28))
    expect(addDays(day(2026, 0, 1), 365)).toBe(day(2027, 0, 1))
  })
})

describe('startOfMonth / addMonths', () => {
  it('floors to the 1st and steps whole months across a year end', () => {
    expect(startOfMonth(day(2026, 9, 12))).toBe(day(2026, 9, 1))
    expect(addMonths(day(2026, 9, 1), 1)).toBe(day(2026, 10, 1))
    expect(addMonths(day(2026, 11, 1), 1)).toBe(day(2027, 0, 1))
    expect(addMonths(day(2027, 0, 1), -2)).toBe(day(2026, 10, 1))
  })
})

describe('dayBoundaries', () => {
  it('returns count + 1 midnights starting at from', () => {
    const from = day(2026, 2, 2)
    const b = dayBoundaries(from, 7)
    expect(b).toHaveLength(8)
    expect(b[0]).toBe(from)
    expect(b[6]).toBe(day(2026, 2, 8))
    expect(b[7]).toBe(day(2026, 2, 9))
  })
})

describe('monthWeeks', () => {
  it('returns the Mon–Sun weeks touching the month, including neighbouring days', () => {
    // October 2026 starts on a Thursday: the first row begins Mon Sep 28.
    expect(monthWeeks(day(2026, 9, 1))).toEqual([
      day(2026, 8, 28),
      day(2026, 9, 5),
      day(2026, 9, 12),
      day(2026, 9, 19),
      day(2026, 9, 26)
    ])
  })
  it('yields six rows for a 31-day month starting on a Saturday', () => {
    // August 2026: Sat Aug 1 … Mon Aug 31.
    expect(monthWeeks(day(2026, 7, 1))).toEqual([
      day(2026, 6, 27),
      day(2026, 7, 3),
      day(2026, 7, 10),
      day(2026, 7, 17),
      day(2026, 7, 24),
      day(2026, 7, 31)
    ])
  })
  it('yields four rows for a February that starts on a Monday', () => {
    // February 2027: Mon Feb 1 … Sun Feb 28.
    expect(monthWeeks(day(2027, 1, 1))).toHaveLength(4)
  })
})

describe('weekdayBit', () => {
  it('maps Mon=1 … Sun=64', () => {
    const monday = day(2026, 9, 12)
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => weekdayBit(addDays(monday, i)))).toEqual([
      1, 2, 4, 8, 16, 32, 64
    ])
    expect(weekdayBit(day(2026, 9, 18))).toBe(64)
  })
})
