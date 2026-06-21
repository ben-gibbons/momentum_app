// components/log/Timer.tsx
// The 10-minute focus timer from the breakdown step (design: `Timer` in ProcrastinationLog.jsx +
// `.mm-timer*` in kit.css). Counts down from 600s; Start/Pause toggles the interval. On reaching
// zero it stops and calls onComplete once — the lead wires any Windows/Electron notification later,
// so this only fires an internal callback. No animation here, so prefers-reduced-motion needs no
// special handling (the countdown is informational text, not motion).
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

const TOTAL_SECONDS = 600

interface TimerProps {
  onComplete?: () => void
}

export function Timer({ onComplete }: TimerProps): React.JSX.Element {
  const [secs, setSecs] = useState(TOTAL_SECONDS)
  const [running, setRunning] = useState(false)
  // Hold the latest onComplete without making it an effect dependency (it would restart the timer).
  // Synced in an effect rather than during render so the ref write happens after commit.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(t)
          setRunning(false)
          onCompleteRef.current?.()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  const done = secs === 0
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border-default bg-raised p-4">
      <span className="font-data text-[30px] font-semibold tracking-[-0.01em] text-ink">
        {mm}:{ss}
      </span>
      <button
        onClick={() => setRunning((r) => !r)}
        disabled={done}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-[9px] text-[14px] font-semibold transition-colors disabled:opacity-50 ${
          running
            ? 'bg-brand-soft text-brand hover:bg-green-100'
            : 'bg-brand text-on-brand hover:bg-brand-hover'
        }`}
      >
        {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {running ? 'Pause' : done ? 'Done' : 'Start 10-minute timer'}
      </button>
    </div>
  )
}
