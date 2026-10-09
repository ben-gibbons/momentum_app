// monitoring.ts
// One state machine for whether the monitoring loop is running. Three things can stop it:
//   - the user's "Distraction popups" toggle in Settings (`monitoring_enabled`) — off means no
//     polling, no sidecar, no session rows, no nudges; only the startup orphan cleanup ever runs
//   - the lock screen
//   - sleep
// Lock and sleep are temporary (the renderer's timers pause with them); the toggle is a standing
// choice (timers keep running). `locked` outranks sleep: a laptop that was locked, slept and woke
// is still locked, so 'resume' must not restart anything — only 'unlock-screen' does. Created when
// the toggle was added (2026-10-07); the lock/sleep handling moved here from index.ts.
import { powerMonitor } from 'electron'
import { pauseMonitoring as pausePolling, readWindow } from './read_window'
import { onPoll, resumeMonitoring, suspendMonitoring } from './session-manager'
import * as settings from './repositories/settings'
import { getMainWindow } from './window'

let enabled = true
let locked = false
let paused = false // true while lock/sleep has the loop stopped (distinct from `enabled`)

function stop(reason: string): void {
  suspendMonitoring(reason)
  pausePolling()
}

function start(reason: string): void {
  resumeMonitoring(reason)
  // readWindow() registers the poll callback on first use and is a no-op while the loop runs, so
  // it works both for a resume and for the first start after launching with the toggle off.
  readWindow(onPoll)
}

// App quit: stop the sidecar (otherwise python.exe outlives us) and stop accepting polls so an
// in-flight one can't open a row after the final close. Called from before-quit.
export function stopMonitoring(): void {
  enabled = false
  stop('quit')
}

// Lock / sleep: the renderer's timers always pause with the system (a forgotten timer must not go
// off on a locked screen); polling stops too, but only if the toggle had it running. A repeated
// pause (lock followed by sleep) is one pause, not two.
function pauseForSystem(reason: string): void {
  if (paused) return
  paused = true
  if (enabled) stop(reason)
  getMainWindow()?.webContents.send('push:monitoringPaused', true)
}

function resumeForSystem(reason: string): void {
  if (!paused || locked) return
  paused = false
  if (enabled) start(reason)
  getMainWindow()?.webContents.send('push:monitoringPaused', false)
}

// The Settings toggle. Off closes the open session and stops polling; on starts polling again —
// unless the system has it paused (locked / asleep), in which case unlock / wake will. Timers
// are not touched by the toggle.
export function setMonitoringEnabled(on: boolean): void {
  if (on === enabled) return
  enabled = on
  if (!on) stop('settings')
  else if (!paused) start('settings')
}

// Called once after app ready. Reads the toggle and only starts the loop when it's on; when off,
// nothing polls and nothing is printed — the only DB activity at launch is the session manager's
// orphan-row cleanup (already run).
export function startMonitoring(): void {
  enabled = settings.getAll().monitoringEnabled
  if (enabled) readWindow(onPoll)
  else suspendMonitoring('settings', true)

  powerMonitor.on('lock-screen', () => {
    locked = true
    pauseForSystem('lock')
  })
  powerMonitor.on('suspend', () => pauseForSystem('sleep'))
  powerMonitor.on('unlock-screen', () => {
    locked = false
    resumeForSystem('unlock')
  })
  powerMonitor.on('resume', () => resumeForSystem('wake'))
}
