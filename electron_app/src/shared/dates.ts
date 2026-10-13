// shared/dates.ts
// Local-calendar date arithmetic shared by the main process (repositories, daily routine,
// recurrence) and the renderer (Home / Calendar / Trends ranges). All values are Unix seconds
// (INTEGER, matching the schema) at local midnight unless noted. Pure; no Electron or DOM imports.
//
// Every step is done through the Date setters (setDate / setMonth), never by adding n * 86400:
// a day that crosses a DST change is 23 or 25 hours long, and the seconds-arithmetic version
// would land an hour off midnight and then bucket sessions and tasks into the wrong day.

function nowSecs(): number {
  return Math.floor(Date.now() / 1000)
}

function toSecs(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}

// Start-of-day (local time) in Unix seconds for the given timestamp (defaults to now).
export function startOfDay(ts: number = nowSecs()): number {
  const d = new Date(ts * 1000)
  d.setHours(0, 0, 0, 0)
  return toSecs(d)
}

// Monday 00:00 (local) of the week containing ts, in Unix seconds.
export function weekStartMonday(ts: number = nowSecs()): number {
  const d = new Date(startOfDay(ts) * 1000)
  const offset = (d.getDay() + 6) % 7 // 0=Sun..6=Sat → days since Monday
  d.setDate(d.getDate() - offset)
  return toSecs(d)
}

// Local midnight n days after dayStart (n may be negative).
export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart * 1000)
  d.setDate(d.getDate() + n)
  return toSecs(d)
}

// 1st of the month, 00:00 local, for the month containing ts.
export function startOfMonth(ts: number): number {
  const d = new Date(ts * 1000)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return toSecs(d)
}

// 1st of the month n months after monthStart (n may be negative). Always called on a
// 1st-of-month value, so setMonth never has to clamp a day that doesn't exist.
export function addMonths(monthStart: number, n: number): number {
  const d = new Date(monthStart * 1000)
  d.setMonth(d.getMonth() + n)
  return toSecs(d)
}

// count + 1 consecutive local midnights starting at from: [from, +1d, …, +count d]. Day i is the
// half-open range [result[i], result[i + 1]).
export function dayBoundaries(from: number, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push(addDays(from, i))
  return out
}

// Monday starts of every Mon–Sun week that touches the month beginning at monthStart, so a month
// view / month chart is a whole number of weeks (the first and last may include days of the
// neighbouring months).
export function monthWeeks(monthStart: number): number[] {
  const nextMonth = addMonths(monthStart, 1)
  const out: number[] = []
  for (let ws = weekStartMonday(monthStart); ws < nextMonth; ws = addDays(ws, 7)) out.push(ws)
  return out
}

// Bit for the weekday of dayStart in a repeat mask: Mon = 1, Tue = 2, … Sat = 32, Sun = 64.
export function weekdayBit(dayStart: number): number {
  const d = new Date(dayStart * 1000)
  return 1 << ((d.getDay() + 6) % 7)
}
