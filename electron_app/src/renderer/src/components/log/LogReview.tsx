// components/log/LogReview.tsx
// Read-only layout of one saved procrastination log — the cards the Logs detail view and the log
// flow's done screen both show: task + when + feeling, the thought record, the first steps, and
// takeaways when an old log has them (the four-step flow no longer collects takeaways or the step
// difficulty / satisfaction, so those render only when non-null). Pass `onSaveActual` to make each
// step's actual minutes an input that commits on blur / Enter (the detail view does: the user comes
// back after doing the step to fill it in); without it the actuals are plain text (the done screen).
import { useState } from 'react'
import type { ProcrastinationLog } from '../../../../shared/types'
import { formatStamp } from '../../lib/format'

interface LogReviewProps {
  log: ProcrastinationLog
  onSaveActual?: (stepIndex: number, mins: number | null) => void
}

export function LogReview({ log, onSaveActual }: LogReviewProps): React.JSX.Element {
  return (
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
          <Row label="% belief in tempting thought">{pct(log.beliefBefore)}</Row>
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
                {onSaveActual ? (
                  <label className="inline-flex items-center gap-2">
                    Actual
                    <ActualInput
                      key={s.actualTimeMins ?? 'unset'}
                      value={s.actualTimeMins}
                      onSave={(v) => onSaveActual(i, v)}
                    />
                    min
                  </label>
                ) : (
                  <span>Actual {mins(s.actualTimeMins)}</span>
                )}
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
    <section className="rounded-xl border border-border-default bg-card p-7 text-left shadow-sm">
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
