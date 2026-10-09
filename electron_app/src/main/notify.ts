// notify.ts
// OS toast helper used by the distraction popup and the CBT-timer "time's up" notification (V1).
// Clicking the toast brings the Momentum window forward.
import { Notification } from 'electron'
import icon from '../../resources/icon.png?asset'
import { bringToFront } from './window'

export function notify(title: unknown, body: unknown): void {
  // False when the OS notification service is unavailable; skip rather than throw.
  if (!Notification.isSupported()) return
  // Dev caveat: setAppUserModelId resolves to process.execPath under `npm run dev`, so toasts are
  // attributed to "Electron" (and Focus Assist may drop them silently). Only a packaged build
  // shows them as Momentum.
  // Coerce + clamp here (the IPC handler passes through) so no caller can hand the OS a huge or
  // non-string payload.
  const n = new Notification({
    title: String(title ?? '').slice(0, 80),
    body: String(body ?? '').slice(0, 200),
    icon
  })
  n.on('click', bringToFront)
  n.show()
}
