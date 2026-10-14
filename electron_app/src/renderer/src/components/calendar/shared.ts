// components/calendar/shared.ts
// Small helpers shared by the Calendar views (V1 item 5, D6): the RangeNav labels (always with the
// year), weekday headers, the "is this today" check, a stable React key for daily rows (projected
// rows have no id — R11), and the tag / chip class strings. The classes are copied from TaskRow
// rather than imported so Agent A's edits to TaskRow can't change this screen's look.
import type { DailyTask } from '../../../../shared/types'
import { addDays, startOfDay } from '../../../../shared/dates'

const toDate = (secs: number): Date => new Date(secs * 1000)

// "Monday, October 12, 2026"
export function dayLabel(dayStart: number): string {
  return toDate(dayStart).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// "Oct 12 – 18, 2026"; across a month "Sep 28 – Oct 4, 2026"; across a year
// "Dec 29, 2025 – Jan 4, 2026".
export function weekLabel(weekStart: number): string {
  const a = toDate(weekStart)
  const b = toDate(addDays(weekStart, 6))
  const month = (d: Date): string => d.toLocaleDateString(undefined, { month: 'short' })
  if (a.getFullYear() !== b.getFullYear()) {
    const full = (d: Date): string =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${full(a)} – ${full(b)}`
  }
  const end = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${month(b)} ${b.getDate()}`
  return `${month(a)} ${a.getDate()} – ${end}, ${b.getFullYear()}`
}

// "October 2026"
export function monthLabel(monthStart: number): string {
  return toDate(monthStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// "Mon" — the column / grid header for a day.
export function weekdayShort(dayStart: number): string {
  return toDate(dayStart).toLocaleDateString(undefined, { weekday: 'short' })
}

// "Oct 13" — used by the "Carried to …" hint.
export function monthDayShort(dayStart: number): string {
  return toDate(dayStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const dayOfMonth = (dayStart: number): number => toDate(dayStart).getDate()

export const isToday = (dayStart: number): boolean => dayStart === startOfDay()

// React key for a daily row. A projected occurrence has id null, so it falls back to the series +
// day it stands for (R11).
export const dailyKey = (t: DailyTask): string =>
  t.id != null ? `t${t.id}` : `p${t.parentTaskId}-${t.date}`

// Tag / chip styles. TAG is the category pill from TaskRow; RISK_TAG is the "Risk factor" tag in
// the warning colour; CHIP is the muted "Carried over" / "planned" chip.
export const TAG_CLASS =
  'whitespace-nowrap rounded-full bg-brand-soft px-[10px] py-[3px] text-[11px] font-semibold text-brand'
export const RISK_TAG_CLASS =
  'whitespace-nowrap rounded-full bg-unproductive-soft px-[10px] py-[3px] text-[11px] font-semibold text-unproductive'
export const CHIP_CLASS =
  'whitespace-nowrap rounded-full bg-sunken px-[8px] py-[2px] text-[11px] font-medium text-muted'

// Checkbox square shared by the weekly list and the day columns (TaskRow's, at a given size).
export function checkboxClass(completed: boolean, size: 'md' | 'sm'): string {
  const dims = size === 'md' ? 'h-[21px] w-[21px] rounded-[7px]' : 'h-4 w-4 rounded-[5px]'
  return `flex flex-none items-center justify-center border-[1.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${dims} ${
    completed ? 'border-green-500 bg-green-500' : 'border-sand-400'
  }`
}

// Capitalize a category for its tag ("work" → "Work"); local copy of lib/format categoryLabel.
export const categoryTag = (c: string | null): string | null =>
  c ? c[0].toUpperCase() + c.slice(1) : null

// Brand ring applied to the row a reminder toast asked to open (Calendar `focus`).
export const HIGHLIGHT_CLASS = 'ring-2 ring-brand ring-offset-2 ring-offset-card rounded-md'
