# Momentum — Monitoring POC Tests

Two proof-of-concept tests to validate the core monitoring architecture before committing to the full stack.

---

## Test 1: Foreground App Detection (`active-win`)

**What it tests:** Whether Node.js can reliably detect which app is in focus on Windows every 10 seconds.

**Setup:**
```
cd poc
npm install active-win
```

**Run:**
```
node test-active-win.mjs
```

**What to verify:**
- Switch between Edge, Slack, File Explorer, Notepad — each should appear with the correct app name
- Click the desktop — should handle gracefully (no crash)
- Leave running for a few minutes — check for memory creep
- Edge detection should log the `-->` handoff message

---

## Test 2: Edge URL Reading (`pywinauto`)

Run these in order.

**Setup:**
```
pip install pywinauto
```

### Step 1 — Inspect the UI tree

Open Edge, navigate to any website, then run:
```
python inspect-edge-tree.py
```

Look through the output for an `Edit` control whose title is the current URL. Note its `AutomationId` — if it differs from the default, update `ADDRESS_BAR_AUTO_ID` in `read-edge-url.py`.

### Step 2 — Read the URL

```
python read-edge-url.py
```

**What to verify:**
- Navigate to 3–4 different sites and confirm the URL updates each poll
- Open a second Edge window on a different monitor — both URLs should be reported each poll
- Cover an Edge window with another app — it should drop out of the output
- Minimise all Edge windows — should report "No visible Edge windows", not crash

---

## What passing looks like

Both tests passing end-to-end means:
1. `active-win` correctly identifies Edge as the foreground app
2. `pywinauto` correctly reads URLs from all visible, unobscured Edge windows

That handoff — app detected → URL read triggered — is the core monitoring loop for Momentum V1.
