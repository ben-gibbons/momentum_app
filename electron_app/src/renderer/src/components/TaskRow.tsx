// components/TaskRow.tsx
// A single task row from the home screen: one line of checkbox, number, title (wraps), the
// tag / due meta, the "Steps" toggle and the drag handle — every fixed-height item sits in a box
// the height of the title's first line (LINE) so they align on it — then the expandable "Steps"
// disclosure (AI-generated 20-minute breakdown). The first incomplete step
// (step.isNext, computed server-side) is highlighted and carries a Start button. Toggles call
// back to the Home screen, which persists via window.api and reloads.
//
// Item-5 markers (D1, D4, D9, D15): a muted "Carried over" chip when the row is a carry-over
// copy, a repeat icon when it belongs to a series, a "Risk factor" tag when the series came from
// a selected risk factor (a task has a category tag or that tag, never both — risk-factor tasks
// have no category), a "Carried to <date>" note on an original that was carried (or "Moved to"
// on a series day the user moved — its copy is the live row, so the original is not tickable),
// and projected future occurrences (no DB row yet, id null) rendered greyed and untickable.
// Clicking the title opens the edit dialog (onEdit) for any real row.
//
// V2 item 7: the list owner (TodayCard) passes the row's 1-based `number`, shown between the
// checkbox and the title at the title's size, and the reorder `handle` for the row's right edge.
// Steps are numbered the same way (left of the step text) and carry their own handle after the
// minutes; a drop reports the step ids in their new order through onReorderSteps.
import { useState } from 'react'
import { Check, ChevronDown, Clock, ListTree, Play, Repeat } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { breakable, categoryLabel, shortDate } from '../lib/format'
import { ListNumber, moveItem, NO_BREAK, numberedText, STRIKE_CLASS, useReorder } from './Reorder'

interface TaskRowProps {
  task: DailyTask
  number: number // 1-based position in the list
  wide?: boolean // the list has ten or more rows: two-digit number column
  isNext?: boolean // the list's first open task: highlighted + bold, like a task's first open step
  handle?: React.ReactNode // the reorder handle (none for a projected row)
  onToggle: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onStartStep?: (step: TaskStep) => void
  onEdit?: (taskId: number) => void
  onReorderSteps?: (taskId: number, stepIds: number[]) => void
}

// A box the height of the title's first line (17px × leading 25px): the checkbox, number, chips,
// Steps button and handle centre in it, so a wrapped title keeps them on its first line.
const LINE = 'flex h-[25px] flex-none items-center'

export function TaskRow({
  task,
  number,
  wide = false,
  isNext = false,
  handle,
  onToggle,
  onToggleStep,
  onStartStep,
  onEdit,
  onReorderSteps
}: TaskRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const stepReorder = useReorder(task.steps.length, (from, to) => {
    if (task.id != null)
      onReorderSteps?.(
        task.id,
        moveItem(task.steps, from, to).map((s) => s.id)
      )
  })
  const tag = categoryLabel(task.category) ?? (task.riskFactor ? 'Risk factor' : null)
  const hasSteps = task.steps.length > 0
  const stepsWide = task.steps.length >= 10
  // A carry-over copy (chip "Carried over"); for a series day, a copy means the user moved it.
  const carriedOver = task.carriedFrom != null
  // A projected row is read-only: no DB row to tick or edit until the routine creates it.
  const inert = task.id == null
  // The original of a carried / moved task: superseded by its copy, so not tickable here.
  const superseded = task.carried && task.carriedTo != null
  const editable = !inert && onEdit != null

  return (
    <div className={inert ? 'opacity-50' : ''}>
      <div
        className={`flex items-start gap-[14px] py-[17px] ${
          isNext ? '-mx-3 my-[2px] rounded-md bg-brand-soft px-3' : ''
        }`}
      >
        <div className={LINE}>
          <button
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            disabled={inert || superseded}
            onClick={() => task.id != null && onToggle(task.id)}
            className={`flex h-[21px] w-[21px] flex-none items-center justify-center rounded-[7px] border-[1.5px] transition-colors disabled:cursor-default ${
              task.completed ? 'border-green-500 bg-green-500' : 'border-sand-400'
            }`}
          >
            {task.completed && <Check className="h-[13px] w-[13px] text-sand-50" strokeWidth={3} />}
          </button>
        </div>
        {/* -ml trims the row gap to 8px between the checkbox and the number. */}
        <div className="-ml-[6px] flex min-w-0 flex-1 flex-col items-start gap-[3px]">
          {editable ? (
            <button
              onClick={() => onEdit(task.id!)}
              className={`max-w-full break-words text-left text-[17px] leading-[25px] transition-colors hover:text-brand ${numberedText(wide)} ${
                task.completed ? STRIKE_CLASS : isNext ? 'font-semibold text-ink' : 'text-body'
              }`}
            >
              <ListNumber n={number} wide={wide} completed={task.completed} />
              {NO_BREAK}
              {breakable(task.title)}
            </button>
          ) : (
            <span
              className={`max-w-full break-words text-[17px] leading-[25px] ${numberedText(wide)} ${
                task.completed ? STRIKE_CLASS : isNext ? 'font-semibold text-ink' : 'text-body'
              }`}
            >
              <ListNumber n={number} wide={wide} completed={task.completed} />
              {NO_BREAK}
              {breakable(task.title)}
            </span>
          )}
          {superseded && (
            <span className="text-[12px] text-faint">
              {task.recurring ? 'Moved' : 'Carried'} to {shortDate(task.carriedTo!)}
            </span>
          )}
        </div>

        {(task.estMinutes != null ||
          carriedOver ||
          tag ||
          task.recurring ||
          task.due ||
          hasSteps) && (
          <div className={`${LINE} gap-[9px]`}>
            {task.estMinutes != null && (
              <span className="whitespace-nowrap font-data text-[12px] text-muted">
                ~{task.estMinutes} min
              </span>
            )}
            {carriedOver && (
              <span className="whitespace-nowrap rounded-full bg-sunken px-[10px] py-[3px] text-[11px] font-semibold text-muted">
                {task.recurring ? 'Moved' : 'Carried over'}
              </span>
            )}
            {tag && (
              <span className="whitespace-nowrap rounded-full bg-brand-soft px-[10px] py-[3px] text-[11px] font-semibold text-brand">
                {tag}
              </span>
            )}
            {task.recurring && (
              <Repeat aria-label="Repeats" className="h-[13px] w-[13px] text-muted" />
            )}
            {task.due && (
              <span className="inline-flex items-center gap-[5px] whitespace-nowrap font-data text-[12px] text-muted">
                <Clock className="h-[13px] w-[13px]" /> {task.due}
              </span>
            )}
            {hasSteps && (
              <button
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-[6px] rounded-full border border-transparent bg-brand-soft px-3 py-[6px] text-[12px] font-semibold text-brand transition-colors hover:bg-green-100"
              >
                <ListTree className="h-[14px] w-[14px]" /> Steps
                <ChevronDown
                  className={`h-[14px] w-[14px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        )}
        {handle && <div className={`${LINE} -mr-[6px]`}>{handle}</div>}
      </div>

      {hasSteps && (
        <div
          className="overflow-hidden transition-[max-height] duration-[280ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
          style={{ maxHeight: open ? 460 : 0 }}
        >
          <div className="pb-[18px] pl-[35px] pt-1">
            {task.steps.map((step, i) => {
              const row = stepReorder.rowProps(i)
              return (
                <div
                  key={step.id}
                  {...row}
                  className={`flex items-center gap-3 py-[9px] ${
                    step.isNext ? '-mx-3 my-[2px] rounded-md bg-brand-soft px-3' : ''
                  } ${row.className}`}
                >
                  <button
                    aria-label={step.completed ? 'Mark step incomplete' : 'Mark step complete'}
                    disabled={inert}
                    onClick={() => onToggleStep(step.id)}
                    className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] border-[1.5px] transition-colors disabled:cursor-default ${
                      step.completed ? 'border-green-500 bg-green-500' : 'border-sand-400'
                    }`}
                  >
                    {step.completed && (
                      <Check className="h-[11px] w-[11px] text-sand-50" strokeWidth={3} />
                    )}
                  </button>
                  <span
                    className={`-ml-[5px] min-w-0 flex-1 break-words text-[13px] ${numberedText(stepsWide)} ${
                      step.completed
                        ? STRIKE_CLASS
                        : step.isNext
                          ? 'font-semibold text-ink'
                          : 'text-body'
                    }`}
                  >
                    <ListNumber n={i + 1} wide={stepsWide} completed={step.completed} />
                    {NO_BREAK}
                    {breakable(step.text)}
                  </span>
                  {step.isNext && !step.completed && !inert && (
                    <button
                      onClick={() => onStartStep?.(step)}
                      className="inline-flex flex-none items-center gap-[5px] rounded-full bg-brand px-[11px] py-[5px] text-[11px] font-semibold text-on-brand"
                    >
                      <Play className="h-[12px] w-[12px]" /> Start
                    </button>
                  )}
                  {step.estMinutes != null && (
                    <span className="flex-none font-data text-[11px] text-faint">
                      ~{step.estMinutes} min
                    </span>
                  )}
                  {onReorderSteps && !inert && stepReorder.handle(i, `step ${i + 1}`)}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
