// components/calendar/WeeklyList.tsx
// The weekly task list on the Calendar's Week view (V1 item 5, D3–D5): one row per weekly row of
// the shown week — checkbox (disabled for a series, which completes through its days), title
// (click → edit dialog), "N of target" for a series or a tick for a single-entry task, category /
// "Risk factor" tags, a "Carried over" chip (this row is the carried-in copy, D5), a repeat icon
// — plus per-row actions: "Add to a day" (an open single-entry task that has no day yet →
// Mon..Sun chips → tasks.addToDaily; a task has one day, moved from its dialog afterwards)
// and "Stop repeating" (a series with days still to come → inline confirm → the series becomes a
// one-off task: unfinished days after today are removed; a series that has ended, e.g. after
// "Delete series" kept its ticked days, has nothing to stop). The original of a carried task
// (carriedTo set) is superseded by
// its copy: it shows "→ carried to …" and no checkbox or actions. "+ Add" opens the create dialog
// (repeat is set inside it). Presentational: WeekView owns the data and the api calls.
import { useEffect, useRef, useState } from 'react'
import { Check, Plus, Repeat } from 'lucide-react'
import type { WeeklyTask } from '../../../../shared/types'
import { addDays, startOfDay, weekStartMonday } from '../../../../shared/dates'
import {
  categoryTag,
  checkboxClass,
  CHIP_CLASS,
  HIGHLIGHT_CLASS,
  monthDayShort,
  RISK_TAG_CLASS,
  TAG_CLASS,
  weekdayShort
} from './shared'

interface WeeklyListProps {
  weekStart: number
  tasks: WeeklyTask[]
  highlightId: number | null // row to ring + scroll to (reminder deep-link)
  onToggle: (weeklyId: number) => void
  onAddToDay: (weeklyId: number, dayStart: number) => void
  onStopRepeating: (weeklyId: number) => void
  onEdit: (taskId: number) => void
  onCreate: (initialDate: number) => void
}

const ACTION_CLASS =
  'rounded-md px-2 py-[3px] text-[12px] font-semibold text-brand transition-colors hover:bg-brand-soft'

export function WeeklyList({
  weekStart,
  tasks,
  highlightId,
  onToggle,
  onAddToDay,
  onStopRepeating,
  onEdit,
  onCreate
}: WeeklyListProps): React.JSX.Element {
  // A task added from a past or future week lands on that week's Monday; in the current week it
  // lands on today so it shows up on Home straight away.
  const addDate = weekStart === weekStartMonday() ? startOfDay() : weekStart
  const done = tasks.filter((t) => t.completed).length

  return (
    // h-full: the Week view stretches this card to the day grid's height.
    <div className="h-full rounded-xl border border-border-default bg-card px-5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3 pb-[6px] pt-[14px]">
        <h3 className="font-display text-[22px] font-medium tracking-[-0.01em] text-ink">
          This week&rsquo;s tasks
        </h3>
        <span className="font-data text-[13px] text-muted">
          {done} of {tasks.length} done
        </span>
      </div>

      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={() => onCreate(addDate)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-strong px-[10px] py-[6px] text-[13px] text-muted transition-colors hover:bg-hover"
        >
          <Plus className="h-[14px] w-[14px] text-brand" /> Add
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="py-4 text-[15px] text-faint">Nothing planned this week.</p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <WeeklyRow
              key={task.id}
              task={task}
              weekStart={weekStart}
              highlighted={task.id === highlightId}
              onToggle={onToggle}
              onAddToDay={onAddToDay}
              onStopRepeating={onStopRepeating}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface WeeklyRowProps {
  task: WeeklyTask
  weekStart: number
  highlighted: boolean
  onToggle: (weeklyId: number) => void
  onAddToDay: (weeklyId: number, dayStart: number) => void
  onStopRepeating: (weeklyId: number) => void
  onEdit: (taskId: number) => void
}

function WeeklyRow({
  task,
  weekStart,
  highlighted,
  onToggle,
  onAddToDay,
  onStopRepeating,
  onEdit
}: WeeklyRowProps): React.JSX.Element {
  const [picking, setPicking] = useState(false) // "Add to a day" chips shown
  const [confirming, setConfirming] = useState(false) // "Stop repeating" confirm shown
  const ref = useRef<HTMLLIElement>(null)
  // Bring the deep-linked row into view once it is rendered (the list loads after the toast click
  // switches the week, so the row may not exist when the highlight is set).
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const series = task.repeatDays !== 0
  // Nothing to stop once the series' last day is today or earlier.
  const stoppable = series && (task.repeatUntil == null || task.repeatUntil > startOfDay())
  // The original of a carried-over task: its copy in a later week is the live row now.
  const superseded = task.carriedTo != null
  // A day can be given to an open single-entry task that has none and hasn't been carried onward.
  const canAddDay = !series && !task.completed && !superseded && !task.scheduled
  const tag = categoryTag(task.category)

  return (
    <li
      ref={ref}
      className={`border-b border-border-subtle py-[12px] last:border-b-0 ${highlighted ? HIGHLIGHT_CLASS : ''}`}
    >
      <div className="flex items-start gap-3">
        {superseded ? (
          // Same footprint as the checkbox so titles stay aligned down the list.
          <span aria-hidden className="mt-px h-[21px] w-[21px] flex-none" />
        ) : (
          <button
            type="button"
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            disabled={series}
            title={series ? 'Recurring tasks complete through their days' : undefined}
            onClick={() => onToggle(task.id)}
            className={`mt-px ${checkboxClass(task.completed, 'md')}`}
          >
            {task.completed && <Check className="h-[13px] w-[13px] text-sand-50" strokeWidth={3} />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onEdit(task.id)}
            className={`block max-w-full break-words text-left text-[15px] leading-[1.4] hover:underline ${
              task.completed ? 'text-faint line-through' : 'text-body'
            }`}
          >
            {task.title}
          </button>

          <div className="mt-[5px] flex flex-wrap items-center gap-[7px]">
            {series ? (
              <span className="font-data text-[12px] text-muted">
                {task.doneCount} of {task.target}
              </span>
            ) : (
              task.completed && (
                <Check className="h-[13px] w-[13px] text-green-500" strokeWidth={3} />
              )
            )}
            {series && <Repeat className="h-[12px] w-[12px] text-muted" aria-label="Repeats" />}
            {tag && <span className={TAG_CLASS}>{tag}</span>}
            {task.riskFactor && <span className={RISK_TAG_CLASS}>Risk factor</span>}
            {task.carried && <span className={CHIP_CLASS}>Carried over</span>}
            {task.carriedTo != null && (
              <span className="text-[12px] text-faint">
                → carried to week of {monthDayShort(task.carriedTo)}
              </span>
            )}
          </div>

          <div className="mt-[6px] flex flex-wrap items-center gap-1">
            {canAddDay && (
              <button type="button" onClick={() => setPicking((v) => !v)} className={ACTION_CLASS}>
                Add to a day
              </button>
            )}
            {stoppable && !confirming && (
              <button type="button" onClick={() => setConfirming(true)} className={ACTION_CLASS}>
                Stop repeating
              </button>
            )}
          </div>

          {picking && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    onAddToDay(task.id, day)
                  }}
                  className="rounded-full border border-border-strong px-[9px] py-[2px] text-[12px] font-semibold text-body transition-colors hover:bg-brand-soft hover:text-brand"
                >
                  {weekdayShort(day)}
                </button>
              ))}
            </div>
          )}

          {confirming && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-body">
              <span>Make this a one-off task? Unfinished days after today are removed.</span>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  onStopRepeating(task.id)
                }}
                className="rounded-md bg-brand px-[10px] py-[3px] text-[12px] font-semibold text-on-brand"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md px-2 py-[3px] text-[12px] font-semibold text-muted hover:bg-hover"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
