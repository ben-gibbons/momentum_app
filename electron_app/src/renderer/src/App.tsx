// App.tsx — the application shell.
// Owns: the sidebar + main-content routing (state-based; no router dep) — the cold-start splash
// is its own page (splash.html) that the main process shows before this one —
// and the two app-wide overlays (the "Feeling distracted?" nudge and the full-screen Procrastination
// Log flow). The nudge opens either from the sidebar or when the main process pushes a
// DistractionEvent (threshold crossed). Three more main-process pushes land here: push:dayChanged
// (the daily task routine ran → dayKey bumps so task views refetch), push:openTask (a reminder
// toast was clicked → Calendar opens on that task) and push:openTimer (a timer's "Time's up" toast
// was clicked → the TimerDone dialog for it, which TimersProvider's onFinished already opened the
// moment the timer hit 0). Screens are content-only <main> panels rendered in the grid's second
// column.
import { useEffect, useRef, useState } from 'react'
import type { DistractionEvent, LogSource, OpenTaskEvent } from '../../shared/types'
import { Sidebar, type NavId } from './components/Sidebar'
import { Nudge } from './components/Nudge'
import { TimerDone } from './components/TimerDone'
import Home from './screens/Home'
import Trends from './screens/Trends'
import Calendar from './screens/Calendar'
import RiskFactors from './screens/RiskFactors'
import Logs from './screens/Logs'
import ProcrastinationLog from './screens/ProcrastinationLog'
import Settings from './screens/Settings'
import { api } from './lib/api'
import { useAsync } from './lib/useAsync'
import { TimersProvider } from './lib/timers'

interface LogFlowState {
  open: boolean
  logId?: number
  seedFactor?: string
  source?: LogSource // how a new log was opened (popup vs manual); ignored when editing
}

function App(): React.JSX.Element {
  const [view, setView] = useState<NavId>('daily')
  const [nudgeOpen, setNudgeOpen] = useState(false)
  // The event that opened the nudge; null when opened manually from the sidebar (generic copy).
  const [distraction, setDistraction] = useState<DistractionEvent | null>(null)
  const [logFlow, setLogFlow] = useState<LogFlowState>({ open: false })
  // Bumped when the main process reports the daily routine ran; task views depend on it to refetch.
  const [dayKey, setDayKey] = useState(0)
  // The task a reminder toast asked to open; Calendar highlights it.
  const [calendarFocus, setCalendarFocus] = useState<OpenTaskEvent | null>(null)
  // The timer the TimerDone dialog is showing (set when a timer finishes, and again by its toast
  // click); null = no dialog.
  const [timerDone, setTimerDone] = useState<string | null>(null)

  // Sidebar daily badge = incomplete daily count; refetched on navigation, when the log flow
  // closes, and on a day change.
  const daily = useAsync(() => api.tasks.listDaily(), [view, logFlow.open, dayKey])
  const incomplete = (daily.data ?? []).filter((t) => !t.completed).length

  useEffect(() => api.events.onDayChanged(() => setDayKey((k) => k + 1)), [])
  useEffect(() => api.events.onOpenTimer((id) => setTimerDone(id)), [])
  useEffect(
    () =>
      api.events.onOpenTask((e) => {
        setCalendarFocus(e)
        setView('calendar')
      }),
    []
  )

  // Main-process push: a distraction threshold was crossed → open the nudge with that event.
  // onDistraction returns its unsubscribe, which doubles as the effect cleanup. The handler reads
  // the log state through a ref (the [] effect would otherwise close over the initial value) and
  // stays quiet while a log is being filled in — the user is already doing the reflective work,
  // and "Try a log" would remount the overlay and discard their edits.
  const logOpenRef = useRef(logFlow.open)
  useEffect(() => {
    logOpenRef.current = logFlow.open
  }, [logFlow.open])
  useEffect(
    () =>
      api.events.onDistraction((e) => {
        if (logOpenRef.current) return
        setDistraction(e)
        setNudgeOpen(true)
        api.app.raiseDistraction(e) // window to front + OS toast, only when the nudge is shown
      }),
    []
  )

  function navigate(id: NavId): void {
    // "Feeling distracted?" opens the nudge over the current view rather than navigating. No event
    // → generic copy.
    if (id === 'distracted') {
      setDistraction(null)
      setNudgeOpen(true)
      return
    }
    setView(id)
  }

  function openLog(opts: Omit<LogFlowState, 'open'> = {}): void {
    setNudgeOpen(false)
    setLogFlow({ open: true, ...opts })
  }

  // TimersProvider wraps the whole shell so timers started in the log overlay outlive it and show
  // on Home; a finished timer opens the TimerDone dialog over whatever is on screen.
  return (
    <TimersProvider onFinished={setTimerDone}>
      <div className="grid h-screen grid-cols-[264px_1fr] overflow-hidden bg-paper">
        <Sidebar active={view} dailyBadge={incomplete} onNavigate={navigate} />

        {view === 'daily' && (
          <Home onNewLog={() => openLog()} onOpenTrends={() => setView('trends')} dayKey={dayKey} />
        )}
        {view === 'trends' && <Trends />}
        {view === 'logs' && (
          <Logs onOpenLog={(logId) => openLog({ logId })} logFlowOpen={logFlow.open} />
        )}
        {view === 'risk' && <RiskFactors onOpenLog={(logId) => openLog({ logId })} />}
        {view === 'calendar' && (
          <Calendar
            focus={calendarFocus}
            onFocusHandled={() => setCalendarFocus(null)}
            dayKey={dayKey}
          />
        )}
        {view === 'settings' && <Settings />}

        {nudgeOpen && (
          <Nudge
            open
            distraction={distraction}
            onClose={() => setNudgeOpen(false)}
            onTryLog={() => openLog({ source: distraction ? 'popup' : 'manual' })}
            onViewRisk={() => {
              setNudgeOpen(false)
              setView('risk')
            }}
          />
        )}

        {logFlow.open && (
          <ProcrastinationLog
            logId={logFlow.logId}
            seedRiskFactor={logFlow.seedFactor}
            source={logFlow.source}
            onClose={() => setLogFlow({ open: false })}
          />
        )}

        {/* Keyed so a second timer's toast gets a fresh dialog (own draft + clock). */}
        {timerDone && (
          <TimerDone key={timerDone} timerId={timerDone} onClose={() => setTimerDone(null)} />
        )}
      </div>
    </TimersProvider>
  )
}

export default App
