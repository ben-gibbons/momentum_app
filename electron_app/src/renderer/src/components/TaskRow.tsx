// components/TaskRow.tsx
// A single task row from the home screen: checkbox + title, optional tag/due meta, and the
// expandable "Steps" disclosure (AI-generated 20-minute breakdown). The first incomplete step
// (step.isNext, computed server-side) is highlighted and carries a Start button. Toggles call
// back to the Home screen, which persists via window.api and reloads.
import { useState } from 'react'
import { Check, ChevronDown, Clock, ListTree, Play, Sparkles } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { categoryLabel } from '../lib/format'

interface TaskRowProps {
  task: DailyTask
  onToggle: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onStartStep?: (step: TaskStep) => void
}

export function TaskRow({
  task,
  onToggle,
  onToggleStep,
  onStartStep
}: TaskRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const tag = categoryLabel(task.category)
  const hasSteps = task.steps.length > 0
  const hasMeta = hasSteps || !!tag || !!task.due

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-start justify-between gap-[18px] py-[17px]">
        <div className="flex min-w-0 flex-1 items-start gap-[14px]">
          <button
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            onClick={() => onToggle(task.id)}
            className={`mt-px flex h-[21px] w-[21px] flex-none items-center justify-center rounded-[7px] border-[1.5px] transition-colors ${
              task.completed ? 'border-green-500 bg-green-500' : 'border-sand-400'
            }`}
          >
            {task.completed && <Check className="h-[13px] w-[13px] text-sand-50" strokeWidth={3} />}
          </button>
          <span
            className={`text-[17px] leading-[1.45] ${
              task.completed ? 'text-faint line-through' : 'text-body'
            }`}
          >
            {task.title}
          </span>
        </div>

        {hasMeta && (
          <div className="flex flex-none flex-col items-end gap-[9px]">
            {(tag || task.due) && (
              <div className="flex items-center gap-[9px]">
                {tag && (
                  <span className="whitespace-nowrap rounded-full bg-brand-soft px-[10px] py-[3px] text-[11px] font-semibold text-brand">
                    {tag}
                  </span>
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
                  onClick={() => onToggleStep(step.id)}
                  className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] border-[1.5px] transition-colors ${
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
                {step.isNext && !step.completed && (
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
