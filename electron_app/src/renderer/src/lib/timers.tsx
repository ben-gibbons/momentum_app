// lib/timers.tsx
// App-wide timer store (React context). Timers used to live as local state inside the log flow's
// step-4 Timer, so leaving that step or closing the log killed them. This provider holds every
// running timer at the shell level so a timer outlives the overlay and shows on the Home screen
// (TimersTile). State is in-memory only — timers do NOT survive an app restart.
//
// Model: a running timer stores its wall-clock end (`endsAt`, ms epoch) and a single 1-second
// interval in the provider recomputes `remainingSecs` from it — so the display is correct after any
// remount or tab switch, not dependent on how many ticks a component saw. While paused, `endsAt` is
// null and `remainingSecs` is authoritative; resume sets `endsAt = now + remainingSecs * 1000`.
// Reaching 0 sends one OS toast (api.app.notify) plus, unless the timer is muted (`sound`), a short
// Web Audio beep — the `notified` flag guards against a repeat. Finished timers stay in the list
// (with a Restart button) until the user removes them; restart() clears the flag so the next
// completion notifies again. Running timers pause when the main process pauses monitoring (lock
// screen / sleep, push:monitoringPaused) and resume with it, so a forgotten timer can't go off on
// a locked screen or fire the instant the laptop wakes.
//
// The provider, its hook and the mm:ss formatter live together on purpose (one module = the store).
// Fast Refresh falls back to a full reload for this file, which is fine:
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'

export interface ActiveTimer {
  id: string
  label: string
  totalSecs: number
  endsAt: number | null // ms epoch while running; null while paused or finished
  remainingSecs: number // authoritative while paused; recomputed from endsAt each tick while running
  key?: string // caller-chosen identity (e.g. the log it belongs to) so start() is idempotent per key
  sound: boolean // play the completion beep (the OS toast always fires)
  notified: boolean
}

export interface StartTimerOpts {
  label: string
  totalSecs: number
  key?: string
  sound?: boolean // default true
}

interface TimersApi {
  timers: ActiveTimer[]
  start(opts: StartTimerOpts): ActiveTimer
  pause(id: string): void
  resume(id: string): void
  remove(id: string): void
  restart(id: string): void
  toggleSound(id: string): void
  // Re-identify a timer (a new log's timer becomes the saved log's once it has an id).
  rekey(oldKey: string, newKey: string): void
  get(key: string): ActiveTimer | undefined
}

const TimersContext = createContext<TimersApi | null>(null)

// Completion sound: a triple 880 Hz sine beep, played three times (0 s, 1.5 s, 3 s), synthesised
// with Web Audio so there is no asset to ship. The AudioContext constructor or start() can throw
// under the autoplay policy (no user gesture yet), so the whole thing is best-effort — the OS
// toast fires regardless.
const BEEP_REPEATS = 3
const BEEP_REPEAT_GAP_S = 1.5
function beep(): void {
  try {
    const ctx = new AudioContext()
    for (let rep = 0; rep < BEEP_REPEATS; rep++) {
      for (let i = 0; i < 3; i++) {
        const at = ctx.currentTime + rep * BEEP_REPEAT_GAP_S + i * 0.2
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        // Quick attack then exponential decay so each beep is a clean click-free blip.
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(0.6, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.15)
        osc.connect(gain).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + 0.15)
      }
    }
    // Release the audio device once the last beep has played.
    setTimeout(() => void ctx.close(), (BEEP_REPEATS * BEEP_REPEAT_GAP_S + 1) * 1000)
  } catch {
    // Autoplay policy or no audio device — silently skip; the toast still fires.
  }
}

export function TimersProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  // Mirror of `timers` for the interval callback and start()'s idempotency check, which need the
  // latest committed list without being re-created every render. Synced after commit.
  const timersRef = useRef(timers)
  useEffect(() => {
    timersRef.current = timers
  }, [timers])

  // One interval for the whole store, as a pure functional updater so it can never overwrite a
  // mutation (pause, rekey, …) committed between ticks. Reaching 0 only flips `notified`; the
  // toast/beep side effect lives in the effect below.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setTimers((prev) => {
        let changed = false
        const next = prev.map((tm) => {
          if (tm.endsAt === null) return tm
          // ceil so a timer never reads 00:00 before it has actually ended.
          const remaining = Math.max(0, Math.ceil((tm.endsAt - now) / 1000))
          if (remaining === tm.remainingSecs) return tm
          changed = true
          return remaining > 0
            ? { ...tm, remainingSecs: remaining }
            : { ...tm, endsAt: null, remainingSecs: 0, notified: true }
        })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Completion side effects, exactly once per completion: fire for every timer whose `notified`
  // flag is newly set (tracked in a ref, so StrictMode's double render can't repeat it); restart()
  // clears the flag, which also clears the ref entry so the next completion fires again.
  const firedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const tm of timers) {
      if (tm.notified && !firedRef.current.has(tm.id)) {
        firedRef.current.add(tm.id)
        api.app.notify("Time's up", tm.label)
        if (tm.sound) beep()
      } else if (!tm.notified) {
        firedRef.current.delete(tm.id)
      }
    }
  }, [timers])

  // Lock screen / sleep: pause every running timer and remember which ones, so only those resume
  // on unlock / wake. A timer the user paused by hand stays paused.
  const pausedByMonitorRef = useRef<Set<string>>(new Set())
  useEffect(
    () =>
      api.events.onMonitoringPaused((paused) => {
        const now = Date.now()
        if (paused) {
          const running = timersRef.current.filter((t) => t.endsAt !== null)
          if (running.length === 0) return // nothing new to remember; keep any earlier set
          for (const t of running) pausedByMonitorRef.current.add(t.id)
          setTimers((prev) =>
            prev.map((t) =>
              t.endsAt === null
                ? t
                : { ...t, endsAt: null, remainingSecs: Math.max(0, Math.ceil((t.endsAt - now) / 1000)) }
            )
          )
        } else {
          const ids = pausedByMonitorRef.current
          pausedByMonitorRef.current = new Set()
          if (ids.size === 0) return
          setTimers((prev) =>
            prev.map((t) =>
              ids.has(t.id) && t.endsAt === null && t.remainingSecs > 0
                ? { ...t, endsAt: now + t.remainingSecs * 1000 }
                : t
            )
          )
        }
      }),
    []
  )

  function get(key: string): ActiveTimer | undefined {
    return timers.find((t) => t.key === key)
  }

  function start(opts: StartTimerOpts): ActiveTimer {
    if (opts.key !== undefined) {
      const existing = timersRef.current.find((t) => t.key === opts.key)
      if (existing) return existing
    }
    const timer: ActiveTimer = {
      id: crypto.randomUUID(),
      label: opts.label,
      totalSecs: opts.totalSecs,
      endsAt: Date.now() + opts.totalSecs * 1000,
      remainingSecs: opts.totalSecs,
      key: opts.key,
      sound: opts.sound ?? true,
      notified: false
    }
    setTimers((prev) => [...prev, timer])
    return timer
  }

  function pause(id: string): void {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.endsAt === null) return t
        return {
          ...t,
          endsAt: null,
          remainingSecs: Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000))
        }
      })
    )
  }

  function resume(id: string): void {
    setTimers((prev) =>
      prev.map((t) => {
        // Only a paused timer with time left can resume; a finished one stays "Done".
        if (t.id !== id || t.endsAt !== null || t.remainingSecs <= 0) return t
        return { ...t, endsAt: Date.now() + t.remainingSecs * 1000 }
      })
    )
  }

  function remove(id: string): void {
    setTimers((prev) => prev.filter((t) => t.id !== id))
  }

  // Back to a full, running countdown. Clearing `notified` is what lets the next completion send
  // the toast/beep again; label, key and sound are kept.
  function restart(id: string): void {
    setTimers((prev) =>
      prev.map((t) =>
        t.id !== id
          ? t
          : {
              ...t,
              endsAt: Date.now() + t.totalSecs * 1000,
              remainingSecs: t.totalSecs,
              notified: false
            }
      )
    )
  }

  function rekey(oldKey: string, newKey: string): void {
    setTimers((prev) => prev.map((t) => (t.key === oldKey ? { ...t, key: newKey } : t)))
  }

  function toggleSound(id: string): void {
    setTimers((prev) => prev.map((t) => (t.id !== id ? t : { ...t, sound: !t.sound })))
  }

  return (
    <TimersContext.Provider
      value={{ timers, start, pause, resume, remove, restart, toggleSound, rekey, get }}
    >
      {children}
    </TimersContext.Provider>
  )
}

export function useTimers(): TimersApi {
  const ctx = useContext(TimersContext)
  if (!ctx) throw new Error('useTimers must be used inside <TimersProvider>')
  return ctx
}

// "mm:ss" for a remaining-seconds value. Shared by the log Timer and the Home tile.
export function formatTimer(secs: number): string {
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
