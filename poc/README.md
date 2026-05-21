# Momentum — Monitoring POC Tests

Two proof-of-concept tests to validate the core monitoring architecture before committing to the full stack.

---

## Test 1: Foreground App Detection + Edge URL Reading

**What it tests:** Whether Node.js can reliably detect which app is in focus on Windows every 10 seconds, and read the active Edge URL via a Python sidecar.

**Setup:**
```
cd poc
npm install
pip install pywinauto
```

**Run:**
```
node test-active-win.mjs
```

This spawns `read-edge-url.py` automatically as a subprocess. No need to run the Python script manually.

**What to verify:**
- Switch between Edge, Slack, File Explorer, Notepad — each should appear with the correct app name
- Navigate to different sites in Edge — the URL should update each poll
- Cover a window with another app — it should be excluded from the output
- Minimise a window — it should be excluded from the output
- Leave running for a few minutes — check for memory creep

---

## Test 2: Edge UI Tree Inspection (`inspect-edge-tree.py`)

A one-time diagnostic tool. Run this if Edge URL reading stops working after an Edge update — it scans the UI tree to find the current `AutomationId` of the address bar.

**Run:**
```
python inspect-edge-tree.py
```

Look for an `Edit` control whose value is the current URL. If its `AutomationId` differs from `view_1021`, update `ADDRESS_BAR_AUTO_ID` in `read-edge-url.py`.

---

## What passing looks like

Both tests passing end-to-end means:
1. Node.js correctly identifies the foreground app and filters minimized/covered windows
2. The Python sidecar correctly reads the active Edge URL every 10 seconds and passes it to Node.js

That handoff — app detected → URL read → classification triggered — is the core monitoring loop for Momentum V1.
