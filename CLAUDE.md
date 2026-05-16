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

- **Framework**: Electron (Node.js)
- **Edge URL reading**: Windows UI Automation via `pywinauto` — no browser extension, to avoid onboarding friction. Acknowledged as fragile; revisit as optional enhancement later.
- **Browser support**: Edge only in V1
- **Polling interval**: 10 seconds (POC); 15 seconds (V1 spec — align when building the full app)
- **No AI in the monitoring layer**: Algorithmic threshold rules only in V1
- **No website hard-blocking in V1**

## Key POC Implementation Details

**Window detection** (`read-edge-url.py`, `inspect-edge-tree.py`): Edge's window title contains a zero-width space between "Microsoft" and "Edge", so title regex matching fails. Both scripts filter `desktop.windows()` by checking `'microsoft' in title.lower() and 'edge' in title.lower()`.

**Visibility check** (`read-edge-url.py`): A window is polled only if it is not minimized (`IsIconic`) AND is the topmost window at its own center point (`WindowFromPoint` + `GetAncestor`). This ensures covered or background Edge windows (e.g. YouTube on a second monitor behind another app) are excluded.

**Address bar lookup**: Located by `AutomationId` (`view_1021`), not by title — the title changes to the live URL. `UIAWrapper` objects from `desktop.windows()` don't support `child_window()`; convert to `WindowSpecification` first via `desktop.window(handle=w.handle)`.

## What Comes Next (after POC)

1. Scaffold the Electron app
2. Background monitoring service: `active-win` polling loop + Python sidecar IPC for Edge URL reading
3. Local data storage (SQLite — schema TBD)
4. Daily/Weekly Task UI
5. "Feeling Distracted?" popup and Windows notification system
6. Productivity Trends (7-day bar chart)
