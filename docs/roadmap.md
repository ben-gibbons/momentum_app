# Features Overview

> This document is the source of truth for all V1–V6 feature releases. Features have been added, adjusted, or reprioritized from `brainstorm-session-2026-05-15.md`, `Brainstorm_Features.docx`, and any other document. `Brainstorm_Features.docx` should be referenced for more detailed explanations for certain features.

---

## V1 Deferred — due 6/28

Take the unpolished V1 build to a usable, mostly functioning desktop app with entire V1 functionality.

- [x] 1. Classification engine — completed 2026-10-06 (Productive/Unproductive lists, strict mode, `classifier.ts` + vitest; see `docs/database-overview.md`)
    - [x] `classify()` stub replaced by `classifyPoll()` over all visible windows; sessions carry `host` + `app_key`; rules table + migrations — completed 2026-10-06
    - [x] Unproductive anywhere overrides; otherwise the front window decides (explained in Settings → "How multiple windows are counted") — completed 2026-10-06
    - [x] Reclassify not-sure data: Settings → "Not sure yet" (adds a rule and rewrites past rows; sort by time / recent; 30-day window) — completed 2026-10-06
    - [x] DECIDE: what goes in the default Productive and Unproductive lists — decided 2026-10-27: the migration-3 set (Momentum App, VS Code, Office apps, github/docs.google/stackoverflow → productive; youtube/netflix/twitch/reddit/x/twitter/facebook/instagram/tiktok → unproductive) plus Outlook, Teams, Slack, Zoom and linkedin.com → productive, added by migration 10 (existing DBs get them; past not-sure sessions reclassified). Rationale: users rarely notice which sites eat focus beyond their top few, and an unlisted site on a side monitor is not-sure, not unproductive
    - [x] DECIDE: the explanation text for the Settings classification section — decided 2026-10-27: Productive caption adds "Make sure these items are strictly tools/websites you use for completing your work…", Unproductive adds "These apps/sites actively take you away from your work." (lists stay named Productive / Unproductive, not allowed / disallowed — Momentum classifies time, it doesn't block)
- [x] 2. Feeling distracted popup trigger, windows notification/force app to front of screen, dynamic nudge text — completed 2026-10-06
    - [x] Threshold detection (`threshold.ts`): contiguous run, per-class thresholds + cooldowns (Settings), re-nudges every cooldown while the user stays put; Desktop / Momentum App never nudge — completed 2026-10-06
    - [x] Window to front via `setAlwaysOnTop` hop + `focus()` + `flashFrame` (`window.ts`); OS toast via Electron `Notification` — completed 2026-10-06
    - [x] Popup has an X; log / risk-factor actions keep existing routing; nudge-started logs are tagged "From a nudge" — completed 2026-10-06
    - [x] Dynamic copy from the DistractionEvent (site/app + exact run length); not-sure toasts explain why — completed 2026-10-06
    - [x] Risk factor → recurring task with a risk-factor category: moved to item 5 — completed 2026-10-13 there (a daily series per selected factor, tagged "Risk factor")
- [x] 3. Timers + notifications — completed 2026-10-06
    - [x] App-wide timer store (`lib/timers.tsx`) + Timers tile on Daily Tasks: log timers outlive the log, custom timers (min + sec), OS toast + repeating beep (mutable), Restart; timers pause with monitoring on lock/sleep. In-memory only — completed 2026-10-06
    - [x] Clicking the "Time's up" toast opens a timer-done dialog (`components/TimerDone.tsx`): the timer's name, how long it ran and how long ago it ended, Close, mute / sound, and Restart — which needs the next task typed in or "Same task" — completed 2026-10-28 (`app:notifyTimer` → `push:openTimer`)
- [x] 4. Settings screen — completed 2026-10-06
    - [x] Name, nudge thresholds + per-class cooldowns (min + sec, 10 s steps, cooldown ≥ threshold), strict mode, Productive / Unproductive lists with placeholder suggestions, "Not sure yet" reclassify list, multi-window explanation; autosaves — completed 2026-10-06
    - [x] Master on/off switch on the Distraction popup card (`monitoring_enabled`): off stops polling, the sidecar, session rows and nudges, and greys out every polling-dependent setting — completed 2026-10-07
    - [ ] Break-down mode (V3) and profile (V2) controls deliberately omitted until their versions
- [x] 5. Daily task carry-over to new day (only incomplete tasks), weekly list sql data review, update written-in tasks to have a popup page to set date/time, category, steps, reminders, Calendar view for daily/weekly, weekly carry-over (double check it follows daily carry-over) — completed 2026-10-13 (`routine.ts` daily routine at launch / midnight / unlock-wake: carry-over as a copy with `carried_from`, Monday weekly carry on the same mechanism, repeating series on a weekday mask, risk-factor series; `tasks` rebuilt by migration v7 + `created_at` v8; completion on every daily row; reminders as OS toasts; see `docs/database-overview.md`)
    - [x] "Add a task" row currently only captures a title — carry-over, weekly flow, and task-create menu interlock; build together — completed 2026-10-13 (TaskDialog: title, due date + time, optional category, steps, reminder, Repeat Daily / Custom + end date; the same dialog edits, deletes, stops repeating)
    - [x] Weekly default, daily or monthly views — completed 2026-10-13 (Calendar: Day / Week / Month with ‹ › arrows and year labels; weekly list with done/target counts; future series days projected read-only)
    - [x] Morning routine generates the recurring daily task for each active `risk_factors` row (moved from item 2; needs a `risk_factor` task category) — completed 2026-10-13 (a daily series with `risk_factor_id` and a "Risk factor" tag; no category added — `category` became free text in v7)
- [x] 6. Splash animation — completed 2026-10-14 (`design_system/brand/splash.html` ships verbatim as a second renderer page `src/renderer/splash.html`, loaded before `index.html`; content-sized 1100×700 window; 3.23 s = one full roll so the snowball lands)
    - [x] CSS `offset-path` snowball roll renders imperfectly in Electron (position/size) — A/B against `splash.html` in a browser to tune — completed 2026-10-14 (the React port drifted under Tailwind's base reset and a different font build; loading the design file itself removed the diff, verified by screenshot against Edge)
    - [x] Do not rewrite to SVG `<animateMotion>` — it was tried and reverted (wrong size/start/end, lost wordmark+caption); CSS `offset-path` + keyframes is the correct basis — still the rule; to change the splash, edit the design file and re-copy it
- [x] 7. Productivity Trends page is same as Current Session — completed 2026-10-13 (Current Session page + nav item removed; Productivity Trends has Today / This week / This month tabs with ‹ › arrows, a labeled productive / total pair, and ranked app / site lists per range; the Home "This session" tile opens Trends → Today)
    - [x] early shell built (`screens/Session.tsx`); real classification data flows since 2026-10-06 — completed 2026-10-06
    - [x] Update Current Session shell, create new page for productivity trends (there should be a template for this in ds) — completed 2026-10-13 (`screens/Session.tsx` → `screens/Trends.tsx`; `MonthChart`, `BreakdownList`)
    - [x] Verify daily/weekly/monthly accumulation at query time (raw rows kept) — completed 2026-10-13 (`sessions.getDay / getWeek / getMonth / getBreakdown` aggregate raw rows with DST-safe day boundaries; nothing is pruned — the 30-day window applies only to Settings "Not sure yet")
- [ ] 8. Verify that logs save and can be reviewed
    - [x] Packaged-build gap: `distortions` and `risk_factor_catalog` defaults are seeded only by dev `seed.ts`, so a fresh install has an empty distortion list in the log flow — move those static seeds into a `db.ts` migration (the Productive/Unproductive defaults already live there) — completed 2026-10-27 (migration 9; `seed.ts` no longer inserts either table)
    - [x] Logs list: rows titled by task text, click → read-only detail with editable actual minutes, Edit → the flow — completed 2026-10-27
    - [x] Delete a log (trash on the row, two-step confirm; its timer leaves the Timers tile) and in-progress logs: X after at least one completed step saves the log with `completed = 0` (migration 11), the row says "In progress" and clicking it resumes the flow at the first unfinished step — completed 2026-10-28
- [ ] 9. Reduce clutter in log flow or resize the card (steps 3 and 4, review all steps and remove unnecessary steps)
    - [x] Four steps, no intro (task → feeling → thought record → first steps with predicted / actual minutes and the timer); done screen shows "Saved to your logs." beside the check, the quote, a review of the saved log with Edit, then Save and close — completed 2026-10-28
    - [x] Step 3 copy (tempting / self-control thought prompts, "% belief in tempting thought"); the last slider accepts 0%. Step 4 caption ("10 mins maximum per step…") and PowerPoint example placeholders — completed 2026-10-28
- [ ] 10. Npm run dev: still prints active window to terminal (says "starting Electron", says Electron in active window print, right clicking taskbar icon says Electron as well)
    - [x] Poll output collapsed to one `[poll] front: … · also visible: …` line per poll; Momentum's own window prints as "Momentum App" — completed 2026-10-06
    - [ ] Remaining: the "starting Electron" banner and the taskbar name are electron-vite / dev-only; decide whether to silence `[poll]` / `[session]` lines entirely once tracking is trusted
- [ ] 11. Remove all the excess eyebrow text (pages already show header + caption, eyebrow is redundant)
- [ ] 12. Make sure top right focused timer, "this session" timing card, "toward a break" card are all linked to the correct page
- [ ] 13. Review how polling works and how sql is stored
    - [ ] Review database question in "Polling Structure" tab with working polling/sql data to see which works best
- [ ] 14. Looks like momentum.exe is working now, verify and figure out why (Windows approved us??)
- [ ] 15. Verify that polling works properly: multiple windows, file explorer vs microsoft edge, minimized items, windows home shell, multiple monitors vs single laptop screen, test Edge (youtube) on half monitor split view
    - [x] Edge windows without an address bar (sites saved as apps, picture-in-picture, DevTools) are named from their title and classified as apps; the New Tab page is the app "Edge - New tab"; all Edge channels report as "Microsoft Edge"; verified live with a Hulu app window — completed 2026-10-09
- [ ] 16. Npm audit warnings
    - [ ] Pre-existing transitive dev/build deps (vite/esbuild, tar via get-windows, undici, form-data) — not shipped in Electron runtime; revisit cautiously (native-module rebuild risk)
- [x] 17. Delete github branch or rename to new feature branch — completed 2026-10-26 (`v1-deferred-p2` deleted locally and on GitHub after PR #3 merged; `v1-deferred-p3` created from `main`)
- [ ] 18. Security check, crash/edge case testing (fable)
- [x] 19. Add V1.0 note to splash screen — completed 2026-10-27 (muted "v1.0" bottom-right of the splash card; `electron.vite.config.ts` injects `package.json` `version` as `__APP_VERSION__`, `splash.ts` writes it as major.minor)

---

## V2 Features — due 7/5 (really 7/3)

Add necessary features to fill in final placeholders and make app cover all core functionality detailed in 'Brainstorm_Features.docx'.

- [ ] 1. Pomodoro Timer break notifier, user specified timer amounts, pomodoro time adjustment setting
    - [ ] The home "Toward a break" ring already tracks progress toward 50 mins — the notifier itself isn't wired yet
    - [ ] These should auto fire. Mode for standard countdown and strict-mode (productive data only)
    - [ ] Default is pomodoro auto fires every 50 mins, user specified time overrides this, option to turn off
    - [ ] Slider to make pomodoro/user specified reoccurring or one-time, consider default breaks
    - [ ] Break popup "Nice work. Take a healthy break for 10 minutes, such as a walk around the block (no music), stretching, getting water or a healthy snack, getting fresh air and sunshine, chatting with a friend, a gratitude journal, or breathing/meditating. Visualize what you have accomplished and what you will do during this time."
- [ ] 2. Current session "live" card (restore or delete)
    - [ ] Omitted from current build (no live-status data) — add `session.getLiveStatus()` IPC returning current foreground app + classification, then restore the card
- [ ] 3. Create Profile page or about me page, replace risk factors page with this, make it a tab in profile page
- [ ] 4. Ensure app is tied to computer's local timezone, add a timezone setting page with manual override
- [ ] 5. Login in popup page (welcome, create profile, new lists for the week, add daily tasks)
    - [ ] Verify first launch of day, week (Monday's) are working with new profile setup
    - [ ] Weekly list is default popup to force user to think about entire week, then select daily items from weekly list and push unessential items to next week (specific day or Monday default), showing a review for the current day
- [ ] 6. Step breakdown walkthrough popup similar to Lyra activity. Can be extra page in new task popup page
- [ ] 7. Drag to reorder tasks/steps
- [ ] 8. Verify changing task/step date or time reorders daily/calendar task view
- [ ] 9. Completed work is saved to calendar tab
    - [ ] Option to show only completed items, hide other items
    - [ ] Option to show only outstanding items, hide completed items
    - [ ] Carried over tasks show original date added or started, original due date
- [ ] 10. Productivity trends has full calendar view, not just current week, add more charts/visuals
- [ ] 11. Add V1.2 note to splash
- [ ] 12. Editable category list — no migration needed: migration 7 dropped the `category` CHECK (free text, NULL = none), so only the `Category` type, the dialog select and the tag colours change

---

## V3 Features — due 7/12

Add the last features to cover full functionality of Brainstorm_Features.docx. This is a completed app, and would be a great stopping point for balancing moving and interviews.

- [ ] 1. Reflection informational page: dopamine/avoidance/productivity advice page (add best practices articles, ie phone out of sight)
    - [ ] Frequent interventions take you to this page
    - [ ] Add pomodoro/breaks research source, hyperlink this to timer popups
    - [ ] Healthy break suggestions (brainstorm.docx), add to popups
    - [ ] Back up other claims in prompts with evidence. "studies show that X is effective" + hyperlink
- [ ] 2. Profile: What are a few things that lock you into your work? Music recs (playlists/sets > 1hr long), standing desk, public setting, etc
    - [ ] What detracts you from focus? Is your phone in a different room? Did you leave it in the car (if safe)?
    - [ ] Popups reference these items
- [ ] 3. Journal page: thought records, strong emotions, gratitude logs
- [ ] 4. Claude API
    - [ ] Review LLM integrations in brainstorm-session.md
- [ ] 5. Add breakdown steps auto feature with Claude API to list all total steps needed to complete a task/goal
    - [ ] List only first 3 steps, big list is expandable
    - [ ] Play around with original first — might be more helpful to go through the process yourself, although Claude is good for unfamiliar tasks
- [ ] 6. Goal Tracking page: input hours spent towards goals, compare that with computer time (productive vs unproductive), phone time (see if you can pull from Apple API, or ask user to check/input their daily screentime), chores time
    - [ ] Short/long term options, milestones, reminders
- [ ] 7. Global vs local allowed/disallowed lists per task
- [ ] 8. Efficiency stats/trends based on task started vs task completed timestamps — in Productivity Trends page
- [ ] 9. Task list auto-organized by category (buttons show only work, only personal, only hobby, only goal, risk factor habit tasks)
- [ ] 10. Setting to turn off log popups and replace them with an informational/stat popup
- [ ] 11. Gantt chart with Claude API (or other visuals for large scale projects so Calendar doesn't get bloated, factor in dependencies)

---

## V4 Features — due 8/9

Nice to have features that aren't listed in the brainstorm doc or necessary for core app functionality. Finish before car-week, CDA, and new job/moving.

- [ ] 1. Mac release, cross-browser support for Safari, Chrome, Firefox
- [ ] 2. Smart App Control code signing, Windows/Mac packaging (license if smart app control workaround from gemini doesn't work)
    - [ ] Windows smart app control allow app — Google Search
    - [ ] `build:unpack` produces `dist/win-unpacked/Momentum.exe` but `winCodeSign` errors unless Windows Developer Mode is enabled; Smart App Control blocks the unsigned exe from running
    - [ ] Code-signing cert costs ~$200–500/yr and needs identity/business verification through a CA; a new cert has no SAC reputation so a freshly-signed build may still be blocked until trust accrues — prefer an EV cert for best SAC reputation
    - [ ] `npm run dev` is unaffected by SAC and fine for development in the meantime
- [ ] 3. "Help me get started" button for tasks
- [ ] 4. Feature to pull in sleep data from Garmin
- [ ] 5. Pull screentime data from iPhone (see if there is a timestamp for phone screentime data to adjust computer productive/unproductive/not-sure data to unproductive data)
- [ ] 6. Claude API or algorithm uses risk factor information, sleep, goal, phone screentime data to deliver personalized popups/nudges
- [ ] 7. End of day/week debrief (similar to lets-go-home), after Claude integration. Include skippable options
- [ ] 8. Framer Motion animations
- [ ] 9. App usage data: streak, total days, consecutive days, monthly totals
- [ ] 10. Task list (daily + steps, calendar) auto-populates after Claude scans email inbox
- [ ] 11. Deadlines feature — Claude auto-populates milestones into your calendar when you input large future deadlines, accounting for size of task and current to-do list
- [ ] 12. Any app licensing needed to publish app. Any licensing/patents to make it legal for me to monetize/protect my IP 

---

## V5 Features

Do not complete until after starting new job.

- [ ] 1. Installer + auto-updater Mac and Windows
- [ ] 2. Windows/Mac app store release or distribution packaging
- [ ] 3. Bug testing, security bulletproofing, RAM/CPU performance (short and long term use), Chromium package size
- [x] 4. AutomationId resilience (auto-diagnostic for Edge UI changes) — completed 2026-10-26 for id renumbering (the sidecar falls back to the address bar's accessible name and adopts the new id; Edge 155 moved `view_1021` → `view_1017`). Not covered: a renamed control or a non-English Edge UI
- [ ] 5. "Hardcore mode" (call me out on my bullshit, be completely honest with what I need to change and give me steps to get there)

---

## V6 Features

Long term ideas.

- [ ] 1. Phone app — syncs with computer(s) for non-work activity
- [ ] 2. Habit tracking — see Brainstorm_Features.docx for more information
- [ ] 3. Data transparency page: "How your data is being used"
- [ ] 4. Voice control (phone and computer)
- [ ] 5. Emotions trend tracking through logs data or daily/weekly surveys, similar to Lyra
- [ ] 6. Life Coach AI Agent
- [ ] 7. Website hard-blocking integration (Freedom / Cold Turkey partnership)
    - [ ] Momentum saves the password (multiple copies in browser extension version), or gives you random password for Block Sites extension and saves copies
- [ ] 8. Meditation features
- [ ] 9. CBT Center
- [ ] 10. Milestoning with enforced consequences (e.g. auto-donate to charity on missed deadline)
- [ ] 11. Partnership with therapy services (e.g. Lyra Health) to prompt users to get help if their data is trending down
- [ ] 12. "Stop Momentum" mode for intentional personal time
- [ ] 13. Doomscrolling/gaming detection
    - [ ] Suggest joining activities for parents or couples where someone has computer addiction
