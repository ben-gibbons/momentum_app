> Archived build record (copied 2026-10-06 from the Claude Code plan file). Decisions A1/A6/D1 were revised during the build — see `docs/roadmap.md` V1 items 1–4 and CLAUDE.md for the final state.

# V1 Deferred build plan — items 1–4 (classification, distraction popup, timer notification, Settings)

## Context

`docs/roadmap.md` V1 Deferred lists what separates the current build from a usable V1. Items 1–4 are the
monitoring → intervention loop that is the product's heartbeat: today every poll is recorded as not-sure
(`classify()` stub), the "Feeling distracted?" nudge only opens from the sidebar, the CBT timer ends silently,
and Settings is a placeholder. This plan takes those four items to done in two build phases with review
gates, using one serial foundations agent and then three parallel agents on disjoint files. Items 5–7 are out of
scope for this build (user decision).

### Decisions already made (do not re-open)

| # | Decision |
|---|---|
| D1 | Desktop / no visible window / Momentum's own window in front → recorded as **not-sure** (3). No rename. |
| D2 | Reclassifying a not-sure app/site adds it to the allowed/disallowed list **and rewrites matching past not-sure session rows**. Raw session rows are kept (no pruning). |
| D3 | Threshold crossed → **OS toast + bring window to front + open Nudge** with dynamic copy. |
| D4 | Threshold = **contiguous run** of one classification, fires **once per run**, then a **cooldown** (default 10 min, in Settings). |
| D5 | Nudge actions keep current routing (log overlay / Risk Factors screen). Logs opened from the Nudge get `source='popup'`. Risk-factor recurring-task generation stays deferred to item 5. |
| D6 | Settings ships only functional controls: name, two thresholds, cooldown, strict mode, allowed/disallowed lists, reclassify-not-sure list, multi-window explanation. No break-down/profile controls. |
| D7 | Add **vitest** for main-process pure logic (classifier, threshold detector). Renderer verified manually. |
| D8 | Multi-window rule: classify all visible windows; any unproductive → interval is unproductive. Strict mode: unlisted → unproductive (on) / not-sure (off). |

### Assumptions (flag if wrong)

- **A1 — Detector skips Desktop/Momentum samples.** Per D1 they are *recorded* as not-sure, but they do **not**
  count toward the 5-min not-sure run. Otherwise filling in a 10-minute CBT log inside Momentum fires the
  not-sure popup at minute 5. One-line change in the detector if you want them to count.
- **A2 — App identity = `get-windows` `owner.name`** ("Microsoft Edge", "Visual Studio Code"), case-insensitive.
  Sites = URL hostname minus `www.`, matched at a dot boundary (`youtube.com` matches `m.youtube.com`, and
  `x.com` does **not** match `netflix.com`); the longest matching pattern wins so `music.youtube.com → allowed`
  can override `youtube.com → disallowed`.
- **A3 — Unknown ≠ unlisted.** An Edge window whose URL the sidecar hasn't read yet is not-sure even in strict
  mode (an app rule for "Microsoft Edge" still applies if one exists). Strict mode must not punish sidecar lag.
- **A4 — Front window decides between productive and not-sure;** any visible unproductive window overrides
  (D8). The session row and the Nudge name the winning window.
- **A5 — Cooldown starts at fire time** (main side), not at dismissal. No dismissal IPC, no dangling state if
  the nudge is never closed; the only difference is the seconds the dialog is open.
- **A6 — No seeded rules (revised 2026-09-26).** Both lists start empty. The Settings "Disallowed" add-site
  input shows placeholder text in light grey ("youtube.com, reddit.com, instagram.com, facebook.com, etc.")
  that disappears as the user types (standard `placeholder` + `placeholder:text-faint`). Momentum is never a rule.
- **A7 — "Add to list" and "reclassify" are one operation.** `rules.add` upserts the rule and rewrites matching
  rows that are currently not-sure (D2). `rules.remove` never reverts rows.
- **A8 — Settings autosave** on change/blur. Session manager re-reads settings + rules every poll (two trivial
  queries per 10 s), so there is no cache to invalidate.
- **A9 — `BringWindowToTop` is not the right call.** It only reorders z-order; it doesn't activate a window, and
  it, `SetForegroundWindow`, and Electron's `win.focus()` are all subject to Windows' foreground lock (a
  background process may only get a taskbar flash). The topmost band (`setAlwaysOnTop`) is **not** subject to
  the lock, so the sequence `restore → show → setAlwaysOnTop(true) → focus → setAlwaysOnTop(false) →
  flashFrame(true)` guarantees the window is visually in front even when keyboard focus is denied. Verified by a
  spike first thing in Phase 1. koffi fallback (`SetForegroundWindow` with `win.getNativeWindowHandle()`, user32
  already loaded in `read_window.ts`) stays as a documented Plan B comment, not shipped code.

---

## Dependency graph

```
Phase 0  Foundations + full IPC surface + classifier + rules repo   (ONE agent, serial)
            │
            ├──────────────────────┬──────────────────────────┐
            ▼                      ▼                          ▼
Phase 1  Agent A (main)        Agent B (renderer)         Agent C (renderer)
         session-manager       Nudge dynamic copy         Settings screen
         threshold detector    push subscription          Switch / RuleListEditor /
         fire path             source='popup'             NotSureList
                               Timer → notify (item 3)
            │                      │                          │
            └──────────────────────┴──────────────────────────┘
                                   ▼
Phase 2  Lead: end-to-end QA, /code-review, docs + roadmap update
```

Hard dependencies:
- Item 2 needs the push channel, `getMainWindow()`, `notify()`, and real classifications (all Phase 0/1A).
- Item 4's list editor and reclassify list need `rules.*` IPC; its threshold fields need `settings.getAll()` (Phase 0).
- Item 3 needs only `notify()` + `app:notify` (Phase 0); it rides with Agent B because both edit `ProcrastinationLog.tsx`.
- Item 2d's "recurring task with risk-factor category" is deferred to item 5 (D5); add a roadmap note.
- Rule: every IPC-surface change (`src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/types.ts`) lands in
  Phase 0, so no two Phase 1 agents ever touch those files.

---

## Phase 0 — Foundations, IPC surface, classifier, rules (one agent, serial)

1. **Schema migrations** — `src/main/db.ts`
   - `initSchema()` is frozen as the v0 baseline. After it, `migrate(db)` runs `MIGRATIONS: ((db) => void)[]`
     gated by `PRAGMA user_version`, each step in a transaction, then bumps the version. Fresh and existing
     DBs take the identical path. Never add columns to the baseline `CREATE TABLE`s.
   - Migration 1:
     ```sql
     CREATE TABLE IF NOT EXISTS classification_rules (
       id             INTEGER PRIMARY KEY,
       kind           TEXT    NOT NULL CHECK (kind IN ('app', 'site')),
       pattern        TEXT    NOT NULL,   -- lowercase; site = bare hostname, no scheme/path/www.
       classification INTEGER NOT NULL CHECK (classification IN (1, 2)),
       created_at     INTEGER NOT NULL,
       UNIQUE (kind, pattern)
     );
     ALTER TABLE sessions ADD COLUMN host TEXT;   -- lowercase hostname of url, NULL if none
     CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions (start_time);
     ```
     plus `INSERT OR IGNORE` of the A6 defaults and a JS backfill of `host` for existing rows with a url.
   - Why `host`: SQLite has no hostname function; `LIKE '%youtube.com%'` matches `notyoutube.com`. One column
     written at insert makes the retroactive UPDATE and the not-sure `GROUP BY host` exact.
2. **Shared types** — `src/shared/types.ts`
   - `Classification` const/type (1|2|3); replace magic numbers in `repositories/sessions.ts` and `session-manager.ts`.
   - `RuleKind`, `ClassificationRule`, `RuleInput`, `NotSureItem { kind, pattern, minutes, lastSeen }`.
   - `AppSettings { userName, thresholdUnproductive, thresholdNotSure, popupCooldown, strictMode }` (seconds).
   - `DistractionEvent { classification: 2|3; app; url; label; runSeconds }`.
   - `MomentumApi` additions: `rules.{list, add, remove, listNotSure}`, `settings.getAll`, `app.notify(title, body)`,
     `events.onDistraction(cb): () => void`.
3. **Pure classifier** — new `src/main/classifier.ts` + `classifier.test.ts` (imports only `../shared/types`; `import type` for `MonitorData`)
   - `hostOf(url)` (tries `new URL`, then with `https://` prefixed; null for `edge://`, search text, etc.),
     `normalizePattern(kind, raw)`, `classifyWindow(w, rules, strict)`, `classifyPoll(windows, rules, strict) →
     { classification, app, url, host }`.
   - Order in `classifyWindow`: self app (`SELF_APPS = {'momentum','electron'}`) → 3; site rule (longest suffix
     match); app rule (exact, lowercase); Edge with null host → 3; else `strict ? 2 : 3`.
   - `classifyPoll`: empty → `{ 3, 'Desktop' }`; winner priority 2 > 1 > 3, front-most on ties (A4).
   - Tests: scheme-less URLs, `www.`/`m.` subdomains, dot boundary (`x.com` vs `netflix.com`), longest-pattern
     override, case-insensitive app match, strict on/off, Edge+null under strict, self under strict, empty poll,
     multi-window priority + tie-break, `normalizePattern` from a pasted full URL.
4. **Poller fixes** — `src/main/read_window.ts`
   - Null-URL guard: `if (handle != null && url) edgeUrls.set(handle, url)` — the sidecar emits `{"url": null}`
     when the address bar is momentarily unreadable; without the guard one hiccup splits the session and resets
     an unproductive run. Widen `MonitorData.url` to `string | null | undefined` for honesty.
5. **Rules repository** — new `src/main/repositories/classificationRules.ts`
   - `list()`, `remove(id)`, `add(input) → { rule, reclassified }` (normalize; upsert
     `ON CONFLICT(kind, pattern) DO UPDATE SET classification`; then `UPDATE sessions SET classification = ?
     WHERE classification = 3 AND (lower(app) = ? | host = ? OR host LIKE '%.' || ?)`, one transaction).
   - `listNotSure()`: app rows (`host IS NULL`, excluding Desktop/self) UNION site rows grouped by host, minutes
     + last seen, ordered by minutes desc, limit 50.
6. **Typed settings** — `src/main/repositories/settings.ts`: keep `get`/`set`; add `getAll(): AppSettings`
   over `DEFAULTS` (120 / 300 / 600 s, strict off, name '') so packaged builds work with an empty table. New key
   `popup_cooldown`.
7. **Main window + bring-to-front** — new `src/main/window.ts`: `setMainWindow` (called in `index.ts`
   `createWindow()`), `getMainWindow()` (null if destroyed), `bringToFront()` per A9.
8. **Notification helper** — new `src/main/notify.ts`: `notify(title, body)` guarded by
   `Notification.isSupported()`, icon from `resources/icon.png`, click → `bringToFront()`.
9. **IPC + preload** — `src/main/ipc.ts`, `src/preload/index.ts`: `rules:*`, `settings:getAll`, `app:notify`
   (validate/clamp strings), and the push listener `events.onDistraction` wrapping `ipcRenderer.on('push:distraction')`
   with an unsubscribe. Push channels are prefixed `push:`.
10. **vitest** — `npm i -D vitest`; `"test": "vitest run"`; tests colocated `src/main/*.test.ts`, explicit
    `import { describe, it, expect } from 'vitest'` (no globals → no tsconfig change; `tsconfig.node.json`
    already covers `src/main/**`). electron-vite bundles only what `index.ts` imports, so tests never reach `out/`.
11. **Small tidy-ups that keep Phase 1 files disjoint**: `seed.ts` not-sure fixture rows use app `Desktop`
    (so dev's reclassify list isn't full of "Seed"); `eslint.config.mjs` comment no longer cites the deleted
    `classify(_app,_url)` stub (keep the rule); stub `screens/Settings.tsx` (heading only) and the `App.tsx`
    route swap so Agent C never edits `App.tsx`.

**Gate 0:** `npm run typecheck && npm run lint && npm test` pass; `npm run dev` boots; in
`%APPDATA%\momentum_app\momentum.db`: `PRAGMA user_version = 1`, 9 rows in `classification_rules`,
`sessions.host` exists; UI unchanged (still all not-sure). Fresh-DB launch (move the dev DB aside) also boots.
`/code-review` on the diff.

---

## Phase 1 — three parallel agents, disjoint files

### Agent A — main process: classification takes effect + distraction detector (items 1, 2 main side)

Files: `src/main/session-manager.ts`, new `src/main/threshold.ts` + `threshold.test.ts`, new
`src/main/distraction.ts`, `src/main/index.ts` (one line). Reads `classifier.ts`; does not edit it.

1. **Spike first (A9):** with thresholds set to 0.2 min via DevTools `api.settings.set`, hard-code a fire →
   confirm toast + window comes forward. If it only flashes, add the koffi fallback in `window.ts` before continuing.
2. **Pure detector** — `threshold.ts`: `initialState(now)`, `step(state, classification, now, cfg) → { state,
   fire }`. New run on class change; fire when `c ∈ {2,3}`, `!firedForRun`, `now ≥ cooldownUntil`, and
   `now − runStart ≥ threshold(c)`; then `firedForRun = true`, `cooldownUntil = now + cooldownSecs` (A5).
   Samples for `Desktop`/self apps do not accrue (A1).
   Tests: fires once at threshold; not-sure uses its own threshold; productive never fires; 2→1→2 restarts the
   clock; cooldown suppresses and carries across runs; changed thresholds honored on the next step; A1 skip.
3. **Session manager rewrite** — delete the stub; `ActiveSession` gains `host` + `classification`; identity =
   `(app, url, classification)` so a rule edit self-heals at the next poll; empty poll opens a `Desktop`
   not-sure session (D1); per poll: `settings.getAll()` + `rules.list()` → `classifyPoll` → open/close →
   `step(...)` → `onDistraction(event)` callback. No `electron` imports here.
   `startSessionManager({ onDistraction })`.
4. **Fire path** — `distraction.ts` `handleDistraction(e)`: `webContents.send('push:distraction', e)` first (so
   the nudge is visible when the window arrives) → `bringToFront()` → `notify('Feeling distracted?', …)`.
   `label` = host minus `www.` for sites, app name otherwise. `index.ts`: `startSessionManager({ onDistraction: handleDistraction })`.

### Agent B — renderer: Nudge wiring + `source='popup'` + timer notification (items 2 renderer, 3)

Files: `src/renderer/src/App.tsx`, `components/Nudge.tsx`, `screens/ProcrastinationLog.tsx`,
`components/log/Timer.tsx` (header comment only), `lib/format.ts`.

1. `App.tsx`: `distraction` state + `useEffect(() => api.events.onDistraction(e => { setDistraction(e);
   setNudgeOpen(true) }), [])`; sidebar open sets `distraction = null`; primary action → `openLog({ source: 'popup' })`.
2. `Nudge.tsx`: `NudgeProps.distraction?: DistractionEvent | null`. Copy — unproductive: "You've been on {label}
   for {run}. Let's take a look — no pressure."; not-sure: "You've been on {label} for {run} and we're not sure it's
   on task. Want to check in?"; manual: "Let's take a look at what's pulling at you — no pressure."
   `formatRun` in `lib/format.ts` (< 90 s → "a minute", else "{n} minutes").
3. `ProcrastinationLog.tsx`: `source?: LogSource` prop threaded to `toLogInput` (~L505):
   `seedRiskFactor ? 'risk_factor' : source ?? 'manual'`. `LogFlowState` in `App.tsx` gains `source`.
4. Item 3: `<Timer onComplete={() => api.app.notify("Time's up", 'Your ten-minute step is done. How did it go?')} />`
   (~L404). Update `Timer.tsx` header comment. (Known, out of scope: leaving step 4 unmounts the timer.)

### Agent C — renderer: Settings screen (item 4)

Files: `src/renderer/src/screens/Settings.tsx` (replacing the Phase 0 stub), new `components/settings/{Switch,RuleListEditor,NotSureList}.tsx`.
Reuses `TextField` / `NumberField` from `components/log/fields.tsx` unmodified; card + header idiom from `screens/Session.tsx`.

1. Load `settings.getAll` / `rules.list` / `rules.listNotSure` via `useAsync`; render a form initialised from the
   loaded values (the ProcrastinationLog "load then lazy-init" pattern). Every control persists on change/blur
   then `reload()` (A8). Minutes ↔ seconds conversion at the edge; fractional minutes allowed (handy for testing).
2. Sections: **You** (name) · **Distraction popup** (unproductive, not-sure, cooldown minutes) · **Strict mode**
   (Switch + "Apps and sites on neither list count as unproductive instead of not-sure.") · **Allowed** /
   **Disallowed** (`RuleListEditor`: kind pill + pattern + remove; inline-add row with App/Site select + input,
   Enter adds, Escape cancels — the `TodayCard`/`RiskFactors` pattern; the Disallowed site input's placeholder
   is "youtube.com, reddit.com, instagram.com, facebook.com, etc." in `text-faint`, Allowed's is
   "e.g. github.com, docs.google.com"; app inputs say "e.g. Visual Studio Code") · **Not sure yet** (`NotSureList`: rows
   "youtube.com · 1h 12m · last seen …" with Productive / Unproductive buttons → `rules.add`; empty state
   "Nothing to sort yet.") · **How multiple windows are counted** (static copy below).
3. `Switch.tsx`: port of the design-system `Switch` (`design_system/_ds_bundle.js` ~L984–1035), Tailwind
   `peer-checked:` track/thumb, `role="switch"`.
4. Multi-window copy: "When more than one window is visible — a split screen or a second monitor — Momentum
   looks at all of them. If any visible window is on the disallowed list, the whole interval counts as
   unproductive, even if you're also working in an allowed app. Otherwise the front window decides: allowed →
   productive, on neither list → not-sure. Minimized and fully covered windows don't count, and Momentum's own
   window is always not-sure."

**Gate 1 (end-to-end, `npm run dev`, thresholds 0.2 min set in Settings):** typecheck/lint/test green; YouTube in
Edge → toast, Momentum comes forward, nudge reads "youtube.com … a minute"; "Try a procrastination log" → Logs
list shows the popup source; stay on YouTube → no re-fire; switch away and back → no re-fire inside cooldown,
re-fires after; Session screen unproductive minutes grow; Settings → Not sure yet → mark VS Code Productive →
Session totals shift and it appears in Allowed; strict mode on → an unlisted app turns unproductive at the next
poll; timer (temporarily lower `TOTAL_SECONDS`) → toast, click brings window forward; only desktop visible →
`Desktop` not-sure row and no nudge (A1). `/code-review high` on each agent's diff.

---

## Phase 2 — Lead integration

- `/code-review high` on the whole branch, `/simplify` pass, `npm run build` (typecheck + bundle; runtime stays
  on `npm run dev` while Smart App Control blocks the exe).
- Docs: `CLAUDE.md` Un-closed Code (drop the classify, Timer, Nudge, Settings-placeholder entries; keep
  Calendar placeholder and the risk_factors orphan rows); `docs/database-overview.md` (rules table, `host`,
  index, migrations, "classify all visible windows" instead of "picks the front-most"); `electron_app/README.md`
  (structure, `npm test`, known stubs); `docs/full-stack-overview.md` What's-Not-Built table; `docs/roadmap.md`
  items 1–4 ticked, with 2d's recurring-task sub-step moved under item 5.

---

## Agent strategy

- Phase 0: one `general-purpose` agent (or a fork carrying this plan) with the full brief; lead gates it.
- Phase 1: three `general-purpose` agents launched in one message, same working tree, **file ownership lists
  above are exclusive**. Each brief includes the decisions table, assumptions, its file list, its gate checks,
  and CLAUDE.md's header-comment + surgical-change rules. Agent A starts with the focus spike and reports the
  result before building on it.
- `Explore` agents only for verification sweeps (e.g. "any remaining magic-number classifications?").
- **Gate process (user decision: approve each gate).** At Gate 0 and Gate 1 the lead runs the automated checks
  (`typecheck`, `lint`, `test`, `/code-review`, `npm run dev` boot), then hands the user a short manual checklist
  for the on-desktop checks (toast, bring-to-front, nudge copy, Settings persistence). The next phase's agents
  launch only after the user confirms. The Phase 1A focus spike is reported to the user as soon as it runs.
- **Why `setAlwaysOnTop` works despite the foreground lock:** Windows restricts *activation* (keyboard focus via
  `SetForegroundWindow`), not *z-order*. `setAlwaysOnTop(true)` is `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)`,
  which any process may call, so the window is visibly on top without being activated. Focus may stay in the
  previous app (Escape won't dismiss the nudge until the user clicks it); `flashFrame` covers that case.

---

## Roadblocks to address before starting

1. **No migration mechanism** — fixed in Phase 0.1; until then new tables are invisible to existing DBs. If a
   migration throws, `user_version` stays 0 and every launch fails; recovery in dev is deleting
   `%APPDATA%\momentum_app\momentum.db` (fixtures regenerate). Make `getDb()` rethrow with the DB path.
2. **Windows foreground lock** (A9) — bring-to-front may only flash the taskbar; Escape won't reach the nudge
   until the user clicks. Phase 1A starts with the spike.
3. **Notifications in dev** — `setAppUserModelId` in dev resolves to `process.execPath`, so toasts appear but
   are attributed to "Electron"; Focus Assist can silently drop them; packaged behaviour can't be verified
   until SAC is solved. `Notification.isSupported()` guard prevents crashes.
4. **Sidecar null URLs / lag** — handled by the Phase 0.4 guard; the first poll after opening Edge still yields
   a short url-less not-sure row (already documented in `database-overview.md`).
5. **Self-app names** — `Electron` (dev) vs `Momentum` (packaged) both hard-coded; verify in the dev console.
6. **Static reference seeds are dev-only** (pre-existing, not in items 1–4): distortions, risk-factor catalog,
   and settings rows are only seeded by `seed.ts`. Settings is unaffected thanks to `getAll` defaults, but a
   packaged build has an empty distortion list in the log flow. Recommend a follow-up roadmap item: move static
   seeds into a migration.
7. **`/good-morning` is due** (`.claude/last-good-morning.txt` says 2026-06-28); plan mode blocked writing it.
   Run it when implementation starts.
8. **Roadmap dates are stale** ("due 6/28"); refresh when ticking items.

## Suggested additional sub-steps (not in the roadmap text)

- Migrations + `sessions.host` + `start_time` index (0.1); shared `Classification` constants (0.2); null-URL
  guard (0.4); typed `settings.getAll` with defaults (0.6); push channel (0.9); vitest (0.10).
- `self` window handling so Momentum in front is not-sure even under strict mode (0.3).
- `rules.listNotSure` query — item 1c's reclassify UI needs it; roadmap doesn't name it (0.5).
- Focus spike before building on bring-to-front (1A.1).
- `popup_cooldown` setting from D4, surfaced in Settings.
- Docs sync in Phase 2.

## Verification summary

| Check | How |
|---|---|
| Unit | `npm test` — classifier + threshold detector |
| Static | `npm run typecheck && npm run lint` |
| Migration | `PRAGMA user_version = 1`, rules seeded, `sessions.host` present; fresh DB also boots |
| Classification | Session screen shows all three classes after browsing listed/unlisted apps |
| Reclassify | Not-sure minutes move after marking in Settings; rule appears in the right list |
| Popup | 0.2-min thresholds → toast, window forward, Nudge names the site; once per run; cooldown respected |
| Timer | Timer end → toast; click focuses Momentum |
| Settings | Values persist across restart; strict mode takes effect at the next poll |
