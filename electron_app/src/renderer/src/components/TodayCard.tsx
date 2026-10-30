// components/TodayCard.tsx
// The "Today" card: head (the title — "Today" on Home; the Calendar's Day view passes the date
// for any other day) with the done count, the task list, and the "Add a task" row. The add
// row and a task title both open the TaskDialog owned by the screen (onAddTask / onEditTask);
// task/step toggles bubble up the same way. Presentational: the screen owns the data and the
// dialog so it can reload after a save. Rows are keyed by id, or by parent + date for projected
// occurrences, which have no row yet (D15 / R11). Rows are numbered 1..n and carry a drag handle
// (V2 item 7); a drop reports the whole list's ids in their new order through onReorder, which
// the screen persists (tasks.reorder) and reloads.
import { Plus } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { TaskRow } from './TaskRow'
import { moveItem, useReorder } from './Reorder'

interface TodayCardProps {
  title?: string // defaults to "Today"
  tasks: DailyTask[]
  onToggleTask: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onAddTask: () => void
  onEditTask?: (taskId: number) => void
  onStartStep?: (step: TaskStep) => void
  onReorder?: (ids: number[]) => void
  onReorderSteps?: (taskId: number, stepIds: number[]) => void
}

export function TodayCard({
  title = 'Today',
  tasks,
  onToggleTask,
  onToggleStep,
  onAddTask,
  onEditTask,
  onStartStep,
  onReorder,
  onReorderSteps
}: TodayCardProps): React.JSX.Element {
  const doneCount = tasks.filter((t) => t.completed).length
  // The first open task in list order that can still be ticked here (not projected, not carried
  // onward) is highlighted like a task's first open step.
  const next = tasks.find(
    (t) => !t.completed && t.id != null && !(t.carried && t.carriedTo != null)
  )
  const reorder = useReorder(tasks.length, (from, to) => {
    const ids = moveItem(tasks, from, to)
      .map((t) => t.id)
      .filter((id): id is number => id != null)
    onReorder?.(ids)
  })

  return (
    <div className="rounded-xl border border-border-default bg-card px-7 py-2 shadow-sm">
      <div className="flex items-center justify-between pb-[6px] pt-[18px]">
        <h3 className="font-display text-[30px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h3>
        <span className="font-data text-[13px] text-muted">
          {doneCount} of {tasks.length} done
        </span>
      </div>

      <div className="flex flex-col">
        {tasks.map((task, i) => {
          const row = reorder.rowProps(i)
          return (
            // The divider is here, not on TaskRow: this wrapper is the list's child, so
            // last:border-b-0 sees the real last row.
            <div
              key={task.id ?? `projected-${task.parentTaskId}-${task.date}`}
              {...row}
              className={`border-b border-border-subtle last:border-b-0 ${row.className}`}
            >
              <TaskRow
                task={task}
                number={i + 1}
                wide={tasks.length >= 10}
                isNext={task === next}
                handle={onReorder && task.id != null ? reorder.handle(i, task.title) : undefined}
                onToggle={onToggleTask}
                onToggleStep={onToggleStep}
                onStartStep={onStartStep}
                onEdit={onEditTask}
                onReorderSteps={onReorderSteps}
              />
            </div>
          )
        })}
      </div>

      <button
        onClick={onAddTask}
        className="my-[14px] flex w-full items-center gap-[11px] rounded-md border border-dashed border-border-strong px-[13px] py-[12px] text-left text-[15px] text-muted transition-colors hover:bg-hover"
      >
        <Plus className="h-4 w-4 text-brand" /> Add a task
      </button>
    </div>
  )
}
