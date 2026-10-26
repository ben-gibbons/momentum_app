// reminders.ts
// Task reminders as OS toasts (V1 item 5, D8). One timer, armed for the next unfired
// reminder_time (capped at 12 h so a far-off reminder or a clock change can't leave it stale).
// fire() toasts every unfinished task whose reminder came due since the last fire, then re-arms.
// Clicking a toast brings Momentum forward and pushes push:openTask so the renderer opens
// Calendar on that task. rearm() is called after every tasks:* mutation (ipc.ts) and by
// dayChange.ts at launch and on unlock / wake, because Node timers don't account for sleep.
// Reminders that came due while the app was closed are not replayed (`lastFired` starts at
// launch), and a reminder set or moved to a time already past is missed, not fired late.
import * as tasks from './repositories/tasks'
import { nowSecs, startOfDay } from './repositories/util'
import { notify } from './notify'
import { getMainWindow } from './window'
import type { OpenTaskEvent } from '../shared/types'

const MAX_WAIT_SECS = 12 * 3600
// A reminder more than this far in the past at (re)arm time is treated as missed; the minute
// covers one that came due while its timer was being reset by a mutation.
const MISSED_AFTER_SECS = 60

let timer: NodeJS.Timeout | null = null
let lastFired = nowSecs()

function openTask(r: tasks.ReminderRow): void {
  const e: OpenTaskEvent = {
    taskId: r.id,
    date: r.date ?? r.week_start ?? startOfDay(r.reminder_time)
  }
  getMainWindow()?.webContents.send('push:openTask', e)
}

function fire(): void {
  const now = nowSecs()
  for (const r of tasks.dueReminders(lastFired, now)) {
    const due = new Date(r.reminder_time * 1000).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })
    notify(r.title, `Reminder · ${due}`, () => openTask(r))
  }
  lastFired = now
  rearm()
}

// Re-read the next reminder and (re)set the single timer for it. Safe to call at any time.
export function rearm(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const now = nowSecs()
  lastFired = Math.max(lastFired, now - MISSED_AFTER_SECS)
  const next = tasks.nextReminder(lastFired)
  if (!next) return
  const wait = Math.min(Math.max(0, next.reminder_time - now), MAX_WAIT_SECS)
  timer = setTimeout(fire, wait * 1000)
}
