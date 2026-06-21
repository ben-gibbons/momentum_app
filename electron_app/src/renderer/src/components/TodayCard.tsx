// components/TodayCard.tsx
// The "Today" card: head with the done count, the task list, and an inline "Add a task" row.
// Clicking the add row reveals an input; Enter creates a daily task (via the Home screen's
// onAddTask → window.api), Escape cancels. Task/step toggles bubble up to the Home screen.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { DailyTask, TaskStep } from '../../../shared/types'
import { TaskRow } from './TaskRow'

interface TodayCardProps {
  tasks: DailyTask[]
  onToggleTask: (taskId: number) => void
  onToggleStep: (stepId: number) => void
  onAddTask: (title: string) => void
  onStartStep?: (step: TaskStep) => void
}

export function TodayCard({
  tasks,
  onToggleTask,
  onToggleStep,
  onAddTask,
  onStartStep
}: TodayCardProps): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const doneCount = tasks.filter((t) => t.completed).length

  function submit(): void {
    const trimmed = title.trim()
    if (trimmed) onAddTask(trimmed)
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="rounded-xl border border-border-default bg-card px-7 py-2 shadow-sm">
      <div className="flex items-center justify-between pb-[6px] pt-[18px]">
        <h3 className="font-display text-[30px] font-medium tracking-[-0.01em] text-ink">Today</h3>
        <span className="font-data text-[13px] text-muted">
          {doneCount} of {tasks.length} done
        </span>
      </div>

      <div className="flex flex-col">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={onToggleTask}
            onToggleStep={onToggleStep}
            onStartStep={onStartStep}
          />
        ))}
      </div>

      {adding ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') {
              setTitle('')
              setAdding(false)
            }
          }}
          placeholder="What needs doing?"
          className="my-[14px] w-full rounded-md border border-border-strong bg-input px-[13px] py-[12px] text-[15px] text-body outline-none placeholder:text-faint focus:border-border-brand"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="my-[14px] flex w-full items-center gap-[11px] rounded-md border border-dashed border-border-strong px-[13px] py-[12px] text-left text-[15px] text-muted transition-colors hover:bg-hover"
        >
          <Plus className="h-4 w-4 text-brand" /> Add a task
        </button>
      )}
    </div>
  )
}
