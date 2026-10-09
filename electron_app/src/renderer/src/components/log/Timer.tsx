// components/log/Timer.tsx
// The 10-minute focus timer from the breakdown step (design: `Timer` in ProcrastinationLog.jsx +
// `.mm-timer*` in kit.css). A thin view over the app-wide timer store (lib/timers.tsx): it shows
// the store's timer for `timerKey` if one exists (mm:ss, Pause/Resume, Restart once finished, mute),
// otherwise a start button that creates one. Because the countdown lives in the store, it keeps
// running after this step or the whole log overlay is closed, and reopening the log shows the same
// timer. The store sends the OS toast (and beep, unless muted) on completion. No animation here, so
// prefers-reduced-motion needs no special handling (the countdown is informational text, not motion).
import { useState } from 'react'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { formatTimer, useTimers } from '../../lib/timers'

const TOTAL_SECONDS = 600

interface TimerProps {
  timerKey: string // identity of the log this timer belongs to (saved id or a per-mount uuid)
  label: string // shown on the Home tile and in the completion toast
}

export function Timer({ timerKey, label }: TimerProps): React.JSX.Element {
  const store = useTimers()
  const timer = store.get(timerKey)
  // Mute state before the timer exists (what start() is created with); afterwards the store's
  // `sound` flag is the source of truth so the Home tile and this view agree.
  const [soundBeforeStart, setSoundBeforeStart] = useState(true)
  const sound = timer ? timer.sound : soundBeforeStart

  const secs = timer ? timer.remainingSecs : TOTAL_SECONDS
  const running = timer !== undefined && timer.endsAt !== null
  const done = timer !== undefined && timer.remainingSecs === 0

  function onClick(): void {
    if (!timer) store.start({ label, totalSecs: TOTAL_SECONDS, key: timerKey, sound })
    else if (done) store.restart(timer.id)
    else if (running) store.pause(timer.id)
    else store.resume(timer.id)
  }

  function onToggleSound(): void {
    if (timer) store.toggleSound(timer.id)
    else setSoundBeforeStart((s) => !s)
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border-default bg-raised p-4">
      <span className="font-data text-[30px] font-semibold tracking-[-0.01em] text-ink">
        {formatTimer(secs)}
      </span>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-[9px] text-[14px] font-semibold transition-colors ${
          running
            ? 'bg-brand-soft text-brand hover:bg-green-100'
            : 'bg-brand text-on-brand hover:bg-brand-hover'
        }`}
      >
        {running ? (
          <Pause className="h-4 w-4" />
        ) : done ? (
          <RotateCcw className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {running ? 'Pause' : done ? 'Restart' : timer ? 'Resume' : 'Start 10-minute timer'}
      </button>
      <button
        aria-label={sound ? 'Mute timer' : 'Unmute timer'}
        onClick={onToggleSound}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand transition-colors hover:bg-brand-soft"
      >
        {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </div>
  )
}
