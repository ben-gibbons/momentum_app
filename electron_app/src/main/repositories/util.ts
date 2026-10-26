// repositories/util.ts
// Small time helpers shared across repositories. All timestamps are Unix seconds (INTEGER),
// matching the schema convention in docs/database-overview.md. The calendar arithmetic
// (startOfDay, weekStartMonday, …) lives in shared/dates.ts so the renderer can use it too; the
// two moved helpers are re-exported here so existing repository imports keep working.

export { startOfDay, weekStartMonday } from '../../shared/dates'

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000)
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
