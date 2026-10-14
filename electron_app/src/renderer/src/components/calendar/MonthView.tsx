// components/calendar/MonthView.tsx
// The Calendar's Month view (V1 item 5, D6 / A6): a grid of the whole Mon–Sun weeks touching the
// month (monthWeeks), each cell showing its day number and "done/total" tasks. Counts come from a
// single tasks.listDailyRange call over the grid's span; projected series occurrences count toward
// the total (they are planned) but never toward done. Days outside the month are muted, today is
// highlighted, and clicking a cell opens that date in the Day view.
import type { DailyTask } from '../../../../shared/types'
import { addDays, addMonths, monthWeeks } from '../../../../shared/dates'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { dayOfMonth, isToday, weekdayShort } from './shared'

interface MonthViewProps {
  monthStart: number
  reloadKey: number // bumped by the screen on a day change or a dialog save → refetch
  onSelectDay: (dayStart: number) => void
}

interface Count {
  done: number
  total: number
}

// done / total per local-midnight date for the rows in the grid's span.
function countByDay(rows: DailyTask[]): Map<number, Count> {
  const out = new Map<number, Count>()
  for (const t of rows) {
    const c = out.get(t.date) ?? { done: 0, total: 0 }
    c.total += 1
    if (t.completed && !t.projected) c.done += 1
    out.set(t.date, c)
  }
  return out
}

export function MonthView({
  monthStart,
  reloadKey,
  onSelectDay
}: MonthViewProps): React.JSX.Element {
  const weeks = monthWeeks(monthStart)
  const gridStart = weeks[0]
  const gridEnd = addDays(weeks[weeks.length - 1], 7) // exclusive
  const nextMonth = addMonths(monthStart, 1)
  const tasks = useAsync(
    () => api.tasks.listDailyRange(gridStart, gridEnd),
    [gridStart, gridEnd, reloadKey]
  )
  const counts = countByDay(tasks.data ?? [])

  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {Array.from({ length: 7 }, (_, i) => addDays(gridStart, i)).map((day) => (
          <div
            key={day}
            className="px-3 py-[8px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
          >
            {weekdayShort(day)}
          </div>
        ))}
      </div>

      {weeks.map((ws) => (
        <div key={ws} className="grid grid-cols-7 border-b border-border-subtle last:border-b-0">
          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((day) => {
            const inMonth = day >= monthStart && day < nextMonth
            const today = isToday(day)
            const c = counts.get(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                className={`flex h-[84px] flex-col items-start border-r border-border-subtle px-3 py-2 text-left transition-colors last:border-r-0 hover:bg-hover ${
                  inMonth ? '' : 'text-faint'
                } ${today ? 'bg-brand-soft' : ''}`}
              >
                <span
                  className={`font-data text-[14px] ${
                    today ? 'font-semibold text-brand' : inMonth ? 'text-ink' : 'text-faint'
                  }`}
                >
                  {dayOfMonth(day)}
                </span>
                {c && (
                  <span
                    className={`mt-auto font-data text-[12px] ${
                      c.done === c.total ? 'text-green-500' : inMonth ? 'text-muted' : 'text-faint'
                    }`}
                  >
                    {c.done}/{c.total}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
