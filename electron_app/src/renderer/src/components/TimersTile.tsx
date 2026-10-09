// components/TimersTile.tsx
// The "Timers" tile on the Home screen (sits under "This session" in the SessionTiles grid). Lists
// every timer in the app-wide store (lib/timers.tsx) — including ones started from a procrastination
// log's step 4 — with Pause/Resume, mute, Restart (once finished) and remove controls, and an inline
// "New timer" row (TodayCard style: dashed button → minutes + seconds + optional label inputs and a
// mute toggle; Enter starts, Escape cancels). Reads the store itself via useTimers(), so it takes
// no props.
import { useState } from 'react'
import { Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { formatTimer, useTimers, type ActiveTimer } from '../lib/timers'

const DEFAULT_MINUTES = 10
const ICON_BTN =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-brand transition-colors hover:bg-brand-soft'

// Speaker icon that flips a timer's completion beep. Shared by the row and the New timer form.
function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button aria-label={on ? 'Mute timer' : 'Unmute timer'} onClick={onToggle} className={ICON_BTN}>
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  )
}

function TimerRow({ timer }: { timer: ActiveTimer }): React.JSX.Element {
  const store = useTimers()
  const running = timer.endsAt !== null
  const done = timer.remainingSecs === 0
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[14px] text-body">{timer.label}</span>
      {done ? (
        <button
          onClick={() => store.restart(timer.id)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-soft"
        >
          <RotateCcw className="h-4 w-4" /> Restart
        </button>
      ) : (
        <>
          <span className="font-data text-[24px] font-semibold leading-none tracking-[-0.01em] text-ink">
            {formatTimer(timer.remainingSecs)}
          </span>
          <button
            aria-label={running ? 'Pause timer' : 'Resume timer'}
            onClick={() => (running ? store.pause(timer.id) : store.resume(timer.id))}
            className={ICON_BTN}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </>
      )}
      <SoundToggle on={timer.sound} onToggle={() => store.toggleSound(timer.id)} />
      <button
        aria-label="Remove timer"
        onClick={() => store.remove(timer.id)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function NewTimer(): React.JSX.Element {
  const store = useTimers()
  const [adding, setAdding] = useState(false)
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const [seconds, setSeconds] = useState('0')
  const [label, setLabel] = useState('')
  const [sound, setSound] = useState(true)

  function reset(): void {
    setAdding(false)
    setMinutes(String(DEFAULT_MINUTES))
    setSeconds('0')
    setLabel('')
    setSound(true)
  }

  function submit(): void {
    const mins = Math.floor(Number(minutes))
    // Seconds snap to the nearest 10 (the input steps by 10, but typing bypasses that).
    const secs = Math.round(Number(seconds) / 10) * 10
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || mins < 0 || secs < 0) return
    const totalSecs = mins * 60 + secs
    if (totalSecs === 0) return
    const trimmed = label.trim()
    const fallback = secs === 0 ? `${mins}-minute timer` : `${formatTimer(totalSecs)} timer`
    store.start({ label: trimmed || fallback, totalSecs, sound })
    reset()
  }

  // Shared by both inputs so Enter/Escape work wherever focus is.
  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') reset()
  }

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="mt-3 flex w-full items-center gap-[11px] rounded-md border border-dashed border-border-strong px-[13px] py-[10px] text-left text-[14px] text-muted transition-colors hover:bg-hover"
      >
        <Plus className="h-4 w-4 text-brand" /> New timer
      </button>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        autoFocus
        type="number"
        min={0}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Minutes"
        className="w-[64px] rounded-md border border-border-strong bg-input px-[10px] py-[8px] font-data text-[14px] text-body outline-none focus:border-border-brand"
      />
      <span className="text-[13px] text-muted">min</span>
      <input
        type="number"
        min={0}
        max={50}
        step={10}
        value={seconds}
        onChange={(e) => setSeconds(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Seconds"
        className="w-[64px] rounded-md border border-border-strong bg-input px-[10px] py-[8px] font-data text-[14px] text-body outline-none focus:border-border-brand"
      />
      <span className="text-[13px] text-muted">sec</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="What are you working on?"
        className="min-w-0 flex-1 rounded-md border border-border-strong bg-input px-[10px] py-[8px] text-[14px] text-body outline-none placeholder:text-faint focus:border-border-brand"
      />
      <SoundToggle on={sound} onToggle={() => setSound((s) => !s)} />
      <button
        onClick={submit}
        className="rounded-md bg-brand px-3 py-[8px] text-[13px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
      >
        Start
      </button>
    </div>
  )
}

export function TimersTile(): React.JSX.Element {
  const { timers } = useTimers()
  return (
    <div className="rounded-xl border border-border-default bg-card px-[22px] py-5 shadow-sm">
      <div className="mb-[14px] text-[13px] font-semibold text-ink">Timers</div>
      {timers.length === 0 ? (
        <div className="text-[13px] text-faint">No timers running.</div>
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle">
          {timers.map((t) => (
            <TimerRow key={t.id} timer={t} />
          ))}
        </div>
      )}
      <NewTimer />
    </div>
  )
}
