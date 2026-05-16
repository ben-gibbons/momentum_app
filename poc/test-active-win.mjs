// test-active-win.mjs
// Proof-of-concept: foreground app detection using active-win
//
// Setup:
//   npm install active-win
//
// Run:
//   node test-active-win.mjs
//
// What to test:
//   Switch between apps (Edge, Slack, File Explorer, Notepad, etc.)
//   and verify each is correctly identified every 10 seconds.
//   Click the desktop to verify graceful handling of no active window.

import { activeWindow } from 'active-win';

const POLL_INTERVAL_MS = 10000;

console.log('=== active-win Proof of Concept ===');
console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds.`);
console.log('Switch between apps to verify detection.');
console.log('Press Ctrl+C to stop.\n');

async function poll() {
  try {
    const result = await activeWindow();

    const timestamp = new Date().toLocaleTimeString();

    if (!result) {
      console.log(`[${timestamp}] No active window (desktop or screensaver)`);
      return;
    }

    console.log(`[${timestamp}]`);
    console.log(`  App Name : ${result.owner.name}`);
    console.log(`  Exe Path : ${result.owner.path}`);
    console.log(`  Window   : ${result.title}`);
    console.log(`  PID      : ${result.owner.processId}`);

    // Flag Edge specifically — this is the handoff point for URL monitoring
    if (result.owner.name === 'Microsoft Edge' || result.owner.path?.toLowerCase().includes('msedge')) {
      console.log(`  --> Edge detected. URL monitoring would trigger here.`);
    }

    console.log('');
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Error: ${err.message}\n`);
  }
}

poll();
setInterval(poll, POLL_INTERVAL_MS);
