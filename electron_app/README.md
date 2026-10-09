# Momentum — Electron App

Windows desktop productivity app that monitors active app and website usage, detects distraction, and prompts CBT-based interventions.

## Stack

- **Electron** + **TypeScript** + **React 19** + **Tailwind CSS v4**
- **SQLite** (`better-sqlite3`) for local data storage
- **`get-windows`** + **`koffi`** (`IsIconic` via Win32) for foreground window polling and minimized detection
- **Python sidecar** (`pywinauto`) for Edge URL reading via UI Automation
- **lucide-react** icons; **@fontsource** self-hosted fonts (Newsreader / Hanken Grotesk / JetBrains Mono — CSP-safe, no CDN)

## Prerequisites

- Node.js
- Python (with `pywinauto` installed: `pip install pywinauto`)
- Visual Studio Build Tools with "Desktop development with C++" workload (required for native module rebuild)

## Setup

```bash
npm install
npx @electron/rebuild
```

`@electron/rebuild` is required after `npm install` and after any Electron version upgrade. It recompiles native modules (`get-windows`, `better-sqlite3`) for Electron's Node.js ABI.

## Development

```bash
npm run dev
```

## Type checking

```bash
npm run typecheck
```

## Build

```bash
npm run build:win      # build + electron-builder (Windows)
npm run build:unpack   # build + unpacked app at dist/win-unpacked/Momentum.exe
npm run icon           # regenerate build/icon.ico (16/32/48/256) from build/icon.png
```

## Project Structure

```
src/
  main/
    index.ts              # Main process entry: window, splash sizing, seed (dev), IPC, session manager, monitoring
    read_window.ts        # Window polling loop (get-windows + koffi); spawns/pauses the Python sidecar
    read-edge-url.py      # Python sidecar — reads Edge address bars via UI Automation (matches Edge by process)
    db.ts                 # SQLite connection, baseline schema + user_version migrations (lazy singleton)
    classifier.ts         # Pure classification (rules → productive/unproductive/not-sure); vitest-tested
    threshold.ts          # Pure distraction-threshold detector (contiguous run + cooldown); vitest-tested
    session-manager.ts    # Poll stream → SQLite session rows; drives the detector; orphan-row cleanup
    distraction.ts        # Push the DistractionEvent to the renderer; bring window to front + OS toast
    monitoring.ts         # Monitoring lifecycle: Settings master switch + lock/sleep pause/resume
    window.ts             # Main BrowserWindow accessor + bringToFront()
    notify.ts             # OS toast helper (Electron Notification)
    seed.ts               # Dev-only fixture seed (runs when the DB is empty)
    ipc.ts                # Registers ipcMain.handle channels (adapters onto repositories)
    repositories/         # All SQL lives here (tasks, sessions, logs, riskFactors, settings, classificationRules, distortions, util)
  shared/
    types.ts              # DTOs + the MomentumApi type (the window.api surface)
    format.ts             # Formatting shared by main and renderer (formatRun)
  preload/
    index.ts              # contextBridge — exposes window.api (ipcRenderer.invoke + push: listeners)
    index.d.ts            # Re-exports MomentumApi for the renderer
  renderer/
    src/
      App.tsx             # Sidebar routing shell; mounts Nudge + the log overlay; TimersProvider
      lib/                # api accessor (api.ts), useAsync hook, formatters, timers store (timers.tsx)
      components/         # presentational components; log/, risk/, session/, settings/ subfolders; TimersTile
      screens/            # Splash, Home, Session, Logs, ProcrastinationLog, RiskFactors, Settings, Placeholder
      assets/
        main.css          # Tailwind entry; imports tokens
        tokens/           # design tokens mapped into Tailwind @theme
        brand/            # mark, icons, snowball asset
scripts/
  inspect-db.mjs          # Dev diagnostic: prints migration state, rules, settings, recent/open session rows
```

> Adding an IPC channel touches three files kept in sync: `src/main/ipc.ts`, `src/preload/index.ts`, and the `MomentumApi` type in `src/shared/types.ts`.

## Tests

```bash
npm test               # vitest — pure main-process logic (classifier, threshold detector)
```

Main-process edits are not hot-reloaded by `npm run dev`; restart the app to pick them up (renderer edits apply instantly).

## Known Stubs (intentionally inert)

- **Calendar screen** — `Placeholder.tsx` is rendered for the `calendar` route (roadmap V1 #5).
- **Timers are in-memory** — `lib/timers.tsx`; running timers don't survive an app restart.
- **Default Productive / Unproductive lists** — migration 3 seeds a placeholder starter set; final contents are an open decision (roadmap V1 #1).

## Data Storage

The DB folder is named after the Electron app name, so **dev and the packaged app use separate databases**: dev → `%APPDATA%\momentum_app\momentum.db`, packaged → `%APPDATA%\Momentum\momentum.db`. One row per contiguous app/site/classification session — written on switch, with a 60s safety flush; orphan rows from a crash are closed at the next startup. Schema changes go through `user_version` migrations in `db.ts`. See `docs/database-overview.md` for full schema and write strategy.
