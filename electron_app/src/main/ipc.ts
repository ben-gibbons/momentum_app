// ipc.ts
// Registers every ipcMain.handle channel the renderer calls via window.api. Each handler is a
// thin adapter onto a repository function — no business logic or SQL lives here. Channel names
// mirror the MomentumApi surface in src/shared/types.ts and the preload bridge. Repositories are
// synchronous (better-sqlite3); ipcMain.handle wraps the return value in a promise for the renderer.
import { ipcMain, BrowserWindow } from 'electron'
import type { LogInput, TaskInput } from '../shared/types'

// App window size after the splash (the splash window is 1100x700, non-resizable).
const APP_WIDTH = 1280
const APP_HEIGHT = 860
import * as tasks from './repositories/tasks'
import * as sessions from './repositories/sessions'
import * as logs from './repositories/logs'
import * as riskFactors from './repositories/riskFactors'
import * as settings from './repositories/settings'
import * as distortions from './repositories/distortions'

export function registerIpc(): void {
  // Tasks
  ipcMain.handle('tasks:listDaily', (_e, date?: number) => tasks.listDaily(date))
  ipcMain.handle('tasks:listWeekly', (_e, weekStart?: number) => tasks.listWeekly(weekStart))
  ipcMain.handle('tasks:toggleComplete', (_e, taskId: number) => tasks.toggleComplete(taskId))
  ipcMain.handle('tasks:create', (_e, input: TaskInput) => tasks.create(input))
  ipcMain.handle('tasks:addToDaily', (_e, weeklyId: number, date: number) =>
    tasks.addToDaily(weeklyId, date)
  )
  ipcMain.handle('taskSteps:toggle', (_e, stepId: number) => tasks.toggleStep(stepId))

  // Session + trends
  ipcMain.handle('session:getCurrent', () => sessions.getCurrent())
  ipcMain.handle('session:getTodayFocus', () => sessions.getTodayFocus())
  ipcMain.handle('trends:getWeek', () => sessions.getWeek())

  // Procrastination logs
  ipcMain.handle('logs:list', () => logs.list())
  ipcMain.handle('logs:get', (_e, id: number) => logs.get(id))
  ipcMain.handle('logs:create', (_e, input: LogInput) => logs.create(input))
  ipcMain.handle('logs:update', (_e, id: number, input: LogInput) => logs.update(id, input))

  // Risk factors
  ipcMain.handle('riskFactors:listCatalog', () => riskFactors.listCatalog())
  ipcMain.handle('riskFactors:addCustom', (_e, label: string) => riskFactors.addCustom(label))
  ipcMain.handle('riskFactors:select', (_e, catalogId: number, recur?: boolean) =>
    riskFactors.select(catalogId, recur)
  )

  // Distortions
  ipcMain.handle('distortions:list', () => distortions.list())

  // Settings
  ipcMain.handle('settings:get', (_e, key: string) => settings.get(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => settings.set(key, value))

  // App window: grow the 1100x700 splash window into the resizable app window.
  ipcMain.handle('app:splashDone', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.setResizable(true)
    win.setMaximizable(true) // re-enable maximize/fullscreen (disabled for the fixed-size splash)
    win.setFullScreenable(true)
    win.setMinimumSize(1024, 720)
    win.setSize(APP_WIDTH, APP_HEIGHT)
    win.center()
  })
}
