// window.ts
// Holds the single main BrowserWindow so modules that don't own it (notify.ts, the distraction
// fire path) can bring it forward without importing index.ts. Created for the V1 distraction
// popup: index.ts registers the window here after createWindow() and clears it on 'closed'.
import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

// Null until the window exists and after it has been destroyed.
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

// Put the Momentum window visibly in front of whatever the user is doing.
//
// Windows' foreground lock stops a background process from *activating* a window: SetForegroundWindow,
// BringWindowToTop, and Electron's win.focus() may all do nothing but flash the taskbar. The lock
// does not cover z-order, though: setAlwaysOnTop(true) is SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE),
// which any process may call. So we hop through the topmost band to guarantee the window is on top,
// then drop back out so it isn't pinned above everything. focus() may still be denied (keyboard focus
// stays in the previous app, so Escape won't reach the nudge until the user clicks); flashFrame
// covers that case.
//
// Plan B, if a spike shows this only flashes: call user32 SetForegroundWindow through koffi (user32 is
// already loaded in read_window.ts) with win.getNativeWindowHandle().readInt32LE(). Not shipped.
export function bringToFront(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.setAlwaysOnTop(true)
  win.focus()
  win.setAlwaysOnTop(false)
  win.flashFrame(true)
}
