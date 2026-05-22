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
- **Browser monitoring approach**: Window enumeration via `get-windows` + `koffi` (`IsIconic`) for visibility, and a Python sidecar (`pywinauto`) for Edge URL reading. Window title alone was insufficient — it returns the page title, not the URL, making classification ambiguous. The Python sidecar runs as a persistent subprocess, polls the Edge address bar via UI Automation every 10s (with a 5s initial offset so it fires at the midpoint of each Node.js poll interval), and emits JSON lines `{handle, url}` to Node.js via stdout.
- **Browser support**: Edge only in V1
- **Polling interval**: 10 seconds (confirmed V1). Range 1–10s under evaluation; default starts at 10s and may be tuned based on feel. Tracking granularity is second-level — 10s polling captures micro-distractions (attention breaks under 30s) that matter for CBT intervention.
- **No AI in the monitoring layer**: Algorithmic threshold rules only in V1
- **No website hard-blocking in V1**

## Key POC Implementation Details

**Window detection**: Edge's window title contains a zero-width space (U+200B) between "Microsoft" and "Edge", so exact string matching fails. In `test-active-win.mjs`, `isEdge()` uses `includes('msedge')` on the exe path to avoid this. In `read-edge-url.py` and `inspect-edge-tree.py`, filtering uses `'microsoft' in title.lower() and 'edge' in title.lower()`.

**Visibility check**: A window is polled only if it is not minimized AND is the topmost window at its own center point. In `test-active-win.mjs`, minimized detection uses `koffi` + `IsIconic` (Win32) — `get-windows` returns restored bounds regardless of minimized state, so the `-32000` sentinel position approach is unreliable. Occlusion is detected via a pure-JS z-order bounds check (`isCovered`). In `read-edge-url.py`, the same checks are done via `ctypes` `IsIconic` and `WindowFromPoint` + `GetAncestor`.

**Address bar lookup**: Located by `AutomationId` (`view_1021`), not by title — the title changes to the live URL. `UIAWrapper` objects from `desktop.windows()` don't support `child_window()`; convert to `WindowSpecification` first via `desktop.window(handle=w.handle)`.

**`ADDRESS_BAR_AUTO_ID` resilience**: `view_1021` is hardcoded in `read-edge-url.py`. If Edge URL polling ever stops returning values after an Edge update, this is the first thing to check — run `inspect-edge-tree.py` to find the new AutomationId and update the constant. In the full Electron app, verify the address bar is reachable on startup and surface a clear error if not. **Open decision:** determine whether `inspect-edge-tree.py` logic should be bundled into the app as an auto-diagnostic that detects and recovers from AutomationId changes without requiring an app update.

**`inspect-edge-tree.py`** is a dev-only diagnostic tool — not part of the app. Run it when `read-edge-url.py` stops working to identify the current address bar AutomationId. It is not a required step during normal setup.

**Python sidecar polling**: `read-edge-url.py` uses a 5s initial delay then polls every 10s — one sample per Node.js poll window, timed at the midpoint. This avoids a race condition where Python and Node.js fire simultaneously and Node.js reads a stale value, while keeping CPU cost minimal (one `pywinauto` call per 10s window).

## SQLite Write Strategy

Do not write to SQLite on every poll. At 10s intervals that is ~2,880 writes per 8-hour day before any V4 LLM overhead — unnecessary volume.

**Correct pattern:**
- Maintain an in-memory session object: `{ app, start_time, accumulated_seconds }`
- Write to SQLite on **app-switch**: close the outgoing session row, open a new one
- **Periodic safety flush** every 60–120 seconds to protect against crashes (upsert the open session row)
- Schema: one row per contiguous session — `(app, start_time, end_time, total_seconds)` — not one row per poll

**Aggregation:** Roll up to minutes at **query time** (for trends views and popup thresholds), not at write time. This keeps raw session data intact for future analysis while keeping the write volume low regardless of polling cadence.

## Task Tracking

All upcoming work items and next steps are tracked in `docs/to_do/project_next_steps.md`. Personal tasks unrelated to the project are tracked in `docs/to_do/personal_tasks.md`. Do not add "What Comes Next" lists to this file — keep CLAUDE.md focused on architecture, decisions, and implementation guidance.
