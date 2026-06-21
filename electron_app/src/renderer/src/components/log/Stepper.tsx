// components/log/Stepper.tsx
// The progress stepper shown at the foot of each log step (design: `<Stepper total current />`
// inside .mm-log__nav — see the .mm-stepper rules in design_system/_ds_bundle.js). A row of 7px
// dots: steps before the current one fill green (done), the current step fills brand, upcoming
// steps stay sunken (sand). A "N of M" count sits to the right. Presentational only.

interface StepperProps {
  total: number
  current: number // zero-based index of the active step
}

export function Stepper({ total, current }: StepperProps): React.JSX.Element {
  return (
    <div className="flex max-w-[240px] flex-1 items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        // done = before current, current = active, upcoming = after.
        const fill = i < current ? 'bg-green-500' : i === current ? 'bg-brand' : 'bg-sunken'
        return <span key={i} className={`h-[7px] flex-1 rounded-full transition-colors ${fill}`} />
      })}
      <span className="ml-[10px] flex-none whitespace-nowrap font-data text-[12px] text-muted">
        {Math.min(current + 1, total)} of {total}
      </span>
    </div>
  )
}
