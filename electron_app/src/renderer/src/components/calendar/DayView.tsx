// components/calendar/DayView.tsx
// The Calendar's Day view (V1 item 5, D6): the Home screen's TodayCard reused for any date. Reads
// tasks.listDaily(dayStart) and wires the same toggle handlers Home uses, with the chosen day in
// place of today. Add / edit open the screen-owned TaskDialog through onCreate / onEdit (the same
// callbacks WeekView gets). The card's own heading still reads "Today"; the RangeNav above it
// names the date.
import { TodayCard } from '../TodayCard'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'

interface DayViewProps {
  dayStart: number
  reloadKey: number // bumped by the screen on a day change or a dialog save → refetch
  onCreate: (initialDate: number) => void // open the TaskDialog in create mode for this day
  onEdit: (taskId: number) => void // open the TaskDialog in edit mode
}

export function DayView({
  dayStart,
  reloadKey,
  onCreate,
  onEdit
}: DayViewProps): React.JSX.Element {
  const tasks = useAsync(() => api.tasks.listDaily(dayStart), [dayStart, reloadKey])

  async function toggleTask(taskId: number): Promise<void> {
    await api.tasks.toggleComplete(taskId)
    tasks.reload()
  }
  async function toggleStep(stepId: number): Promise<void> {
    await api.taskSteps.toggle(stepId)
    tasks.reload()
  }
  return (
    <TodayCard
      tasks={tasks.data ?? []}
      onToggleTask={toggleTask}
      onToggleStep={toggleStep}
      onAddTask={() => onCreate(dayStart)}
      onEditTask={onEdit}
    />
  )
}
