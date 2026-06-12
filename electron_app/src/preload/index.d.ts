// preload/index.d.ts
// Declares the shape of window.electron and window.api for renderer TypeScript.
// contextBridge attaches these at runtime (see index.ts) — TypeScript can't see that,
// so this file is the manual bridge. Add a type here whenever you expose a new channel
// in index.ts, or the renderer will get a type error on window.api.
import { ElectronAPI } from '@electron-toolkit/preload'

interface MonitorData {
  app: string
  url?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onMonitorData: (callback: (data: MonitorData[]) => void) => void
    }
  }
}
