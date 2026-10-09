// distraction.ts
// The Electron side of the distraction popup (V1 roadmap item 2). handleDistraction() is what the
// session manager's threshold detector calls: it only pushes the event to the renderer. The
// renderer decides whether to act on it (it stays quiet while a procrastination log is being
// filled in) and, when it does show the nudge, asks main to raiseDistraction(): bring the window
// forward and show the OS toast. Kept separate from session-manager.ts so that file has no
// electron imports.
import type { DistractionEvent } from '../shared/types'
import { distractionLines } from '../shared/format'
import { bringToFront, getMainWindow } from './window'
import { notify } from './notify'

export function handleDistraction(e: DistractionEvent): void {
  getMainWindow()?.webContents.send('push:distraction', e)
}

export function raiseDistraction(e: DistractionEvent): void {
  bringToFront()
  // Same lines as the in-app nudge; Windows toasts honour the line break.
  notify('Feeling distracted?', distractionLines(e).join('\n'))
}
