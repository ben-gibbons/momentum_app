// components/calendar/WeekView.tsx
// The Calendar's Week view (V1 item 5, D6 / D15): the WeeklyList on the left and seven Mon..Sun
// day columns on the right, both for the shown week. Owns both fetches (tasks.listWeekly and
// tasks.listDailyRange) and every mutation here, because a daily tick changes the weekly N/target
// and a weekly tick mirrors onto its daily — so any write reloads both. Day columns show each
// day's dailies as compact rows; projected future occurrences of a series (id null) are greyed,
// not tickable and marked "planned"; a carried original (or a moved series day) shows "→ carried"
// / "→ moved" with its new date and is not tickable — its copy is the live row. Rows are numbered
// in the day's list order (V2 item 7) — the order set on Home / the Day view, or by the weekly
// list, whose drag handle is the one reorder control on this view (none on the columns).
import { useEffect, useRef, useState } from 'react'
import { Check, Clock, Plus } from 'lucide-react'
import type { DailyTask } from '../../../../shared/types'
import { addDays, dayBoundaries } from '../../../../shared/dates'
import { api, ipcErrorMessage } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { breakable, shortDate } from '../../lib/format'
import { WeeklyList } from './WeeklyList'
import { ListNumber, NO_BREAK, STRIKE_CLASS } from '../Reorder'
import {
  checkboxClass,
  dailyKey,
  dayOfMonth,
  HIGHLIGHT_CLASS,
  isToday,
  weekdayShort
} from './shared'

interface WeekViewProps {
  weekStart: number
  reloadKey: number // bumped by the screen on a day change or a dialog save → refetch
  highlightId: number | null // task id a reminder toast asked to open (ring + scroll into view)
  onEdit: (taskId: number) => void
  onCreate: (initialDate: number, initialRepeatDays?: number) => void
}

export function WeekView({
  weekStart,
  reloadKey,
  highlightId,
  onEdit,
  onCreate
}: WeekViewProps): React.JSX.Element {
  const weekly = useAsync(() => api.tasks.listWeekly(weekStart), [weekStart, reloadKey])
  const daily = useAsync(
    () => api.tasks.listDailyRange(weekStart, addDays(weekStart, 7)),
    [weekStart, reloadKey]
  )
  // Message from a rejected write (e.g. the repository refusing a toggle), shown above the grid.
  const [error, setError] = useState<string | null>(null)

  // Every write goes through here: on success or failure both lists are refetched so the view
  // never shows a half-applied state.
  async function run(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    } finally {
      weekly.reload()
      daily.reload()
    }
  }

  const days = dayBoundaries(weekStart, 6) // the seven Mon..Sun midnights
  const rows = daily.data ?? []

  return (
    <div>
      {error && <p className="mb-3 text-[13px] text-unproductive">{error}</p>}
      {/* The list card keeps its 300px and stretches to the day grid's height; the day columns
          take the rest of the (wide) page (AP1). */}
      <div className="grid grid-cols-[300px_minmax(0,1fr)] items-stretch gap-5">
        <WeeklyList
          weekStart={weekStart}
          tasks={weekly.data ?? []}
          highlightId={highlightId}
          onToggle={(id) => run(() => api.tasks.toggleComplete(id))}
          onAddToDay={(id, day) => run(() => api.tasks.addToDaily(id, day))}
          onStopRepeating={(id) => run(() => api.tasks.update(id, { repeatDays: 0 }))}
          onEdit={onEdit}
          onCreate={onCreate}
          onReorder={(ids) => run(() => api.tasks.reorder(ids))}
        />

        <div className="grid grid-cols-7 divide-x divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-card shadow-sm">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              tasks={rows.filter((t) => t.date === day)}
              highlightId={highlightId}
              onToggle={(id) => run(() => api.tasks.toggleComplete(id))}
              onEdit={onEdit}
              onCreate={onCreate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface DayColumnProps {
  day: number
  tasks: DailyTask[]
  highlightId: number | null
  onToggle: (taskId: number) => void
  onEdit: (taskId: number) => void
  onCreate: (initialDate: number) => void
}

function DayColumn({
  day,
  tasks,
  highlightId,
  onToggle,
  onEdit,
  onCreate
}: DayColumnProps): React.JSX.Element {
  const today = isToday(day)
  return (
    <div className="flex min-h-[560px] min-w-0 flex-col">
      <div
        className={`relative flex flex-col items-center border-b border-border-subtle px-2 py-[8px] ${
          today ? 'bg-brand-soft' : ''
        }`}
      >
        <div className="min-w-0 text-center leading-tight">
          <div
            className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${today ? 'text-brand' : 'text-muted'}`}
          >
            {weekdayShort(day)}
          </div>
          <div className={`font-data text-[15px] ${today ? 'text-brand' : 'text-ink'}`}>
            {dayOfMonth(day)}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Add a task on ${weekdayShort(day)} ${dayOfMonth(day)}`}
          onClick={() => onCreate(day)}
          className="absolute right-1 top-1 flex h-6 w-6 flex-none items-center justify-center rounded-md text-brand transition-colors hover:bg-card"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-[2px] px-[6px] py-[6px]">
        {tasks.map((task, i) => (
          <DayTaskRow
            key={dailyKey(task)}
            task={task}
            number={i + 1}
            wide={tasks.length >= 10}
            highlighted={task.id != null && task.id === highlightId}
            onToggle={onToggle}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}

interface DayTaskRowProps {
  task: DailyTask
  number: number
  wide: boolean // ten or more rows that day: two-digit number column
  highlighted: boolean
  onToggle: (taskId: number) => void
  onEdit: (taskId: number) => void
}

function DayTaskRow({
  task,
  number,
  wide,
  highlighted,
  onToggle,
  onEdit
}: DayTaskRowProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const projected = task.id == null
  const superseded = task.carried && task.carriedTo != null
  const edit = (): void => {
    if (task.id != null) onEdit(task.id)
  }
  return (
    // The column is narrow, so the row is text flow rather than a flex row: the checkbox and the
    // number are inline at the start of the title, and a wrapped title's later lines run the
    // full width under the checkbox. The title is a span (a <button> would be an atomic box and
    // could not wrap around the checkbox), so it carries the button role and keys itself.
    <div
      ref={ref}
      className={`rounded-md px-1 py-[5px] text-[13px] leading-[18px] ${projected ? 'opacity-50' : ''} ${
        highlighted ? HIGHLIGHT_CLASS : ''
      }`}
    >
      <button
        type="button"
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        disabled={projected || superseded}
        title={projected ? 'Planned — created when its week starts' : undefined}
        onClick={() => task.id != null && onToggle(task.id)}
        className={`mr-[4px] inline-flex align-[-3px] ${checkboxClass(task.completed, 'sm')}`}
      >
        {task.completed && <Check className="h-[10px] w-[10px] text-sand-50" strokeWidth={3} />}
      </button>
      <span
        role="button"
        tabIndex={projected ? -1 : 0}
        aria-disabled={projected || undefined}
        title={task.title}
        onClick={projected ? undefined : edit}
        onKeyDown={(e) => {
          if (!projected && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            edit()
          }
        }}
        className={`break-words ${task.completed ? STRIKE_CLASS : 'text-body'} ${
          projected ? '' : 'cursor-pointer hover:underline'
        }`}
      >
        <ListNumber n={number} wide={wide} completed={task.completed} />
        {NO_BREAK}
        {breakable(task.title)}
      </span>
      <div className="leading-tight">
        {task.due && (
          <span className="mt-[1px] inline-flex items-center gap-[3px] font-data text-[10px] text-muted">
            <Clock className="h-[10px] w-[10px]" /> {task.due}
          </span>
        )}
        {projected && <div className="text-[10px] italic text-faint">planned</div>}
        {superseded && (
          <div className="text-[10px] text-faint">
            → {task.recurring ? 'moved' : 'carried'} to {shortDate(task.carriedTo!)}
          </div>
        )}
      </div>
    </div>
  )
}
