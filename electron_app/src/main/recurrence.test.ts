// recurrence.test.ts
// Unit tests for the pure repeat / carry-over rules (vitest, run with `npm test`). Weeks are
// built around Mon 2026-10-12 with `new Date(y, m, d)` (local time) so expectations are exact in
// any zone.
import { describe, expect, it } from 'vitest'
import { addDays } from '../shared/dates'
import {
  ALL_DAYS,
  carryCandidates,
  daysToGenerate,
  isRecurring,
  projectedDays,
  seriesActiveInWeek,
  seriesDays,
  targetForWeek,
  type SeriesRow
} from './recurrence'

const day = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m, d).getTime() / 1000)

const MON = day(2026, 9, 12)
const WED = day(2026, 9, 14)
const SUN = day(2026, 9, 18)
const NEXT_MON = addDays(MON, 7)
const MON_BIT = 1
const THU_BIT = 8

function series(partial: Partial<SeriesRow>): SeriesRow {
  return {
    id: 1,
    weekStart: MON,
    startsOn: null,
    repeatDays: ALL_DAYS,
    repeatUntil: null,
    ...partial
  }
}

describe('isRecurring', () => {
  it('is false only for an empty mask', () => {
    expect(isRecurring(0)).toBe(false)
    expect(isRecurring(MON_BIT)).toBe(true)
    expect(isRecurring(ALL_DAYS)).toBe(true)
  })
})

describe('seriesDays / targetForWeek', () => {
  it('a daily series created on Wednesday has five occurrences in its first week', () => {
    const s = series({ startsOn: WED })
    expect(seriesDays(s)).toEqual([2, 3, 4, 5, 6].map((i) => addDays(MON, i)))
    expect(targetForWeek(s)).toBe(5)
  })
  it('a Mon+Thu series ending on Tuesday has a target of one', () => {
    const s = series({ repeatDays: MON_BIT | THU_BIT, repeatUntil: addDays(MON, 1) })
    expect(seriesDays(s)).toEqual([MON])
    expect(targetForWeek(s)).toBe(1)
  })
  it('a full daily series in a later week counts all seven days', () => {
    expect(targetForWeek(series({ weekStart: NEXT_MON, startsOn: WED }))).toBe(7)
  })
  it('a single-entry weekly has a target of one regardless of its dates', () => {
    expect(targetForWeek(series({ repeatDays: 0 }))).toBe(1)
    expect(seriesDays(series({ repeatDays: 0 }))).toEqual([])
  })
})

describe('daysToGenerate', () => {
  it('on Sunday only Sunday is left', () => {
    expect(daysToGenerate(series({ startsOn: WED }), SUN)).toEqual([SUN])
  })
  it('from Wednesday yields Wednesday through Sunday, skipping unmasked days', () => {
    const s = series({ repeatDays: MON_BIT | THU_BIT | 64 })
    expect(daysToGenerate(s, WED)).toEqual([addDays(MON, 3), SUN])
  })
  it('a row from an earlier week yields nothing this week', () => {
    expect(daysToGenerate(series({}), NEXT_MON)).toEqual([])
  })
})

describe('seriesActiveInWeek', () => {
  it('is active with no end, or an end on/after the week start', () => {
    expect(seriesActiveInWeek(series({}), NEXT_MON)).toBe(true)
    expect(seriesActiveInWeek(series({ repeatUntil: NEXT_MON }), NEXT_MON)).toBe(true)
    expect(seriesActiveInWeek(series({ repeatUntil: SUN }), NEXT_MON)).toBe(false)
  })
})

describe('projectedDays', () => {
  it('skips the series own week and stops at repeat_until', () => {
    // Mon+Thu, ending on the Tuesday of the week after next.
    const s = series({ repeatDays: MON_BIT | THU_BIT, repeatUntil: addDays(NEXT_MON, 8) })
    expect(projectedDays(s, MON, addDays(MON, 28))).toEqual([
      NEXT_MON,
      addDays(NEXT_MON, 3),
      addDays(NEXT_MON, 7)
    ])
  })
  it('clips to the [from, to) range and ignores startsOn in later weeks', () => {
    const s = series({ startsOn: WED })
    const from = addDays(NEXT_MON, 5) // next Saturday
    expect(projectedDays(s, from, addDays(NEXT_MON, 9))).toEqual([
      from,
      addDays(from, 1),
      addDays(from, 2),
      addDays(from, 3)
    ])
    expect(projectedDays(s, MON, NEXT_MON)).toEqual([])
  })
})

describe('carryCandidates', () => {
  const base = {
    date: addDays(MON, -1),
    completed: false,
    repeatDays: 0,
    riskFactorId: null,
    carried: false
  }
  it('keeps an incomplete single-entry daily from a past date', () => {
    expect(carryCandidates([{ ...base, id: 1 }], MON)).toEqual([{ ...base, id: 1 }])
    expect(carryCandidates([{ ...base, date: addDays(MON, -30) }], MON)).toHaveLength(1)
  })
  it('drops recurring, risk-factor, already-carried, completed, and today-or-later rows', () => {
    const rows = [
      { ...base, repeatDays: ALL_DAYS },
      { ...base, riskFactorId: 3 },
      { ...base, carried: true },
      { ...base, completed: true },
      { ...base, date: MON },
      { ...base, date: addDays(MON, 1) },
      { ...base, date: null }
    ]
    expect(carryCandidates(rows, MON)).toEqual([])
  })
})
