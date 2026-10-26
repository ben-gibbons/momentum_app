// components/calendar/MonthView.tsx
// The Calendar's Month view (V1 item 5, D6 / A6): a grid of the whole Mon–Sun weeks touching the
// month (monthWeeks). Each cell shows its day number, "done/total", and the day's tasks as compact
// rows like the Week view's columns (tick, title on one line — no wrapping here — click → edit
// dialog; projected series occurrences greyed and inert). Rows come from a single
// tasks.listDailyRange call over the grid's span; projected occurrences count toward the total
// (they are planned) but never toward done. Days outside the month are muted, today is
// highlighted, and clicking a cell's empty area opens that date in the Day view.
import { Check } from 'lucide-react'
import type { DailyTask } from '../../../../shared/types'
import { addDays, addMonths, monthWeeks } from '../../../../shared/dates'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { checkboxClass, dailyKey, dayOfMonth, isToday, weekdayShort } from './shared'

interface MonthViewProps {
  monthStart: number
  reloadKey: number // bumped by the screen on a day change or a dialog save → refetch
  onSelectDay: (dayStart: number) => void
  onEdit: (taskId: number) => void // open the TaskDialog in edit mode
}

// Each day's rows (in list order) plus its done / total.
interface DayCell {
  tasks: DailyTask[]
  done: number
}

function byDay(rows: DailyTask[]): Map<number, DayCell> {
  const out = new Map<number, DayCell>()
  for (const t of rows) {
    const c = out.get(t.date) ?? { tasks: [], done: 0 }
    c.tasks.push(t)
    if (t.completed && !t.projected) c.done += 1
    out.set(t.date, c)
  }
  return out
}

export function MonthView({
  monthStart,
  reloadKey,
  onSelectDay,
  onEdit
}: MonthViewProps): React.JSX.Element {
  const weeks = monthWeeks(monthStart)
  const gridStart = weeks[0]
  const gridEnd = addDays(weeks[weeks.length - 1], 7) // exclusive
  const nextMonth = addMonths(monthStart, 1)
  const tasks = useAsync(
    () => api.tasks.listDailyRange(gridStart, gridEnd),
    [gridStart, gridEnd, reloadKey]
  )
  const days = byDay(tasks.data ?? [])

  async function toggle(taskId: number): Promise<void> {
    await api.tasks.toggleComplete(taskId)
    tasks.reload()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {Array.from({ length: 7 }, (_, i) => addDays(gridStart, i)).map((day) => (
          <div
            key={day}
            className="px-3 py-[8px] text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
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
            const c = days.get(day)
            return (
              // A div, not a <button>: the task rows inside are buttons of their own. Clicking the
              // cell's empty area opens the day; a row's click stops here.
              <div
                key={day}
                role="button"
                tabIndex={0}
                aria-label={`Open ${weekdayShort(day)} ${dayOfMonth(day)}`}
                onClick={() => onSelectDay(day)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectDay(day)
                  }
                }}
                className={`flex min-h-[124px] min-w-0 cursor-pointer flex-col border-r border-border-subtle px-2 py-2 text-left transition-colors last:border-r-0 hover:bg-hover ${
                  inMonth ? '' : 'text-faint'
                } ${today ? 'bg-brand-soft' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <span
                    className={`font-data text-[15px] ${
                      today ? 'font-semibold text-brand' : inMonth ? 'text-ink' : 'text-faint'
                    }`}
                  >
                    {dayOfMonth(day)}
                  </span>
                  {c && (
                    <span
                      className={`font-data text-[11px] ${
                        c.done === c.tasks.length
                          ? 'text-green-500'
                          : inMonth
                            ? 'text-muted'
                            : 'text-faint'
                      }`}
                    >
                      {c.done}/{c.tasks.length}
                    </span>
                  )}
                </div>
                {c && (
                  <div className="mt-1 flex flex-col gap-[1px]">
                    {c.tasks.map((task) => (
                      <MonthTaskRow
                        key={dailyKey(task)}
                        task={task}
                        onToggle={toggle}
                        onEdit={onEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface MonthTaskRowProps {
  task: DailyTask
  onToggle: (taskId: number) => void
  onEdit: (taskId: number) => void
}

// One task in a month cell: tick + single-line title (truncated — the cell is narrow). Projected
// rows have no DB row yet and are inert; a carried / moved original is superseded by its copy.
function MonthTaskRow({ task, onToggle, onEdit }: MonthTaskRowProps): React.JSX.Element {
  const inert = task.id == null
  const superseded = task.carried && task.carriedTo != null
  return (
    <div
      className={`flex min-w-0 items-center gap-[5px] rounded px-1 py-[2px] ${inert ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        disabled={inert || superseded}
        onClick={(e) => {
          e.stopPropagation()
          if (task.id != null) onToggle(task.id)
        }}
        className={`flex-none ${checkboxClass(task.completed, 'sm')}`}
      >
        {task.completed && <Check className="h-[10px] w-[10px] text-sand-50" strokeWidth={3} />}
      </button>
      <button
        type="button"
        disabled={inert}
        title={task.title}
        onClick={(e) => {
          e.stopPropagation()
          if (task.id != null) onEdit(task.id)
        }}
        className={`min-w-0 flex-1 truncate text-left text-[11px] ${
          task.completed ? 'text-faint line-through' : 'text-body'
        } ${inert ? '' : 'hover:underline'}`}
      >
        {task.title}
      </button>
    </div>
  )
}
