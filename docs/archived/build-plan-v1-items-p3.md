# V1 Deferred build plan — P3: every remaining V1 item (paste this into a new session)

**For the new session.** Read `CLAUDE.md` first. This plan was interviewed and approved by Ben on
2026-10-27 in the previous session; do not re-interview or re-present it. Branch `v1-deferred-p3`
already exists, is checked out and pushed, and starts at `1d770aa` (item 17 ticked). The archived
copy of this plan, `docs/archived/build-plan-v1-items-p3.md`, is uncommitted and rides along with
the first commit. Working rules carried over from P1/P2:

- Ben approves each gate himself with on-desktop checks; commit only at a gate or on his say-so.
  Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; the PR body
  ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Skip `/good-morning` and never write `.claude/last-good-morning.txt`. When Ben says **stop**,
  stop immediately. Plain-language, feature-first explanations. Any later small fix list gets its
  own short plan, never this file re-presented.
- Main-process changes need a `npm run dev` restart; say so each time. Renderer hot-reloads.
- Bash heredocs with quotes/backticks fail in this shell: write patch scripts to the scratchpad
  and run `python -I <file>`; `npx eslint --fix` for prettier. Dev DB: `%APPDATA%\momentum_app\momentum.db`
  (`timeout 60 npx electron scripts/inspect-db.mjs` from `electron_app/`). Packaged DB: `%APPDATA%\Momentum`.
- `/code-review high` on each phase's diff before its commit; `npm run typecheck && npm run lint`
  (0 warnings), `npm test`, `npm run test:electron`, `npm run build` must be green at every gate.

## Context

V1 Deferred items 1–7 and 17 are done (P1: items 1–4, 2026-10-06; P2: items 5–7, merged as PR #3
on 2026-10-26). This phase closes the V1 Deferred section: the two DECIDE items under item 1, the
packaged-build seed gap under item 8, the log flow rebuild (9), eyebrow cleanup (11), Home links
(12), the exe check (14), the polling verification (15), `npm audit` (16), the security / edge-case
audit (18) and the splash version note (19). Items 10, 13 and the item-4 note are dropped from the
build, not completed (see "Roadmap bookkeeping"). After this phase V1 Deferred has no open boxes
and work moves to V2.

### Decisions (Ben, 2026-10-27 — do not re-open)

| # | Decision |
|---|---|
| P3-1 | **Default Productive list** = the current placeholders **plus Outlook, Teams, Slack, Zoom (apps) and linkedin.com (site)**. Unproductive list unchanged. Added by a migration so existing databases get them. "Momentum App" stays on the list: its time counts as productive and it never nudges (CLAUDE.md Not-Sure scope). |
| P3-2 | **Settings copy.** Productive caption gains a second sentence: *"Make sure these items are strictly tools/websites you use for completing your work. For example, while Spotify can help your focus, it does not belong here because your presentation is completed in PowerPoint."* Unproductive caption gains: *"These apps/sites actively take you away from your work."* The "How multiple windows are counted" paragraph is unchanged. Both DECIDE items are then ticked. |
| P3-3 | **Static reference data ships by migration.** `distortions` (10) and `risk_factor_catalog` (9) move out of the dev-only seed into a migration step, so a fresh packaged install has them. |
| P3-4 | **Log flow becomes four steps, no intro.** Full spec under Agent A below. Step 5 (Takeaways) is removed; the stepper reads "N of 4". |
| P3-5 | **Logs review = task text in the list + a read-only detail view** with an Edit button that opens the flow. In the detail view the per-step **actual time** boxes are always editable. |
| P3-6 | **Eyebrows:** remove all five page eyebrows (Logs, Trends, Settings, Risk Factors, Calendar). Keep the Home date line, the log step labels, and the splash eyebrow. Caption edits: Logs → "…Click one to revisit it."; Trends → "Honest numbers, notice the patterns."; Settings caption may span the card width (it wraps too early). |
| P3-7 | **Home links:** the top-right "Xh Ym focused today" pill opens Trends → Today (like the "This session" tile). The "Toward a break" card stays non-clickable in V1; a note under roadmap V2 #1 (Pomodoro) says it should open the Pomodoro timer page. |
| P3-8 | **Item 14 (exe):** one `npm run build:unpack` + launch attempt, result recorded on the roadmap either way. No signing, no installer work (V4). |
| P3-9 | **Item 16:** `npm audit fix` without `--force`, then the full check suite; what remains is recorded. **New roadmap V2 #13: upgrade Electron to the current major (native-module rebuild).** |
| P3-10 | **Item 18 = audit pass + fix what it finds** (security review and crash / edge-case review across main, preload, renderer, sidecar), with tests where the code is pure. |
| P3-11 | **Splash version note:** small muted "v1.0" in the bottom-right corner of the splash card, value injected from `package.json` `version` at build time. Edited in `design_system/brand/splash.html` and re-copied (CLAUDE.md rule). |
| P3-12 | **Items 10 and 13 and the item-4 "deliberately omitted" note are dropped from the build.** Roadmap mark: `- [-] … — dropped from build 2026-10-27 (reason)`. Markdown has no colour; a plain `[-]` box is the convention. |

### Assumptions (flag if wrong)

- **A1** Step-3 reveals are *sticky*: once a field has appeared it stays visible even if an earlier
  field is cleared; Continue re-checks every condition. Editing an existing log shows every field.
- **A2** Step-4 optional cards left blank are not saved; a saved log always has ≥ 1 step.
- **A3** Removing sliders / Takeaways needs no migration: `predicted_difficulty`,
  `predicted_satisfaction`, `actual_difficulty`, `actual_satisfaction` (`log_steps`) and
  `takeaways` (`procrastination_logs`) stay in the schema, are written as NULL by the new flow, and
  are shown in the detail view only when non-null (old logs). Listed under CLAUDE.md Un-closed Code.
- **A4** `logs.update()` deletes and re-inserts `log_steps` (`repositories/logs.ts:191`), so the
  detail view's actual-time edits save by sending the whole loaded log back through
  `api.logs.update` — no new IPC channel.
- **A5** App rules match the owner name exactly, lowercased (`classifier.ts:106`), so the new
  Productive entries need the names Windows reports. Starting set: `outlook`, `microsoft outlook`,
  `microsoft teams`, `slack`, `zoom`; verified at Gate 0 by opening each app and reading Settings →
  "Not sure yet" (any name that shows up there is added / corrected before the commit).
- **A6** The step-4 timer is started on step 4, after step 1 is required, so its label can be the
  step-1 task text at start time; no relabel on later edits.
- **A7** `sandbox: false` in `index.ts` stays unless the audit finds the preload works with it on;
  `shell.openExternal` gets an `https:`/`mailto:` allow-list.

---

## Dependency graph

```
Phase 0  lead, serial (main process + shared + small renderer wiring; one restart)
         migration v9 (static seeds) + v10 (Productive additions) → seed.ts trimmed
         → Settings captions (P3-2) → splash version (P3-11) → Hero pill → Trends (P3-7)
         → CLAUDE.md Un-closed Code entry for the unused log columns
            │
            ├──────────────────────────┐
            ▼                          ▼
Phase 1  Agent A                   Agent B (small; lead may do it)
         log flow rebuild +        eyebrows + captions + Settings
         Logs list / detail        caption width
            │                          │
            └──────────────────────────┘
                          ▼
Phase 2  lead: npm audit fix (16) → security + edge-case audit and fixes (18)
         → packaged build attempt (14) → Ben's polling checklist (15)
         → docs + roadmap → PR v1-deferred-p3 → main
```

Agent A and Agent B touch disjoint files (A: `screens/ProcrastinationLog.tsx`, `screens/Logs.tsx`,
`components/log/*`, new `components/log/LogDetail.tsx`, `App.tsx` only for the detail route; B:
`screens/{Trends,Settings,RiskFactors,Calendar}.tsx` headers and `screens/Logs.tsx` **caption line
only** — give that one line to A instead if both run at once).

---

## Phase 0 — foundations (lead, serial; restart once)

### 0.1 Migrations — `src/main/db.ts` (append to `MIGRATIONS`; never edit shipped steps)

- **v8 → v9, static reference seeds (P3-3).** Move the `RISK_FACTOR_CATALOG` and `DISTORTIONS`
  arrays from `seed.ts` to `db.ts`. `risk_factor_catalog.label` is UNIQUE → `INSERT OR IGNORE`.
  `distortions.label` is not → insert only if `SELECT COUNT(*) FROM distortions` is 0 (the dev DB
  already has them from the seed; a packaged DB is empty). `seed.ts` stops inserting both tables
  (otherwise it double-inserts distortions on a fresh dev DB).
- **v9 → v10, Productive additions (P3-1).** Same shape as migration 5: `INSERT OR IGNORE INTO
  classification_rules (kind, pattern, classification, created_at)` for the A5 app names and
  `('site', 'linkedin.com', 1)`. Append the same entries to `DEFAULT_PRODUCTIVE` so a fresh DB gets
  them from migration 3 too (duplicates are ignored). Update the comment that calls the lists
  "PLACEHOLDER CONTENTS" — they are the V1 defaults now.
- `db.test.ts`: expected `user_version` → 10; one test that a fresh in-memory DB has 10
  distortions, 9 catalog rows and the LinkedIn rule.

### 0.2 Settings copy (P3-2) — `src/renderer/src/screens/Settings.tsx:159` and `:170`

Append the two sentences verbatim. Also widen the header caption (`max-w-[540px]` → none; the
container is already 800 px) — this is the Settings part of P3-6, done here because the file is
open.

### 0.3 Splash version (P3-11)

- `electron.vite.config.ts` renderer: `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`
  (read `package.json`); declare it in `src/renderer/src/env.d.ts`.
- `design_system/brand/splash.html`: add `<div class="v-version">v1.0</div>` inside the card,
  positioned bottom-right (`position:absolute; right:28px; bottom:22px`), `font-family:
  var(--font-data)`, 12 px, same muted colour as `.v-head`. Re-copy to
  `src/renderer/splash.html` (the three known deltas plus this element's text, which
  `splash.ts` sets from `__APP_VERSION__` — that is now the fourth documented delta).
- Verify with the scratchpad capture harness pattern from P2 (bare 1100×700 BrowserWindow,
  `capturePage` at 300 / 1600 / 3200 ms) against the design file.

### 0.4 Home pill → Trends (P3-7)

`components/Hero.tsx`: `onOpenTrends?: () => void`; the pill (`:35–38`) becomes
`role="button"` + `tabIndex` + Enter/Space + hover, mirroring `SessionTiles.tsx:76–86`.
`screens/Home.tsx` threads it; `App.tsx:102` passes the same `() => setView('trends')`.

### 0.5 Un-closed Code — `CLAUDE.md`

Add: "**Unused log columns** — `log_steps.predicted_/actual_difficulty`, `_satisfaction` and
`procrastination_logs.takeaways` stay in the schema; the four-step flow (2026-10-27) writes NULL,
the detail view shows them only for old logs. A V3 journal / reflection feature may reuse them."

**Gate 0 (Ben, restart `npm run dev`):** `inspect-db` shows `user_version 10`; Settings →
Productive lists the new entries; open Outlook / Teams / Slack / Zoom / LinkedIn for a poll each
and confirm none appears under "Not sure yet" (fix A5 names if one does); the two new caption
sentences read right and the Settings caption no longer wraps early; the focused pill opens
Trends → Today; splash shows "v1.0" bottom-right; fresh-DB boot (move the dev DB aside) still
seeds and the log flow's distortion dropdown is populated. `/code-review high`; commit.

---

## Phase 1 — renderer

### Agent A — log flow rebuild + Logs review (P3-4, P3-5)

Files: `screens/ProcrastinationLog.tsx`, `components/log/{fields,Stepper,Timer}.tsx`,
`screens/Logs.tsx`, new `components/log/LogDetail.tsx`, `App.tsx` (detail route only),
`lib/format.ts` if a formatter is needed. Field primitives (`TextField`, `TextAreaField`,
`SliderField`, `SelectField`) are reused as they are; the `label` prop becomes optional.

**Flow (phases `0..3` then `'done'`; the `'intro'` phase is deleted; new and edit both open at
step 0):**

| Step | Heading | Fields | Continue enabled when |
|---|---|---|---|
| 1 | "What are you avoiding right now?" | one text input, **no label above, no date/time line below** (the timestamp is still saved as `created_at` and shown in Logs) | task text non-blank |
| 2 | "Name the emotions underneath it." | one textarea, **no label** | emotion non-blank |
| 3 | "Catch the tempting thought, then reframe it." | progressive reveal, A1: **(a)** tempting-thought textarea + "% belief before" slider (default **0**); **(b)** when (a) has text and slider > 0 → "Cognitive distortion" select appears; **(c)** when a distortion is chosen → "Self-control thought (reframe)" textarea + "% belief in reframe" slider (0) appear; **(d)** when (c) has text and slider > 0 → "% belief in original tempting thought" slider (0; saved to `belief_after`) appears below it | (d)'s slider > 0. Back always enabled |
| 4 | "The first ~3 easiest steps to get started" | **three** step cards by default + "Add a step"; each card = step text, then **predicted minutes and actual minutes on one line**; **no difficulty / satisfaction sliders**; card 1 has no remove button, cards 2+ do; the `<Timer>` sits under the cards and is labelled with the step-1 task text (A6) | card 1 has text (blank optional cards are dropped on save, A2) |
| done | check icon + closing quote once + "Saved to your logs." (**"Go gently." removed**) + "Save and close" | — | — |

- Stepper: `total = 4`; the "Step N · …" eyebrow strings shrink to four.
- Card: keep `max-w-[600px]`; with the labels and intro gone the card sizes to content — remove
  any min-height / spacer that kept the old height ("tighten").
- `toLogInput()`: `takeaways: null`, step difficulty / satisfaction `null`; slider defaults 0.
- Button: a disabled Continue uses the existing disabled button style (`opacity` + `cursor-not-allowed`);
  the last step's button still reads "Finish".

**Logs screen (`screens/Logs.tsx`) + detail:**

- Rows: **task text** as the title (fallback: the timestamp when blank in an old log), the
  timestamp + risk-factor suffix as the sub-line, source pill, "felt {emotion}". `LogListItem`
  already carries `taskText`? — if not, add it to `logs.list()` (`repositories/logs.ts:56`) and
  `types.ts` (Phase 0 lead applies the main/shared change if Agent A reports it).
- Click → `LogDetail` (read-only): task + when, feeling, thought record (thought, % before,
  distortion, reframe, % in reframe, % in original), steps (text, predicted min, **actual min as an
  editable input**, saved on blur / Enter via `api.logs.update(id, …)` with the whole loaded log,
  A4), takeaways only if present (A3). "Edit" button opens the flow (`openLog({ logId })`) at
  step 1; "Back" returns to the list. Route: an `App.tsx` state `openLogId` rendered over Logs, or
  a `selected` state inside `Logs.tsx` — pick the simpler; no new nav item.

### Agent B — eyebrows + captions (P3-6)

Files: `screens/Trends.tsx:292–300`, `screens/RiskFactors.tsx:85–87`, `screens/Calendar.tsx:124–126`,
`screens/Logs.tsx:48–55` (eyebrow + caption line; coordinate with A or hand it to A).
Delete the five eyebrow `div`s (Settings' was done in 0.2); the `h1`'s `mt-[6px]` becomes `mt-0`.
Logs caption: "Every time you worked through the dread. Click one to revisit it." Trends caption:
"Honest numbers, notice the patterns." Keep Hero's date line, the log step labels, the splash
eyebrow, and the non-eyebrow uppercase labels (Sidebar "Reflect", stat labels, day headers).

**Gate 1 (Ben, hot reload):**
- New log: lands on step 1 with no intro; Continue greyed until text; step 2 same; step 3 reveals
  in the (a)→(d) order with 0 % defaults and Continue only after the last slider; step 4 shows three
  cards, card 1 required, minutes on one line, no sliders, timer under the cards; Finish → done
  screen without "Go gently."; stepper says "4 of 4".
- Home Timers tile shows the task text as the timer's name.
- Logs list shows task text; click → read-only detail; change an actual time → persists after
  reopening; Edit → flow at step 1 with values loaded; an old seed log still opens (NULL steps /
  takeaways shown or hidden correctly).
- No eyebrow on Logs / Trends / Settings / Risk Factors / Calendar; captions read as decided.
- `/code-review high` per agent diff; fixes; commit.

---

## Phase 2 — hardening, packaging check, verification, docs, PR (lead)

### 2.1 `npm audit fix` (item 16, P3-9)

From `electron_app/`: `npm audit fix` (no `--force`), then typecheck / lint / test / test:electron
/ build, and `npm run dev` boots (native modules intact). Record what remains (expected: the
Electron advisory and anything needing a major bump) in the roadmap item's sub-bullet; tick 16.

### 2.2 Security + crash / edge-case audit with fixes (item 18, P3-10)

Run `/security-review` on the branch and a `/code-review high` focused on crashes. Check at least:
IPC handlers validate ids / dates / patterns (`ipc.ts`, every `repositories/*` entry point);
`shell.openExternal` allow-list (A7); `sandbox: false` justification; sidecar stdout parsing with
malformed JSON / huge lines; notification click after the window is closed; fresh DB and empty
tables everywhere (Trends, Calendar, Logs, Settings "Not sure yet"); midnight / DST / sleep-wake
(`dayChange.ts`, `reminders.ts`); very long titles / URLs; DB locked or corrupt at open (`db.ts`,
WAL); unhandled promise rejections in `useAsync`; timer store with 50+ timers. Fix real findings in
the same phase (tests for pure modules); list anything deliberately left in the roadmap under V5 #3.
Tick 18 with a one-line summary of what was fixed.

### 2.3 Packaged build attempt (item 14, P3-8)

`npm run build:unpack` from `electron_app/` (expect the `winCodeSign` error unless Developer Mode
is on; the `dist/win-unpacked/` output is still produced). Ben launches `Momentum.exe`. Record on
the roadmap: launched or blocked by Smart App Control, Windows build / SAC mode, and (if it ran)
that the packaged fresh DB has distortions and the catalog (proves P3-3). Tick 14 either way with
the finding; signing stays V4.

### 2.4 Polling verification (item 15 — Ben's on-desktop checklist, lead reviews the log)

With `npm run dev` running, each for at least two polls, reading the `[poll]` / `[session]` lines
and Trends → Today afterwards: two Edge windows side by side (front decides; unproductive anywhere
wins); File Explorer in front of Edge; Edge minimized (not counted); nothing but the desktop
("Desktop" session); second monitor vs laptop-only (a visible unproductive site on the other
monitor counts); Edge YouTube in a half-screen split next to VS Code (unproductive). Fix what
misbehaves; tick 15 with the date.

### 2.5 Docs + roadmap bookkeeping

| File | Change |
|---|---|
| `docs/roadmap.md` | Tick item 1's two DECIDE lines, 8 (+ sub-bullet), 9, 11, 12, 14, 15, 16, 18, 19 with dates and one-line outcomes. Mark `- [-]` "dropped from build 2026-10-27": item 10 (dev-only noise, revisit when packaging — V4), item 13 (write strategy documented in `docs/database-overview.md`, verified by Trends), item 4's "Break-down mode (V3) and profile (V2) controls deliberately omitted" note (deferred to those versions). Under V2 #1 add "- [ ] Home 'Toward a break' card opens the Pomodoro timer page". Add V2 #13 "Upgrade Electron to the current major (native rebuild; clears the Electron audit advisory)". Item 12: note the break card is V2. |
| `CLAUDE.md` | Project Overview "Remaining work" sentence → V1 Deferred complete; Un-closed Code: drop the "Default lists are placeholders" entry, add the unused-log-columns entry (0.5); Splash paragraph: four deltas incl. the version element; migrations v9/v10 mention under Database Schema if the doc lists them. |
| `docs/database-overview.md` | Migrations table rows v9, v10; seeds section: static reference data now by migration, dev seed only fixtures; log flow fields note (A3). |
| `electron_app/README.md` | Project structure: `components/log/LogDetail.tsx`; Known Stubs / seeds note; packaging result line. |
| `docs/full-stack-overview.md` | Log flow description (4 steps, detail view); nothing else unless the audit changed a boundary. |
| `docs/archived/build-plan-v1-items-p3.md` | Copy of this plan. |

Open PR `v1-deferred-p3 → main`.

---

## Verification summary

| Check | How |
|---|---|
| Static | `npm run typecheck && npm run lint` (0 warnings) at every gate |
| Unit | `npm test` (+ new db.test cases for v9/v10), `npm run test:electron` |
| Build | `npm run build`; Phase 2 adds `build:unpack` |
| Migration | `inspect-db`: `user_version 10`; fresh DB has 10 distortions / 9 catalog rows / new rules; dev DB has no duplicate distortions |
| Log flow | Gate 1 walk-through; an old seed log still opens; detail actual-time edit persists |
| Lists / copy | Gate 0: new apps classify productive on first poll; captions verbatim |
| Splash | Capture harness frames vs design file; "v1.0" bottom-right, nothing else moved |
| Audit | `/security-review` + crash review findings fixed or recorded; `npm audit` delta recorded |
| Exe | Launch result recorded on roadmap item 14 |
| Polling | Item 15 checklist outcomes in the roadmap |

**Could not verify in planning:** the Windows owner names for Outlook / Teams / Zoom (A5) and
whether SAC still blocks the exe (P3-8).
