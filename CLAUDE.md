# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Momentum** is a Windows desktop productivity app (Electron/Node.js) that monitors active app and website usage, detects distraction, and prompts CBT-based interventions. The core monitoring loop is: detect foreground app → if Edge, read URL → classify as productive/unproductive/not-sure → trigger interventions at thresholds.

The repo is currently in **POC phase**. No Electron app exists yet — only the two monitoring mechanism tests in `poc/`. Full app build begins once both POC tests pass.

## Running the POC

### Test 1 — Foreground app detection (Node.js)
```
cd poc
npm install
node test-active-win.mjs
```

### Test 2 — Edge URL reading (Python)
```
pip install pywinauto
python poc/inspect-edge-tree.py   # Step 1: find address bar AutomationId
python poc/read-edge-url.py       # Step 2: poll URLs
```

Run `inspect-edge-tree.py` first to confirm `ADDRESS_BAR_AUTO_ID` (`view_1021` by default) on the target machine.

## Architecture Decisions (do not revisit without PM approval)

- **Framework**: Electron (Node.js + TypeScript + React). Chosen because UI quality is a core retention mechanism for a distraction-prone user base — the full web design stack (Tailwind, Framer Motion, React component libraries, direct Figma handoff) is required to reach premium UI in V4+. Chromium performance overhead is the accepted trade-off; migrate to Tauri only if overhead proves a real user-facing problem, with the known caveat that Tauri uses WebKit on Mac (vs. Chromium on Windows), creating cross-platform rendering inconsistencies.
- **Browser monitoring approach**: Window title classification via `get-windows` + `koffi` (for `IsIconic`). No Python sidecar in V1. Browser window titles follow a consistent "Page Title – Browser Name" pattern sufficient for productive/unproductive classification. Edge URL reading via `pywinauto` is deferred as an optional V2+ enhancement for edge-case disambiguation (e.g. YouTube Music vs. YouTube video).
- **Browser support**: Edge only in V1
- **Polling interval**: 10 seconds (confirmed V1). Range 1–10s under evaluation; default starts at 10s and may be tuned based on feel. Tracking granularity is second-level — 10s polling captures micro-distractions (attention breaks under 30s) that matter for CBT intervention.
- **No AI in the monitoring layer**: Algorithmic threshold rules only in V1
- **No website hard-blocking in V1**

## Key POC Implementation Details

**Window detection**: Edge's window title contains a zero-width space (U+200B) between "Microsoft" and "Edge", so exact string matching fails. In `test-active-win.mjs`, `isEdge()` uses `includes('msedge')` on the exe path to avoid this. `edgePageTitle()` uses `\S*` in the regex to absorb the zero-width space: `/^(.*)\s-\sMicrosoft\S*\sEdge$/i`. In `read-edge-url.py` and `inspect-edge-tree.py`, filtering uses `'microsoft' in title.lower() and 'edge' in title.lower()`.

**Visibility check**: A window is polled only if it is not minimized AND is the topmost window at its own center point. In `test-active-win.mjs`, minimized detection uses `koffi` + `IsIconic` (Win32) — `get-windows` returns restored bounds regardless of minimized state, so the `-32000` sentinel position approach is unreliable. Occlusion is detected via a pure-JS z-order bounds check (`isCovered`). In `read-edge-url.py`, the same checks are done via `ctypes` `IsIconic` and `WindowFromPoint` + `GetAncestor`.

**Address bar lookup**: Located by `AutomationId` (`view_1021`), not by title — the title changes to the live URL. `UIAWrapper` objects from `desktop.windows()` don't support `child_window()`; convert to `WindowSpecification` first via `desktop.window(handle=w.handle)`.

## SQLite Write Strategy

Do not write to SQLite on every poll. At 10s intervals that is ~2,880 writes per 8-hour day before any V4 LLM overhead — unnecessary volume.

**Correct pattern:**
- Maintain an in-memory session object: `{ app, start_time, accumulated_seconds }`
- Write to SQLite on **app-switch**: close the outgoing session row, open a new one
- **Periodic safety flush** every 60–120 seconds to protect against crashes (upsert the open session row)
- Schema: one row per contiguous session — `(app, start_time, end_time, total_seconds)` — not one row per poll

**Aggregation:** Roll up to minutes at **query time** (for trends views and popup thresholds), not at write time. This keeps raw session data intact for future analysis while keeping the write volume low regardless of polling cadence.

## What Comes Next (after POC)

1. Scaffold the Electron app
2. Background monitoring service: `get-windows` polling loop (10s) + `koffi` for `IsIconic` + window title classification. No Python sidecar.
3. Local data storage (SQLite — session-per-row schema; write on app-switch + 60–120s safety flush)
4. Daily/Weekly Task UI
5. "Feeling Distracted?" popup and Windows notification system
6. Productivity Trends (7-day bar chart)
