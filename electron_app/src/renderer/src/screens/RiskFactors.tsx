// screens/RiskFactors.tsx
// The Risk Factors check-in (recreates design_system/interactive-flows/RiskFactors.jsx). A grid of
// selectable factor cards sourced from the catalog (api.riskFactors.listCatalog), plus an "add
// custom" affordance. Selecting a factor seeds a procrastination log via api.riskFactors.select;
// recurrence is OPT-IN via the "Remind me daily for 2 weeks" toggle. On select, the new log id is
// handed to the optional onOpenLog prop so the lead can route to the log screen in Phase 3.
//
// Follows the Home.tsx exemplar: data via useAsync + api, mutations call the api then reload(),
// presentation split into a FactorCard subcomponent, styling via the design tokens. This builds
// ONLY the main-content panel (its own heading + scrollable container) — no sidebar.
import { useState } from 'react'
import {
  Moon,
  Droplet,
  Apple,
  Pill,
  Activity,
  Users,
  Sun,
  Smile,
  Award,
  Plus,
  ArrowRight,
  type LucideIcon
} from 'lucide-react'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'
import type { RiskFactorCatalogItem } from '../../../shared/types'
import { FactorCard } from '../components/risk/FactorCard'

// Maps known catalog labels to Lucide icons (mirrors the ICONS map in the design source).
// Custom factors fall back to FactorCard's default (Circle).
const FACTOR_ICONS: Record<string, LucideIcon> = {
  Sleep: Moon,
  Water: Droplet,
  Food: Apple,
  Medication: Pill,
  Exercise: Activity,
  'Social connection': Users,
  'Going outside': Sun,
  'Fun activities': Smile,
  'Sense of accomplishment': Award
}

export default function RiskFactors({
  onOpenLog
}: {
  onOpenLog?: (logId: number) => void
}): React.JSX.Element {
  const catalog = useAsync(() => api.riskFactors.listCatalog(), [])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [recur, setRecur] = useState(false)
  const [adding, setAdding] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [starting, setStarting] = useState(false)

  const factors = catalog.data ?? []
  const selected = factors.find((f) => f.id === selectedId) ?? null

  async function addCustom(): Promise<void> {
    const trimmed = customLabel.trim()
    setCustomLabel('')
    setAdding(false)
    if (!trimmed) return
    await api.riskFactors.addCustom(trimmed)
    catalog.reload()
  }

  async function startLog(): Promise<void> {
    if (selectedId == null || starting) return
    setStarting(true)
    try {
      const logId = await api.riskFactors.select(selectedId, recur)
      onOpenLog?.(logId)
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[980px] px-10 pb-16 pt-9">
        {/* View header (recreates .mm-view__head) */}
        <header className="mb-[26px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            A gentle check-in
          </div>
          <h1 className="mt-[6px] font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            What&apos;s running low?
          </h1>
          <p className="mt-2 max-w-[540px] text-[17px] text-muted">
            Distraction often starts in the body. Pick anything that&apos;s been neglected.
          </p>
        </header>

        {/* Card wrapping the grid (recreates Card padding="lg" + .mm-risk__foot) */}
        <div className="rounded-xl border border-border-default bg-card p-6 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            {factors.map((f: RiskFactorCatalogItem) => (
              <FactorCard
                key={f.id}
                label={f.label}
                icon={FACTOR_ICONS[f.label]}
                selected={selectedId === f.id}
                onSelect={() => setSelectedId(f.id)}
              />
            ))}

            {/* Add-custom affordance: a dashed card that reveals an inline input. */}
            {adding ? (
              <input
                autoFocus
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onBlur={addCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCustom()
                  if (e.key === 'Escape') {
                    setCustomLabel('')
                    setAdding(false)
                  }
                }}
                placeholder="Name your own…"
                className="rounded-lg border border-border-strong bg-input p-[18px] text-[15px] text-body outline-none placeholder:text-faint focus:border-border-brand"
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong p-[18px] text-left transition-colors hover:bg-hover"
              >
                <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-md bg-card text-brand">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-[15px] font-semibold text-muted">Add your own</span>
              </button>
            )}
          </div>

          {selected && (
            <div className="mt-[18px] flex items-center justify-between gap-4 border-t border-border-subtle pt-[18px]">
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px] text-muted">
                  We&apos;ll start a log for{' '}
                  <strong className="text-brand">lack of {selected.label.toLowerCase()}</strong>.
                </p>
                {/* Recurrence is opt-in — recur=true is only passed when this is checked. */}
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={recur}
                    onChange={(e) => setRecur(e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  Remind me daily for 2 weeks
                </label>
              </div>
              <button
                onClick={startLog}
                disabled={starting}
                className="inline-flex h-10 flex-none items-center gap-2 whitespace-nowrap rounded-lg bg-brand px-4 text-[13px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
              >
                Start the log <ArrowRight className="h-[17px] w-[17px]" />
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
