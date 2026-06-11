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
