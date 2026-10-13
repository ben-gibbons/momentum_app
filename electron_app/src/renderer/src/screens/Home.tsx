// screens/Home.tsx
// The Daily Tasks home screen (the approved design, source of truth) and the EXEMPLAR every other
// screen follows: data is read through window.api with useAsync; mutations call the api then
// reload(); presentation is split into small components; styling uses the design tokens. Owns the
// full shell (sidebar + scrolling main) for now — Phase 3 extracts the shell + routing.
import { Hero } from '../components/Hero'
import { TodayCard } from '../components/TodayCard'
import { SessionTiles } from '../components/SessionTiles'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'
import type { SessionTotals, TodayFocus } from '../../../shared/types'
import { startOfDay } from '../../../shared/dates'

const ZERO_SESSION: SessionTotals = { productive: 0, unproductive: 0, notsure: 0 }
const ZERO_FOCUS: TodayFocus = {
  focusedMinutes: 0,
  breakProgressMinutes: 0,
  breakTargetMinutes: 50
}

// The Daily Tasks home screen. Content-only (the app shell in App.tsx owns the sidebar + routing).
interface HomeProps {
  onNewLog?: () => void
  onOpenTrends?: () => void // "This session" tile → Productivity Trends
  dayKey?: number // bumped by App when the daily routine ran (new day / carry-over): refetch
}

export default function Home({ onNewLog, onOpenTrends, dayKey }: HomeProps): React.JSX.Element {
  const tasks = useAsync(() => api.tasks.listDaily(), [dayKey])
  const current = useAsync(() => api.session.getCurrent(), [dayKey])
  const focus = useAsync(() => api.session.getTodayFocus(), [dayKey])
  const userName = useAsync(() => api.settings.get('user_name'), [])

  const dailyTasks = tasks.data ?? []
  const incomplete = dailyTasks.filter((t) => !t.completed).length

  async function toggleTask(taskId: number): Promise<void> {
    await api.tasks.toggleComplete(taskId)
    tasks.reload()
  }
  async function toggleStep(stepId: number): Promise<void> {
    await api.taskSteps.toggle(stepId)
    tasks.reload()
  }
  async function addTask(title: string): Promise<void> {
    await api.tasks.create({ type: 'daily', title, date: startOfDay() })
    tasks.reload()
  }

  return (
    <main className="overflow-y-auto bg-paper">
      <Hero
        userName={userName.data ?? 'there'}
        focusedMinutes={(focus.data ?? ZERO_FOCUS).focusedMinutes}
        incompleteCount={incomplete}
        onNewLog={onNewLog}
      />
      <div className="mx-auto max-w-[920px] px-12 pb-14 pt-[30px]">
        <TodayCard
          tasks={dailyTasks}
          onToggleTask={toggleTask}
          onToggleStep={toggleStep}
          onAddTask={addTask}
        />
        <SessionTiles
          current={current.data ?? ZERO_SESSION}
          focus={focus.data ?? ZERO_FOCUS}
          onOpenTrends={onOpenTrends}
        />
      </div>
    </main>
  )
}
