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
  return w.owner.name === 'Microsoft Edge' || w.owner.path?.toLowerCase().includes('msedge') === true
}

// Python Sidecar
function readUrl(): void {
  const scriptPath = join(app.getAppPath(), 'src', 'main', 'read-edge-url.py')
  const pyProc = spawn('python', [scriptPath])

  createInterface({ input: pyProc.stdout }).on('line', (line) => {
    try {
      const { handle, url } = JSON.parse(line)
      if (handle != null) edgeUrls.set(handle, url)
    } catch {}
  })

  pyProc.stderr.on('data', (d) => process.stderr.write(d))

  pyProc.on('exit', (code) => {
    console.error(`[read_window] Python sidecar exited with code ${code}`)
  })
}

async function poll(): Promise<void> {
  try {
    const all = await openWindows()
    const visible = all.filter((w, i) =>
      w.bounds.width > 0 && w.bounds.height > 0 // exclude zero-bounds shell windows (desktop, taskbar)
      && !IsIconic(w.id)
      && !isCovered(w, all, i)
    )

    if (visible.length === 0) {
      console.log('[read_window] No visible windows')
      return
    }

    for (const w of visible) {
      const info = isEdge(w)
        ? `${w.owner.name} | URL: ${edgeUrls.get(w.id) ?? '(pending...)'}`
        : w.owner.name
      console.log(`[read_window] ${info}`)
    }
  } catch (err) {
    console.error('[read_window] Error:', (err as Error).message)
  }
}

export function readWindow(): void {
  readUrl()
  poll()
  setInterval(poll, POLL_INTERVAL_MS)
}
