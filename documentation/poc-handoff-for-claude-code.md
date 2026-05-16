# Momentum — Monitoring POC Handoff for Claude Code
Date: 2026-05-15

---

## Context

Momentum is a Windows desktop productivity app built in Electron (Node.js). Before building the full app, we need to validate two core monitoring mechanisms that the entire V1 data tracking layer depends on:

1. **Foreground app detection** — knowing which app the user is actively using
2. **Edge URL detection** — knowing which website the user is on when Edge is the active app

These are proof-of-concept tests only. No app scaffolding exists yet. Once both tests pass, the full Electron app build begins.

All POC files are in: `momentum_app/poc/`

---

## Test 1 — Foreground App Detection (`active-win`)

### What it does
Uses the `active-win` npm package to poll the Windows foreground window every 15 seconds and log the active app name, executable path, window title, and PID.

### Files
- `poc/test-active-win.mjs` — the test script
- `poc/package.json` — `"type": "module"`, `active-win` v9.0.0

### Setup
```
cd poc
npm install
node test-active-win.mjs
```

### Known issue
`active-win` v7.7.2 failed with `Cannot find module 'ffi-napi'` — this native addon requires Visual Studio C++ Build Tools which are not installed. The package.json has been updated to v9.0.0 which dropped the `ffi-napi` dependency. **This needs to be tested.**

If v9.0.0 still fails, investigate whether:
- A different install approach resolves it
- An alternative package should be used (e.g. spawning a PowerShell command to get the foreground window via `Get-Process` + `MainWindowTitle`)

### What passing looks like
- Switching between Slack, Notepad, File Explorer, Edge all produce distinct correct `App Name` values
- Clicking the desktop produces a graceful "no active window" message, not a crash
- Script runs stably for several minutes without memory issues
- Edge produces the `-->` handoff log line

---

## Test 2 — Edge URL Detection (`pywinauto`)

### What it does
Uses Python's `pywinauto` library to connect to a running Edge window and read the current tab's URL from the address bar via Windows UI Automation (the same accessibility tree used by screen readers). Polls every 15 seconds.

### Files
- `poc/inspect-edge-tree.py` — Step 1: prints Edge's full UI element tree so you can confirm the address bar element name
- `poc/read-edge-url.py` — Step 2: reads the URL from the address bar on a 15-second loop

### Setup
```
pip install pywinauto
```

### Run order

**Step 1 — Inspect the tree:**
```
python inspect-edge-tree.py
```
Open Edge and navigate to any website first. Search the output for an `Edit` control named `"Address and search bar"`. If the name on this machine differs, update the `ADDRESS_BAR_NAME` constant at the top of `read-edge-url.py`.

**Step 2 — Read the URL:**
```
python read-edge-url.py
```

### What passing looks like
- Navigating to 3–4 different sites updates the URL each poll
- Multiple Edge windows open: note which URL is returned (active window vs. first window)
- Edge minimised: fails with a clear error message, does not crash
- If `ADDRESS_BAR_NAME` doesn't match, update the constant and re-test

---

## End-to-End Handoff Test

Once both tests pass individually, do one combined check:

1. Run `test-active-win.mjs`
2. Open Edge and navigate to a site on the disallowed list
3. Confirm `active-win` logs Edge as the foreground app with the `-->` handoff message
4. Confirm `read-edge-url.py` (running in a second terminal) logs the correct URL at the same moment

This handoff — app detected → URL read triggered — is the full monitoring loop for V1.

---

## What comes next (after POC passes)

- Scaffold the Electron app
- Implement the background monitoring service (active-win polling loop + Python sidecar IPC for Edge URL reading)
- Implement local data storage (SQLite — schema TBD)
- Build the Daily/Weekly Task UI
- Build the "Feeling Distracted?" popup and notification system

---

## Architecture Decisions Already Made (do not revisit without PM approval)

- **Framework**: Electron (Node.js) — chosen for Claude Design integration and UI quality
- **Browser**: Edge only for V1 — no Chrome or Firefox support
- **No browser extension**: UIAutomation (pywinauto) used instead to avoid extra install friction
- **Polling interval**: 15 seconds
- **No AI in the monitoring layer**: Algorithmic threshold rules only in V1
- **No website hard-blocking in V1**
