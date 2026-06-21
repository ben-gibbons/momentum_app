// preload/index.d.ts
// Declares the shape of window.electron and window.api for renderer TypeScript. contextBridge
// attaches these at runtime (see index.ts) — TypeScript can't see that, so this file is the
// manual bridge. The api surface is the MomentumApi type defined in src/shared/types.ts; keep
// the preload implementation, src/main/ipc.ts, and that type in sync when adding channels.
import { ElectronAPI } from '@electron-toolkit/preload'
import type { MomentumApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MomentumApi
  }
}
