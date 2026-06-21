// App.tsx — the application shell.
// Owns: cold-start splash boot, the sidebar + main-content routing (state-based; no router dep),
// and the two app-wide overlays (the "Feeling distracted?" nudge and the full-screen Procrastination
// Log flow). Screens are content-only <main> panels rendered in the grid's second column.
import { useState } from 'react'
import { Sidebar, type NavId } from './components/Sidebar'
import { Nudge } from './components/Nudge'
import Splash from './screens/Splash'
import Home from './screens/Home'
import Session from './screens/Session'
import RiskFactors from './screens/RiskFactors'
import Logs from './screens/Logs'
import ProcrastinationLog from './screens/ProcrastinationLog'
import Placeholder from './screens/Placeholder'
import { api } from './lib/api'
import { useAsync } from './lib/useAsync'

interface LogFlowState {
  open: boolean
  logId?: number
  seedFactor?: string
}

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<NavId>('daily')
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [logFlow, setLogFlow] = useState<LogFlowState>({ open: false })

  // Sidebar daily badge = incomplete daily count; refetched on navigation and when the log flow closes.
  const daily = useAsync(() => api.tasks.listDaily(), [view, logFlow.open])
  const incomplete = (daily.data ?? []).filter((t) => !t.completed).length

  // Cold-start: show the splash, then grow the window into the app and reveal it.
  async function finishSplash(): Promise<void> {
    try {
      await api.app.splashDone()
    } finally {
      setBooting(false)
    }
  }

  function navigate(id: NavId): void {
    // "Feeling distracted?" opens the nudge over the current view rather than navigating.
    if (id === 'distracted') {
      setNudgeOpen(true)
      return
    }
    setView(id)
  }

  function openLog(opts: { logId?: number; seedFactor?: string } = {}): void {
    setNudgeOpen(false)
    setLogFlow({ open: true, ...opts })
  }

  if (booting) return <Splash onDone={finishSplash} />

  return (
    <div className="grid h-screen grid-cols-[264px_1fr] overflow-hidden bg-paper">
      <Sidebar active={view} dailyBadge={incomplete} onNavigate={navigate} />

      {view === 'daily' && <Home onNewLog={() => openLog()} />}
      {(view === 'session' || view === 'trends') && <Session />}
      {view === 'logs' && <Logs />}
      {view === 'risk' && <RiskFactors onOpenLog={(logId) => openLog({ logId })} />}
      {view === 'calendar' && <Placeholder title="Calendar" note="Coming in a later version." />}
      {view === 'settings' && <Placeholder title="Settings" note="Coming soon." />}

      {nudgeOpen && (
        <Nudge
          open
          onClose={() => setNudgeOpen(false)}
          onTryLog={() => openLog()}
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
          onClose={() => setLogFlow({ open: false })}
        />
      )}
    </div>
  )
}

export default App
