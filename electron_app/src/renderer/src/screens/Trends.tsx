// screens/Trends.tsx
// Productivity Trends — the screen behind the "Productivity Trends" nav item (the separate "Current
// session" item was removed, D11; renamed from Session.tsx in Phase 0 of V1 items 5–7). Three
// underline tabs — Today / This week / This month — each with a ‹ › RangeNav over its own range:
// Today = the session card (totals + stacked bar) plus the per-class "most time" lists for that
// day; This week = the 7-day TrendsChart for any week; This month = one bar per Mon–Sun week
// touching the month. Each tab body is its own component so it fetches through window.api via
// useAsync keyed on its range, and only while shown. Recreates design_system/interactive-flows/
// Session.jsx in the Home.tsx exemplar style. Main-content panel only — App.tsx owns the shell.
import { useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { formatHM } from '../lib/format'
import { api } from '../lib/api'
import type { SessionTotals, TrendDay, TrendWeek } from '../../../shared/types'
import {
  addDays,
  addMonths,
  startOfDay,
  startOfMonth,
  weekStartMonday
} from '../../../shared/dates'
import { RangeNav } from '../components/RangeNav'
import { SessionStatGrid } from '../components/session/SessionStatGrid'
import { StatBar } from '../components/session/StatBar'
import { TrendsChart } from '../components/session/TrendsChart'
import { MonthChart } from '../components/session/MonthChart'
import { BreakdownList } from '../components/session/BreakdownList'

const ZERO_SESSION: SessionTotals = { productive: 0, unproductive: 0, notsure: 0 }

type Tab = 'today' | 'week' | 'month'

// Underline tab — recreates the design-system Tabs (variant="underline"): a brand underline under
// the active tab, muted labels otherwise. Local to this screen; no shared Tabs component exists yet.
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }): React.JSX.Element {
  const items: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This week' },
    { id: 'month', label: 'This month' }
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

// .mm-chart__legend: divider + the three classification swatches (shared by both charts).
function Legend(): React.JSX.Element {
  return (
    <div className="mt-5 flex gap-[18px] border-t border-border-subtle pt-4">
      <LegendDot color="bg-productive" label="Productive" />
      <LegendDot color="bg-unproductive" label="Unproductive" />
      <LegendDot color="bg-notsure" label="Not-sure" />
    </div>
  )
}

// ---- RangeNav labels: the relative word for the current range, the dated range otherwise ----

const fmtDate = (secs: number, opts: Intl.DateTimeFormatOptions): string =>
  new Date(secs * 1000).toLocaleDateString(undefined, opts)

// "Today" / "Monday, October 12, 2026"
function dayLabel(dayStart: number): string {
  if (dayStart === startOfDay()) return 'Today'
  return fmtDate(dayStart, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// "This week" / "Oct 12 – 18, 2026" / "Sep 28 – Oct 4, 2026" / "Dec 29, 2025 – Jan 4, 2026"
function weekLabel(weekStart: number): string {
  if (weekStart === weekStartMonday()) return 'This week'
  const end = addDays(weekStart, 6)
  const a = new Date(weekStart * 1000)
  const b = new Date(end * 1000)
  if (a.getFullYear() !== b.getFullYear()) {
    const full: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    return `${fmtDate(weekStart, full)} – ${fmtDate(end, full)}`
  }
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (a.getMonth() === b.getMonth()) {
    return `${fmtDate(weekStart, short)} – ${b.getDate()}, ${b.getFullYear()}`
  }
  return `${fmtDate(weekStart, short)} – ${fmtDate(end, { ...short, year: 'numeric' })}`
}

// "This month" / "October 2026"
function monthLabel(monthStart: number): string {
  if (monthStart === startOfMonth(startOfDay())) return 'This month'
  return fmtDate(monthStart, { month: 'long', year: 'numeric' })
}

// ---- Tab bodies: each owns its fetch, keyed on the range it is shown for ----

function TodayTab({ dayStart }: { dayStart: number }): React.JSX.Element {
  const day = useAsync(() => api.trends.getDay(dayStart), [dayStart])
  const breakdown = useAsync(() => api.trends.getDayBreakdown(dayStart), [dayStart])
  const totals = day.data ?? ZERO_SESSION
  const lists = breakdown.data ?? { productive: [], unproductive: [], notsure: [] }
  const isToday = dayStart === startOfDay()

  return (
    <>
      {/* Session summary card: big productive-minutes stat, 3-up stat grid, full stacked bar. */}
      <div className="rounded-xl border border-border-default bg-card p-7 shadow-sm">
        <div className="mb-[6px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {isToday ? 'Productive this session' : 'Productive that day'}
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

      {/* Where the time went: one ranked list per classification (D11), side by side. */}
      <div className="mt-[18px] grid grid-cols-3 gap-[18px]">
        <BreakdownList title="Productive" dot="bg-productive" items={lists.productive} />
        <BreakdownList title="Unproductive" dot="bg-unproductive" items={lists.unproductive} />
        <BreakdownList title="Not sure" dot="bg-notsure" items={lists.notsure} />
      </div>
    </>
  )
}

function WeekTab({ weekStart }: { weekStart: number }): React.JSX.Element {
  const trends = useAsync(() => api.trends.getWeek(weekStart), [weekStart])
  const week: TrendDay[] = trends.data ?? []

  return (
    // Trends card: 7-day stacked bar chart + legend.
    <div className="rounded-xl border border-border-default bg-card p-7 shadow-sm">
      <div className="mb-[14px]">
        <div className="font-display text-[20px] font-medium tracking-[-0.01em] text-ink">
          Productivity this week
        </div>
        <div className="mt-[2px] text-[13px] text-muted">
          Productive · unproductive · not-sure, per day
        </div>
      </div>

      <TrendsChart week={week} />
      <Legend />
    </div>
  )
}

function MonthTab({ monthStart }: { monthStart: number }): React.JSX.Element {
  const trends = useAsync(() => api.trends.getMonth(monthStart), [monthStart])
  const weeks: TrendWeek[] = trends.data ?? []

  return (
    // Month card: one stacked bar per Mon–Sun week touching the month + legend.
    <div className="rounded-xl border border-border-default bg-card p-7 shadow-sm">
      <div className="mb-[14px]">
        <div className="font-display text-[20px] font-medium tracking-[-0.01em] text-ink">
          Productivity this month
        </div>
        <div className="mt-[2px] text-[13px] text-muted">
          Productive · unproductive · not-sure, per week
        </div>
      </div>

      <MonthChart weeks={weeks} />
      <Legend />
    </div>
  )
}

export default function Trends(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('today')
  // One range per tab, so stepping back a week doesn't move the day or month views.
  const [dayStart, setDayStart] = useState(() => startOfDay())
  const [weekStart, setWeekStart] = useState(() => weekStartMonday())
  const [monthStart, setMonthStart] = useState(() => startOfMonth(startOfDay()))

  // The active tab's RangeNav: label + arrow steps + "Today" reset.
  const nav =
    tab === 'today'
      ? {
          label: dayLabel(dayStart),
          step: (n: number) => setDayStart((d) => addDays(d, n)),
          reset: () => setDayStart(startOfDay())
        }
      : tab === 'week'
        ? {
            label: weekLabel(weekStart),
            step: (n: number) => setWeekStart((w) => addDays(w, 7 * n)),
            reset: () => setWeekStart(weekStartMonday())
          }
        : {
            label: monthLabel(monthStart),
            step: (n: number) => setMonthStart((m) => addMonths(m, n)),
            reset: () => setMonthStart(startOfMonth(startOfDay()))
          }

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

        <div className="mt-[22px] mb-[18px]">
          <RangeNav
            label={nav.label}
            onPrev={() => nav.step(-1)}
            onNext={() => nav.step(1)}
            onToday={nav.reset}
          />
        </div>

        {tab === 'today' && <TodayTab dayStart={dayStart} />}
        {tab === 'week' && <WeekTab weekStart={weekStart} />}
        {tab === 'month' && <MonthTab monthStart={monthStart} />}
      </div>
    </main>
  )
}
