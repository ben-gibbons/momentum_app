// preload/index.ts
// Runs in a privileged context between main and renderer. Exposes APIs to the renderer via
// contextBridge. Builds the typed window.api surface (MomentumApi) where each method is a thin
// ipcRenderer.invoke onto a channel registered in src/main/ipc.ts — channel names must stay in
// sync across this file, ipc.ts, and src/shared/types.ts. Never expose raw Node/Electron APIs.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { DistractionEvent, LogInput, MomentumApi, RuleInput, TaskInput } from '../shared/types'

const api: MomentumApi = {
  tasks: {
    listDaily: (date?: number) => ipcRenderer.invoke('tasks:listDaily', date),
    listWeekly: (weekStart?: number) => ipcRenderer.invoke('tasks:listWeekly', weekStart),
    toggleComplete: (taskId: number) => ipcRenderer.invoke('tasks:toggleComplete', taskId),
    create: (input: TaskInput) => ipcRenderer.invoke('tasks:create', input),
    addToDaily: (weeklyId: number, date: number) =>
      ipcRenderer.invoke('tasks:addToDaily', weeklyId, date)
  },
  taskSteps: {
    toggle: (stepId: number) => ipcRenderer.invoke('taskSteps:toggle', stepId)
  },
  session: {
    getCurrent: () => ipcRenderer.invoke('session:getCurrent'),
    getTodayFocus: () => ipcRenderer.invoke('session:getTodayFocus')
  },
  trends: {
    getWeek: () => ipcRenderer.invoke('trends:getWeek')
  },
  logs: {
    list: () => ipcRenderer.invoke('logs:list'),
    get: (id: number) => ipcRenderer.invoke('logs:get', id),
    create: (input: LogInput) => ipcRenderer.invoke('logs:create', input),
    update: (id: number, input: LogInput) => ipcRenderer.invoke('logs:update', id, input)
  },
  riskFactors: {
    listCatalog: () => ipcRenderer.invoke('riskFactors:listCatalog'),
    addCustom: (label: string) => ipcRenderer.invoke('riskFactors:addCustom', label),
    select: (catalogId: number, recur?: boolean) =>
      ipcRenderer.invoke('riskFactors:select', catalogId, recur)
  },
  distortions: {
    list: () => ipcRenderer.invoke('distortions:list')
  },
  rules: {
    list: () => ipcRenderer.invoke('rules:list'),
    add: (input: RuleInput) => ipcRenderer.invoke('rules:add', input),
    remove: (id: number) => ipcRenderer.invoke('rules:remove', id),
    listNotSure: () => ipcRenderer.invoke('rules:listNotSure')
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  app: {
    splashDone: () => ipcRenderer.invoke('app:splashDone'),
    notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body),
    raiseDistraction: (event: DistractionEvent) =>
      ipcRenderer.invoke('app:raiseDistraction', event)
  },
  // Main → renderer push channels (prefixed push:). The wrapper hides the IpcRendererEvent and
  // returns an unsubscribe so a useEffect can clean up.
  events: {
    onDistraction: (cb: (e: DistractionEvent) => void) => {
      const listener = (_e: IpcRendererEvent, event: DistractionEvent): void => cb(event)
      ipcRenderer.on('push:distraction', listener)
      return () => {
        ipcRenderer.removeListener('push:distraction', listener)
      }
    },
    onMonitoringPaused: (cb: (paused: boolean) => void) => {
      const listener = (_e: IpcRendererEvent, paused: boolean): void => cb(paused)
      ipcRenderer.on('push:monitoringPaused', listener)
      return () => {
        ipcRenderer.removeListener('push:monitoringPaused', listener)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
