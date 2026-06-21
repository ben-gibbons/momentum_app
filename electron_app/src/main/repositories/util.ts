// repositories/util.ts
// Small time helpers shared across repositories. All timestamps are Unix seconds (INTEGER),
// matching the schema convention in docs/database-overview.md.

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000)
}

// Start-of-day (local time) in Unix seconds for the given timestamp (defaults to now).
export function startOfDay(ts: number = nowSecs()): number {
  const d = new Date(ts * 1000)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// Monday 00:00 (local) of the week containing ts, in Unix seconds.
export function weekStartMonday(ts: number = nowSecs()): number {
  const d = new Date(startOfDay(ts) * 1000)
  const offset = (d.getDay() + 6) % 7 // 0=Sun..6=Sat → days since Monday
  d.setDate(d.getDate() - offset)
  return Math.floor(d.getTime() / 1000)
}

// Format a Unix-seconds timestamp as a display due time, e.g. "2:00 PM". Null passes through.
export function formatDue(ts: number | null): string | null {
  if (ts == null) return null
  const d = new Date(ts * 1000)
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  const hour = d.getHours() % 12 || 12
  return `${hour}:${minutes} ${ampm}`
}
