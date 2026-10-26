// components/calendar/DayView.tsx
// The Calendar's Day view (V1 item 5, D6): the Home screen's TodayCard reused for any date. Reads
// tasks.listDaily(dayStart) and wires the same toggle handlers Home uses, with the chosen day in
// place of today. Add / edit open the screen-owned TaskDialog through onCreate / onEdit (the same
// callbacks WeekView gets). The card's heading reads "Today" only for today; any other day is
// titled with its date ("Monday, Oct 12"). Held at the width it had before the Calendar page widened for the Week / Month
// grids (AP1: the day list keeps its size), centered.
import { TodayCard } from '../TodayCard'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { isToday } from './shared'

// "Monday, Oct 12" — the card title for a day other than today (the RangeNav carries the year).
const dayTitle = (dayStart: number): string =>
  new Date(dayStart * 1000).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })

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
    <div className="mx-auto max-w-[1004px]">
      <TodayCard
        title={isToday(dayStart) ? 'Today' : dayTitle(dayStart)}
        tasks={tasks.data ?? []}
        onToggleTask={toggleTask}
        onToggleStep={toggleStep}
        onAddTask={() => onCreate(dayStart)}
        onEditTask={onEdit}
      />
    </div>
  )
}
