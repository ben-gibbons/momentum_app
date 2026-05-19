// test-active-win.mjs
// Proof-of-concept: visible window detection across all monitors using active-win
//
// Setup:
//   npm install active-win
//
// Run:
//   node test-active-win.mjs
//
// What to test:
//   Open apps on multiple monitors and verify all are reported every 10 seconds.
//   Cover a window with another app — it should be excluded from the output.
//   Minimise a window — it should be excluded from the output.
//   Leave no open windows — should report "No visible windows".

import { openWindows } from 'get-windows';

const POLL_INTERVAL_MS = 10000;

console.log('=== active-win Proof of Concept ===');
console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds.`);
console.log('Open apps across monitors, cover or minimise windows to verify filtering.');
console.log('Press Ctrl+C to stop.\n');

// Windows sets minimized window position to -32000,-32000
function isMinimized(w) {
  return w.bounds.x <= -30000 || w.bounds.y <= -30000;
}

// openWindows() returns windows front-to-back (z-order). A window is blocked if
// any earlier (higher z-order) window's bounds cover its center point — mirrors
// the Python script's WindowFromPoint + GetAncestor check.
function isCovered(w, allWindows, index) {
  const cx = w.bounds.x + w.bounds.width / 2;
  const cy = w.bounds.y + w.bounds.height / 2;
  for (let i = 0; i < index; i++) {
    const b = allWindows[i].bounds;
    if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) {
      return true;
    }
  }
  return false;
}

function isEdge(w) {
  return w.owner.name === 'Microsoft Edge' || w.owner.path?.toLowerCase().includes('msedge');
}

async function poll() {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const all = await openWindows();
    const visible = all.filter((w, i) => !isMinimized(w) && !isCovered(w, all, i));

    if (visible.length === 0) {
      console.log(`[${timestamp}] No visible windows\n`);
      return;
    }

    console.log(`[${timestamp}] ${visible.length} visible window(s):`);
    for (const w of visible) {
      console.log(`  App Name : ${w.owner.name}`);
      console.log(`  Exe Path : ${w.owner.path}`);
      console.log(`  Window   : ${w.title}`);
      console.log(`  PID      : ${w.owner.processId}`);
      if (isEdge(w)) {
        console.log(`  --> Edge detected. URL monitoring would trigger here.`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Error: ${err.message}\n`);
  }
}

poll();
setInterval(poll, POLL_INTERVAL_MS);
