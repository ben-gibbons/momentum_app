// components/session/SessionStatGrid.tsx
// The 3-up stat grid for the Current Session view: productive / unproductive / not-sure totals,
// each as a status dot + big data number + uppercase label. Recreates kit.css .mm-statgrid* with
// Tailwind token utilities. Presentational — totals come from the Session screen (SessionTotals).
import type { SessionTotals } from '../../../../shared/types'
import { formatHM } from '../../lib/format'

interface StatItem {
  key: 'productive' | 'unproductive' | 'notsure'
  label: string
  dot: string // dot color utility (matches the classification swatch)
  value: number
}

// Status dot colors mirror the design's productive/unproductive/not-sure tokens.
function items(totals: SessionTotals): StatItem[] {
  return [
    { key: 'productive', label: 'Productive', dot: 'bg-productive', value: totals.productive },
    {
      key: 'unproductive',
      label: 'Unproductive',
      dot: 'bg-unproductive',
      value: totals.unproductive
    },
    { key: 'notsure', label: 'Not-sure', dot: 'bg-notsure', value: totals.notsure }
  ]
}

export function SessionStatGrid({ totals }: { totals: SessionTotals }): React.JSX.Element {
  return (
    // .mm-statgrid: 3 equal columns, 18px gap
    <div className="grid grid-cols-3 gap-[18px]">
      {items(totals).map((item) => (
        // .mm-statgrid__item: raised surface, subtle border, lg radius, 18px padding
        <div
          key={item.key}
          className="flex flex-col gap-[6px] rounded-lg border border-border-subtle bg-raised p-[18px]"
        >
          {/* lg status dot (13px) */}
          <span className={`h-[13px] w-[13px] flex-none rounded-full ${item.dot}`} />
          {/* .mm-statgrid__num: 28px data number */}
          <span className="mt-1 font-data text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
            {formatHM(item.value)}
          </span>
          {/* .mm-statgrid__lbl: uppercase muted label */}
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
