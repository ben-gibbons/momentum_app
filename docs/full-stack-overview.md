# Momentum — Full Stack Overview

Entry-level summary of how the stack fits together, covering both the current build and the intended final product.

---

## The Two-Process Model

Electron apps run two separate, sandboxed processes. Understanding this split is the foundation for understanding everything else.

```
┌─────────────────────────────────────────┐
│           MAIN PROCESS (Node.js)        │
│  Monitoring loop · SQLite · Python IPC  │
│                   │                     │
│            preload script               │
│          (contextBridge)                │
│                   │                     │
│        RENDERER PROCESS (React)         │
│    UI · Task lists · Popups · Charts    │
└─────────────────────────────────────────┘
```

The main process has full OS access. The renderer is essentially a browser tab — it can't touch the filesystem or OS directly. The preload script is the controlled bridge between them.

---

## Stack Components

**Electron** — the wrapper that turns a web app into a native Windows desktop app. It bundles Chromium (the browser engine) and Node.js together, giving you a browser-based UI with full access to the OS.

**Node.js (main process)** — the "backend" running inside Electron. This is where the monitoring loop lives: polling the foreground window every 10s, calling Windows APIs via `koffi`, and managing the Python sidecar. It never touches the UI directly.

**Python sidecar (`pywinauto`)** — a subprocess spawned by Node.js specifically to read the Edge address bar via Windows UI Automation. Node.js can't do this natively, so Python handles it and pipes `{handle, url}` JSON back via stdout.

**TypeScript** — the language used across both the main process and renderer. Adds static typing so errors surface at compile time rather than at runtime.

**React (renderer process)** — the UI layer. Electron's renderer is essentially a browser tab, and React is the framework used to build the component tree — screens, task lists, popups, charts.

**Tailwind CSS** — utility-class styling applied directly in React JSX. Maps directly from Figma designs and pairs naturally with component libraries.

**Framer Motion** — animation library for React. Not wired up yet — comes in V4 for micro-interactions, transitions, and motion design across all screens.

**Vite (via `electron-vite`)** — build tool and dev server. Compiles TypeScript, processes CSS, and handles hot-reloading during development. Not part of the shipped app.

**SQLite (`better-sqlite3`)** — local database for session data, tasks, and procrastination logs. No cloud dependency in V1–V3; all data stays on the user's machine.

**Anthropic JS SDK (V4)** — not yet used. Wired into the response layer (procrastination log suggestions, risk factor analysis) when V4 begins. The monitoring layer stays algorithmic throughout all versions.

---

## How the Processes Communicate

The main process and renderer can't talk to each other directly — they're isolated for security. The preload script acts as the controlled middleman.

**How it works:**

1. `src/preload/index.ts` runs in a privileged in-between context. It uses Electron's `contextBridge` to expose specific functions onto `window` in the renderer — nothing else from the main process is accessible.
2. `src/preload/index.d.ts` tells TypeScript what shape those exposed functions have, so the renderer gets type checking and autocomplete when calling `window.api`.
3. `contextIsolation: true` enforces the security boundary — the renderer can only access what the preload explicitly hands it.

**The IPC surface (`window.api`):**

The renderer **pulls** data on demand via typed request/response channels (`ipcRenderer.invoke` → `ipcMain.handle`), grouped by domain: `tasks`, `taskSteps`, `session`, `trends`, `logs`, `riskFactors`, `distortions`, `settings`, and `app`. Each renderer call routes through `src/main/ipc.ts` to a function in `src/main/repositories/*` (the only place SQL lives). The full method list and DTOs are defined in `src/shared/types.ts` (the `MomentumApi` type), which the preload implements and `index.d.ts` re-exports for the renderer.

> Note: the scaffold's original push channel `window.api.onMonitorData` was **removed** once `session-manager.ts` began writing polls straight to SQLite — pushing raw polls to the renderer had no consumer. The renderer reads session/trend data on demand via `session.*`/`trends.*` instead.

New IPC channels are added in three places kept in sync: `src/main/ipc.ts` (handler), `src/preload/index.ts` (bridge), and the `MomentumApi` type in `src/shared/types.ts`.

---

## Data Flow

```
Every 10 seconds:
  Node.js polls foreground windows
    → Python sidecar reads Edge URL (fires at 5s midpoint)
    → classify(app, url) → productive / unproductive / not_sure
    → if app changed: write closed session to SQLite, open new row
    → every 60s: safety flush open session row to SQLite
    → send { app, url } to renderer via IPC
```

**SQLite write strategy:** one row per contiguous session, not one row per poll. Aggregation (for trends and thresholds) happens at query time. See [`database-overview.md`](database-overview.md) for full schema and write strategy.

---

## What's Built

The full design-system UI is in place, wired renderer ⇄ IPC ⇄ SQLite: splash → sidebar-routed shell with the Daily Tasks home, Current Session, Productivity Trends, Procrastination Logs + the CBT log flow, Risk Factors, and the "Feeling distracted?" nudge.

## What's Not Built Yet

Tracked in [`docs/to_do/project_next_steps.md`](to_do/project_next_steps.md) (Deferred — V1/V2). The *screens* above mostly exist; what's missing below is the underlying logic/wiring.

| Feature | Version |
|---|---|
| Allowed/disallowed classification + Strict Mode (`classify()` is a stub) | V1 |
| Distraction popup **auto-trigger** + Windows notification (the dialog UI exists) | V1 |
| CBT timer → Windows notification | V1 |
| Settings screen (thresholds, toggles, name) | V1 |
| Daily-task carry-over + weekly task UI + richer task-create menu | V1 |
| Break notifier (50-min productive) | V2 |
| Current Session live "Right now" card | V2 |
| Framer Motion animations | V4 |
| Anthropic SDK integration | V4 |
| Code-signing / installer (Smart App Control blocks the unsigned build) | V4 |
