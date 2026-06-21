// index.ts
// Main process entry point. Creates the BrowserWindow, starts the monitoring loop
// (readWindow), and starts the session manager (SQLite writes). Stops the session
// manager cleanly on before-quit so the open session row is closed before exit.
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { readWindow } from './read_window'
import { onPoll, startSessionManager, stopSessionManager } from './session-manager'
import { registerIpc } from './ipc'
import { seedDevFixtures } from './seed'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const win = new BrowserWindow({
    // Start at the splash's native 1100x700, non-resizable; ipc 'app:splashDone' grows it into the
    // resizable app window once the cold-start splash transitions to Home.
    width: 1100,
    height: 700,
    resizable: false,
    maximizable: false,
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

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

  createWindow()
  startSessionManager()
  readWindow(onPoll)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopSessionManager()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
