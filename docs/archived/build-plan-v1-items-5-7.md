> Archived build record (copied 2026-10-14 from the Claude Code plan file; branch `v1-deferred-p2`, HEAD `67dfe8c`). The three "Gate 1" sections (G1-1 … G1-13) and the "Appearance pass" section (AP1–AP7) at the end **amend** the earlier decisions and assumptions — where they conflict, the later entry wins (e.g. A5 → G1-1 / G1-3 / G1-13, G1-8 → G1-11, D12 → AP7). `docs/roadmap.md` V1 items 5–7, `docs/database-overview.md` and CLAUDE.md hold the final state.

# V1 Deferred build plan — items 5–7 (tasks + Calendar, splash, Productivity Trends)

Branch: `V1-Deferred-P2` (created and pushed). Commit at each gate; PR to `main` when done.

## Context

`docs/roadmap.md` V1 Deferred items 5–7 are what remain between the current build and a usable V1
beyond the monitoring loop: tasks only live for one day (no carry-over, no weekly planning UI, a
title-only "Add a task" row, `risk_factors` rows written but never read), the splash is clipped
by the window frame and cut off mid-animation, and the "Current session" and "Productivity
Trends" nav items render the same component. This plan takes those three items to done using the
process that worked for items 1–4: one serial foundations agent that owns the IPC surface, then
parallel agents on strictly disjoint files, with a `/code-review high` gate and a commit after
each phase.

Explored 2026-10-10/12 with three read-only sweeps (tasks domain, splash, session/trends) and a
design pass; every decision below was made by Ben in this session unless marked (lead).

### Decisions (do not re-open)

| # | Decision |
|---|---|
| D1 | **Carry-over = copy with origin link.** An incomplete single-entry daily from *any* past date that has no copy yet is copied to today (`carried_from` = old id); the old row stays on its date and renders as "Carried to …". Recurring dailies never carry over: a missed day stays missed. |
| D2 | **Daily routine runs at launch, at the next local midnight (re-armed timer), and after unlock / wake.** Idempotent via a `last_routine_day` settings key; pushes `push:dayChanged` so Home / Calendar refetch. |
| D3 | **Per-daily completion.** Every daily row owns `completed` / `completed_at`. A weekly row shows *N of target* where target = number of repeat days that fall in its week (1 for a single-entry task); it auto-completes when the count is reached. Weekly checkbox is disabled above target 1 (shows the count); ticking a target-1 weekly also completes its daily if one exists. Replaces the "completion lives on the weekly row" rule in `docs/database-overview.md`. |
| D4 | **Repeat = weekday mask on the weekly row** (`repeat_days`, bit 0 = Mon … bit 6 = Sun; 0 = once; 127 = daily) + nullable `repeat_until` (end date; NULL = until stopped). Dialog: Repeat switch off by default (greyed label) → Daily / Weekly (pick weekday(s)) / Custom (multi-select weekdays) + optional end date. A series continues every week until it ends; the routine creates the new week's weekly row on Monday and each day's daily automatically. |
| D5 | **Monday carry-over:** incomplete single-entry weeklies copy into the new week with an origin link (same mechanism as D1). |
| D6 | **Calendar screen** replaces the Placeholder: **daily, weekly (default), monthly** views, each with ‹ › arrows. Headers show date + year (daily), date range + year (weekly), month + year (monthly). The weekly view hosts the weekly list and Mon..Sun day columns. |
| D7 | **Task-create dialog** (replaces the title-only add row on Home; also opened from Calendar): title, date, due time, category (**optional**, defaults to none), steps, reminder, repeat (D4). Same dialog edits an existing task. |
| D8 | **Reminder = OS toast at `reminder_time`,** scheduled in the main process via `notify.ts`, re-armed on launch. Clicking the toast brings Momentum forward and opens Calendar → weekly view with that task highlighted. |
| D9 | **Risk-factor morning routine:** each `risk_factors` row with `recur_until >= today` yields a weekly series (`repeat_days = 127`, `repeat_until = recur_until`, `risk_factor_id` set, title = the factor label) and a daily per day. The task shows a "Risk factor" tag. |
| D10 | **Keep raw session rows, no pruning.** Trends aggregate at query time; the 30-day window stays only on Settings "Not sure yet". Roadmap sub-step 7c is reworded to "verify accumulation". |
| D11 | **Delete the Current Session page and nav item.** Productivity Trends gets tabs **Today / This week / This month**, each with ‹ › arrows. Today = expanded "This session" card (totals + horizontal bar) + three per-class "most time" lists (apps/sites ranked by minutes, in the NotSureList "most time" style; a Desktop row under not-sure). This week = existing `TrendsChart` for any week. This month = same look, one bar per Mon..Sun week touching the month, labelled by date range. The Home "This session" tile links to Trends → Today. |
| D12 | **Splash:** `useContentSize: true` on the BrowserWindow (main; restart), `SPLASH_MS` 2000 → 3230 (one full loop so the ball lands), restore `text-box-trim: trim-both; text-box-edge: cap alphabetic` on `.v-title`. No other splash change; no SVG `animateMotion`. |
| D13 | **Rebuild the `tasks` table once and drop the fixed category rule.** The new table has no `CHECK` on `category` (validated in TypeScript; NULL = no category), plus the item-5 columns and the risk-factor link, in one migration (v6 → v7). The migration runner gains a mode for a step that manages foreign keys itself. Rationale: there is no real user data yet (dev = seed fixtures, packaged = empty), so this is the cheapest moment; categories can become an editable list later with no further rebuild. |
| D14 | (inherited) Schema changes only through `MIGRATIONS` in `db.ts`; never edit `initSchema()` or a shipped step. All three IPC files change only in Phase 0. vitest for every new pure module. |
| D15 | **Future occurrences are projected, read-only.** The range query adds virtual rows (`projected: true`, `id: null`) for active series beyond the latest created week. Calendar shows them greyed and not tickable; real rows replace them when that week's routine runs. |

### Assumptions (flag if wrong)

- **A1 — `carried_from` is the only carry column.** "Already carried" = `EXISTS (SELECT 1 FROM tasks c WHERE c.carried_from = t.id)`. Series continuation reuses it (next week's weekly points at the previous week's row); `repeat_days != 0` tells the two apart.
- **A2 — Weekly rows reuse `date` as the series start** (the dialog date). `date` is NULL on every weekly row today, so no conflict. Target for the first week counts only mask days ≥ `date`.
- **A3 — Recurring instances are created for the current week** (today → Sunday, clipped by `repeat_until`) when the series is created/edited and by the routine; later weeks are projected (D15).
- **A4 — A carried daily is re-parented** to the current week's copy of its weekly when that weekly was itself carried (D5). The copy takes the original's steps (with completion state), keeps the due *time of day* on the new date, and drops `reminder_time` (a stale reminder must not fire for a task the user never rescheduled).
- **A5 — Deletion keeps completed history.** Deleting a *single-entry* weekly deletes it and its one daily (+ steps). Deleting a *series* weekly keeps every completed daily, deletes only dailies with `date >= today AND completed = 0` (+ steps), and ends the series (`repeat_until = addDays(today, -1)`) so no more days are generated; the row stays with its final count (target recomputes from the clipped series days, e.g. 3/3), or is deleted outright if it has no dailies left. Deleting a daily from Home deletes only that row + steps. "Stop repeating" (`repeat_until` = this Sunday) keeps this week's days. Not in V1: deleting one occurrence of a series (the routine would regenerate it); a recurring daily's dialog offers Stop repeating / Delete series instead. FKs have no `ON DELETE`, so every cascade is explicit SQL in one transaction.
- **A6 — Month chart uses whole Mon–Sun weeks** that touch the month (a bar can include Aug 31); the label shows the actual range.
- **A7 — Breakdown labels are what the rows recorded:** `app` for host-less rows, `host` for sites, `Desktop` as-is.
- **A8 — `session.getCurrent` / `getTodayFocus` stay** for Home; Trends uses new `trends.*` channels.
- **A9 — Steps in the dialog are plain text + optional minutes** (no AI; V3 #5). Series steps are copied onto each generated daily (steps attach to dailies).
- **A10 — `Category` TypeScript type stays the four known labels** (tag colours exist for those); the DB accepts any text so an editable list is a later, migration-free feature.

### Where item 5 lands: Home vs Calendar

| Home (Daily tasks) | Calendar (new screen) |
|---|---|
| "Add a task" opens the task dialog (replaces the title-only row) | Weekly list with `N/target` counts, tags, carried chips; "+ Add" with repeat preset |
| Task rows show a carried-over chip, a repeat marker, a "Risk factor" tag; click opens the dialog to edit / delete | Mon..Sun columns for the shown week; "Add to a day" from a single-entry weekly; projected future days greyed |
| Carried-over and generated recurring tasks appear automatically; list refreshes on day change | Day view (reuses the Today card for any date) and Month view (per-day done/total counts) |
| "This session" tile links to Trends → Today | ‹ › arrows on all three views with date / range / month + year headers; Stop repeating; reminder deep-link highlight |

Home gets no weekly panel; everything weekly or multi-day lives on Calendar.

---

## Dependency graph

```
Phase 0  ONE agent, serial
         shared/dates.ts + recurrence.ts (+tests) → migration v7 (rebuild) + runner mode
         → tasks / sessions repositories → routine.ts + dayChange.ts + reminders.ts + notify onClick
         → FULL IPC surface (ipc.ts / preload / types.ts) → renderer stubs (App.tsx, Sidebar,
           Trends.tsx rename, Calendar.tsx stub, TaskDialog stub, RangeNav, Home/SessionTiles props)
         → splash fix → seed + inspect-db updates
            │
            ├──────────────────┬──────────────────┐
            ▼                  ▼                  ▼
Phase 1  Agent A           Agent C            Agent B
         TaskDialog +      Calendar screen    Trends screen,
         Home/TodayCard/   + calendar/*       MonthChart,
         TaskRow           components         BreakdownList, tile click
            │                  │                  │
            └──────────────────┴──────────────────┘
                               ▼
Phase 2  Lead: end-to-end QA, /code-review high, /simplify, docs + roadmap, PR
```

Hard dependencies: A and C need every `tasks.*` / `taskSteps.*` channel, `events.onDayChanged`,
`events.onOpenTask`, `RangeNav`, `shared/dates.ts`, and the `TaskDialog` **props interface**
(stub file created in Phase 0 so C can import it while A fills it in). B needs
`trends.getDay / getDayBreakdown / getWeek(ws) / getMonth`, `RangeNav`, and the `onOpenTrends`
prop already threaded to `SessionTiles`. Nothing in Phase 1 touches `App.tsx`, `Sidebar.tsx`,
`RangeNav.tsx`, `ipc.ts`, `preload`, `types.ts`, or `src/main/**`.

---

## Phase 0 — foundations, services, IPC surface, stubs (one agent, serial)

### 0.1 Pure date module — new `src/shared/dates.ts` + `dates.test.ts`

No Electron/DB imports (precedent: `src/shared/format.ts`). `repositories/util.ts` keeps
`nowSecs` / `formatDue` and re-exports the moved helpers; `renderer/lib/format.ts`
`startOfTodaySecs` (L48–52) is deleted in favour of this module.

```ts
startOfDay(ts = nowSecs())            // moved from util.ts (local midnight)
weekStartMonday(ts = nowSecs())       // moved from util.ts
addDays(dayStart, n)                  // setDate-based; DST-safe (never + n*86400)
startOfMonth(ts); addMonths(monthStart, n)
dayBoundaries(from, count)            // [from, +1d, … +count d]
monthWeeks(monthStart)                // Mon–Sun weeks touching the month (A6)
weekdayBit(dayStart)                  // Mon=1 … Sun=64
```
Tests: US DST weeks (2026-03-08, 2026-11-01), a 6-row month, `weekdayBit(Sunday) === 64`,
`addDays` across month/year ends.

### 0.2 Pure recurrence module — new `src/main/recurrence.ts` + `recurrence.test.ts`

```ts
ALL_DAYS = 127
SeriesRow { id; weekStart; startsOn: number|null; repeatDays; repeatUntil: number|null }
isRecurring(mask)
seriesDays(s)                          // dayStarts in s.weekStart's week where bit set, ≥ startsOn, ≤ repeatUntil
targetForWeek(s)                       // seriesDays().length, or 1 when mask = 0
daysToGenerate(s, today)               // seriesDays() ∩ [today, Sunday]
seriesActiveInWeek(s, weekStart)       // repeatUntil == null || repeatUntil >= weekStart
projectedDays(s, from, to)             // D15: occurrences in [from, to) for weeks after s.weekStart
carryCandidates(rows, today)           // D1 filter: drops recurring, risk-factor, already-copied, today's rows
```
Tests: daily series created Wednesday → target 5; "Mon+Thu" ending Tuesday → target 1;
`daysToGenerate` on Sunday → `[Sunday]`; projection across a `repeat_until`; carry filter cases.

### 0.3 Migration v6 → v7 — `src/main/db.ts` (append to `MIGRATIONS`) + runner mode

**Runner change** (`migrate()`, `db.ts:269–280`): `MIGRATIONS` entries become
`Step | { ownTransaction: true; run: Step }`. For the flagged kind the runner does
`PRAGMA foreign_keys = OFF` → `transaction(() => { run(db); PRAGMA foreign_key_check must be
empty; user_version = next })()` → `PRAGMA foreign_keys = ON` (in `finally`). Plain steps run
exactly as today. `PRAGMA foreign_keys` is a no-op inside a transaction, which is why the toggle
must sit outside it.

**Step 6 (v6 → v7, `ownTransaction`)**, SQLite's documented 12-step rebuild:
```sql
CREATE TABLE tasks_new (
  id             INTEGER PRIMARY KEY,
  type           TEXT    NOT NULL CHECK (type IN ('weekly', 'daily')),
  week_start     INTEGER,
  date           INTEGER,                       -- daily: the day; weekly series: start day (A2)
  parent_task_id INTEGER REFERENCES tasks(id),
  title          TEXT    NOT NULL,
  category       TEXT,                          -- free text, NULL = none (D13); no CHECK
  due_date       INTEGER,
  reminder_time  INTEGER,
  completed      INTEGER NOT NULL DEFAULT 0,
  completed_at   INTEGER,
  repeat_days    INTEGER NOT NULL DEFAULT 0,    -- weekday mask, weekly rows; 0 = once (D4)
  repeat_until   INTEGER,                       -- local midnight of last day; NULL = never
  carried_from   INTEGER REFERENCES tasks(id),  -- copy → the row it was carried / continued from
  risk_factor_id INTEGER REFERENCES risk_factors(id)
);
INSERT INTO tasks_new (id, type, week_start, date, parent_task_id, title, category, due_date,
                       reminder_time, completed, completed_at)
  SELECT id, type, week_start, date, parent_task_id, title, category, due_date,
         reminder_time, completed, completed_at FROM tasks;     -- ids preserved
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX idx_tasks_type_date ON tasks (type, date);
CREATE INDEX idx_tasks_type_week ON tasks (type, week_start);
CREATE INDEX idx_tasks_parent    ON tasks (parent_task_id);
CREATE INDEX idx_tasks_carried   ON tasks (carried_from);
CREATE INDEX idx_tasks_reminder  ON tasks (reminder_time);
-- D3 backfill: a daily whose weekly parent is done was done.
UPDATE tasks SET completed = 1,
  completed_at = COALESCE((SELECT p.completed_at FROM tasks p WHERE p.id = tasks.parent_task_id), <now>)
WHERE type = 'daily' AND completed = 0
  AND parent_task_id IN (SELECT id FROM tasks WHERE type = 'weekly' AND completed = 1);
```
`task_steps.task_id REFERENCES tasks(id)` keeps pointing at the renamed table (SQLite ≥ 3.26 with
`legacy_alter_table` off rewrites the reference on rename); `foreign_key_check` confirms it. Step
must be idempotent-safe: skip the rebuild if `tasks_new` exists or `tasks` already has
`repeat_days` (a crash between rename and version bump). `user_version` becomes 7.

### 0.4 Tasks repository — `src/main/repositories/tasks.ts` (read/write rules rewritten)

| Function | Notes / SQL |
|---|---|
| `listDaily(date = startOfDay())` | `SELECT t.id, t.title, t.category, t.date, t.due_date, t.reminder_time, t.completed, t.parent_task_id, t.carried_from, p.repeat_days, p.risk_factor_id, rf.factor, EXISTS(SELECT 1 FROM tasks c WHERE c.carried_from = t.id) AS carried FROM tasks t JOIN tasks p ON p.id = t.parent_task_id LEFT JOIN risk_factors rf ON rf.id = p.risk_factor_id WHERE t.type='daily' AND t.date = ? ORDER BY t.due_date IS NULL, t.due_date, t.id`. Own `completed` — no `COALESCE` (D3). |
| `listDailyRange(from, to)` | Same select over `t.date >= ? AND t.date < ?`, **plus** projected rows (D15) from `projectedDays()` for every active series whose latest weekly row is before the range end. Calendar week columns + month counts in one call. |
| `listWeekly(weekStart = weekStartMonday())` | `… (SELECT COUNT(*) FROM tasks d WHERE d.parent_task_id = w.id AND d.completed = 1) AS done_count, EXISTS(copy) AS carried …`; `target = targetForWeek()` in JS. |
| `get(taskId)` | Full row + steps + (for a daily) parent repeat fields; edit dialog + toast deep-link. |
| `create(input)` | **One transaction.** `repeatDays === 0`: daily on `date` + auto weekly parent in that week (as today, `tasks.ts:127–134`) + steps. `repeatDays !== 0`: weekly series row `{week_start: weekStartMonday(date), date, repeat_days, repeat_until}` then `generateWeek()`. Returns the created id. |
| `update(taskId, patch)` | Title/category/due/reminder/steps on any row; repeat fields on a series: delete this week's `completed = 0 AND date >= today` dailies of that parent, update, regenerate. "Stop repeating" = `repeat_until = addDays(weekStart, 6)`. |
| `remove(taskId)` | A5 in one transaction: daily → row + steps; single-entry weekly → its daily (+ steps) + row; series weekly → unfinished dailies from today (+ steps), `repeat_until = yesterday`, row deleted only if no dailies remain. |
| `addToDaily(weeklyId, date)` | Unchanged (`tasks.ts:155–167`). |
| `toggleComplete(taskId)` | Daily: flip own, then `recomputeWeekly(parent)` (`completed = done_count >= target`). Weekly: if `target > 1` throw `'Recurring tasks complete through their days'`; else flip own and mirror onto its latest daily if any. One transaction. |
| `addStep / removeStep / toggleStep` | `ordinal = MAX+1`. |
| `generateWeek(weeklyId, today)` | For each `daysToGenerate()` day with no `(parent_task_id, date)` row: insert daily `{title, category, date, due_date: day + due time-of-day}` + copy of the series' step texts. Exported for the routine. |
| `listReminders(after)` | `SELECT id, title, reminder_time, date FROM tasks WHERE reminder_time > ? AND completed = 0 ORDER BY reminder_time LIMIT 1`. |

Weekly-parent invariant stays: a single-entry written-in daily still auto-creates its weekly so the
weekly list is complete.

### 0.5 Daily routine + day change — new `src/main/routine.ts`, new `src/main/dayChange.ts`

`runDailyRoutine(today = startOfDay()): boolean` — one transaction; returns false if
`settings.last_routine_day === today`:

1. **Series rows for this week:** for each latest row of an active series (`repeat_days != 0`,
   `seriesActiveInWeek(thisWeek)`, `week_start < thisWeek`, no row with `carried_from = id` in this
   week) insert `{week_start: thisWeek, date: NULL, repeat_days, repeat_until, risk_factor_id, carried_from: id}`.
   Then for each `risk_factors` row with `recur_until >= today` and no weekly this week with that
   `risk_factor_id`: insert `{title: factor, category: NULL, repeat_days: 127, repeat_until: startOfDay(recur_until), risk_factor_id}`.
2. **Weekly carry (D5):** incomplete, `repeat_days = 0`, `risk_factor_id IS NULL`, `week_start < thisWeek`, no copy → copy into this week with `carried_from`.
3. **Daily carry (D1, A4):** `carryCandidates()` over `type='daily' AND date < today AND completed = 0` joined to parent → copy `{date: today, due re-based, carried_from, parent: this week's copy of parent if it exists else parent}` + steps.
4. **Generate today** for every series row in this week (`generateWeek`) — covers risk-factor dailies.
5. `settings.set('last_routine_day', today)`; return true.

`dayChange.ts` `startDayChange()`: run on launch (after `registerIpc()`, before `createWindow()`),
arm `setTimeout` for next local midnight + 1 s (re-armed after each fire), add its own
`powerMonitor.on('unlock-screen' | 'resume')` listeners (`monitoring.ts` untouched). After a run
that returns true: `getMainWindow()?.webContents.send('push:dayChanged')` and `reminders.rearm()`.

### 0.6 Reminders — new `src/main/reminders.ts`, edit `src/main/notify.ts`

`notify(title, body, onClick?)` — click → `bringToFront()` then `onClick?.()` (`notify.ts:21`).
`startReminders()` / `rearm()`: one timer; `rearm()` reads `tasks.listReminders(now)` and sets
`setTimeout(fire, min(delta, 12h))`. `fire()` toasts every due row not yet fired
(`notify(title, 'Reminder · ' + due, () => send('push:openTask', { taskId, date }))`) then
`rearm()`. `ipc.ts` calls `rearm()` after `tasks:create/update/remove/toggleComplete`;
`dayChange.ts` calls it on resume (Node timers don't account for sleep).

### 0.7 Sessions repository — `src/main/repositories/sessions.ts`

- `getDay(dayStart)` generalises `todaysSessions()` (L49–57) to `[dayStart, addDays(dayStart,1))`; `getCurrent = () => getDay(startOfDay())`.
- `getWeek(weekStart = weekStartMonday())` buckets by `dayBoundaries(weekStart, 7)`, not `/ 86400` (L102). `TrendDay` gains `date`.
- `getMonth(monthStart): TrendWeek[]` — `monthWeeks()` → `{ weekStart, weekEnd, productive, unproductive, notsure }` per week.
- `getDayBreakdown(dayStart): DayBreakdown` — `{ productive: BreakdownItem[]; unproductive; notsure }`, `BreakdownItem { kind: 'app'|'site'; label; minutes }`:
  ```sql
  SELECT classification, 'app' AS kind, MAX(app) AS label, SUM(COALESCE(total_seconds, ? - start_time)) AS secs
    FROM sessions WHERE start_time >= ? AND start_time < ? AND host IS NULL GROUP BY classification, app_key
  UNION ALL
  SELECT classification, 'site', host, SUM(COALESCE(total_seconds, ? - start_time))
    FROM sessions WHERE start_time >= ? AND start_time < ? AND host IS NOT NULL GROUP BY classification, host
  ORDER BY classification, secs DESC
  ```
  Separate from `listNotSure()` (`classificationRules.ts:132`), which is not modified.

### 0.8 Shared types — `src/shared/types.ts`

- `DailyTask` += `date`, `dueDate`, `reminderTime`, `parentTaskId`, `recurring`, `riskFactor: string|null`, `carried`, `carriedFrom`, `projected` (`id: number | null`). Keep `due` string for `TaskRow`.
- `WeeklyTask` += `doneCount`, `target`, `repeatDays`, `repeatUntil`, `startsOn`, `riskFactor`, `carried`.
- `TaskInput` += `repeatDays?`, `repeatUntil?`, `steps?: { text; estMinutes? }[]`; new `TaskPatch`, `TaskDetail`.
- `TrendDay` += `date`; new `TrendWeek`, `BreakdownItem`, `DayBreakdown`, `OpenTaskEvent { taskId; date }`.
- `Category` unchanged (A10).

### 0.9 IPC surface delta (`ipc.ts`, `preload/index.ts`, `MomentumApi`)

| Group | Add / change |
|---|---|
| `tasks` | `listDailyRange(from, to)`, `get(id)`, `update(id, patch)`, `remove(id)`; others unchanged |
| `taskSteps` | `add(taskId, text, estMinutes?)`, `remove(stepId)` |
| `trends` | `getWeek(weekStart?)` (arg added), `getDay(dayStart)`, `getDayBreakdown(dayStart)`, `getMonth(monthStart)` |
| `session` | unchanged (A8) |
| `events` | `onDayChanged(cb)`, `onOpenTask(cb: (e: OpenTaskEvent) => void)` — same unsubscribe pattern as `preload/index.ts:63–69` |
| main hooks | `tasks:*` mutations call `reminders.rearm()`. No dev-only "run routine" channel: Gate 1 resets `last_routine_day` instead. |

### 0.10 Renderer stubs so Phase 1 never touches shared files

- `App.tsx`: remove the `'session'` route (L97); `view === 'trends' && <Trends />`; `view === 'calendar' && <Calendar focus={calendarFocus} dayKey={dayKey} />`; `Home` gets `onNavigate` + `dayKey`; subscribe `events.onDayChanged` → `setDayKey(k+1)` and `events.onOpenTask` → `setCalendarFocus(e); setView('calendar')`. `Placeholder` import dropped (file deleted).
- `Sidebar.tsx`: remove `'session'` from `NavId` (L22) and `MAIN_ITEMS` (L38).
- `git mv screens/Session.tsx screens/Trends.tsx` (header updated; old two-tab body stays for Agent B). Delete `screens/Placeholder.tsx`. New `screens/Calendar.tsx` stub (heading only; accepts `focus` / `dayKey`).
- New `components/tasks/TaskDialog.tsx` **stub exporting the final props**: `{ open; mode: 'create'|'edit'; taskId?; initialDate?; initialRepeatDays?; onClose; onSaved }` — renders nothing yet. Agent A implements it; Agent C imports it.
- New `components/RangeNav.tsx`: `{ label; onPrev; onNext; onToday? }` — arrows + label; used by Calendar and Trends.
- `components/SessionTiles.tsx`: `onOpenTrends?` prop, threaded through `Home.tsx` (L63) from `App.tsx` (`setView('trends')`).
- `Home.tsx`: import `startOfDay` from `shared/dates` (replaces `startOfTodaySecs`).

### 0.11 Splash (D12)

- `src/main/index.ts:17–33`: add `useContentSize: true` (restart). `app:splashDone` (`ipc.ts:76–85`) keeps outer-size calls.
- `screens/Splash.tsx:17`: `SPLASH_MS = 3230`; `.v-title` (≈L35–36): add `text-box-trim: trim-both; text-box-edge: cap alphabetic;` — the only diff from `design_system/brand/splash.html:36`.

### 0.12 Fixtures + diagnostics

- `seed.ts:179–201`: write `completed` on the daily row itself (D3); add one recurring weekly ("Stretch", `repeat_days = 127`) so the weekly list has a `0/N` example. Migrations run before the seed, so the columns exist.
- `scripts/inspect-db.mjs`: print `last_routine_day`, task counts by type/week, and the new columns.

**Gate 0 (automated by lead, then Ben):** `npm run typecheck && npm run lint && npm test` green
(dates, recurrence, classifier, threshold); **restart** `npm run dev`; `npx electron
scripts/inspect-db.mjs` shows `user_version 7`, the new columns and five indexes,
`last_routine_day = today`; seed daily "Reply to design feedback" shows done on Home; sidebar has
no "Current session"; Trends/Calendar stubs render; splash card unclipped and the snowball lands
before the shell appears; fresh-DB boot (move the dev DB aside) also works. `/code-review high`
on the diff; fix; commit.

---

## Phase 1 — three parallel agents, disjoint files

### Agent A — TaskDialog + Home (item 5 renderer, part 1)

Files: `components/tasks/TaskDialog.tsx` (fills the stub), new `components/tasks/{RepeatPicker,WeekdayPicker,StepsEditor}.tsx`, `screens/Home.tsx`, `components/TodayCard.tsx`, `components/TaskRow.tsx`, `lib/format.ts`.

1. **TaskDialog** — modal after `Nudge.tsx:52–105` (scrim, `role="dialog"`, Escape/backdrop close, `animate-pop-in`) sized like the DS `Dialog` wide variant (`_ds_bundle.js:361–438`, 560px, radius 2xl). Fields from `components/log/fields.tsx`; native `<input type="date">` / `type="time"` (no DS date picker). Category select with "None" first. Repeat: `Switch` (`components/settings/Switch.tsx`) with greyed "Repeat" label; on → segmented Daily / Weekly / Custom; Weekly and Custom show `WeekdayPicker` chips (Weekly preselects the date's weekday); "Ends" date input. `StepsEditor` rows (text + minutes, add/remove). Create mode (date = today from Home; the clicked day from Calendar) and edit mode (`tasks.get`); in edit mode a Delete button (single task: deletes it; series: "Delete series — completed days are kept, unfinished days from today are removed") plus "Stop repeating" for a series. Save → `tasks.create` / `update` → `onSaved()`.
2. **Home / TodayCard / TaskRow:** inline add row (`TodayCard.tsx:57–80`) → "Add a task" opens the dialog. `TaskRow`: "Carried over" chip, repeat icon when `recurring`, "Risk factor" tag when `riskFactor` (`categoryLabel` handles it), projected rows greyed/untickable, click-to-edit. Home reloads on `dayKey`.

### Agent C — Calendar (item 5 renderer, part 2)

Files: `screens/Calendar.tsx`, new `components/calendar/{WeekView,DayView,MonthView,WeeklyList}.tsx`.

1. `RangeNav` header per D6 (`toLocaleDateString` labels with year). Tabs Day / Week / Month (local underline tabs as in `Session.tsx:23`), Week default.
2. **Week view:** `WeeklyList` left (title · `doneCount/target` · tag · carried chip; checkbox disabled when `target > 1`; "+ Add" opens `TaskDialog` with `initialRepeatDays`; "Stop repeating" on series rows) and seven day columns from `listDailyRange(weekStart, +7d)` (projected rows greyed); "Add to a day" on a single-entry weekly → `addToDaily`.
3. **Day view** reuses `TodayCard` for the chosen date. **Month view:** grid from `monthWeeks()` with per-day done/total counts, click → Day view.
4. `focus` prop (toast deep-link) selects the week of `e.date` and highlights `e.taskId` (ring + scroll into view).

### Agent B — Trends (item 7 renderer)

Files: `screens/Trends.tsx`, `components/session/TrendsChart.tsx`, new `components/session/{MonthChart,BreakdownList}.tsx`, `components/SessionTiles.tsx`.

1. Tabs Today / This week / This month (keep the local underline `Tabs`), each with `RangeNav`; state `{ tab, dayStart, weekStart, monthStart }`; labels become the range + year when not current.
2. **Today:** existing session card (`Session.tsx:90–107`) over `trends.getDay`, then three `BreakdownList`s from `getDayBreakdown`, rows in the `NotSureList` idiom (`NotSureList.tsx:51–61`: kind pill, label, `formatHM`), empty state "Nothing recorded".
3. **Week:** `TrendsChart` keyed by `d.date` (`TrendsChart.tsx:25`) over `getWeek(weekStart)`. **Month:** `MonthChart` = same column math over `TrendWeek` rows, labels like "Oct 6–12".
4. `SessionTiles` "This session" tile: `role="button"`, `onClick={onOpenTrends}`, hover state.

**Gate 1 (Ben, `npm run dev`; renderer work hot-reloads, no restart unless noted):**
- Home → Add a task → title, no category, due 4 PM, two steps → row with time + Steps disclosure, no tag; edit it; delete it.
- Add with Repeat → Daily → appears today and on every remaining day in Calendar week view, greyed in next week; weekly list shows `0/N`; tick today → `1/N`; weekly checkbox disabled.
- Repeat → Custom → Mon+Wed, Ends next Wednesday → only those days; "Stop repeating" removes later days.
- Delete a series after ticking one day → the ticked day stays, today's unticked and later days vanish, weekly list shows `1/1`; delete a single task → gone from Home and the weekly list.
- Reminder 2 minutes ahead → toast; click → Momentum front, Calendar week view, task highlighted.
- Carry-over (DevTools): `await api.tasks.create({type:'daily', title:'Old', date:<yesterday midnight secs>})`, `await api.settings.set('last_routine_day','0')`, **restart** → "Old" on today with the carried chip; yesterday's Day view shows "Carried to …"; `inspect-db` shows one copy; restart again → no second copy.
- Monday carry: `api.tasks.create({type:'weekly', title:'Last week', weekStart:<last Monday>})`, reset, restart → in this week's list, carried.
- Risk factor: Risk Factors → select with recurrence → reset, restart → "Risk factor"-tagged daily today and a `0/7` series in the weekly list.
- Trends: only "Productivity Trends" in the sidebar; Today totals match the Home tile; three ranked lists (seed shows "Seed"/"Desktop"; real browsing shows hosts); ◀ to yesterday; week arrows; month chart with date-range labels; Home tile click → Trends Today.
- `/code-review high` per agent diff; fixes; commit.

Each restart during these checks writes real session rows (orphans close at the next launch).

---

## Phase 2 — lead integration

`/code-review high` on the whole branch, `/simplify`, `npm run build`. Docs:

| File | Change |
|---|---|
| `CLAUDE.md` | Un-closed Code: drop the `riskFactors.select(recur)` orphan entry and the Placeholder entry; Electron App Structure: add `routine.ts`, `dayChange.ts`, `reminders.ts`, `recurrence.ts`, `shared/dates.ts`; Project Overview "Remaining work" sentence. |
| `docs/database-overview.md` | `tasks` schema (rebuilt; no category CHECK; new columns + indexes); **replace** the completion rule (L148–150, L213) with D3/D4/A1/A2; migrations table row v6 → v7 + the `ownTransaction` runner mode; "Each morning…" paragraph → the routine steps. |
| `electron_app/README.md` | Project structure (new main modules, `screens/Calendar|Trends`, `components/tasks|calendar`), Known Stubs (remove Calendar), tests list. |
| `docs/full-stack-overview.md` | What's-Not-Built rows for V1 removed; push channels += `push:dayChanged`, `push:openTask`. |
| `docs/roadmap.md` | Items 5, 6, 7 ticked with dates; 7c reworded "verify daily/weekly/monthly accumulation at query time (raw rows kept)"; V2 note: editable category list (no migration needed). |
| `docs/archived/build-plan-v1-items-5-7.md` | Copy of this plan. |

Open PR `V1-Deferred-P2 → main`.

---

## Agent strategy

- **Phase 0:** one `general-purpose` agent with this plan; it reports to the lead after the migration (0.3) and after the IPC surface (0.9) so the lead can `/code-review` the risky middle before the diff grows. Main-process edits need an Electron restart; the lead tells Ben when.
- **Phase 1:** Agents A, C, B launched in one message, same tree, exclusive file lists above. Briefs include the decisions table, assumptions, their file list, their Gate 1 lines, and CLAUDE.md header-comment + surgical rules. None edits `App.tsx`, `Sidebar.tsx`, `RangeNav.tsx`, `TaskDialog`'s props, or anything under `src/main` / `src/shared`; a needed surface change is reported and the lead applies it serially.
- `Explore` only for sweeps ("any remaining `'session'` NavId references?", "any caller of `startOfTodaySecs`?").
- **Gates:** Ben approves Gate 0 and Gate 1 with the checklists above; Phase 1 launches only after Gate 0. No background `npm run dev` boots by Claude unless a migration needs verifying (and say so).

---

## Roadblocks and risks

| # | Risk | Handling |
|---|---|---|
| R1 | **Table rebuild under foreign keys.** `getDb()` sets `foreign_keys = ON` (`db.ts:287`) and `migrate()` wraps every step in a transaction (L274–277), where the pragma is a no-op. | The `ownTransaction` runner mode (0.3) toggles the pragma outside the transaction and runs `foreign_key_check` inside it. Dev DB holds only fixtures; a failure is fixed by deleting it. |
| R2 | **Repository/routine code has no unit tests**: `better-sqlite3` is rebuilt for Electron's ABI (`postinstall`), so vitest may not load it. *Unverified.* | Phase 0 agent tries one `:memory:` test first; if it fails, DB logic stays thin and decisions live in `recurrence.ts`. Gate 1 covers the DB path. |
| R3 | **Midnight while asleep / app open overnight.** `setTimeout` fires late after wake; `unlock`/`resume` listeners re-run; `last_routine_day` makes double runs harmless. | 0.5. |
| R4 | **DST.** `seed.ts:208` and `sessions.ts:102` use `+ n*86400`; all new code uses `addDays`. | 0.1 tests; seed left as is (dev only). |
| R5 | **Packaged build has an empty `risk_factor_catalog`** (roadmap item 8). The routine handles an empty `risk_factors` table. | Note only; item 8 stays. |
| R6 | **Notification click** in dev is attributed to "Electron"; Focus Assist may drop toasts; click only reaches us while the app runs. | Gate 1 verifies in dev; packaged behaviour deferred with SAC (V4). |
| R7 | **`text-box-trim`** shipped in Chromium 133; Electron 39 = Chromium 142. *Unverified at runtime.* | Gate 0 eyeballs the title against `splash.html` in Edge. |
| R8 | **Removing `'session'`**: `App.tsx:97`, `Sidebar.tsx:22,38`, `Session.tsx`. Nothing else (grep). | 0.10. |
| R9 | **`tasks.create` not transactional today** (`tasks.ts:122–152`). | Wrapped in 0.4. |
| R10 | **Carried originals in old weeks** stay incomplete; previous-week views show "Carried to Oct 13" so it does not read as a miss. | Agent C copy. |
| R11 | **Projected rows have no id**; any renderer code that keys on `task.id` must fall back to `date + parentTaskId`. | Agents A/C. |
| R12 | **Deleting a series** keeps completed days and removes unfinished ones from today (A5); the dialog says so, and offers "Stop repeating" to keep this week intact. | Agent A copy; `remove()` in 0.4. |

## Suggested sub-steps the roadmap doesn't name

`shared/dates.ts` + `recurrence.ts` with tests (0.1–0.2); `ownTransaction` runner mode + indexes on `tasks` + completion backfill (0.3); `listDailyRange` with projection, `get`, `update`, `remove`, step add/remove, `generateWeek` (0.4); `last_routine_day` + `push:dayChanged` (0.5); reminder scheduler + `notify` onClick + `push:openTask` (0.6); `getDayBreakdown` / `getMonth` / DST-safe bucketing (0.7); `RangeNav` + `TaskDialog` props stub (0.10); delete the Session screen and `Placeholder` (0.10); seed + `inspect-db` (0.12); docs sync (Phase 2).

## Verification summary

| Check | How |
|---|---|
| Unit | `npm test` — dates (DST, month weeks), recurrence (targets, generate days, projection, carry filter), classifier, threshold |
| Static | `npm run typecheck && npm run lint` (zero warnings) |
| Migration | `inspect-db`: `user_version 7`, rebuilt `tasks` with new columns and five indexes, ids preserved (seed steps still attached), backfilled daily completion; fresh DB boots |
| Routine | `last_routine_day` set; carry / Monday carry / risk-factor series via the Gate 1 recipes; second launch same day adds no rows |
| Dialog | Create/edit/delete; no-category save; repeat Daily/Weekly/Custom + end date produce the right days; steps persist |
| Completion | Daily tick → weekly `n/target`; target reached → weekly done; target-1 weekly tick mirrors its daily |
| Reminder | Toast at the set minute; click → Calendar week, task highlighted |
| Calendar | Three views, arrows, year in every header; projected rows next week; week columns match Home for today |
| Trends | Today totals = Home tile; lists ranked; week/month arrows; no "Current session" anywhere |
| Splash | No clipping at 1100×700 content size; roll completes; title position matches `splash.html` |

**Could not verify in plan mode:** R2 (vitest + better-sqlite3 under the Electron ABI) and R7 (`text-box-trim` rendering).

---

## Gate 1 feedback (2026-10-13) — decisions that amend the above

| # | Change (Ben) | Where it landed |
|---|---|---|
| G1-1 | **Deleting a single-entry daily deletes its weekly mirror** when no other day is left, plus the rows it was carried from (so the routine can't carry it again). Amends A5 ("Deleting a daily from Home deletes only that row"). | `tasks.remove` → `removeDailies` / `carryOrigins` / `tidyMirror` |
| G1-2 | **A carried-onward original is neither open nor done** for its weekly: ticking today's copy completes the weekly even though yesterday's original is still unticked. (Root cause of "weekly list doesn't sync".) | `recomputeWeekly` (`NOT_CARRIED`), `toggleComplete` mirror |
| G1-3 | **Stop repeating = the series becomes a one-off task**: unfinished days after today are removed, today's and ticked days stay, `repeat_days = 0`, earlier chain rows close at their own Sunday. Replaces A5's "repeat_until = this Sunday". In the dialog it is the Repeat switch turned off + Save; in the weekly list the inline action. | `tasks.update` → `stopRepeating`; TaskDialog, WeeklyList, WeekView |
| G1-4 | **No "Weekly" repeat preset** (same control as Custom). Daily / Custom only. | RepeatPicker |
| G1-5 | **Dialog: "Date" → "Due date", with "Created on mm/dd/yy" under it.** New `tasks.created_at` (migration v8; copies / generated days keep their source's; existing rows backfilled from their date / week). | db.ts v8, tasks.ts, types.ts `TaskDetail.createdAt`, seed.ts |
| G1-6 | **Trends → Today: the three ranked lists are side-by-side columns** (Productive · Unproductive · Not sure). | Trends.tsx |
| G1-7 | **Weekly list: "+ Repeating" button removed** (repeat is set inside the dialog). | WeeklyList |

### Gate 1 round 2 (2026-10-13)

| # | Change (Ben) | Where it landed |
|---|---|---|
| G1-8 | **Due date editable everywhere except a series day.** A single-entry weekly that has a day opens as that day (`tasks.get` returns the daily: one dialog, the day's steps, Delete removes both); a single-entry weekly with no day shows an empty due date and saving one schedules it (`addToDaily`, due time carried); a series' due date is its start and moving it re-bases the series (prune + regenerate, clamped to today like create). A series day's date comes from its repeat rule and stays locked, with the reason shown in the dialog. Repeat switched on for a one-off day turns its weekly into a series from that day (keeps the weekly-list capability the redirect would have lost). | `tasks.get` / `update` (`liveDaily`, `moveDaily`, `firstOccurrence`), `addToDaily`, TaskDialog |
| G1-9 | **"Stop repeating" only on a series with days still to come** (`repeat_until` null or after today). A series "Delete series" left with its ticked days has nothing to stop. | WeeklyList `stoppable` |
| G1-10 | **Reappearing tasks explained, not a bug:** resetting `last_routine_day` re-ran the Monday weekly carry (D5) on the June/September weeklies whose copies had been deleted before G1-1 landed (the old delete left origins behind). Post-G1-1 deletes take origins with them, so deleting the copies once is enough. Weekly-only rows ("Call the dentist", …) are D5 carries of weeklies that never had a day. | — |

### Gate 1 round 3 (2026-10-13)

| # | Change (Ben) | Where it landed |
|---|---|---|
| G1-11 | **Due date editable on any task not yet done; a finished task keeps its date.** Replaces G1-8's series-day lock: moving a day of a series leaves the old row as a superseded slot (the carry mechanism: copy with `carried_from`, old row neither generated again nor counted) and the copy is the live day; steps and reminder move with it; the Calendar / Home show "→ moved to …" on the slot, which is not tickable. A moved day survives later series edits (`pruneSeriesRow` skips `carried_from` rows). | `tasks.update` → `moveSeriesDay`; TaskDialog `dateLocked = completed`; TaskRow, WeekView |
| G1-12 | **A single-entry task has one day.** "Add to a day" shows only for an open task with no day (`WeeklyTask.scheduled`), and `addToDaily` refuses a second day; the day is moved from the dialog instead. | `tasks.addToDaily`, `listWeekly`, WeeklyList |
| G1-13 | **Delete series keeps only ticked days, as a plain done task; nothing ticked = the whole series goes.** Every unfinished day of the chain is removed whatever its date; a week's row left with ticked days gets `repeat_days 0`, `repeat_until NULL`, `carried_from NULL` (no "N of M", no repeat icon, date locked because done). Replaces A5's "ends the series on its last day". | `tasks.removeSeries`; TaskDialog delete copy |

---

# Appearance pass before Phase 2 (2026-10-14)

## Context

Gate 1 is approved and committed (`0866eda`). Before Phase 2 (code review, cleanup, docs, build,
PR) Ben wants three appearance changes: bigger Calendar Week / Month views with a centered range
header; Productivity Trends showing productive vs total time with bigger charts and ranked lists
on every tab; and the splash restored to the approved `design_system/brand/splash.html` by a
method that can be verified on screen rather than re-typed from memory. Renderer-only parts
hot-reload; the Trends ranked lists and the splash touch the main process (restart).

### Decisions (Ben, 2026-10-14)

| # | Decision |
|---|---|
| AP1 | Calendar Week and Month views get much bigger; the page keeps a margin at the window edges (not full width). Day view stays its current size. Week view: the day columns get the extra width; the weekly list card keeps its 300 px width and is centered beside the calendar. |
| AP2 | On all three Calendar views the ‹ › arrows, the range label and the Today button are centered over the calendar. |
| AP3 | Trends Today / This week / This month and Home's "This session" tile show productive and total time side by side, both labeled. |
| AP4 | Week and Month charts: taller card so bars are visible; wider bars. |
| AP5 | The value under each bar (today: whole hours of total time, unlabeled) becomes `productive / total`, both as "Xh Ym", with the pair labeled in the card. |
| AP6 | This week and This month get the same three ranked lists (apps / sites by minutes) as Today, over their range. |
| AP7 | Splash: load the design file itself as a second renderer page instead of a hand-ported React copy; verify by screenshotting the running Electron window against the design file in Edge. |

### Assumptions (flag if wrong)

- **A11** "Centered with the calendar" (AP1) = the weekly list card is vertically centered beside
  the taller day grid (`items-center` instead of `items-start`); the block as a whole already sits
  centered in the page.
- **A12** Layout numbers: Calendar container `max-w-[1100px]` → `max-w-[1480px]` (keeps the `px-12`
  margins); day columns `min-h-[320px]` → `min-h-[560px]` with 13 px row titles; Month cells
  `h-[84px]` → `h-[124px]`. Day view is wrapped at its current rendered width (`max-w-[1004px]`,
  centered). Trends stays 920 px wide; chart `BARWRAP_HEIGHT` 168 → 300, `MAX_BAR` 150 → 280, bar
  width 18 → 36 px.
- **A13** "Total" = all tracked minutes in the range (productive + unproductive + not-sure), which
  `SessionTotals` / `TrendDay` / `TrendWeek` already carry.
- **A14** The splash page keeps the design file's HTML and CSS verbatim except: the `../styles.css`
  link becomes a module script that loads the renderer's token CSS and fonts; the image path
  points at the renderer's copy; the CSP meta from `index.html` is added; a 3.23 s timer calls
  `window.api.app.splashDone()`.

## Calendar (renderer only; hot-reloads)

Files: `screens/Calendar.tsx`, `components/calendar/{WeekView,DayView,MonthView}.tsx`.

1. `Calendar.tsx` L144: container `max-w-[1100px]` → `max-w-[1480px]` (A12). Header and tabs stay
   left-aligned. L159–166: wrap `RangeNav` in `flex justify-center` (AP2).
2. `DayView.tsx`: wrap the `TodayCard` in `mx-auto max-w-[1004px]` so it keeps today's size while
   the container widens (AP1).
3. `WeekView.tsx` L69: `items-start` → `items-center` (A11); L118 column `min-h-[320px]` →
   `min-h-[560px]`; row title L201 `text-[12px]` → `text-[13px]`. WeeklyList untouched.
4. `MonthView.tsx` L75: cell `h-[84px]` → `h-[124px]`; date number `text-[14px]` → `text-[15px]`.

## Productivity Trends

### Main process (restart): ranked lists over a range (AP6)

- `repositories/sessions.ts`: `getDayBreakdown(dayStart)` → `getBreakdown(from, to)` (same SQL;
  the only day-specific lines are `from` / `to`). No test references it (checked).
- `shared/types.ts` `MomentumApi.trends`: `getDayBreakdown(dayStart)` → `getBreakdown(from, to):
  Promise<Breakdown>` (DTO `DayBreakdown` renamed `Breakdown`).
- `ipc.ts` L59–61 and `preload/index.ts` L45: channel `trends:getBreakdown(from, to)`.

### Renderer

Files: `screens/Trends.tsx`, `components/session/{TrendsChart,MonthChart,StatBar}.tsx`,
`components/SessionTiles.tsx`.

1. **Totals, labeled (AP3).** New component in `Trends.tsx`, `ProductiveOfTotal({ productive,
   total, size })`: `formatHM(productive)` in ink, then ` / ` and `formatHM(total)` muted, with
   "productive" and "total tracked" under each number (11 px uppercase, the `SessionStatGrid` label
   style). Today card: replaces the lone 44 px number. Week / Month cards: in the card header to
   the right of the title, summing the range's `TrendDay[]` / `TrendWeek[]`. `SessionTiles` "This
   session" tile: `1h 20m / 3h 05m` with caption "productive / total tracked" (`getCurrent()`
   already returns all three classes).
2. **Charts (AP4, AP5).** `TrendsChart` / `MonthChart`: `BARWRAP_HEIGHT = 300`, `MAX_BAR = 280`,
   bar `width: 36`; the under-bar label becomes `formatHM(productive)` (ink) + `/ formatHM(total)`
   (muted), `font-data text-[12px] whitespace-nowrap`. Card sub-line: "Under each bar: productive
   / total tracked". `StatBar` vertical track `w-[14px]` → `w-full` (only the two charts use the
   vertical orientation; checked).
3. **Ranked lists on every tab (AP6).** The existing `grid grid-cols-3` of three `BreakdownList`s
   moves into a `Breakdowns({ from, to })` component calling `api.trends.getBreakdown(from, to)`,
   rendered under each tab's card: Today `(dayStart, +1 d)`, Week `(weekStart, +7 d)`, Month
   `(firstWeek, lastWeek + 7 d)` from the same `monthWeeks()` the chart uses.

## Splash (AP7; supersedes D12)

Why the port drifted, found in this exploration: the React copy renders under Tailwind's base
reset and the app stylesheet, and the app ships **static** Newsreader (`@fontsource/newsreader`,
optical size fixed at 16) while the design file gets Google's **variable** Newsreader, whose
`opsz` axis gives the 64 px wordmark its display cut. Neither shows in a CSS diff.

1. **Second renderer page** `src/renderer/splash.html`: the design file verbatim (A14) with
   `<link href="../styles.css">` → `<script type="module" src="/src/splash.ts">`, the image `src`
   → `/src/assets/brand/snowball-new-w.png`, and the `index.html` CSP meta. New
   `src/renderer/src/splash.ts`: imports `@fontsource-variable/newsreader` (new dependency; carries
   `opsz`) and the Hanken Grotesk weights already used, then `./assets/tokens/{colors,typography,
   spacing,base}.css` (no Tailwind), sets `--font-display: 'Newsreader Variable', Georgia, serif`
   for this page, and after 3230 ms calls `window.api.app.splashDone()` (preload is shared, so
   `window.api` exists here; CSP forbids inline scripts, hence the module file).
2. **`electron.vite.config.ts`**: `renderer.build.rollupOptions.input = { index: 'src/renderer/
   index.html', splash: 'src/renderer/splash.html' }`.
3. **`main/index.ts`** `createWindow()`: add `backgroundColor: '#234032'` (no white flash on the
   page switch); load `${ELECTRON_RENDERER_URL}/splash.html` in dev, `../renderer/splash.html`
   packaged. Export `loadApp(win)` (dev URL / packaged `index.html`), called by **`ipc.ts`**
   `app:splashDone` after the resize.
4. **`App.tsx`**: drop `booting`, `finishSplash`, the `Splash` import and the `splashDone` call;
   delete `screens/Splash.tsx`. `types.ts` keeps `app.splashDone` (now called by the splash page).
5. Expect one restart to see it, a second if the font needs a tweak.

## Verification

| Check | How |
|---|---|
| Static | `npm run typecheck && npm run lint` (0 warnings); `npm test`; `npm run test:electron` |
| Calendar | On screen: Week columns fill a ~1380 px page with 48 px gutters, list card 300 px and vertically centered; Month cells 124 px; Day view unchanged; nav centered on all three tabs |
| Trends | Today: labeled productive / total pair equals the Home tile; Week / Month: taller chart, 36 px bars, "Xh Ym / Xh Ym" under each bar; three ranked lists under each card |
| Splash | Lead launches the app (`run` skill) and screenshots the Electron window at ~0.3 s, ~1.6 s and ~3.2 s; opens `design_system/brand/splash.html` in Edge at 1100×700 for the same frames; shows the pairs to Ben before the gate. Then the window grows into Home with no white flash |
| Gate (Ben) | Restart `npm run dev`; walk Calendar Day / Week / Month, Trends three tabs + Home tile, watch the splash cold start twice |

After Ben's approval: commit "Appearance pass: Calendar size + centered nav, Trends totals /
charts / ranked lists, splash as its own page", then Phase 2 as already planned (its docs table
gains: README project structure `splash.html` + `splash.ts`; CLAUDE.md `index.ts` line; D12 note).
