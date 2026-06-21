// preload/index.ts
// Runs in a privileged context between main and renderer. Exposes APIs to the renderer via
// contextBridge. Builds the typed window.api surface (MomentumApi) where each method is a thin
// ipcRenderer.invoke onto a channel registered in src/main/ipc.ts — channel names must stay in
// sync across this file, ipc.ts, and src/shared/types.ts. Never expose raw Node/Electron APIs.
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { LogInput, MomentumApi, TaskInput } from '../shared/types'

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
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  app: {
    splashDone: () => ipcRenderer.invoke('app:splashDone')
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
