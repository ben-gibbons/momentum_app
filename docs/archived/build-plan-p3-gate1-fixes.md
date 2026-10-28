# P3 Gate 1 fix list — build plan (short)

Ben's Gate 1 notes, 2026-10-28, built before the rest of Phase 2 (`v1-deferred-p3`). Standalone on purpose; the P3 plan is `build-plan-v1-items-p3.md` and is not re-presented here.

## Decisions

1. **Risk Factors caption** wraps at the card's width (the `max-w-[540px]` cap goes).
2. **Delete a log** — a trash icon at the far right of each Logs row; a two-step inline confirm ("Delete this log?" Delete / Cancel) like the task dialog. Deletes the log and its steps (one transaction); a running timer keyed to that log is dropped from the Timers tile.
3. **In-progress logs** — a new `completed` column (migration v11, default 1 so every existing log is complete). Pressing X on a *new* log after at least one Continue saves it with `completed = 0`; X on a log with no step completed saves nothing. Resuming an in-progress log (click its row) opens the flow on the first unfinished step with the values loaded, and X there saves progress again. X on an already-completed log discards edits, as before. Finish marks the log complete. The row shows "In progress" at the far right in the clay status colour (the design system's "red": `--status-unproductive`; there is no alarm-red token).
4. **Step 3 copy** — placeholders and the "% belief in tempting thought" label verbatim from Ben's note (also in the detail view). The last slider accepts 0: Continue enables as soon as that slider is revealed (its default is 0, so there is nothing to "move").
5. **Step 4** — caption under the title verbatim; card placeholders "Open PowerPoint, create a blank presentation" / "create a title slide and 3 body slides" / "Write one bullet per slide"; a fourth card and beyond say "Optional".
6. **Done screen** — check + "Saved to your logs." on one line at the top, the quote, a read-only review of the saved log (the same cards as the detail view, shared `LogReview` component) with an Edit button that reopens the flow at step 1, then Save and close. Finish after an Edit updates the same log (no duplicate).
7. **Timer popup** — the timer store asks the main process for the toast with the timer's id (`app:notifyTimer`); clicking the toast brings Momentum forward and pushes `push:openTimer`, and the shell opens a centred dialog over whatever is on screen: the timer's name, the time it ran ("10:00 elapsed") and how long ago it finished, Close, a mute / sound toggle, and Restart. Restart needs the next task typed in or "Same task" clicked; it restarts the same timer under the new name. The Home tile and the log step-4 timer keep their own Restart buttons.

## Steps

1. Main: migration v11 + `logs.remove` + `completed` in the repository, `logs:remove` and `app:notifyTimer` channels, `push:openTimer`; preload + `MomentumApi`; `db.test.ts` to v11. → `npm run test:electron`
2. Renderer: RiskFactors caption; `LogReview` extracted from `LogDetail`; Logs rows (In progress, trash, resume); ProcrastinationLog copy, 0% rule, step-4 caption, X-save, resume step, done review; timers store `finishedAt` + `restart(id, {label})`; `TimerDone` dialog + App wiring. → typecheck, lint, build, `npm test`
3. Docs: `docs/database-overview.md` (v11, column), roadmap sub-bullets under items 3, 8, 9. `/code-review high` on the diff, then Gate 2a for Ben (restart `npm run dev`: main process changed).
