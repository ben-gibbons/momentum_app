// index.ts
// Main process entry point. Creates the BrowserWindow, starts the session manager (SQLite
// writes) and the monitoring lifecycle (monitoring.ts). Stops the session manager cleanly on
// before-quit so the open session row is closed before exit.
import { app, shell, BrowserWindow, ipcMain } from 'electron'
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
      sandbox: false,
      contextIsolation: true
    }
  })

  // Register the window for bringToFront() / notification clicks (window.ts); clear it on close.
  setMainWindow(win)
  win.on('closed', () => setMainWindow(null))

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // The cold-start splash page first; its script calls app:splashDone, which loads the app page.
  loadPage(win, 'splash')
}

app.whenReady().then(() => {
  // AppUserModelID groups the taskbar entry + drives its icon on Windows; set a Momentum id
  // rather than the scaffold's default so the packaged app shows as Momentum.
  electronApp.setAppUserModelId('com.momentum.app')

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
