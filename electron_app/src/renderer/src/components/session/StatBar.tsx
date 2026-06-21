// components/session/StatBar.tsx
// The signature Momentum stacked bar: productive / unproductive / not-sure segments sized by their
// share of the total. Recreates the design-system StatBar (kit.css .mm-statbar*) in Tailwind.
// Horizontal for the session summary; vertical for each column of the 7-day trends chart.
// Presentational — values (minutes) come from the parent.
interface StatBarProps {
  productive: number
  unproductive: number
  notsure: number
  orientation?: 'horizontal' | 'vertical'
}

// Each segment grows proportionally via flex-grow; min-w-0 lets thin segments shrink. A zero-value
// segment is omitted (matching the design StatBar, which renders only val > 0).
function Segment({ value, color }: { value: number; color: string }): React.JSX.Element | null {
  if (value <= 0) return null
  return <span style={{ flexGrow: value }} className={`min-w-0 ${color}`} />
}

export function StatBar({
  productive,
  unproductive,
  notsure,
  orientation = 'horizontal'
}: StatBarProps): React.JSX.Element {
  const vertical = orientation === 'vertical'
  // .mm-statbar__track: pill track on a sunken surface, 2px gaps between segments. Vertical stacks
  // bottom-up (column-reverse) and fills its parent's height; horizontal is a fixed-height bar.
  const track = vertical
    ? 'flex h-full w-[14px] flex-col-reverse gap-[2px] overflow-hidden rounded-full bg-sand-200'
    : 'flex h-[14px] gap-[2px] overflow-hidden rounded-full bg-sand-200'
  return (
    <div className={track}>
      <Segment value={productive} color="bg-productive" />
      <Segment value={unproductive} color="bg-unproductive" />
      <Segment value={notsure} color="bg-notsure" />
    </div>
  )
}
