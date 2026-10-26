// dayChange.ts
// Runs the daily routine (routine.ts) at the moments a new day can begin for the user: launch,
// the next local midnight (a timer re-armed after each fire), and unlock / wake (a laptop that
// slept through midnight fires its timer late, so these re-check; `last_routine_day` makes a
// repeat run a no-op). After a run that did work it pushes push:dayChanged so Home / Calendar
// refetch, and re-arms the reminder timer in any case (Node timers don't account for sleep).
// Own powerMonitor listeners — monitoring.ts is not involved.
import { powerMonitor } from 'electron'
import { runDailyRoutine } from './routine'
import { rearm } from './reminders'
import { getMainWindow } from './window'
import { addDays, startOfDay } from '../shared/dates'

let midnightTimer: NodeJS.Timeout | null = null

// A routine failure must not become an uncaught main-process exception (these run from timer and
// powerMonitor callbacks): log it; the next trigger tries again. Reminders re-arm regardless.
function runAndNotify(): void {
  try {
    if (runDailyRoutine()) getMainWindow()?.webContents.send('push:dayChanged')
  } catch (err) {
    console.error('[dayChange] daily routine failed:', err)
  }
  try {
    rearm()
  } catch (err) {
    console.error('[dayChange] reminder re-arm failed:', err)
  }
}

// Fire one second after the next local midnight. The next timer is armed before the routine
// runs so a failing run can't leave the chain broken.
function armMidnight(): void {
  if (midnightTimer) clearTimeout(midnightTimer)
  const nextMidnight = addDays(startOfDay(), 1)
  const waitMs = nextMidnight * 1000 - Date.now() + 1000
  midnightTimer = setTimeout(() => {
    armMidnight()
    runAndNotify()
  }, waitMs)
}

// Called once after app ready (before the window exists: the launch run needs no push).
export function startDayChange(): void {
  armMidnight()
  runAndNotify()
  powerMonitor.on('unlock-screen', runAndNotify)
  powerMonitor.on('resume', runAndNotify)
}
