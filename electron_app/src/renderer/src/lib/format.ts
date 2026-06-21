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

// Start-of-today in Unix seconds (local) — used when creating a daily task so it lands in
// today's list (tasks.listDaily defaults to today).
export function startOfTodaySecs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}
