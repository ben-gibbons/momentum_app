// components/Hero.tsx
// Forest-green hero banner from the home screen: eyebrow date, time-of-day greeting, a calm
// remaining-tasks sub-line, a live "focused today" pill, and a New log button. Pure presentational
// component — data + the onNewLog handler come from the Home screen.
import { NotebookPen } from 'lucide-react'
import { formatHM, greeting, remainingLine, todayLabel } from '../lib/format'

interface HeroProps {
  userName: string
  focusedMinutes: number
  incompleteCount: number
  onNewLog?: () => void
}

export function Hero({
  userName,
  focusedMinutes,
  incompleteCount,
  onNewLog
}: HeroProps): React.JSX.Element {
  return (
    <div className="bg-green-800 px-12 py-7 text-green-100">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-green-300">
            {todayLabel()}
          </div>
          <h1 className="mt-[10px] font-display text-[40px] font-medium leading-[1.06] tracking-[-0.02em] text-sand-50">
            {greeting(userName)}
          </h1>
          <p className="mt-3 text-[20px] text-green-200">{remainingLine(incompleteCount)}</p>
        </div>

        <div className="flex flex-none flex-col items-end gap-[10px]">
          <span className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border-brand bg-raised px-4 text-[13px] font-semibold text-brand">
            <span className="h-[7px] w-[7px] rounded-full bg-green-600" />
            {formatHM(focusedMinutes)} focused today
          </span>
          <button
            onClick={onNewLog}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-border-brand bg-raised px-4 text-[13px] font-semibold text-brand transition-colors hover:bg-green-50"
          >
            <NotebookPen className="h-[17px] w-[17px]" /> New log
          </button>
        </div>
      </div>
    </div>
  )
}
