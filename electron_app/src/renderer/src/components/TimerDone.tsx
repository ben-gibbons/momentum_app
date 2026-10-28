// components/TimerDone.tsx
// The timer-done dialog. App opens it the moment a timer finishes (TimersProvider's onFinished),
// whatever screen is showing; clicking the "Time's up" toast brings the window forward and pushes
// push:openTimer with the same id, which lands on the dialog already open. A centred modal in the
// nudge's style, above everything including the log overlay (z-70). Shows how long the timer ran,
// then the next task (typed, or "Same task" for the finished timer's name), a minutes stepper for the next run, the mute /
// sound toggle, and Restart — which restarts the same store timer under the new name and length,
// so the Home tile and a log's step-4 timer follow it. Closes itself if the timer is gone from the
// store (removed from the Home tile) or running again (restarted from there), so it can't pop back
// up uninvited at that timer's next completion.
import { useEffect, useState } from 'react'
import { Minus, Plus, RotateCcw, TimerIcon, Volume2, VolumeX, X } from 'lucide-react'
import { formatTimer, useTimers } from '../lib/timers'

const MAX_NEXT_MINS = 180

interface TimerDoneProps {
  timerId: string
  onClose: () => void
}

export function TimerDone({ timerId, onClose }: TimerDoneProps): React.JSX.Element | null {
  const store = useTimers()
  const timer = store.timers.find((t) => t.id === timerId)
  const [next, setNext] = useState('')
  // Length of the next run, in whole minutes; starts at the finished timer's length. (App keys
  // this dialog by timer id, so the lazy initializer sees the right timer.)
  const [nextMins, setNextMins] = useState(() =>
    Math.min(MAX_NEXT_MINS, Math.max(1, Math.round((timer?.totalSecs ?? 600) / 60)))
  )

  // Escape closes while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Nothing to show for a timer that was removed or restarted elsewhere: hand the close back to
  // App so its state clears (otherwise the dialog would reappear when the timer next hits 0).
  const stale = !timer || timer.remainingSecs > 0
  useEffect(() => {
    if (stale) onClose()
  }, [stale, onClose])

  if (!timer || stale) return null

  const label = next.trim()

  function restart(): void {
    if (!timer || !label) return
    store.restart(timer.id, { label, totalSecs: nextMins * 60 })
    onClose()
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(35,64,50,0.32)] p-6 animate-fade-in motion-reduce:animate-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-done-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] rounded-xl border border-border-default bg-card p-7 shadow-sm animate-pop-in motion-reduce:animate-none"
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-body"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <TimerIcon className="h-6 w-6" />
        </div>
        <h2
          id="timer-done-title"
          className="text-center font-display text-[22px] font-medium tracking-[-0.01em] text-ink"
        >
          Time&apos;s up
        </h2>
        <p className="mt-[6px] text-center font-data text-[14px] text-muted">
          {formatTimer(timer.totalSecs)} elapsed
        </p>

        {/* Restart needs a name for the next stretch of work. */}
        <label className="mt-6 block text-[13px] font-semibold text-body">
          What are you doing next?
          <span className="mt-[7px] flex gap-2">
            <input
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') restart()
              }}
              placeholder="The next task"
              className="min-w-0 flex-1 rounded-md border border-border-strong bg-input px-[13px] py-[10px] text-[15px] font-normal text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand"
            />
            <button
              type="button"
              onClick={() => setNext(timer.label)}
              className="flex-none rounded-md border border-border-strong bg-card px-3 py-[10px] text-[13px] font-semibold text-body transition-colors hover:bg-hover"
            >
              Same task
            </button>
          </span>
        </label>

        <div className="mt-6 flex items-center justify-between gap-3">
          {/* Length of the next run, in whole minutes. */}
          <span className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-card px-1 py-1">
            <button
              aria-label="One minute less"
              onClick={() => setNextMins((m) => Math.max(1, m - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand transition-colors hover:bg-brand-soft"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[64px] text-center font-data text-[14px] font-semibold text-ink">
              {nextMins} min
            </span>
            <button
              aria-label="One minute more"
              onClick={() => setNextMins((m) => Math.min(MAX_NEXT_MINS, m + 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand transition-colors hover:bg-brand-soft"
            >
              <Plus className="h-4 w-4" />
            </button>
          </span>
          <span className="flex items-center gap-2">
            <button
              aria-label={timer.sound ? 'Mute timer' : 'Unmute timer'}
              onClick={() => store.toggleSound(timer.id)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-brand transition-colors hover:bg-brand-soft"
            >
              {timer.sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            <button
              onClick={restart}
              disabled={!label}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-brand"
            >
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
