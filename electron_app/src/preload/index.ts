// preload/index.ts
// Runs in a privileged context between main and renderer. Exposes APIs to the renderer
// via contextBridge. TypeScript can't infer what contextBridge attaches to window at
// runtime, so index.d.ts declares those types manually — keep both files in sync when
// adding IPC channels. Never expose raw Node.js/Electron APIs directly.
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
}
