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

**Current channel:**
- `window.api.onMonitorData(callback)` — the renderer subscribes to monitoring updates. Every 10s when the poll runs, the main process packages `{ app, url }` and sends it through.

New IPC channels are added to `index.ts` (runtime) and declared in `index.d.ts` (types) as features are built — task reads/writes, threshold triggers, popup events.

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

## What's Not Built Yet

| Feature | Version |
|---|---|
| Allowed/disallowed list classification | V1 |
| Daily/Weekly Task UI | V1 |
| CBT procrastination log UI | V2 |
| Distraction popup + threshold logic | V2–V3 |
| Risk factors page | V3 |
| Framer Motion animations | V4 |
| Anthropic SDK integration | V4 |
