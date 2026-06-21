// components/risk/FactorCard.tsx
// A single selectable risk-factor card (recreates `.mm-risk` from the design's RiskFactors.jsx):
// an icon tile above a label, with hover and selected ("--on") states. Presentational — the
// RiskFactors screen owns selection state and passes `selected` + `onSelect`.
import type { LucideIcon } from 'lucide-react'
import { Circle } from 'lucide-react'

interface FactorCardProps {
  label: string
  icon?: LucideIcon
  selected: boolean
  onSelect: () => void
}

export function FactorCard({
  label,
  icon,
  selected,
  onSelect
}: FactorCardProps): React.JSX.Element {
  const Icon = icon ?? Circle
  return (
    <button
      onClick={onSelect}
      // Base card matches .mm-risk; selected state matches .mm-risk--on (brand border + soft fill
      // + focus ring). Focus ring uses the design's --ring-focus token via an arbitrary value.
      className={
        'flex flex-col items-start gap-3 rounded-lg border p-[18px] text-left transition-all ' +
        (selected
          ? 'border-brand bg-brand-soft shadow-[var(--ring-focus)]'
          : 'border-border-default bg-raised hover:border-border-brand hover:bg-green-50')
      }
    >
      <span
        className={
          'inline-flex h-[38px] w-[38px] items-center justify-center rounded-md text-brand ' +
          (selected ? 'bg-white' : 'bg-card')
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[15px] font-semibold text-ink">{label}</span>
    </button>
  )
}
