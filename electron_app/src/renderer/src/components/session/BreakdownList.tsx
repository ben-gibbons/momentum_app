// components/session/BreakdownList.tsx
// One "most time" card on the Productivity Trends → Today tab: the apps and sites that accrued
// time under a single classification (Productive / Unproductive / Not sure), ranked by minutes as
// the repository returns them (trends.getBreakdown, D11 / AP6). Rows follow the Settings "Not sure
// yet" idiom (NotSureList): kind pill, label, formatted minutes. Long lists are cut at TOP_N with
// a "Show all" toggle. Presentational — the screen owns the data and the day.
import { useState } from 'react'
import type { BreakdownItem } from '../../../../shared/types'
import { formatHM } from '../../lib/format'
import { KindPill } from '../settings/RuleListEditor'

const TOP_N = 10

interface BreakdownListProps {
  title: string
  dot: string // status-dot color utility (bg-productive / bg-unproductive / bg-notsure)
  items: BreakdownItem[]
}

export function BreakdownList({ title, dot, items }: BreakdownListProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, TOP_N)

  return (
    <section className="rounded-xl border border-border-default bg-card p-6 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <span className={`h-[10px] w-[10px] flex-none rounded-full ${dot}`} />
        {title}
      </h2>

      {items.length === 0 ? (
        <p className="py-2 text-[15px] text-faint">Nothing recorded</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {visible.map((item) => (
            <li key={`${item.kind}:${item.label}`} className="flex items-center gap-3 py-[10px]">
              <KindPill kind={item.kind} />
              <span className="min-w-0 flex-1 truncate text-[15px] text-body">{item.label}</span>
              <span className="flex-none font-data text-[13px] text-muted">
                {formatHM(item.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length > TOP_N && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 rounded-md px-[10px] py-[6px] text-[13px] font-semibold text-brand transition-colors hover:bg-brand-soft"
        >
          {showAll ? 'Show less' : `Show all (${items.length})`}
        </button>
      )}
    </section>
  )
}
