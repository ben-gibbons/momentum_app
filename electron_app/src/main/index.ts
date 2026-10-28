// index.ts
// Main process entry point. Opens the database (a failure shows an error box and quits rather
// than leaving a windowless process), creates the BrowserWindow, starts the session manager
// (SQLite writes) and the monitoring lifecycle (monitoring.ts). Stops the session manager cleanly
// on before-quit so the open session row is closed before exit.
import { app, dialog, shell, BrowserWindow, ipcMain } from 'electron'
import { getDb } from './db'
import { startSessionManager, stopSessionManager } from './session-manager'
import { startMonitoring, stopMonitoring } from './monitoring'
import { registerIpc } from './ipc'
import { startDayChange } from './dayChange'
import { seedDevFixtures } from './seed'
import { loadPage, setMainWindow } from './window'
import { handleDistraction } from './distraction'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const win = new BrowserWindow({
    // Start at the splash's native 1100x700, non-resizable; ipc 'app:splashDone' grows it into the
    // resizable app window once the cold-start splash transitions to Home.
    width: 1100,
    height: 700,
    // Size the web content, not the outer frame: the splash is a fixed 1100x700 card, and with
    // the frame included the content area was ~40px shorter and clipped it (D12).
    useContentSize: true,
    resizable: false,
    maximizable: false,
    // The splash field's edge colour: shown behind both pages while they load, so the switch from
    // splash.html to index.html never flashes white.
    backgroundColor: '#234032',
    title: 'Momentum',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The preload only uses contextBridge + ipcRenderer (no Node APIs), so the renderer runs in
      // Chromium's sandbox; everything privileged stays in this process behind the typed IPC.
      sandbox: true,
      contextIsolation: true
    }
  })

  // Register the window for bringToFront() / notification clicks (window.ts); clear it on close.
  setMainWindow(win)
  win.on('closed', () => setMainWindow(null))

  win.on('ready-to-show', () => {
    win.show()
  })

  // The app never opens windows of its own; a link in page content (or a future one) goes to the
  // system browser / mail client, and only for web / mail schemes — never file:, a custom
  // protocol handler, or anything else openExternal would hand to the OS.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The cold-start splash page first; its script calls app:splashDone, which loads the app page.
  loadPage(win, 'splash')
}

app.whenReady().then(() => {
  // AppUserModelID groups the taskbar entry + drives its icon on Windows; set a Momentum id
  // rather than the scaffold's default so the packaged app shows as Momentum.
  electronApp.setAppUserModelId('com.momentum.app')

  // Open (and migrate) the DB before anything depends on it. A corrupt or locked file, or a
  // failed migration, would otherwise throw out of this callback as an unhandled rejection and
  // leave Momentum running with no window; say what happened and quit instead.
  try {
    getDb()
  } catch (err) {
    dialog.showErrorBox(
      "Momentum can't open its database",
      `${(err as Error).message}\n\nMomentum will close. If this keeps happening, move or delete the file and relaunch.`
    )
    app.quit()
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  // Seed dev fixtures (no-op once the DB has data) before registering IPC so the renderer
  // has data to read on first launch. Dev-only — never runs in a packaged build.
  if (is.dev) seedDevFixtures()
  registerIpc()
  // Daily task routine (carry-over, series days) for today, then the midnight / wake re-runs; it
  // also arms the reminder toasts. Before the window so Home loads the day's final task list.
  startDayChange()

  createWindow()
  startSessionManager({ onDistraction: handleDistraction })
  // Polling, the sidecar, and the lock/sleep + Settings-toggle lifecycle live in monitoring.ts.
  startMonitoring()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopMonitoring()
  stopSessionManager()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
