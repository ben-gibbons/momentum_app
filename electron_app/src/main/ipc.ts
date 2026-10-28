// ipc.ts
// Registers every ipcMain.handle channel the renderer calls via window.api. Each handler is a
// thin adapter onto a repository function — no business logic or SQL lives here. Channel names
// mirror the MomentumApi surface in src/shared/types.ts and the preload bridge. Repositories are
// synchronous (better-sqlite3); ipcMain.handle wraps the return value in a promise for the renderer.
import { ipcMain, BrowserWindow } from 'electron'
import type { DistractionEvent, LogInput, RuleInput, TaskInput, TaskPatch } from '../shared/types'

// App window size after the splash (the splash window is 1100x700, non-resizable).
const APP_WIDTH = 1280
const APP_HEIGHT = 860
import * as tasks from './repositories/tasks'
import * as sessions from './repositories/sessions'
import * as logs from './repositories/logs'
import * as riskFactors from './repositories/riskFactors'
import * as settings from './repositories/settings'
import * as distortions from './repositories/distortions'
import * as rules from './repositories/classificationRules'
import { notify } from './notify'
import { raiseDistraction } from './distraction'
import { setMonitoringEnabled } from './monitoring'
import { rearm } from './reminders'
import { getMainWindow, loadPage } from './window'

// A task mutation may add, move, or clear a reminder: re-read the next one after it.
function thenRearm<T>(result: T): T {
  rearm()
  return result
}

export function registerIpc(): void {
  // Tasks
  ipcMain.handle('tasks:listDaily', (_e, date?: number) => tasks.listDaily(date))
  ipcMain.handle('tasks:listDailyRange', (_e, from: number, to: number) =>
    tasks.listDailyRange(from, to)
  )
  ipcMain.handle('tasks:listWeekly', (_e, weekStart?: number) => tasks.listWeekly(weekStart))
  ipcMain.handle('tasks:get', (_e, taskId: number) => tasks.get(taskId))
  ipcMain.handle('tasks:toggleComplete', (_e, taskId: number) =>
    thenRearm(tasks.toggleComplete(taskId))
  )
  ipcMain.handle('tasks:create', (_e, input: TaskInput) => thenRearm(tasks.create(input)))
  ipcMain.handle('tasks:update', (_e, taskId: number, patch: TaskPatch) =>
    thenRearm(tasks.update(taskId, patch))
  )
  ipcMain.handle('tasks:remove', (_e, taskId: number) => thenRearm(tasks.remove(taskId)))
  ipcMain.handle('tasks:addToDaily', (_e, weeklyId: number, date: number) =>
    thenRearm(tasks.addToDaily(weeklyId, date))
  )
  ipcMain.handle('taskSteps:toggle', (_e, stepId: number) => tasks.toggleStep(stepId))
  ipcMain.handle('taskSteps:add', (_e, taskId: number, text: string, estMinutes?: number | null) =>
    tasks.addStep(taskId, text, estMinutes)
  )
  ipcMain.handle('taskSteps:remove', (_e, stepId: number) => tasks.removeStep(stepId))

  // Session + trends
  ipcMain.handle('session:getCurrent', () => sessions.getCurrent())
  ipcMain.handle('session:getTodayFocus', () => sessions.getTodayFocus())
  ipcMain.handle('trends:getWeek', (_e, weekStart?: number) => sessions.getWeek(weekStart))
  ipcMain.handle('trends:getDay', (_e, dayStart: number) => sessions.getDay(dayStart))
  ipcMain.handle('trends:getBreakdown', (_e, from: number, to: number) =>
    sessions.getBreakdown(from, to)
  )
  ipcMain.handle('trends:getMonth', (_e, monthStart: number) => sessions.getMonth(monthStart))

  // Procrastination logs
  ipcMain.handle('logs:list', () => logs.list())
  ipcMain.handle('logs:get', (_e, id: number) => logs.get(id))
  ipcMain.handle('logs:create', (_e, input: LogInput) => logs.create(input))
  ipcMain.handle('logs:update', (_e, id: number, input: LogInput) => logs.update(id, input))
  ipcMain.handle('logs:remove', (_e, id: number) => logs.remove(id))

  // Risk factors
  ipcMain.handle('riskFactors:listCatalog', () => riskFactors.listCatalog())
  ipcMain.handle('riskFactors:addCustom', (_e, label: string) => riskFactors.addCustom(label))
  ipcMain.handle('riskFactors:select', (_e, catalogId: number, recur?: boolean) =>
    riskFactors.select(catalogId, recur)
  )

  // Distortions
  ipcMain.handle('distortions:list', () => distortions.list())

  // Classification rules (productive / unproductive lists + the reclassify-not-sure list)
  ipcMain.handle('rules:list', () => rules.list())
  ipcMain.handle('rules:add', (_e, input: RuleInput) => rules.add(input))
  ipcMain.handle('rules:remove', (_e, id: number) => rules.remove(id))
  ipcMain.handle('rules:listNotSure', () => rules.listNotSure())

  // Settings
  ipcMain.handle('settings:get', (_e, key: string) => settings.get(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    settings.set(key, value)
    // The master switch takes effect immediately (other keys are re-read every poll anyway).
    if (key === 'monitoring_enabled') setMonitoringEnabled(value === '1')
  })
  ipcMain.handle('settings:getAll', () => settings.getAll())

  // OS toast (notify() coerces + clamps the strings).
  ipcMain.handle('app:notify', (_e, title: string, body: string) => notify(title, body))
  // A timer's "Time's up" toast: clicking it brings the window forward (notify does that) and
  // pushes the timer's id so the renderer opens the timer-done dialog for it.
  ipcMain.handle('app:notifyTimer', (_e, timerId: string, label: string) =>
    notify("Time's up", label, () =>
      getMainWindow()?.webContents.send('push:openTimer', String(timerId))
    )
  )
  // The renderer shows the nudge for a pushed DistractionEvent, then asks for the window + toast.
  ipcMain.handle('app:raiseDistraction', (_e, event: DistractionEvent) => raiseDistraction(event))

  // App window: called by the splash page after its animation — grow the 1100x700 splash window
  // into the resizable app window and load the app page in it.
  ipcMain.handle('app:splashDone', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.setResizable(true)
    win.setMaximizable(true) // re-enable maximize/fullscreen (disabled for the fixed-size splash)
    win.setFullScreenable(true)
    win.setMinimumSize(1024, 720)
    win.setSize(APP_WIDTH, APP_HEIGHT)
    win.center()
    loadPage(win, 'index')
  })
}
