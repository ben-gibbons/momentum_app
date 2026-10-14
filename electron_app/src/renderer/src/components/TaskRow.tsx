// components/TaskRow.tsx
// A single task row from the home screen: checkbox + title, optional tag/due meta, and the
// expandable "Steps" disclosure (AI-generated 20-minute breakdown). The first incomplete step
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
import { useState } from 'react'
import { Check, ChevronDown, Clock, ListTree, Play, Repeat, Sparkles } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { categoryLabel, shortDate } from '../lib/format'

interface TaskRowProps {
  task: DailyTask
  onToggle: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onStartStep?: (step: TaskStep) => void
  onEdit?: (taskId: number) => void
}

export function TaskRow({
  task,
  onToggle,
  onToggleStep,
  onStartStep,
  onEdit
}: TaskRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const tag = categoryLabel(task.category) ?? (task.riskFactor ? 'Risk factor' : null)
  const hasSteps = task.steps.length > 0
  // A carry-over copy (chip "Carried over"); for a series day, a copy means the user moved it.
  const carriedOver = task.carriedFrom != null
  const hasMeta = hasSteps || !!tag || !!task.due || carriedOver || task.recurring
  // A projected row is read-only: no DB row to tick or edit until the routine creates it.
  const inert = task.id == null
  // The original of a carried / moved task: superseded by its copy, so not tickable here.
  const superseded = task.carried && task.carriedTo != null
  const editable = !inert && onEdit != null

  return (
    <div className={`border-b border-border-subtle last:border-b-0 ${inert ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-[18px] py-[17px]">
        <div className="flex min-w-0 flex-1 items-start gap-[14px]">
          <button
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            disabled={inert || superseded}
            onClick={() => task.id != null && onToggle(task.id)}
            className={`mt-px flex h-[21px] w-[21px] flex-none items-center justify-center rounded-[7px] border-[1.5px] transition-colors disabled:cursor-default ${
              task.completed ? 'border-green-500 bg-green-500' : 'border-sand-400'
            }`}
          >
            {task.completed && <Check className="h-[13px] w-[13px] text-sand-50" strokeWidth={3} />}
          </button>
          <div className="flex min-w-0 flex-col items-start gap-[3px]">
            {editable ? (
              <button
                onClick={() => onEdit(task.id!)}
                className={`text-left text-[17px] leading-[1.45] transition-colors hover:text-brand ${
                  task.completed ? 'text-faint line-through' : 'text-body'
                }`}
              >
                {task.title}
              </button>
            ) : (
              <span
                className={`text-[17px] leading-[1.45] ${
                  task.completed ? 'text-faint line-through' : 'text-body'
                }`}
              >
                {task.title}
              </span>
            )}
            {superseded && (
              <span className="text-[12px] text-faint">
                {task.recurring ? 'Moved' : 'Carried'} to {shortDate(task.carriedTo!)}
              </span>
            )}
          </div>
        </div>

        {hasMeta && (
          <div className="flex flex-none flex-col items-end gap-[9px]">
            {(tag || task.due || carriedOver || task.recurring) && (
              <div className="flex items-center gap-[9px]">
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
              </div>
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
      </div>

      {hasSteps && (
        <div
          className="overflow-hidden transition-[max-height] duration-[280ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
          style={{ maxHeight: open ? 460 : 0 }}
        >
          <div className="pb-[18px] pl-[35px] pt-1">
            <p className="mb-3 flex items-center gap-[7px] text-[12px] text-muted">
              <Sparkles className="h-[13px] w-[13px] text-brand" /> Broken into 20-minute steps,
              easiest first.
            </p>
            {task.steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 py-[9px] ${
                  step.isNext ? '-mx-3 my-[2px] rounded-md bg-brand-soft px-3' : ''
                }`}
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
                  className={`flex-1 text-[13px] ${
                    step.completed
                      ? 'text-faint line-through'
                      : step.isNext
                        ? 'font-semibold text-ink'
                        : 'text-body'
                  }`}
                >
                  {step.text}
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
