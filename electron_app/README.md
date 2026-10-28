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
npm run build:unpack   # build + unpacked app at dist/win-unpacked/Momentum.exe (unsigned — signing is a V4 item; Smart App Control blocks unsigned exes when it is on)
npm run icon           # regenerate build/icon.ico (16/32/48/256) from build/icon.png
```

## Project Structure

```
src/
  main/
    index.ts              # Main process entry: window (loads splash.html, then index.html on app:splashDone), seed (dev), IPC, daily routine, reminders, session manager, monitoring
    read_window.ts        # Window polling loop (get-windows + koffi); spawns/pauses the Python sidecar
    read-edge-url.py      # Python sidecar — reads Edge address bars via UI Automation (matches Edge by process)
    db.ts                 # SQLite connection, baseline schema + user_version migrations (lazy singleton)
    classifier.ts         # Pure classification (rules → productive/unproductive/not-sure); vitest-tested
    threshold.ts          # Pure distraction-threshold detector (contiguous run + cooldown); vitest-tested
    session-manager.ts    # Poll stream → SQLite session rows; drives the detector; orphan-row cleanup
    distraction.ts        # Push the DistractionEvent to the renderer; bring window to front + OS toast
    monitoring.ts         # Monitoring lifecycle: Settings master switch + lock/sleep pause/resume
    window.ts             # Main BrowserWindow accessor, bringToFront(), loadPage('splash' | 'index')
    notify.ts             # OS toast helper (Electron Notification); optional onClick
    routine.ts            # Daily task routine: series continuation, risk-factor series, weekly/daily carry-over, generate days (idempotent via last_routine_day)
    dayChange.ts          # Runs the routine at launch / midnight / unlock-wake; pushes push:dayChanged
    reminders.ts          # Task reminder toasts (one timer for the next reminder_time); click → push:openTask
    recurrence.ts         # Pure weekday-mask rules for repeating series; vitest-tested
    seed.ts               # Dev-only fixture seed (runs when the DB is empty)
    ipc.ts                # Registers ipcMain.handle channels (adapters onto repositories)
    repositories/         # All SQL lives here (tasks, sessions, logs, riskFactors, settings, classificationRules, distortions, util)
  shared/
    types.ts              # DTOs + the MomentumApi type (the window.api surface)
    dates.ts              # Local-calendar arithmetic (startOfDay, weekStartMonday, addDays, monthWeeks, …); DST-safe; vitest-tested
    format.ts             # Formatting shared by main and renderer (formatRun)
  preload/
    index.ts              # contextBridge — exposes window.api (ipcRenderer.invoke + push: listeners)
    index.d.ts            # Re-exports MomentumApi for the renderer
  renderer/
    index.html            # The app page (React)
    splash.html           # The cold-start splash page: design_system/brand/splash.html verbatim (re-copy, don't edit)
    src/
      splash.ts           # splash.html's script: tokens + fonts, then app:splashDone after one 3.23 s loop
      App.tsx             # Sidebar routing shell; mounts Nudge + the log overlay; TimersProvider; push:dayChanged / push:openTask / push:openTimer (TimerDone dialog)
      lib/                # api accessor (api.ts), useAsync hook, formatters, timers store (timers.tsx)
      components/         # presentational components; RangeNav; log/ (fields, Stepper, Timer, LogReview, LogDetail), risk/, settings/ subfolders; TimersTile, TimerDone
        tasks/            # TaskDialog (create / edit / delete / stop repeating), RepeatPicker, WeekdayPicker, StepsEditor
        calendar/         # WeekView, DayView, MonthView, WeeklyList, shared.ts (labels, keys)
        session/          # TrendsChart, MonthChart, BreakdownList, StatBar, SessionStatGrid
      screens/            # Home, Calendar, Trends, Logs, ProcrastinationLog, RiskFactors, Settings
      assets/
        main.css          # Tailwind entry; imports tokens
        splash.css        # splash.html page background only
        tokens/           # design tokens mapped into Tailwind @theme
        brand/            # mark, icons, snowball asset
scripts/
  inspect-db.mjs          # Dev diagnostic: migration state, rules, settings, sessions, the tasks table + last_routine_day
  test-electron.mjs       # Runs the DB-backed vitest suites under Electron's Node (npm run test:electron)
  make-icon.mjs           # Regenerates build/icon.ico from build/icon.png
```

> Adding an IPC channel touches three files kept in sync: `src/main/ipc.ts`, `src/preload/index.ts`, and the `MomentumApi` type in `src/shared/types.ts`.

## Tests

```bash
npm test               # vitest under system Node — pure modules: dates, recurrence, classifier, threshold detector (59 tests)
npm run test:electron  # vitest under Electron's Node — the DB-backed suites: db (migrations), routine, tasks, sessions (52 tests)
```

The DB-backed suites open a real `better-sqlite3` database, which `postinstall` rebuilds for Electron's ABI, so plain `npm test` cannot load it and those suites skip themselves there; `scripts/test-electron.mjs` runs vitest with `ELECTRON_RUN_AS_NODE=1` instead. Extra arguments pass through (`npm run test:electron -- --watch`).

Main-process edits are not hot-reloaded by `npm run dev`; restart the app to pick them up (renderer edits apply instantly).

## Known Stubs (intentionally inert)

- **Timers are in-memory** — `lib/timers.tsx`; running timers don't survive an app restart.
- **Unused log columns** — `log_steps.predicted_difficulty` / `actual_difficulty` / `predicted_satisfaction` / `actual_satisfaction` and `procrastination_logs.takeaways`: the four-step log flow writes NULL; `LogReview` shows them only for older logs that have values.

## Data Storage

The DB folder is named after the Electron app name, so **dev and the packaged app use separate databases**: dev → `%APPDATA%\momentum_app\momentum.db`, packaged → `%APPDATA%\Momentum\momentum.db`. One row per contiguous app/site/classification session — written on switch, with a 60s safety flush; orphan rows from a crash are closed at the next startup. Schema changes go through `user_version` migrations in `db.ts`. See `docs/database-overview.md` for full schema and write strategy.
