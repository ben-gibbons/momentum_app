// components/log/LogDetail.tsx
// Read-only view of one saved procrastination log, shown inside the Logs screen when a row is
// clicked (no route or nav item — Logs holds the selected id). The cards themselves are LogReview
// (shared with the flow's done screen); this component loads the log and owns the one live
// control: each step's actual minutes, which save via api.logs.update with the whole loaded log
// (the repository rewrites the step set wholesale). "Edit" hands off to the full flow via the
// parent's onEdit; "Back" returns to the list.
import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import type { LogInput, ProcrastinationLog } from '../../../../shared/types'
import { api } from '../../lib/api'
import { LogReview } from './LogReview'

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
          disabled={!log}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-card px-4 py-[9px] text-[14px] font-semibold text-body transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
      </div>

      {error && <p className="text-[13px] text-unproductive">{error}</p>}

      {log && <LogReview log={log} onSaveActual={saveActual} />}
    </div>
  )
}

// Saved log → the LogInput update() expects. Everything is sent back as-is (label / source /
// riskFactor / completed included) so a detail-view save never drops a column.
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
    completed: l.completed,
    steps: l.steps
  }
}
