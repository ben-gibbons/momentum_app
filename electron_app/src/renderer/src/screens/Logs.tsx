// screens/Logs.tsx
// The Procrastination Logs landing list ("a record, not a report card"). Reads api.logs.list()
// (LogListItem[]), sorts newest-first, and renders each as a tappable row titled by the step-1 task
// text. Clicking a finished row swaps the list for the read-only LogDetail (`selected` state — no
// route, no nav item); its Edit button asks App for the full flow (App owns the ProcrastinationLog
// overlay so the distraction nudge knows when a log is open). A log closed part-way through the
// flow shows "In progress" at the far right and clicking it resumes the flow instead. Each row has
// a trash button with a two-step confirm (the task dialog's pattern); deleting also drops the
// log's timer from the Timers tile. A "New log" button opens a fresh flow. Design source: the
// LogsList component in design_system/interactive-flows/index.html (the `.mm-logslist` /
// `.mm-logitem` styles) + the view header pattern from kit.css. Main-content panel only — no sidebar.
import { useState } from 'react'
import { ChevronRight, NotebookPen, Plus, Trash2 } from 'lucide-react'
import type { LogListItem } from '../../../shared/types'
import { api, ipcErrorMessage } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatStamp } from '../lib/format'
import { useTimerActions } from '../lib/timers'
import { LogDetail } from '../components/log/LogDetail'

// Row sub-line: the timestamp formatted from createdAt (MM/DD/YY h:mm AM/PM, app-wide format), plus
// the "· lack of X" suffix when the label carries one (risk-factor logs). We format from createdAt
// rather than the stored label so the date/time format is always consistent. Doubles as the row
// title for an old log with no task text.
function rowStamp(item: LogListItem): string {
  const i = item.label.indexOf('· lack of')
  const suffix = i >= 0 ? ' ' + item.label.slice(i) : ''
  return formatStamp(item.createdAt) + suffix
}

// How the log was started. Manual logs get no pill — that's the default; the pill is for the
// two ways Momentum itself prompted the log.
const SOURCE_LABEL: Partial<Record<NonNullable<LogListItem['source']>, string>> = {
  popup: 'From a nudge',
  risk_factor: 'Risk factor'
}

interface LogsProps {
  // App owns the single ProcrastinationLog overlay (so the distraction nudge knows when a log is
  // open); this screen only asks for it. `logFlowOpen` flips when that overlay closes → refetch.
  onOpenLog: (logId?: number) => void
  logFlowOpen: boolean
}

export default function Logs({ onOpenLog, logFlowOpen }: LogsProps): React.JSX.Element {
  const logs = useAsync(() => api.logs.list(), [logFlowOpen])
  // Actions only (not the ticking list) so the list doesn't re-render once a second.
  const timers = useTimerActions()
  // The log open in the detail view; null shows the list.
  const [selected, setSelected] = useState<number | null>(null)
  // The row whose trash button was clicked and is waiting for Delete / Cancel.
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Newest first by createdAt (Unix seconds).
  const items: LogListItem[] = [...(logs.data ?? [])].sort((a, b) => b.createdAt - a.createdAt)

  async function remove(id: number): Promise<void> {
    try {
      await api.logs.remove(id)
    } catch (e: unknown) {
      setError(`Couldn't delete that log: ${ipcErrorMessage(e)}`)
      setConfirmId(null)
      return
    }
    // The step-4 timer is keyed on the log id; a deleted log's timer would otherwise linger on
    // the Home tile with nothing to reopen.
    timers.removeByKey(`log-${id}`)
    setError(null)
    setConfirmId(null)
    logs.reload()
  }

  return (
    <main className="overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[920px] px-12 pb-14 pt-9">
        <header className="mb-[26px] flex items-end justify-between gap-5">
          <div>
            <h1 className="mt-0 font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
              Procrastination logs
            </h1>
            <p className="mt-2 max-w-[540px] text-[16px] text-muted">
              Every time you worked through the dread. Click one to revisit it.
            </p>
          </div>
          <button
            onClick={() => onOpenLog()}
            className="inline-flex flex-none items-center gap-2 rounded-lg bg-brand px-4 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-[17px] w-[17px]" /> New log
          </button>
        </header>

        {selected != null ? (
          <LogDetail
            logId={selected}
            refreshKey={logFlowOpen}
            onBack={() => setSelected(null)}
            onEdit={() => onOpenLog(selected)}
          />
        ) : (
          <div className="rounded-xl border border-border-default bg-card p-6 shadow-sm">
            {error && <p className="mb-4 text-[13px] text-unproductive">{error}</p>}
            {items.length === 0 ? (
              <p className="py-8 text-center text-[15px] text-muted">
                No logs yet. When you catch yourself avoiding something, start one.
              </p>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {items.map((l) => {
                  // An old log with no task text is titled by its stamp instead and gets no
                  // sub-line (identifiers only: task / risk factor and when).
                  const hasTask = !!l.taskText?.trim()
                  const title = hasTask ? l.taskText!.trim() : rowStamp(l)
                  const confirming = confirmId === l.id
                  return (
                    // The row is a div (not a button) so the trash button can sit inside it; the
                    // main area is its own button.
                    <div
                      key={l.id}
                      className="flex items-center gap-[14px] rounded-lg border border-transparent bg-raised py-3 pl-4 pr-3 transition-colors hover:border-border-brand hover:bg-green-50"
                    >
                      <button
                        onClick={() => (l.completed ? setSelected(l.id) : onOpenLog(l.id))}
                        className="flex min-w-0 flex-1 items-center gap-[14px] text-left"
                      >
                        <span className="inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-md bg-brand-soft text-brand">
                          <NotebookPen className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-ink">
                              {title}
                            </span>
                            {l.source && SOURCE_LABEL[l.source] && (
                              <span className="flex-none rounded-full bg-brand-soft px-[10px] py-[3px] text-[11px] font-semibold text-brand">
                                {SOURCE_LABEL[l.source]}
                              </span>
                            )}
                          </span>
                          {hasTask && (
                            <span className="mt-[2px] block font-data text-[12px] text-muted">
                              {rowStamp(l)}
                            </span>
                          )}
                        </span>
                      </button>

                      {confirming ? (
                        <span className="flex flex-none items-center gap-2 text-[13px] text-muted">
                          Delete this log?
                          <button
                            onClick={() => remove(l.id)}
                            className="rounded-md bg-unproductive px-3 py-[6px] text-[13px] font-semibold text-on-brand transition-opacity hover:opacity-90"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="rounded-md px-3 py-[6px] text-[13px] font-semibold text-muted transition-colors hover:bg-hover"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          {!l.completed && (
                            <span className="flex-none text-[12px] font-semibold text-unproductive">
                              In progress
                            </span>
                          )}
                          <button
                            aria-label="Delete log"
                            onClick={() => setConfirmId(l.id)}
                            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-unproductive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <ChevronRight className="h-5 w-5 flex-none text-faint" />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
