// lib/format.ts
// Small display formatters shared across screens. Pure functions, no React.

// Minutes → "2h 41m" (or "41m" when under an hour, "0m" when zero).
export function formatHM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}m` : `${h}h ${m}m`
}

// Time-of-day greeting, e.g. "Good morning, Ben".
export function greeting(name: string, d: Date = new Date()): string {
  const h = d.getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name}`
}

// "Tuesday, June 16" — the hero eyebrow date.
export function todayLabel(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// A calm sub-line based on how many tasks remain today.
export function remainingLine(incomplete: number): string {
  if (incomplete === 0) return 'All done for today. Nice work.'
  const noun = incomplete === 1 ? 'thing' : 'things'
  return `${incomplete} ${noun} left for today. Let's figure out what matters most.`
}

// Capitalize a task category for its tag pill ("work" → "Work").
export function categoryLabel(category: string | null): string | null {
  return category ? category[0].toUpperCase() + category.slice(1) : null
}

// Format a Unix-seconds timestamp as "MM/DD/YY h:mm AM/PM" (12-hour) — the app-wide date/time
// display format. Hour is 1–12 (not zero-padded), minutes zero-padded, matching due-time style.
export function formatStamp(secs: number): string {
  const d = new Date(secs * 1000)
  const p = (n: number): string => n.toString().padStart(2, '0')
  const date = `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)}`
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  const hour = d.getHours() % 12 || 12
  return `${date} ${hour}:${p(d.getMinutes())} ${ampm}`
}

// ---- Task dialog helpers ----
// Bridges between the native <input type="date"> / <input type="time"> string values the
// TaskDialog uses and the Unix-second timestamps the tasks API stores, plus repeat-mask labels.
// Day arithmetic itself lives in shared/dates.ts; everything here is local-time and pure.

// Weekday labels indexed by repeat-mask bit (bit 0 = Mon … bit 6 = Sun, as in recurrence.ts).
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Local midnight (Unix seconds) → "YYYY-MM-DD" for a date input.
export function toDateInput(dayStart: number): string {
  const d = new Date(dayStart * 1000)
  const p = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// "YYYY-MM-DD" → local midnight (Unix seconds); null for an empty or partial value. Built with
// the Date(y, m, d) constructor so the result is local midnight, not UTC (new Date('2026-10-12')
// parses as UTC and would land on the previous evening west of Greenwich).
export function fromDateInput(value: string): number | null {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}

// Unix seconds → "HH:MM" (local, 24h) for a time input; "" when unset.
export function toTimeInput(ts: number | null): string {
  if (ts == null) return ''
  const d = new Date(ts * 1000)
  const p = (n: number): string => n.toString().padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// "HH:MM" on the given local day → Unix seconds; null when the input is empty. Uses setHours
// rather than dayStart + h * 3600 so a time on a DST-change day still reads back as typed.
export function timeOnDay(dayStart: number, value: string): number | null {
  const [h, m] = value.split(':').map(Number)
  if (value === '' || Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(dayStart * 1000)
  d.setHours(h, m, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// Repeat mask → "Daily" (every bit set), "Mon, Wed", or "Never" (0).
export function repeatLabel(mask: number): string {
  if (mask === 0) return 'Never'
  if (mask === 127) return 'Daily'
  return WEEKDAY_LABELS.filter((_, i) => mask & (1 << i)).join(', ')
}

// "Oct 13" — short day label for "Carried to …" notes and repeat end dates.
export function shortDate(dayStart: number): string {
  return new Date(dayStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
