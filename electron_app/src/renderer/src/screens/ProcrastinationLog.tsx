// screens/ProcrastinationLog.tsx
// The Procrastination Log CBT flow — a full-screen overlay that walks one step at a time through a
// thought record (design source: design_system/interactive-flows/ProcrastinationLog.jsx + the
// `.mm-log*` styles in kit.css). Phases: intro quote → 5 steps → done quote. Distortions come from
// api.distortions.list(); on finish the form is mapped to a LogInput and persisted via
// api.logs.create (or api.logs.update when editing an existing log id). If `logId` is given the
// saved log is loaded for review/edit; `seedRiskFactor` pre-fills a risk-factor log.
//
// Field → DTO mapping lives in toLogInput() at the bottom; the form mirrors LogInput / LogStep[]
// (shared/types.ts) one-to-one.
import { useState } from 'react'
import { ArrowRight, Check, NotebookPen, X } from 'lucide-react'
import type {
  LogInput,
  LogStep,
  LogSource,
  ProcrastinationLog as SavedLog
} from '../../../shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatStamp } from '../lib/format'
import { Stepper } from '../components/log/Stepper'
import { Timer } from '../components/log/Timer'
import {
  NumberField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField
} from '../components/log/fields'

const OPENING_QUOTE =
  "Procrastination isn't a time management problem, it's an emotional regulation problem."
const CLOSING_QUOTE = 'The dread is always worse than the actual doing of the task.'

const STEP_META = [
  { eyebrow: 'Step 1 · The task', prompt: 'What are you avoiding right now?' },
  { eyebrow: 'Step 2 · The feeling', prompt: 'Name the emotion underneath it.' },
  { eyebrow: 'Step 3 · Thought record', prompt: 'Catch the thought, then reframe it.' },
  { eyebrow: 'Step 4 · First steps', prompt: 'Just the first easy move — about ten minutes.' },
  { eyebrow: 'Step 5 · Takeaways', prompt: 'Anything worth remembering?' }
] as const

const TOTAL_STEPS = STEP_META.length

// An empty editable breakdown step (form-side; maps onto LogStep at save time).
interface FormStep {
  description: string
  predictedDifficulty: number
  predictedTimeMins: number | null
  predictedSatisfaction: number
  actualDifficulty: number | null
  actualTimeMins: number | null
  actualSatisfaction: number | null
}

function emptyStep(): FormStep {
  return {
    description: '',
    predictedDifficulty: 35,
    predictedTimeMins: 10,
    predictedSatisfaction: 60,
    actualDifficulty: null,
    actualTimeMins: null,
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
  takeaways: string
}

function emptyForm(): FormState {
  return {
    taskText: '',
    emotion: '',
    temptingThought: '',
    beliefBefore: 75,
    distortion: '',
    selfControlThought: '',
    beliefSelfControl: 55,
    beliefAfter: 40,
    steps: [emptyStep()],
    takeaways: ''
  }
}

// Build form state from a saved log (used to initialize the form when editing).
function formFromLog(l: SavedLog): FormState {
  return {
    taskText: l.taskText ?? '',
    emotion: l.emotion ?? '',
    temptingThought: l.temptingThought ?? '',
    beliefBefore: l.beliefBefore ?? 75,
    distortion: l.distortion ?? '',
    selfControlThought: l.selfControlThought ?? '',
    beliefSelfControl: l.beliefSelfControl ?? 55,
    beliefAfter: l.beliefAfter ?? 40,
    steps: l.steps.length
      ? l.steps.map((s) => ({
          description: s.description ?? '',
          predictedDifficulty: s.predictedDifficulty ?? 35,
          predictedTimeMins: s.predictedTimeMins,
          predictedSatisfaction: s.predictedSatisfaction ?? 60,
          actualDifficulty: s.actualDifficulty,
          actualTimeMins: s.actualTimeMins,
          actualSatisfaction: s.actualSatisfaction
        }))
      : [emptyStep()],
    takeaways: l.takeaways ?? ''
  }
}

type Phase = 'intro' | number | 'done'

interface ProcrastinationLogProps {
  logId?: number
  seedRiskFactor?: string
  onClose?: () => void
}

export default function ProcrastinationLog({
  logId,
  seedRiskFactor,
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
      onClose={onClose}
    />
  )
}

interface LogFlowProps {
  initialLog: SavedLog | null
  logId?: number
  seedRiskFactor?: string
  onClose?: () => void
}

function LogFlow({ initialLog, logId, seedRiskFactor, onClose }: LogFlowProps): React.JSX.Element {
  const distortions = useAsync(() => api.distortions.list(), [])
  // Initial state is derived directly from the loaded log (editing) or empty (new) via lazy
  // initializers — so no hydration effect is needed. Editing opens on step 1; a new log on the intro.
  const [form, setForm] = useState<FormState>(() =>
    initialLog ? formFromLog(initialLog) : emptyForm()
  )
  const [phase, setPhase] = useState<Phase>(() => (initialLog ? 0 : 'intro'))
  const [saving, setSaving] = useState(false)

  function patch(p: Partial<FormState>): void {
    setForm((f) => ({ ...f, ...p }))
  }
  function patchStep(i: number, p: Partial<FormStep>): void {
    setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }))
  }
  function addStep(): void {
    setForm((f) => (f.steps.length >= 3 ? f : { ...f, steps: [...f.steps, emptyStep()] }))
  }
  function removeStep(i: number): void {
    setForm((f) => (f.steps.length <= 1 ? f : { ...f, steps: f.steps.filter((_, j) => j !== i) }))
  }

  async function finish(): Promise<void> {
    if (saving) return
    setSaving(true)
    try {
      const input = toLogInput(form, seedRiskFactor, logId == null)
      if (logId != null) {
        await api.logs.update(logId, input)
      } else {
        await api.logs.create(input)
      }
      setPhase('done')
    } finally {
      setSaving(false)
    }
  }

  const isStep = typeof phase === 'number'
  function next(): void {
    setPhase((p) => (typeof p === 'number' ? p + 1 : 0))
  }
  function back(): void {
    setPhase((p) => (typeof p === 'number' && p > 0 ? p - 1 : 'intro'))
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
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage — items-start so the card sizes to its content rather than stretching to full
          height (design: .mm-log__stage { align-items: flex-start }). */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-9">
        <div className="w-full max-w-[600px] rounded-xl border border-border-default bg-card p-8 shadow-sm">
          {phase === 'intro' && (
            <div className="flex flex-col items-center gap-[18px] px-4 py-8 text-center">
              <p className="mm-quote max-w-[460px] text-[24px] leading-[1.32]">“{OPENING_QUOTE}”</p>
              <p className="text-[14px] text-muted">
                We&apos;ll go one step at a time. Nothing here is graded.
              </p>
              <button
                onClick={() => setPhase(0)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
              >
                Begin <ArrowRight className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}

          {isStep && (
            <div>
              <div className="mb-[22px]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {STEP_META[phase].eyebrow}
                </div>
                <h2 className="mt-2 font-display text-[27px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
                  {STEP_META[phase].prompt}
                </h2>
              </div>

              {phase === 0 && (
                <div className="flex flex-col gap-[18px]">
                  <TextField
                    label="The task"
                    value={form.taskText}
                    onChange={(v) => patch({ taskText: v })}
                    placeholder="e.g. finish the quarterly report"
                  />
                  <div className="font-data text-[12px] text-muted">{nowHint()}</div>
                </div>
              )}

              {phase === 1 && (
                <div className="flex flex-col gap-[18px]">
                  <TextAreaField
                    label="Name the emotion"
                    value={form.emotion}
                    onChange={(v) => patch({ emotion: v })}
                    placeholder="overwhelmed, anxious, fear it won't be good enough…"
                  />
                </div>
              )}

              {phase === 2 && (
                <div className="flex flex-col gap-[18px]">
                  <TextAreaField
                    label="Tempting thought"
                    value={form.temptingThought}
                    onChange={(v) => patch({ temptingThought: v })}
                    placeholder="What do you want to do instead?"
                  />
                  <SliderField
                    label="% belief before"
                    value={form.beliefBefore}
                    onChange={(v) => patch({ beliefBefore: v })}
                  />
                  <SelectField
                    label="Cognitive distortion"
                    value={form.distortion}
                    onChange={(v) => patch({ distortion: v })}
                    options={distortions.data ?? []}
                    placeholder="Which pattern is this?"
                  />
                  <TextAreaField
                    label="Self-control thought (reframe)"
                    value={form.selfControlThought}
                    onChange={(v) => patch({ selfControlThought: v })}
                    placeholder="A kinder, truer way to see it"
                  />
                  <div className="grid grid-cols-2 gap-[18px]">
                    <SliderField
                      label="% belief in reframe"
                      value={form.beliefSelfControl}
                      onChange={(v) => patch({ beliefSelfControl: v })}
                    />
                    <SliderField
                      label="% belief after"
                      value={form.beliefAfter}
                      onChange={(v) => patch({ beliefAfter: v })}
                    />
                  </div>
                </div>
              )}

              {phase === 3 && (
                <div className="flex flex-col gap-5">
                  {form.steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-[18px] rounded-lg border border-border-subtle bg-raised p-[18px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Step {i + 1}
                        </span>
                        {form.steps.length > 1 && (
                          <button
                            onClick={() => removeStep(i)}
                            className="text-[12px] font-semibold text-muted transition-colors hover:text-body"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <TextField
                        label="First step (~10 min)"
                        value={s.description}
                        onChange={(v) => patchStep(i, { description: v })}
                        placeholder="Open the doc and write three section headers"
                      />
                      {/* Two sliders share the row (roomy); time is a compact field on its own line. */}
                      <div className="grid grid-cols-2 gap-5">
                        <SliderField
                          label="Predicted difficulty"
                          value={s.predictedDifficulty}
                          onChange={(v) => patchStep(i, { predictedDifficulty: v })}
                        />
                        <SliderField
                          label="Predicted satisfaction"
                          value={s.predictedSatisfaction}
                          onChange={(v) => patchStep(i, { predictedSatisfaction: v })}
                        />
                      </div>
                      <NumberField
                        label="Predicted time (min)"
                        value={s.predictedTimeMins}
                        onChange={(v) => patchStep(i, { predictedTimeMins: v })}
                        placeholder="10"
                      />
                      {/* Actuals — filled in after working the step. */}
                      <div className="flex flex-col gap-[18px] border-t border-border-subtle pt-[18px]">
                        <div className="grid grid-cols-2 gap-5">
                          <SliderField
                            label="Actual difficulty"
                            value={s.actualDifficulty ?? 0}
                            onChange={(v) => patchStep(i, { actualDifficulty: v })}
                          />
                          <SliderField
                            label="Actual satisfaction"
                            value={s.actualSatisfaction ?? 0}
                            onChange={(v) => patchStep(i, { actualSatisfaction: v })}
                          />
                        </div>
                        <NumberField
                          label="Actual time (min)"
                          value={s.actualTimeMins}
                          onChange={(v) => patchStep(i, { actualTimeMins: v })}
                          placeholder="—"
                        />
                      </div>
                    </div>
                  ))}

                  {form.steps.length < 3 && (
                    <button
                      onClick={addStep}
                      className="self-start text-[13px] font-semibold text-brand transition-colors hover:text-brand-hover"
                    >
                      + Add another step
                    </button>
                  )}

                  <Timer />
                </div>
              )}

              {phase === 4 && (
                <div className="flex flex-col gap-[18px]">
                  <TextAreaField
                    label="Takeaways"
                    value={form.takeaways}
                    onChange={(v) => patch({ takeaways: v })}
                    placeholder="Optional — what did you notice?"
                    rows={4}
                  />
                  <p className="mm-quote mt-[6px] text-[18px]">“{CLOSING_QUOTE}”</p>
                </div>
              )}

              {/* Nav */}
              <div className="mt-[30px] flex items-center justify-between gap-[18px] border-t border-border-subtle pt-5">
                <Stepper total={TOTAL_STEPS} current={phase} />
                <div className="flex flex-none gap-[10px]">
                  <button
                    onClick={back}
                    className="rounded-lg px-4 py-[10px] text-[14px] font-semibold text-muted transition-colors hover:bg-hover"
                  >
                    Back
                  </button>
                  <button
                    onClick={phase === TOTAL_STEPS - 1 ? finish : next}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
                  >
                    {phase === TOTAL_STEPS - 1 ? (saving ? 'Saving…' : 'Finish') : 'Continue'}
                    {phase !== TOTAL_STEPS - 1 && <ArrowRight className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-[18px] px-4 py-8 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Check className="h-7 w-7" />
              </div>
              <p className="mm-quote max-w-[460px] text-[24px] leading-[1.32]">“{CLOSING_QUOTE}”</p>
              <p className="text-[14px] text-muted">Saved to your logs. Go gently.</p>
              <button
                onClick={onClose}
                className="rounded-lg bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
              >
                Save and close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// "Today · 06/20/26 9:42 AM" — the step-1 date/time hint. Uses the app-wide formatStamp
// (MM/DD/YY h:mm AM/PM) so every date/time in the flow reads consistently.
function nowHint(d: Date = new Date()): string {
  return `Today · ${formatStamp(Math.floor(d.getTime() / 1000))}`
}

// Map the form state onto the LogInput DTO. Blank strings become null so the DB stores nulls, not
// empty strings. Steps map to LogStep[] with sequential stepNumber. `source` is only set on create
// (popup/manual/risk_factor); on update we leave it to the repository's existing value.
function toLogInput(form: FormState, seedRiskFactor?: string, isCreate?: boolean): LogInput {
  const nz = (s: string): string | null => (s.trim() === '' ? null : s.trim())

  const steps: LogStep[] = form.steps
    .filter((s) => s.description.trim() !== '')
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
    takeaways: nz(form.takeaways),
    riskFactor: seedRiskFactor ?? null,
    steps
  }

  if (isCreate) {
    const source: LogSource = seedRiskFactor ? 'risk_factor' : 'manual'
    input.source = source
  }

  return input
}
