// preload/index.ts
// Runs in a privileged context between main and renderer. Exposes typed APIs to the
// renderer via contextBridge. Add SQLite-backed IPC channels here as features are built
// (Task UI, trends, etc.) — never expose raw Node.js/Electron APIs directly.
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
