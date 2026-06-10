import { openWindows } from 'get-windows'
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')
const IsIconic = user32.func('bool IsIconic(void* hWnd)')

const POLL_INTERVAL_MS = 10000

type WindowInfo = Awaited<ReturnType<typeof openWindows>>[number]

// Populated by the Python sidecar (wired in next step)
export const edgeUrls = new Map<number, string>()

function isCovered(w: WindowInfo, allWindows: WindowInfo[], index: number): boolean {
  const cx = w.bounds.x + w.bounds.width / 2
  const cy = w.bounds.y + w.bounds.height / 2
  for (let i = 0; i < index; i++) {
    const b = allWindows[i].bounds
    if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) {
      return true
    }
  }
  return false
}

function isEdge(w: WindowInfo): boolean {
  return w.owner.name === 'Microsoft Edge' || w.owner.path?.toLowerCase().includes('msedge') === true
}

async function poll(): Promise<void> {
  try {
    const all = await openWindows()
    const visible = all.filter((w, i) => !IsIconic(w.id) && !isCovered(w, all, i))

    if (visible.length === 0) {
      console.log('[monitor] No visible windows')
      return
    }

    for (const w of visible) {
      const info = isEdge(w)
        ? `${w.owner.name} | URL: ${edgeUrls.get(w.id) ?? '(pending...)'}`
        : w.owner.name
      console.log(`[monitor] ${info}`)
    }
  } catch (err) {
    console.error('[monitor] Error:', (err as Error).message)
  }
}

export function startMonitoring(): void {
  poll()
  setInterval(poll, POLL_INTERVAL_MS)
}
