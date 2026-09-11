# Project Next Steps

- [x] 1. Scaffold the Electron app — completed 2026-06-10
    - [x] Run `npm create @quick-start/electron@latest` in repo root, select react-ts template, review generated structure (~15 min) — completed 2026-06-05
    - [x] Trim template: update package.json name/description, delete boilerplate components, run `npm run dev`, confirm window opens (~15 min) — completed 2026-06-10
    - [x] Set up Tailwind CSS: install tailwindcss + postcss, init config, add directives to base CSS, confirm styles apply in dev (~15 min) — completed 2026-06-10
    - [x] Move POC monitoring logic into `src/main/monitor.ts` — adapt test-active-win.mjs to TypeScript (~20 min) — completed 2026-06-10
    - [x] Add Python sidecar spawn to main process: spawn `read-edge-url.py`, pipe stdout JSON lines to monitor module (~20 min) — completed 2026-06-10
    - [x] Move `read-edge-url.py` from `poc/` into `src/main/` and update the path in `read_url.ts` — currently referencing the POC folder which won't exist in production (~10 min) — completed 2026-06-10
    - [x] Configure preload script and contextBridge: expose typed IPC API to renderer, verify contextIsolation is on (~20 min) — completed 2026-06-10
    - [x] Wire basic IPC channel: main sends active-app/URL data to renderer via contextBridge, renderer logs it to confirm end-to-end flow (~20 min) — completed 2026-06-10

- [x] 2. Background monitoring service (`get-windows` polling loop + `koffi` for `IsIconic` + Python sidecar for Edge URL reading) — COMPLETE, validated in POC

- [x] 3. Local data storage (SQLite — session-per-row schema; write on app-switch + 60–120s safety flush) — completed 2026-06-11
    - [x] Install `better-sqlite3` + `@types/better-sqlite3`, run `npx @electron/rebuild` to build for Electron's ABI (~15 min) — completed 2026-06-11
    - [x] Create `src/main/db.ts` — open/init DB file, create `sessions` table (~20 min) — completed 2026-06-11
    - [x] Create `src/main/session-manager.ts` — in-memory session object, `onPoll()` detects app-switch and writes rows, 60s safety flush (~20 min) — completed 2026-06-11
    - [x] Wire `session-manager` into `index.ts`; remove `monitor:data` IPC send + `onMonitorData` from preload (~15 min) — completed 2026-06-11

- [x] 4. Loading screen and home landing page — completed 2026-06-22 (built from the Claude Design handoff in `design_system/`, not claude.ai/design mockups)
    - [x] Use claude.ai/design to mock up the loading screen — describe Momentum's feel (focus, calm, minimal) and generate a design (~20 min) — completed 2026-06-22 (designed in Claude Design; delivered as `design_system/brand/splash.html`)
    - [x] Use claude.ai/design to mock up the home landing page — think about what it shows: today's task summary, session status, nav to other screens (~20 min) — completed 2026-06-22 (delivered as `design_system/home-screen/index.html`)
    - [x] Share both screenshots here → build the loading screen component from the mockup (~20 min) — completed 2026-06-22 (`screens/Splash.tsx`)
    - [x] Build the home landing page component from the mockup (~20 min) — completed 2026-06-22 (`screens/Home.tsx`)
    - [x] Wire the two screens together — loading screen shows briefly on startup, transitions to home (~15 min) — completed 2026-06-22 (splash boots, then `app:splashDone` resizes into the app on Home)
    - [x] Run the app and verify the full flow looks right (~10 min) — completed 2026-06-22

---

## V1 Deferred — due 6/28

Take the unpolished V1 build to a usable, mostly functioning desktop app with entire V1 functionality.

- [ ] 1. Classification engine (allowed/disallowed lists global only, strict mode, classify() and not-sure data — ask claude how to best classify this, classify Windows home screen?)
    - [ ] url not showing in Edge
    - [ ] `classify()` in `session-manager.ts` is a stub returning `not_sure` (3) for everything — build real `classify(app, url)`; this unblocks accurate Session/Trends data
    - [ ] Unproductive data overrides productive/not-sure data on multiple monitors (add an explanation for this in settings)
    - [ ] Option to reclassify not-sure data if it was indeed productive or unproductive
- [ ] 2. Feeling distracted popup trigger, windows notification/force app to front of screen, nudge text is hardcoded not live
    - [ ] Nudge dialog currently opens manually from the sidebar only — build threshold detection: 2 min unproductive OR 5 min not-sure (default, configurable in Settings)
    - [ ] Electron: Utilize the win.show() method followed by win.focus() to bring the Electron window to the foreground on the user's screen.
    - [ ] Play around with timing of popup, view risk factors or procrastination log options, option to close popup
    - [ ] Have risk factors and procrastination log options take you to separate popup pages. Risk factors enables you to make a recurring task to help you make it a habit, task has risk factor category
    - [ ] Dynamic nudge copy: dialog text is hardcoded ("You've been on YouTube…") — drive `appName`/duration from the detected distraction by extending `NudgeProps`; depends on classification engine
- [ ] 3. Timer + notifications, 10-min for logs (countdown)
    - [ ] `Timer.tsx` already counts down and fires internal `onComplete` — wire a Windows OS notification that surfaces even when the window is backgrounded
- [ ] 4. Settings screen is a placeholder, not functioning1
    - [ ] Add settings for popup trigger in minutes, break-down mode (V3), strict mode, profile (V2)
    - [ ] Defaults: 2 min unproductive / 5 min not-sure thresholds; include greeting name field; persists via existing `settings` table / `settings.*` IPC
- [ ] 5. Daily task carry-over to new day (only incomplete tasks), weekly list sql data review, update written-in tasks to have a popup page to set date/time, category, steps, reminders, Calendar view for daily/weekly, weekly carry-over (double check it follows daily carry-over)
    - [ ] "Add a task" row currently only captures a title — carry-over, weekly flow, and task-create menu interlock; build together
    - [ ] Weekly default, daily or monthly views
- [ ] 6. Splash animation
    - [ ] CSS `offset-path` snowball roll renders imperfectly in Electron (position/size) — A/B against `splash.html` in a browser to tune
    - [ ] Do not rewrite to SVG `<animateMotion>` — it was tried and reverted (wrong size/start/end, lost wordmark+caption); CSS `offset-path` + keyframes is the correct basis
- [ ] 7. Productivity Trends page is same as Current Session
    - [ ] early shell built (`screens/Session.tsx`); chart renders but data is all not-sure until the classification engine lands
    - [ ] Update Current Session shell, create new page for productivity trends (there should be a template for this in ds)
    - [ ] Ensure SQL database is storing daily/previous day trends properly as accumulated data and deleting the rest for previous days
- [ ] 8. Verify that logs save and can be reviewed
- [ ] 9. Reduce clutter in log flow or resize the card (steps 3 and 4, review all steps and remove unnecessary steps)
- [ ] 10. Npm run dev: still prints active window to terminal (says "starting Electron", says Electron in active window print, right clicking taskbar icon says Electron as well)
    - [ ] Change this print to a "running Momentum app" or remove all print statements once you verify the sql window/url tracking is working properly
- [ ] 11. Remove all the excess eyebrow text (pages already show header + caption, eyebrow is redundant)
- [ ] 12. Make sure top right focused timer, "this session" timing card, "toward a break" card are all linked to the correct page
- [ ] 13. Review how polling works and how sql is stored
    - [ ] Review database question in "Polling Structure" tab with working polling/sql data to see which works best
- [ ] 14. Looks like momentum.exe is working now, verify and figure out why (Windows approved us??)
- [ ] 15. Verify that polling works properly: multiple windows, file explorer vs microsoft edge, minimized items, windows home shell, multiple monitors vs single laptop screen, test Edge (youtube) on half monitor split view
- [ ] 16. Npm audit warnings
    - [ ] Pre-existing transitive dev/build deps (vite/esbuild, tar via get-windows, undici, form-data) — not shipped in Electron runtime; revisit cautiously (native-module rebuild risk)
- [ ] 17. Delete github branch or rename to new feature branch
- [ ] 18. Security check, crash/edge case testing (fable)
- [ ] 19. Add V1.0 note to splash screen
