// components/TodayCard.tsx
// The "Today" card: head (the title — "Today" on Home; the Calendar's Day view passes the date
// for any other day) with the done count, the task list, and the "Add a task" row. The add
// row and a task title both open the TaskDialog owned by the screen (onAddTask / onEditTask);
// task/step toggles bubble up the same way. Presentational: the screen owns the data and the
// dialog so it can reload after a save. Rows are keyed by id, or by parent + date for projected
// occurrences, which have no row yet (D15 / R11).
import { Plus } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { TaskRow } from './TaskRow'

interface TodayCardProps {
  title?: string // defaults to "Today"
  tasks: DailyTask[]
  onToggleTask: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onAddTask: () => void
  onEditTask?: (taskId: number) => void
  onStartStep?: (step: TaskStep) => void
}

export function TodayCard({
  title = 'Today',
  tasks,
  onToggleTask,
  onToggleStep,
  onAddTask,
  onEditTask,
  onStartStep
}: TodayCardProps): React.JSX.Element {
  const doneCount = tasks.filter((t) => t.completed).length

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
        {tasks.map((task) => (
          <TaskRow
            key={task.id ?? `projected-${task.parentTaskId}-${task.date}`}
            task={task}
            onToggle={onToggleTask}
            onToggleStep={onToggleStep}
            onStartStep={onStartStep}
            onEdit={onEditTask}
          />
        ))}
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
