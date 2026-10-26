// components/RangeNav.tsx
// ‹ label › range navigation shared by Calendar (day / week / month) and Productivity Trends
// (today / week / month): two icon buttons around a label, plus an optional "Today" text button
// that jumps back to the current range. Presentational; the screen owns the range state and
// formats the label (date + year, range + year, or month + year per D6 / D11).
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface RangeNavProps {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday?: () => void
}

function ArrowButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-card text-body transition-colors hover:bg-hover"
    >
      {children}
    </button>
  )
}

export function RangeNav({ label, onPrev, onNext, onToday }: RangeNavProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <ArrowButton label="Previous" onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </ArrowButton>
      <span className="min-w-[180px] text-center text-[15px] font-semibold text-ink">{label}</span>
      <ArrowButton label="Next" onClick={onNext}>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </ArrowButton>
      {onToday && (
        <button
          type="button"
          onClick={onToday}
          className="ml-1 rounded-md px-[10px] py-[6px] text-[13px] font-semibold text-brand transition-colors hover:bg-brand-soft"
        >
          Today
        </button>
      )}
    </div>
  )
}
