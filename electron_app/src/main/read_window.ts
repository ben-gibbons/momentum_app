// read_window.ts
// Polls visible windows every 10s using get-windows + koffi (IsIconic).
// Spawns the Python sidecar (read-edge-url.py) which reads the Edge address bar
// and writes URLs into the shared edgeUrls map for classification.

import { openWindows } from 'get-windows'
import koffi from 'koffi'
import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { app } from 'electron'

const user32 = koffi.load('user32.dll')
const IsIconic = user32.func('bool IsIconic(void* hWnd)')

const POLL_INTERVAL_MS = 10000

type WindowInfo = Awaited<ReturnType<typeof openWindows>>[number]

export interface MonitorData {
  app: string
  url?: string
}

const edgeUrls = new Map<number, string>()

function isCovered(w: WindowInfo, allWindows: WindowInfo[], index: number): boolean {
  // A window is covered if any higher z-order window's bounds contain its center point.
  // openWindows() returns windows front-to-back, so lower index = higher z-order.
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
  return (
    w.owner.name === 'Microsoft Edge' || w.owner.path?.toLowerCase().includes('msedge') === true
  )
}

// Python Sidecar
function readUrl(): void {
  // The .py is excluded from the asar; in a packaged build it's shipped as an extra resource on the
  // real filesystem (process.resourcesPath). In dev it's read straight from src/main.
  const scriptPath = app.isPackaged
    ? join(process.resourcesPath, 'read-edge-url.py')
    : join(app.getAppPath(), 'src', 'main', 'read-edge-url.py')
  const pyProc = spawn('python', [scriptPath])

  createInterface({ input: pyProc.stdout }).on('line', (line) => {
    try {
      const { handle, url } = JSON.parse(line)
      if (handle != null) edgeUrls.set(handle, url)
    } catch {
      // ignore malformed/partial JSON lines from the sidecar
    }
  })

  pyProc.stderr.on('data', (d) => process.stderr.write(d))

  pyProc.on('exit', (code) => {
    console.error(`[read_window] Python sidecar exited with code ${code}`)
  })
}

async function poll(onPoll: (data: MonitorData[]) => void): Promise<void> {
  try {
    const all = await openWindows()
    const visible = all.filter(
      (w, i) =>
        w.bounds.width > 0 &&
        w.bounds.height > 0 && // exclude zero-bounds shell windows (desktop, taskbar)
        !IsIconic(w.id) &&
        !isCovered(w, all, i)
    )

    if (visible.length === 0) {
      console.log('[read_window] No visible windows')
      onPoll([])
      return
    }

    const data: MonitorData[] = visible.map((w) => ({
      app: w.owner.name,
      ...(isEdge(w) ? { url: edgeUrls.get(w.id) } : {})
    }))

    data.forEach((d) => console.log(`[read_window] ${d.app}${d.url ? ` | URL: ${d.url}` : ''}`))
    onPoll(data)
  } catch (err) {
    console.error('[read_window] Error:', (err as Error).message)
  }
}

export function readWindow(onPoll: (data: MonitorData[]) => void): void {
  readUrl()
  poll(onPoll)
  setInterval(() => poll(onPoll), POLL_INTERVAL_MS)
}
