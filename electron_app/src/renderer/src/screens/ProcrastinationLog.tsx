// screens/ProcrastinationLog.tsx
// The Procrastination Log CBT flow — a full-screen overlay that walks one step at a time through a
// thought record (design source: design_system/interactive-flows/ProcrastinationLog.jsx + the
// `.mm-log*` styles in kit.css). Four steps (task → feeling → thought record → first steps), then a
// done screen that reviews the saved log; new and edit both open at step 1, a resumed in-progress
// log opens at its first unfinished step. Distortions come from api.distortions.list(); on finish
// the form is mapped to a LogInput and persisted via api.logs.create (or api.logs.update once the
// log has an id). If `logId` is given the saved log is loaded for review/edit; `seedRiskFactor`
// pre-fills a risk-factor log; `source` records how a new log was opened ('popup' from the nudge,
// else 'manual'). The step-4 timer lives in the app-wide timer store (lib/timers.tsx), keyed per
// log, so it survives closing the overlay.
//
// Closing with the X saves progress when the log isn't finished: a new log once at least one step
// has been completed (Continue pressed), or a resumed in-progress log at any point — both with
// `completed: false`, so the Logs list shows "In progress" and clicking the row resumes. A new log
// with no step completed saves nothing, and a finished log being edited discards its edits.
//
// Each step gates Continue on its required fields (see canContinue()); step 3 reveals its fields
// progressively as the earlier ones are answered. Field → DTO mapping lives in toLogInput() at the
// bottom; the form mirrors LogInput / LogStep[] (shared/types.ts). The difficulty / satisfaction
// step columns and `takeaways` stay in the schema but this flow no longer collects them — a new
// log writes null, and an edited old log carries its saved values through untouched (LogReview
// shows them read-only).
import { useState } from 'react'
import { ArrowRight, Check, NotebookPen, Pencil, X } from 'lucide-react'
import type {
  LogInput,
  LogStep,
  LogSource,
  ProcrastinationLog as SavedLog
} from '../../../shared/types'
import { api, ipcErrorMessage } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Stepper } from '../components/log/Stepper'
import { Timer } from '../components/log/Timer'
import { LogReview } from '../components/log/LogReview'
import { useTimers } from '../lib/timers'
import {
  NumberField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField
} from '../components/log/fields'

const CLOSING_QUOTE = 'The dread is always worse than the actual doing of the task.'

const STEP_META: { eyebrow: string; prompt: string; caption?: string }[] = [
  { eyebrow: 'Step 1 · The task', prompt: 'What are you avoiding right now?' },
  { eyebrow: 'Step 2 · The feeling', prompt: 'Name the emotions underneath it.' },
  { eyebrow: 'Step 3 · Thought record', prompt: 'Catch the tempting thought, then reframe it.' },
  {
    eyebrow: 'Step 4 · First steps',
    prompt: 'The first ~3 easiest steps to get started',
    caption:
      '10 mins maximum per step, as simple as possible. Fill out actual mins after completing the task on the saved logs page'
  }
]

const TOTAL_STEPS = STEP_META.length
const DEFAULT_STEP_CARDS = 3
// Predicted minutes a fresh card starts with ("10 mins maximum per step"): a real value, so an
// untouched card saves 10 and the review shows it.
const DEFAULT_PREDICTED_MINS = 10
// Example text for the three default cards; a fourth card and beyond just say "Optional".
const STEP_PLACEHOLDERS = [
  'Open PowerPoint, create a blank presentation',
  'create a title slide and 3 body slides',
  'Write one bullet per slide'
]

// An editable breakdown step (form-side; maps onto LogStep at save time). The difficulty /
// satisfaction values are not edited by this flow; they are carried from the saved step (null on a
// new one) so editing an old log doesn't erase them.
interface FormStep {
  description: string
  predictedTimeMins: number | null
  actualTimeMins: number | null
  predictedDifficulty: number | null
  predictedSatisfaction: number | null
  actualDifficulty: number | null
  actualSatisfaction: number | null
}

function emptyStep(): FormStep {
  return {
    description: '',
    predictedTimeMins: DEFAULT_PREDICTED_MINS,
    actualTimeMins: null,
    predictedDifficulty: null,
    predictedSatisfaction: null,
    actualDifficulty: null,
    actualSatisfaction: null
  }
}

// The full editable form state — a renderer-side mirror of LogInput.
interface FormState {
  taskText: string
  emotion: string
  temptingThought: string
  beliefBefore: number
  distortion: string
  selfControlThought: string
  beliefSelfControl: number
  beliefAfter: number
  steps: FormStep[]
  takeaways: string | null // not collected any more; carried from a saved log (see header)
}

function emptyForm(): FormState {
  return {
    taskText: '',
    emotion: '',
    temptingThought: '',
    beliefBefore: 0,
    distortion: '',
    selfControlThought: '',
    beliefSelfControl: 0,
    beliefAfter: 0,
    steps: Array.from({ length: DEFAULT_STEP_CARDS }, emptyStep),
    takeaways: null
  }
}

// Build form state from a saved log (used to initialize the form when editing). Saved steps are
// padded up to the default three cards so editing looks like a fresh step 4; blanks are dropped
// again on save.
function formFromLog(l: SavedLog): FormState {
  const steps: FormStep[] = l.steps.map((s) => ({
    description: s.description ?? '',
    predictedTimeMins: s.predictedTimeMins,
    actualTimeMins: s.actualTimeMins,
    predictedDifficulty: s.predictedDifficulty,
    predictedSatisfaction: s.predictedSatisfaction,
    actualDifficulty: s.actualDifficulty,
    actualSatisfaction: s.actualSatisfaction
  }))
  while (steps.length < DEFAULT_STEP_CARDS) steps.push(emptyStep())
  return {
    taskText: l.taskText ?? '',
    emotion: l.emotion ?? '',
    temptingThought: l.temptingThought ?? '',
    beliefBefore: l.beliefBefore ?? 0,
    distortion: l.distortion ?? '',
    selfControlThought: l.selfControlThought ?? '',
    beliefSelfControl: l.beliefSelfControl ?? 0,
    beliefAfter: l.beliefAfter ?? 0,
    steps,
    takeaways: l.takeaways
  }
}

const filled = (s: string): boolean => s.trim() !== ''

// How far step 3's progressive reveal has been earned by the current answers: 0 = only the
// tempting thought + its slider, 1 = + the distortion select, 2 = + the reframe + its slider,
// 3 = + the "% belief in original thought" slider. Each level requires the one before it.
function revealLevel(f: FormState): number {
  if (!(filled(f.temptingThought) && f.beliefBefore > 0)) return 0
  if (!filled(f.distortion)) return 1
  if (!(filled(f.selfControlThought) && f.beliefSelfControl > 0)) return 2
  return 3
}

// Continue / Finish is enabled only when the step's required answers are in. Step 3 re-checks
// every condition (not just the last reveal), since an earlier field may have been cleared after
// the later ones appeared; its last slider may stay at 0 ("I no longer believe it at all" is the
// point of the reframe), so Continue enables as soon as it is revealed. Step 4 needs at least one
// card with text (blank cards are dropped and the rest renumbered on save, so clearing card 1 while
// card 2 is filled is still a valid log). A log that was already finished (`strict` false) is never
// re-gated: older logs may have empty answers the flow didn't require at the time, and a small
// edit to one must still be savable.
function canContinue(step: number, f: FormState, strict = true): boolean {
  if (!strict) return true
  switch (step) {
    case 0:
      return filled(f.taskText)
    case 1:
      return filled(f.emotion)
    case 2:
      return revealLevel(f) === 3
    case 3:
      return f.steps.some((st) => filled(st.description))
    default:
      return false
  }
}

// Where a resumed in-progress log opens: its first step that can't be continued yet, else step 4.
function firstUnfinishedStep(f: FormState): number {
  for (let i = 0; i < TOTAL_STEPS - 1; i++) if (!canContinue(i, f)) return i
  return TOTAL_STEPS - 1
}

type Phase = number | 'done'

interface ProcrastinationLogProps {
  logId?: number
  seedRiskFactor?: string
  source?: LogSource // only used on create; a risk-factor seed overrides it
  onClose?: () => void
}

export default function ProcrastinationLog({
  logId,
  seedRiskFactor,
  source,
  onClose
}: ProcrastinationLogProps): React.JSX.Element | null {
  // When editing, wait for the saved log before mounting the form so its initial state can be set
  // directly (no hydration effect). A fresh log has nothing to load. The inner LogFlow is keyed by
  // logId so switching between logs remounts it with the right initial state.
  const existing = useAsync(
    () => (logId != null ? api.logs.get(logId) : Promise.resolve(null)),
    [logId]
  )
  if (logId != null && existing.loading) return null
  return (
    <LogFlow
      key={logId ?? 'new'}
      initialLog={existing.data ?? null}
      logId={logId}
      seedRiskFactor={seedRiskFactor}
      source={source}
      onClose={onClose}
    />
  )
}

interface LogFlowProps {
  initialLog: SavedLog | null
  logId?: number
  seedRiskFactor?: string
  source?: LogSource
  onClose?: () => void
}

function LogFlow({
  initialLog,
  logId,
  seedRiskFactor,
  source,
  onClose
}: LogFlowProps): React.JSX.Element {
  const distortions = useAsync(() => api.distortions.list(), [])
  // Initial state is derived directly from the loaded log (editing) or empty (new) via lazy
  // initializers — so no hydration effect is needed.
  // Step 3's reveals are sticky: once a field has appeared it stays even if an earlier answer is
  // cleared (Continue still re-checks everything). A finished log shows every field; an
  // in-progress one shows what its answers have earned. The high-water mark lives next to the form
  // in one state object so patch() can bump it inside the same functional updater (two patches in
  // one tick can't clobber each other).
  const [draft, setDraft] = useState<{ form: FormState; revealed: number }>(() => {
    const form = initialLog ? formFromLog(initialLog) : emptyForm()
    return { form, revealed: initialLog?.completed ? 3 : revealLevel(form) }
  })
  const { form, revealed } = draft
  const [phase, setPhase] = useState<Phase>(() =>
    initialLog && !initialLog.completed ? firstUnfinishedStep(draft.form) : 0
  )
  const [saving, setSaving] = useState(false)
  // The row this flow writes to: the log being edited, or the id a new log got when it was first
  // saved here (Finish, then Edit from the done screen, then Finish again updates — no duplicate).
  const [savedId, setSavedId] = useState<number | null>(logId ?? null)
  // Set once Finish has succeeded in this session: the log is complete, so the X discards edits.
  const [finished, setFinished] = useState(false)
  // Set once Continue has been pressed (a step completed), and kept if the user goes Back — that,
  // not the current step, is what makes a new log worth saving on X.
  const [continued, setContinued] = useState(false)
  // A failed save (Finish or the X's progress save); shown above the nav, the overlay stays open.
  const [error, setError] = useState<string | null>(null)
  // Required-field gating applies to new and in-progress logs; an already-finished log is exempt.
  const strict = !initialLog?.completed
  // Identity of this log's timer in the store: a saved log reuses its id (reopening it shows the
  // same timer); a not-yet-saved log gets one stable uuid per mount, swapped for the saved id once
  // the log has one.
  const [timerKey, setTimerKey] = useState(() =>
    logId != null ? `log-${logId}` : `new-${crypto.randomUUID()}`
  )
  const timers = useTimers()

  function patch(p: Partial<FormState>): void {
    setDraft((d) => {
      const next = { ...d.form, ...p }
      return { form: next, revealed: Math.max(d.revealed, revealLevel(next)) }
    })
  }
  function patchSteps(f: (steps: FormStep[]) => FormStep[]): void {
    setDraft((d) => ({ ...d, form: { ...d.form, steps: f(d.form.steps) } }))
  }
  function patchStep(i: number, p: Partial<FormStep>): void {
    patchSteps((steps) => steps.map((s, j) => (j === i ? { ...s, ...p } : s)))
  }
  function addStep(): void {
    patchSteps((steps) => [...steps, emptyStep()])
  }
  // Card 1 has no remove button; only cards 2+ can go.
  function removeStep(i: number): void {
    if (i > 0) patchSteps((steps) => steps.filter((_, j) => j !== i))
  }

  // Write the form to the DB as finished or in-progress; returns the log's id.
  async function save(completed: boolean): Promise<number> {
    // A seed names the risk factor for a new log; an edit keeps whatever the saved log has.
    const riskFactor = seedRiskFactor ?? initialLog?.riskFactor ?? null
    const input = toLogInput(form, riskFactor, savedId == null, completed, source)
    if (savedId != null) {
      await api.logs.update(savedId, input)
      return savedId
    }
    const id = await api.logs.create(input)
    // The step-4 timer was keyed on this mount's uuid; hand it the saved id so reopening the log
    // finds the same running timer instead of offering a second one.
    timers.rekey(timerKey, `log-${id}`)
    setTimerKey(`log-${id}`)
    setSavedId(id)
    return id
  }

  async function finish(): Promise<void> {
    if (saving) return
    setSaving(true)
    try {
      await save(true)
      setError(null)
      setFinished(true)
      setPhase('done')
    } catch (e: unknown) {
      setError(`Couldn't save the log: ${ipcErrorMessage(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // The X. Progress is kept for an unfinished log (see the header); otherwise just close. If the
  // progress save fails the overlay stays open with the message, so the answers aren't lost.
  async function close(): Promise<void> {
    if (saving) return
    const unfinished = !finished && (initialLog ? !initialLog.completed : continued)
    if (unfinished) {
      setSaving(true)
      try {
        await save(false)
      } catch (e: unknown) {
        setError(`Couldn't save your progress: ${ipcErrorMessage(e)}`)
        return
      } finally {
        setSaving(false)
      }
    }
    onClose?.()
  }

  const isStep = typeof phase === 'number'
  const isLast = phase === TOTAL_STEPS - 1
  function next(): void {
    setContinued(true)
    setPhase((p) => (typeof p === 'number' ? p + 1 : 0))
  }
  function back(): void {
    setPhase((p) => (typeof p === 'number' && p > 0 ? p - 1 : p))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper animate-fade-in motion-reduce:animate-none">
      {/* Top bar: identity + close */}
      <div className="flex items-center justify-between border-b border-border-default px-[22px] py-4">
        <div className="inline-flex items-center gap-[9px] text-[14px] font-semibold text-muted">
          <NotebookPen className="h-[17px] w-[17px] text-brand" />
          <span>Procrastination log</span>
          {seedRiskFactor && (
            <span className="rounded-full border border-border-default px-[10px] py-[2px] text-[12px] font-semibold text-body">
              lack of {seedRiskFactor}
            </span>
          )}
        </div>
        <button
          aria-label="Close log"
          onClick={close}
          disabled={saving}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage — items-start so the card sizes to its content rather than stretching to full
          height (design: .mm-log__stage { align-items: flex-start }). */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-9">
        <div className="w-full max-w-[600px] rounded-xl border border-border-default bg-card p-8 shadow-sm">
          {isStep && (
            <div>
              <div className="mb-[22px]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {STEP_META[phase].eyebrow}
                </div>
                <h2 className="mt-2 font-display text-[27px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
                  {STEP_META[phase].prompt}
                </h2>
                {STEP_META[phase].caption && (
                  <p className="mt-2 text-[14px] leading-[1.5] text-muted">
                    {STEP_META[phase].caption}
                  </p>
                )}
              </div>

              {/* Steps 1 and 2: the heading is the prompt, so the single field carries no label. */}
              {phase === 0 && (
                <TextField
                  value={form.taskText}
                  onChange={(v) => patch({ taskText: v })}
                  placeholder="e.g. finish the quarterly report"
                />
              )}

              {phase === 1 && (
                <TextAreaField
                  value={form.emotion}
                  onChange={(v) => patch({ emotion: v })}
                  placeholder="overwhelmed, anxious, fear it won't be good enough…"
                />
              )}

              {phase === 2 && (
                <div className="flex flex-col gap-[18px]">
                  <TextAreaField
                    label="Tempting thought"
                    value={form.temptingThought}
                    onChange={(v) => patch({ temptingThought: v })}
                    placeholder="What do you think when you first feel that emotion? What do you want to do instead of your task, and why?"
                  />
                  <SliderField
                    label="% belief in tempting thought"
                    value={form.beliefBefore}
                    onChange={(v) => patch({ beliefBefore: v })}
                  />
                  {revealed >= 1 && (
                    <SelectField
                      label="Cognitive distortion"
                      value={form.distortion}
                      onChange={(v) => patch({ distortion: v })}
                      options={distortions.data ?? []}
                      placeholder="Which pattern is this?"
                    />
                  )}
                  {revealed >= 2 && (
                    <>
                      <TextAreaField
                        label="Self-control thought (reframe)"
                        value={form.selfControlThought}
                        onChange={(v) => patch({ selfControlThought: v })}
                        placeholder="What can you think instead when you feel that emotion? What is the counterargument to your tempting thought?"
                      />
                      <SliderField
                        label="% belief in reframe"
                        value={form.beliefSelfControl}
                        onChange={(v) => patch({ beliefSelfControl: v })}
                      />
                    </>
                  )}
                  {revealed >= 3 && (
                    <SliderField
                      label="% belief in original tempting thought"
                      value={form.beliefAfter}
                      onChange={(v) => patch({ beliefAfter: v })}
                    />
                  )}
                </div>
              )}

              {phase === 3 && (
                <div className="flex flex-col gap-5">
                  {form.steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-[14px] rounded-lg border border-border-subtle bg-raised p-[18px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Step {i + 1}
                        </span>
                        {i > 0 && (
                          <button
                            onClick={() => removeStep(i)}
                            className="text-[12px] font-semibold text-muted transition-colors hover:text-body"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <TextField
                        value={s.description}
                        onChange={(v) => patchStep(i, { description: v })}
                        placeholder={STEP_PLACEHOLDERS[i] ?? 'Optional'}
                      />
                      {/* Predicted and actual minutes share one row; actual is filled in after
                          working the step (also editable later from the log's detail view). */}
                      <div className="flex gap-5">
                        <NumberField
                          label="Predicted (min)"
                          value={s.predictedTimeMins}
                          onChange={(v) => patchStep(i, { predictedTimeMins: v })}
                          placeholder="10"
                        />
                        <NumberField
                          label="Actual (min)"
                          value={s.actualTimeMins}
                          onChange={(v) => patchStep(i, { actualTimeMins: v })}
                          placeholder="—"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={addStep}
                    className="self-start text-[13px] font-semibold text-brand transition-colors hover:text-brand-hover"
                  >
                    + Add a step
                  </button>

                  {/* The store sends the OS toast at zero (so the user hears it even if Momentum
                      is behind other windows). The label names the timer on the Home tile; it is
                      fixed at start time (step 1 is required, so it is always the task text). */}
                  <Timer timerKey={timerKey} label={timerLabel(form.taskText)} />
                </div>
              )}

              {error && <p className="mt-5 text-[13px] text-unproductive">{error}</p>}

              {/* Nav */}
              <div className="mt-[30px] flex items-center justify-between gap-[18px] border-t border-border-subtle pt-5">
                <Stepper total={TOTAL_STEPS} current={phase} />
                <div className="flex flex-none gap-[10px]">
                  <button
                    onClick={back}
                    disabled={phase === 0}
                    className="rounded-lg px-4 py-[10px] text-[14px] font-semibold text-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    Back
                  </button>
                  <button
                    onClick={isLast ? finish : next}
                    disabled={saving || !canContinue(phase, form, strict)}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-brand"
                  >
                    {isLast ? (saving ? 'Saving…' : 'Finish') : 'Continue'}
                    {!isLast && <ArrowRight className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'done' && savedId != null && (
            <DoneReview logId={savedId} onEdit={() => setPhase(0)} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// The done screen: "Saved to your logs." beside the check, the closing quote, then a read-only
// review of what was just saved (re-read from the DB so it shows exactly what the list will) with
// an Edit button that drops back into the flow at step 1, and Save and close.
function DoneReview({
  logId,
  onEdit,
  onClose
}: {
  logId: number
  onEdit: () => void
  onClose?: () => void
}): React.JSX.Element {
  const saved = useAsync(() => api.logs.get(logId), [logId])
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center justify-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Check className="h-5 w-5" />
        </span>
        <span className="text-[15px] font-semibold text-ink">Saved to your logs.</span>
      </div>
      <p className="mm-quote mx-auto max-w-[460px] text-center text-[24px] leading-[1.32]">
        “{CLOSING_QUOTE}”
      </p>

      <div className="flex items-center justify-between border-t border-border-subtle pt-5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
          Your log
        </span>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-card px-4 py-[9px] text-[14px] font-semibold text-body transition-colors hover:bg-hover"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
      </div>
      {saved.data && <LogReview log={saved.data} />}

      <button
        onClick={onClose}
        className="self-center rounded-lg bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
      >
        Save and close
      </button>
    </div>
  )
}

// "Log: <task text>" (truncated to 40 chars) for the timer store / Home tile; falls back to a
// generic label when the task hasn't been named yet.
function timerLabel(taskText: string): string {
  const t = taskText.trim()
  if (!t) return 'Procrastination log'
  return `Log: ${t.length > 40 ? t.slice(0, 39) + '…' : t}`
}

// Map the form state onto the LogInput DTO. Blank strings become null so the DB stores nulls, not
// empty strings. Blank step cards are dropped; the rest map to LogStep[] with sequential
// stepNumber, and the columns this flow no longer collects (difficulty, satisfaction, takeaways)
// pass through from the form (null for a new log, the saved values for an edit). `completed` is
// true from Finish, false when the X saves progress. `source` is only set on create (a risk-factor
// seed wins, else the caller's source — 'popup' from the nudge — else 'manual'); on update we
// leave it to the repository's existing value.
function toLogInput(
  form: FormState,
  riskFactor: string | null,
  isCreate: boolean,
  completed: boolean,
  source?: LogSource
): LogInput {
  const nz = (s: string): string | null => (s.trim() === '' ? null : s.trim())

  const steps: LogStep[] = form.steps
    .filter((s) => filled(s.description))
    .map((s, i) => ({
      stepNumber: i + 1,
      description: nz(s.description),
      predictedDifficulty: s.predictedDifficulty,
      predictedTimeMins: s.predictedTimeMins,
      predictedSatisfaction: s.predictedSatisfaction,
      actualDifficulty: s.actualDifficulty,
      actualTimeMins: s.actualTimeMins,
      actualSatisfaction: s.actualSatisfaction
    }))

  const input: LogInput = {
    taskText: nz(form.taskText),
    emotion: nz(form.emotion),
    temptingThought: nz(form.temptingThought),
    beliefBefore: form.beliefBefore,
    distortion: nz(form.distortion),
    selfControlThought: nz(form.selfControlThought),
    beliefSelfControl: form.beliefSelfControl,
    beliefAfter: form.beliefAfter,
    takeaways: form.takeaways,
    riskFactor,
    completed,
    steps
  }

  if (isCreate) {
    input.source = riskFactor ? 'risk_factor' : (source ?? 'manual')
  }

  return input
}
