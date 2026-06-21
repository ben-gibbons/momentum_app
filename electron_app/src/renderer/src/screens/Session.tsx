// screens/Session.tsx
// Current Session + 7-day Productivity Trends — the single screen behind both the "Current session"
// and "Productivity Trends" nav items. Recreates design_system/interactive-flows/Session.jsx in the
// Home.tsx exemplar style: data is read through window.api via useAsync (rendered with zeros until
// loaded), an underline tab switches between the session summary and the week chart, and presentation
// is split into small components in components/session/. Main-content panel only — the shared app
// shell (sidebar + routing) is added by the lead in Phase 3.
import { useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { formatHM } from '../lib/format'
import { api } from '../lib/api'
import type { SessionTotals, TrendDay } from '../../../shared/types'
import { SessionStatGrid } from '../components/session/SessionStatGrid'
import { StatBar } from '../components/session/StatBar'
import { TrendsChart } from '../components/session/TrendsChart'

const ZERO_SESSION: SessionTotals = { productive: 0, unproductive: 0, notsure: 0 }

type Tab = 'session' | 'trends'

// Underline tab — recreates the design-system Tabs (variant="underline"): a brand underline under
// the active tab, muted labels otherwise. Local to this screen; no shared Tabs component exists yet.
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }): React.JSX.Element {
  const items: { id: Tab; label: string }[] = [
    { id: 'session', label: 'This session' },
    { id: 'trends', label: 'This week' }
  ]
  return (
    <div className="flex gap-[22px] border-b border-border-default" role="tablist">
      {items.map((t) => {
        const active = t.id === tab
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px py-[10px] text-[13px] font-semibold transition-colors ${
              active
                ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-brand after:content-[""]'
                : 'text-muted hover:text-body'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// Small swatch + label used in the chart legend (recreates the StatusDot used in Session.jsx).
function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-body">
      <span className={`h-[10px] w-[10px] flex-none rounded-full ${color}`} />
      {label}
    </span>
  )
}

export default function Session(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('session')
  const current = useAsync(() => api.session.getCurrent(), [])
  const trends = useAsync(() => api.trends.getWeek(), [])

  const totals = current.data ?? ZERO_SESSION
  const week: TrendDay[] = trends.data ?? []

  return (
    <main className="h-screen overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[920px] px-12 pb-14 pt-9">
        {/* .mm-view__head — eyebrow + display title + calm sub-line */}
        <header className="mb-[26px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Your time
          </div>
          <h1 className="mt-[6px] font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Where the day went
          </h1>
          <p className="mt-2 max-w-[540px] text-[17px] text-muted">
            Honest numbers, no judgment. Notice the patterns.
          </p>
        </header>

        <Tabs tab={tab} onChange={setTab} />

        {tab === 'session' ? (
          // Session summary card: big productive-minutes stat, 3-up stat grid, full stacked bar.
          <div className="mt-[22px] rounded-xl border border-border-default bg-card p-7 shadow-sm">
            <div className="mb-[6px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              Productive this session
            </div>
            <div className="mb-7 font-data text-[44px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {formatHM(totals.productive)}
            </div>

            <SessionStatGrid totals={totals} />

            <div className="mt-[22px]">
              <StatBar
                productive={totals.productive}
                unproductive={totals.unproductive}
                notsure={totals.notsure}
              />
            </div>
          </div>
        ) : (
          // Trends card: 7-day stacked bar chart + legend.
          <div className="mt-[22px] rounded-xl border border-border-default bg-card p-7 shadow-sm">
            <div className="mb-[14px]">
              <div className="font-display text-[20px] font-medium tracking-[-0.01em] text-ink">
                Productivity this week
              </div>
              <div className="mt-[2px] text-[13px] text-muted">
                Productive · unproductive · not-sure, per day
              </div>
            </div>

            <TrendsChart week={week} />

            {/* .mm-chart__legend: divider + the three classification swatches */}
            <div className="mt-5 flex gap-[18px] border-t border-border-subtle pt-4">
              <LegendDot color="bg-productive" label="Productive" />
              <LegendDot color="bg-unproductive" label="Unproductive" />
              <LegendDot color="bg-notsure" label="Not-sure" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
