// screens/Logs.tsx
// The Procrastination Logs landing list ("a record, not a report card"). Reads api.logs.list()
// (LogListItem[]), sorts newest-first, and renders each as a tappable row that opens the saved log
// for review/edit (App owns the ProcrastinationLog overlay; this screen asks for it). A "New log" button
// opens a fresh flow. Design source: the LogsList component in design_system/interactive-flows/
// index.html (the `.mm-logslist`/`.mm-logitem` styles) + the view header pattern from kit.css.
// Main-content panel only — no sidebar.
import { ChevronRight, NotebookPen, Plus } from 'lucide-react'
import type { LogListItem } from '../../../shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatStamp } from '../lib/format'

// Row title: the timestamp formatted from createdAt (MM/DD/YY h:mm AM/PM, app-wide format), plus
// the "· lack of X" suffix when the label carries one (risk-factor logs). We format from createdAt
// rather than the stored label so the date/time format is always consistent.
function rowTitle(item: LogListItem): string {
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

  // Newest first by createdAt (Unix seconds).
  const items: LogListItem[] = [...(logs.data ?? [])].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <main className="overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[920px] px-12 pb-14 pt-9">
        <header className="mb-[26px] flex items-end justify-between gap-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              A record, not a report card
            </div>
            <h1 className="mt-[6px] font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
              Procrastination logs
            </h1>
            <p className="mt-2 max-w-[540px] text-[16px] text-muted">
              Every time you worked through the dread. Tap one to revisit it.
            </p>
          </div>
          <button
            onClick={() => onOpenLog()}
            className="inline-flex flex-none items-center gap-2 rounded-lg bg-brand px-4 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-[17px] w-[17px]" /> New log
          </button>
        </header>

        <div className="rounded-xl border border-border-default bg-card p-6 shadow-sm">
          {items.length === 0 ? (
            <p className="py-8 text-center text-[15px] text-muted">
              No logs yet. When you catch yourself avoiding something, start one.
            </p>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {items.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpenLog(l.id)}
                  className="flex items-center gap-[14px] rounded-lg border border-transparent bg-raised px-4 py-3 text-left transition-colors hover:border-border-brand hover:bg-green-50"
                >
                  <span className="inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-md bg-brand-soft text-brand">
                    <NotebookPen className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink">
                        {rowTitle(l)}
                      </span>
                      {l.source && SOURCE_LABEL[l.source] && (
                        <span className="flex-none rounded-full bg-brand-soft px-[10px] py-[3px] text-[11px] font-semibold text-brand">
                          {SOURCE_LABEL[l.source]}
                        </span>
                      )}
                    </span>
                    {l.emotion && (
                      <span className="mt-[2px] block font-data text-[12px] text-muted">
                        felt {l.emotion}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-5 w-5 flex-none text-faint" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
