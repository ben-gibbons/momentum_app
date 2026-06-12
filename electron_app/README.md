# Momentum — Electron App

Windows desktop productivity app that monitors active app and website usage, detects distraction, and prompts CBT-based interventions.

## Stack

- **Electron** + **TypeScript** + **React** + **Tailwind CSS v4**
- **SQLite** (`better-sqlite3`) for local data storage
- **Python sidecar** (`pywinauto`) for Edge URL reading via UI Automation

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
npm run build:win
```

## Project Structure

```
src/
  main/
    index.ts              # Main process entry point
    read_window.ts        # Window polling loop (get-windows + koffi)
    read-edge-url.py      # Python sidecar — reads Edge address bar via UI Automation
    db.ts                 # SQLite connection + table init (lazy singleton)
    session-manager.ts    # Translates poll stream into SQLite session rows
  preload/
    index.ts              # contextBridge — exposes typed IPC APIs to renderer
  renderer/
    src/                  # React UI (Tailwind CSS v4)
```

## Data Storage

Sessions are written to `%APPDATA%\momentum\momentum.db`. One row per contiguous app session — written on app-switch, with a 60s safety flush to protect against crashes. See `docs/database-overview.md` for full schema and write strategy.
