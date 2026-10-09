// App.tsx — the application shell.
// Owns: cold-start splash boot, the sidebar + main-content routing (state-based; no router dep),
// and the two app-wide overlays (the "Feeling distracted?" nudge and the full-screen Procrastination
// Log flow). The nudge opens either from the sidebar or when the main process pushes a
// DistractionEvent (threshold crossed). Screens are content-only <main> panels rendered in the
// grid's second column.
import { useEffect, useRef, useState } from 'react'
import type { DistractionEvent, LogSource } from '../../shared/types'
import { Sidebar, type NavId } from './components/Sidebar'
import { Nudge } from './components/Nudge'
import Splash from './screens/Splash'
import Home from './screens/Home'
import Session from './screens/Session'
import RiskFactors from './screens/RiskFactors'
import Logs from './screens/Logs'
import ProcrastinationLog from './screens/ProcrastinationLog'
import Placeholder from './screens/Placeholder'
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
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<NavId>('daily')
  const [nudgeOpen, setNudgeOpen] = useState(false)
  // The event that opened the nudge; null when opened manually from the sidebar (generic copy).
  const [distraction, setDistraction] = useState<DistractionEvent | null>(null)
  const [logFlow, setLogFlow] = useState<LogFlowState>({ open: false })

  // Sidebar daily badge = incomplete daily count; refetched on navigation and when the log flow closes.
  const daily = useAsync(() => api.tasks.listDaily(), [view, logFlow.open])
  const incomplete = (daily.data ?? []).filter((t) => !t.completed).length

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

  // Cold-start: show the splash, then grow the window into the app and reveal it.
  async function finishSplash(): Promise<void> {
    try {
      await api.app.splashDone()
    } finally {
      setBooting(false)
    }
  }

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

  if (booting) return <Splash onDone={finishSplash} />

  // TimersProvider wraps the whole shell so timers started in the log overlay outlive it and show
  // on Home.
  return (
    <TimersProvider>
      <div className="grid h-screen grid-cols-[264px_1fr] overflow-hidden bg-paper">
        <Sidebar active={view} dailyBadge={incomplete} onNavigate={navigate} />

        {view === 'daily' && <Home onNewLog={() => openLog()} />}
        {(view === 'session' || view === 'trends') && <Session />}
        {view === 'logs' && (
          <Logs onOpenLog={(logId) => openLog({ logId })} logFlowOpen={logFlow.open} />
        )}
        {view === 'risk' && <RiskFactors onOpenLog={(logId) => openLog({ logId })} />}
        {view === 'calendar' && <Placeholder title="Calendar" note="Coming in a later version." />}
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
      </div>
    </TimersProvider>
  )
}

export default App
