# Momentum — Electron App

Windows desktop productivity app that monitors active app and website usage, detects distraction, and prompts CBT-based interventions.

## Stack

- **Electron** + **TypeScript** + **React 19** + **Tailwind CSS v4**
- **SQLite** (`better-sqlite3`) for local data storage
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
    index.ts              # Main process entry: window, splash sizing, seed (dev), IPC, monitoring
    read_window.ts        # Window polling loop (get-windows + koffi); spawns the Python sidecar
    read-edge-url.py      # Python sidecar — reads Edge address bar via UI Automation
    db.ts                 # SQLite connection + initSchema() (lazy singleton)
    session-manager.ts    # Translates poll stream into SQLite session rows
    seed.ts               # Dev-only fixture seed (runs when the DB is empty)
    ipc.ts                # Registers ipcMain.handle channels (adapters onto repositories)
    repositories/         # All SQL lives here (tasks, sessions, logs, riskFactors, settings, …)
  shared/
    types.ts              # DTOs + the MomentumApi type (the window.api surface)
  preload/
    index.ts              # contextBridge — exposes window.api (ipcRenderer.invoke)
    index.d.ts            # Re-exports MomentumApi for the renderer
  renderer/
    src/
      lib/                # api accessor, useAsync hook, formatters
      components/         # presentational components (+ log/ subcomponents)
      screens/            # screens that own data + handlers via window.api
      assets/tokens/      # design tokens mapped into Tailwind @theme (main.css)
```

> Adding an IPC channel touches three files kept in sync: `src/main/ipc.ts`, `src/preload/index.ts`, and the `MomentumApi` type in `src/shared/types.ts`.

## Data Storage

The DB folder is named after the Electron app name, so **dev and the packaged app use separate databases**: dev → `%APPDATA%\momentum_app\momentum.db`, packaged → `%APPDATA%\Momentum\momentum.db`. One row per contiguous app session — written on app-switch, with a 60s safety flush. See `docs/database-overview.md` for full schema and write strategy.
