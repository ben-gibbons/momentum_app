// components/log/LogDetail.tsx
// Read-only view of one saved procrastination log, shown inside the Logs screen when a row is
// clicked (no route or nav item — Logs holds the selected id). Lays the thought record out as a
// record to re-read: task + when, feeling, the thought record, the first steps, and takeaways if
// the log has them (older logs; the four-step flow no longer collects takeaways or the step
// difficulty / satisfaction, so those render only when non-null). The one live control is each
// step's actual minutes: the user comes back after doing the step to fill it in, so it saves on
// blur / Enter via api.logs.update with the whole loaded log (the repository rewrites the step set
// wholesale). "Edit" hands off to the full flow via the parent's onEdit; "Back" returns to the list.
import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import type { LogInput, ProcrastinationLog } from '../../../../shared/types'
import { api } from '../../lib/api'
import { formatStamp } from '../../lib/format'

interface LogDetailProps {
  logId: number
  refreshKey: unknown // changes when the edit flow closes → reload the log
  onBack: () => void
  onEdit: () => void
}

export function LogDetail({
  logId,
  refreshKey,
  onBack,
  onEdit
}: LogDetailProps): React.JSX.Element {
  // Local state rather than useAsync because the actual-minutes save mutates the loaded log in place.
  const [log, setLog] = useState<ProcrastinationLog | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api.logs
      .get(logId)
      .then((l) => {
        if (cancelled) return
        setLog(l)
        setError(l ? null : 'This log no longer exists.')
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [logId, refreshKey])

  // Write one step's actual minutes back. The whole log goes with it (update replaces log_steps),
  // which keeps old logs' difficulty / satisfaction columns intact. Optimistic: the new value is
  // shown at once and rolled back if the write fails, so the screen never claims a save it lost.
  async function saveActual(stepIndex: number, mins: number | null): Promise<void> {
    if (!log) return
    const steps = log.steps.map((s, i) => (i === stepIndex ? { ...s, actualTimeMins: mins } : s))
    const next = { ...log, steps }
    setLog(next)
    try {
      await api.logs.update(log.id, toInput(next))
      setError(null)
    } catch (e: unknown) {
      setLog(log)
      setError(`Couldn't save that change: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-[6px] rounded-lg px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-hover"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-card px-4 py-[9px] text-[14px] font-semibold text-body transition-colors hover:bg-hover"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
      </div>

      {error && <p className="text-[13px] text-unproductive">{error}</p>}

      {log && (
        <>
          <Card>
            <h2 className="font-display text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
              {log.taskText ?? log.label}
            </h2>
            <p className="mt-2 font-data text-[13px] text-muted">
              {formatStamp(log.createdAt)}
              {log.riskFactor && ` · lack of ${log.riskFactor.toLowerCase()}`}
            </p>
            {log.emotion && (
              <Row label="Feeling" className="mt-5">
                {log.emotion}
              </Row>
            )}
          </Card>

          <Card title="Thought record">
            <div className="flex flex-col gap-4">
              <Row label="Tempting thought">{log.temptingThought ?? '—'}</Row>
              <Row label="% belief before">{pct(log.beliefBefore)}</Row>
              <Row label="Cognitive distortion">{log.distortion ?? '—'}</Row>
              <Row label="Self-control thought (reframe)">{log.selfControlThought ?? '—'}</Row>
              <Row label="% belief in reframe">{pct(log.beliefSelfControl)}</Row>
              <Row label="% belief in original tempting thought">{pct(log.beliefAfter)}</Row>
            </div>
          </Card>

          <Card title="First steps">
            <div className="flex flex-col gap-3">
              {log.steps.map((s, i) => (
                <div
                  key={s.id ?? i}
                  className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-raised p-4"
                >
                  <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Step {s.stepNumber}
                  </div>
                  <div className="text-[15px] text-body">{s.description ?? '—'}</div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-data text-[13px] text-muted">
                    <span>Predicted {mins(s.predictedTimeMins)}</span>
                    <label className="inline-flex items-center gap-2">
                      Actual
                      <ActualInput
                        key={s.actualTimeMins ?? 'unset'}
                        value={s.actualTimeMins}
                        onSave={(v) => saveActual(i, v)}
                      />
                      min
                    </label>
                    {/* Older logs only — the flow no longer asks for these. */}
                    {s.predictedDifficulty != null && (
                      <span>
                        Difficulty {s.predictedDifficulty}%
                        {s.actualDifficulty != null && ` → ${s.actualDifficulty}%`}
                      </span>
                    )}
                    {s.predictedSatisfaction != null && (
                      <span>
                        Satisfaction {s.predictedSatisfaction}%
                        {s.actualSatisfaction != null && ` → ${s.actualSatisfaction}%`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {log.takeaways && (
            <Card title="Takeaways">
              <p className="whitespace-pre-wrap text-[15px] text-body">{log.takeaways}</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// Whole-minute input that commits on blur or Enter (not on every keystroke, so a half-typed "1"
// of "15" never hits the DB). The draft is a string so the box can be cleared back to unset.
function ActualInput({
  value,
  onSave
}: {
  value: number | null
  onSave: (v: number | null) => void
}): React.JSX.Element {
  // The parent keys this input on the saved value, so a change underneath (reload after an edit in
  // the flow) remounts it with a fresh draft — no resync effect needed.
  const [draft, setDraft] = useState(value == null ? '' : String(value))

  function commit(): void {
    const n = draft === '' ? null : Math.max(0, Math.floor(Number(draft)))
    const clean = n == null || Number.isNaN(n) ? null : n
    if (clean !== value) onSave(clean)
  }

  return (
    <input
      type="number"
      min={0}
      value={draft}
      placeholder="—"
      aria-label="Actual minutes"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur() // blur runs commit once
      }}
      className="w-[66px] rounded-md border border-border-strong bg-input px-[10px] py-[6px] font-data text-[14px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand"
    />
  )
}

function Card({
  title,
  children
}: {
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-border-default bg-card p-7 shadow-sm">
      {title && (
        <h3 className="mb-[18px] font-display text-[20px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}

function Row({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={className}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-[15px] text-body">{children}</div>
    </div>
  )
}

const pct = (n: number | null): string => (n == null ? '—' : `${n}%`)
const mins = (n: number | null): string => (n == null ? '—' : `${n} min`)

// Saved log → the LogInput update() expects. Everything is sent back as-is (label / source /
// riskFactor included) so a detail-view save never drops a column.
function toInput(l: ProcrastinationLog): LogInput {
  return {
    label: l.label,
    taskText: l.taskText,
    emotion: l.emotion,
    temptingThought: l.temptingThought,
    beliefBefore: l.beliefBefore,
    distortion: l.distortion,
    selfControlThought: l.selfControlThought,
    beliefSelfControl: l.beliefSelfControl,
    beliefAfter: l.beliefAfter,
    takeaways: l.takeaways,
    riskFactor: l.riskFactor,
    steps: l.steps
  }
}
