// read_window.ts
// Polls visible windows every 10s using get-windows + koffi (IsIconic).
// Spawns the Python sidecar (read-edge-url.py) which reads the Edge address bar
// and writes URLs into the shared edgeUrls map for classification.

import { openWindows } from 'get-windows'
import koffi from 'koffi'
import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { app } from 'electron'
import { BROWSER_APP, EDGE_NEW_TAB, edgeAppName, SELF_APP } from './classifier'

const user32 = koffi.load('user32.dll')
const IsIconic = user32.func('bool IsIconic(void* hWnd)')

const POLL_INTERVAL_MS = 10000

type WindowInfo = Awaited<ReturnType<typeof openWindows>>[number]

export interface MonitorData {
  app: string
  url?: string | null // Edge only; null/undefined until the sidecar has read the address bar
}

const edgeUrls = new Map<number, string>()
// Edge windows the sidecar found no address bar in (sites saved as apps, picture-in-picture,
// DevTools). Reported by app name from the title, as a plain app rather than a browser window.
const appWindows = new Set<number>()
// Edge windows currently on the New Tab page (empty address bar). Reported as the app
// "Edge - New tab" so a feed-filled new tab still accrues toward a nudge and can be sorted;
// internal pages, mid-typing and the pre-read moment stay host-less (not-sure, no nudge).
const newTabs = new Set<number>()
// Consecutive sidecar read errors per HWND. A couple in a row is a transient hiccup and the last
// good URL is kept; past MAX_URL_ERRORS the entry is dropped so a persistent failure (an Edge
// update changing ADDRESS_BAR_AUTO_ID) degrades that window to not-sure instead of freezing it
// on whatever site it was last seen on.
const urlErrors = new Map<number, number>()
const MAX_URL_ERRORS = 3
// Surface an address-bar read failure once (see CLAUDE.md on ADDRESS_BAR_AUTO_ID) instead of every 10s.
let sidecarErrorLogged = false

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

// Windows shell overlays (SearchHost, ShellExperienceHost, StartMenuExperienceHost, SystemSettings)
// showed up as not-sure noise. They all live in these two folders; everything else under the Windows
// directory (cmd, PowerShell, Task Manager, Remote Desktop) is a real app the user may be in.
const WINDIR = (process.env.WINDIR ?? 'C:\\Windows').toLowerCase()
const SHELL_DIRS = [`${WINDIR}\\systemapps\\`, `${WINDIR}\\immersivecontrolpanel\\`]
function isShellWindow(w: WindowInfo): boolean {
  const p = w.owner.path?.toLowerCase() ?? ''
  return SHELL_DIRS.some((d) => p.startsWith(d))
}

function isEdge(w: WindowInfo): boolean {
  return (
    w.owner.name === 'Microsoft Edge' || w.owner.path?.toLowerCase().includes('msedge') === true
  )
}

// Python Sidecar. Held at module scope so pauseMonitoring() can stop it (lock screen / sleep)
// and resumeMonitoring() can spawn a fresh one.
let pyProc: ChildProcess | null = null

function readUrl(): void {
  // The .py is excluded from the asar; in a packaged build it's shipped as an extra resource on the
  // real filesystem (process.resourcesPath). In dev it's read straight from src/main.
  const scriptPath = app.isPackaged
    ? join(process.resourcesPath, 'read-edge-url.py')
    : join(app.getAppPath(), 'src', 'main', 'read-edge-url.py')
  const proc = spawn('python', [scriptPath])
  pyProc = proc
  const spawnedAt = Date.now()
  sidecarErrorLogged = false // a fresh sidecar gets to report a read failure once more

  // No python on PATH: spawn emits 'error' (ENOENT) and, with no listener, Node would raise it as
  // an uncaught exception — a crash dialog at every launch and every unlock. Log once instead;
  // Edge windows then classify by app rule / not-sure.
  proc.on('error', (err) => {
    if (pyProc === proc) pyProc = null
    console.error(`[read_window] cannot start the Python sidecar: ${err.message}`)
  })

  createInterface({ input: proc.stdout! }).on('line', (line) => {
    try {
      const { handle, url, error, noOmnibox, emptyOmnibox } = JSON.parse(line)
      if (handle == null) return
      // Two kinds of null from the sidecar: with `error` the address bar couldn't be read (a
      // one-poll hiccup, or an Edge update that changed ADDRESS_BAR_AUTO_ID) — keep the last good
      // URL so the session isn't split; without `error` the omnibox is genuinely empty (New Tab
      // page) — forget the old URL so time there isn't billed to the site the user left.
      // The per-window states (has URL / app window / new tab / erroring) are exclusive: each
      // branch clears the others so a window can't be both an app window and a new tab.
      if (url) {
        edgeUrls.set(handle, url)
        urlErrors.delete(handle)
        appWindows.delete(handle)
        newTabs.delete(handle)
      } else if (noOmnibox) {
        appWindows.add(handle)
        newTabs.delete(handle)
        edgeUrls.delete(handle)
        urlErrors.delete(handle)
      } else if (emptyOmnibox) {
        newTabs.add(handle)
        appWindows.delete(handle)
        edgeUrls.delete(handle)
        urlErrors.delete(handle)
      } else if (error) {
        if (!sidecarErrorLogged) {
          sidecarErrorLogged = true
          console.error(`[read_window] sidecar cannot read the Edge address bar: ${error}`)
        }
        const n = (urlErrors.get(handle) ?? 0) + 1
        urlErrors.set(handle, n)
        if (n >= MAX_URL_ERRORS) edgeUrls.delete(handle)
      } else {
        edgeUrls.delete(handle)
        urlErrors.delete(handle)
      }
    } catch {
      // ignore malformed/partial JSON lines from the sidecar
    }
  })

  proc.stderr!.on('data', (d) => process.stderr.write(d))

  proc.on('exit', (code) => {
    // An exit we asked for (pauseMonitoring) isn't an error. An unrequested one means no more URL
    // lines will arrive, so forget what we had (otherwise every Edge window freezes on its last
    // URL) and respawn with a short backoff — unless polling is paused, in which case resume
    // will spawn a fresh one.
    if (pyProc !== proc) return
    pyProc = null
    edgeUrls.clear()
    urlErrors.clear()
    appWindows.clear()
    newTabs.clear()
    // An exit within seconds of starting means it can't run at all (pywinauto missing, syntax
    // error); after a few of those stop retrying and say so once, instead of respawning every 30s
    // for the rest of the session.
    const fast = Date.now() - spawnedAt < SIDECAR_FAST_EXIT_MS
    fastExits = fast ? fastExits + 1 : 0
    if (fastExits >= SIDECAR_MAX_FAST_EXITS) {
      console.error(
        `[read_window] Python sidecar keeps exiting at startup (code ${code}); giving up for this ` +
          `session — Edge URLs will be unavailable. Is pywinauto installed? (pip install pywinauto)`
      )
      return
    }
    console.error(`[read_window] Python sidecar exited with code ${code}`)
    if (pollTimer) setTimeout(() => pollTimer && !pyProc && readUrl(), SIDECAR_RESPAWN_MS)
  })
}
const SIDECAR_RESPAWN_MS = 30_000
const SIDECAR_FAST_EXIT_MS = 5_000
const SIDECAR_MAX_FAST_EXITS = 3
let fastExits = 0

let pollTimer: NodeJS.Timeout | null = null
let pollFn: ((data: MonitorData[]) => void) | null = null

// Lock screen / sleep: stop the 10s window enumeration and kill the sidecar (its UIA traversal is
// the expensive part) so a locked laptop isn't burning battery on polls nobody will record. The
// URL map is kept: the live-HWND sweep in poll() prunes dead windows, and keeping it means the
// first poll after unlock already knows the site instead of opening a throwaway not-sure row
// while the fresh sidecar sits out its 5s start delay.
export function pauseMonitoring(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  const proc = pyProc
  pyProc = null // cleared first so the exit handler stays quiet
  proc?.kill()
}

export function resumeMonitoring(): void {
  if (!pollFn || pollTimer) return
  readUrl()
  const fn = pollFn
  poll(fn)
  pollTimer = setInterval(() => poll(fn), POLL_INTERVAL_MS)
}

async function poll(onPoll: (data: MonitorData[]) => void): Promise<void> {
  try {
    const all = await openWindows()
    // Drop URLs for windows that no longer exist so a recycled HWND can't inherit a dead one's URL.
    const liveIds = new Set(all.map((w) => w.id))
    for (const id of edgeUrls.keys()) if (!liveIds.has(id)) edgeUrls.delete(id)
    for (const id of urlErrors.keys()) if (!liveIds.has(id)) urlErrors.delete(id)
    for (const id of appWindows) if (!liveIds.has(id)) appWindows.delete(id)
    for (const id of newTabs) if (!liveIds.has(id)) newTabs.delete(id)

    // Occlusion is judged against every real on-screen window, shell windows included: a
    // maximized Windows Settings covering Edge means the user is in Settings, not Edge. Shell
    // windows themselves are then dropped from tracking (so Settings time is "no visible window",
    // i.e. Desktop / not-sure, rather than a SystemSettings.exe session). Momentum's own window is
    // tracked like any other app (reported as SELF_APP below).
    const onScreen = all.filter(
      (w) =>
        w.bounds.width > 0 &&
        w.bounds.height > 0 && // exclude zero-bounds shell windows (desktop, taskbar)
        !IsIconic(w.id)
    )
    const visible = onScreen.filter((w, i) => !isShellWindow(w) && !isCovered(w, onScreen, i))

    if (visible.length === 0) {
      console.log('[poll] no visible windows')
      onPoll([])
      return
    }

    const data: MonitorData[] = visible.map((w) => {
      // Our own window reports the exe's name ('Electron' in dev, 'Momentum' packaged); give it one
      // stable name so rules and the terminal read the same in both.
      if (w.owner.processId === process.pid) return { app: SELF_APP }
      // An Edge window with no address bar is a site saved as an app: name it like the standalone
      // app would be ("Hulu"), with no url key, so it classifies by app rule like any other app.
      if (isEdge(w) && appWindows.has(w.id)) return { app: edgeAppName(w.title) }
      if (isEdge(w) && newTabs.has(w.id)) return { app: EDGE_NEW_TAB }
      // Every Edge channel (Beta/Dev/Canary report their own owner.name) is reported under one
      // name so the detector's host-less exemption, the "Not sure yet" exclusion and the
      // browser-rule refusal all agree on what "the browser" is.
      return isEdge(w) ? { app: BROWSER_APP, url: edgeUrls.get(w.id) } : { app: w.owner.name }
    })

    // One line per poll: the front window (which decides the session unless something behind it
    // is unproductive), then whatever else is visible. A browser window with no URL yet shows its
    // title so a missing read can be traced to a specific window (sidecar lag vs. a window the
    // sidecar doesn't match).
    const describe = (w: WindowInfo, d: MonitorData): string =>
      d.url
        ? `${d.app} (${d.url})`
        : isEdge(w) && !appWindows.has(w.id) && !newTabs.has(w.id)
          ? `${d.app} (no URL yet: "${w.title}")`
          : isEdge(w)
            ? `${d.app} (Edge app)`
            : d.app
    const front = describe(visible[0], data[0])
    const rest = visible.slice(1).map((w, i) => describe(w, data[i + 1]))
    console.log(`[poll] front: ${front}${rest.length ? ` · also visible: ${rest.join(', ')}` : ''}`)
    onPoll(data)
  } catch (err) {
    console.error('[read_window] Error:', (err as Error).message)
  }
}

export function readWindow(onPoll: (data: MonitorData[]) => void): void {
  pollFn = onPoll
  resumeMonitoring()
}
