// screens/Calendar.tsx
// The Calendar screen (V1 item 5, D6): daily / weekly / monthly views of tasks with ‹ › arrows,
// the weekly list with N/target counts, and the reminder deep-link highlight. Phase 0 STUB —
// header only; Agent C fills in the views (components/calendar/*). Props are the contract:
//   focus  — set when a reminder toast was clicked (push:openTask): select the week of e.date and
//            highlight task e.taskId
//   dayKey — bumped by App on push:dayChanged so the views refetch
import type { OpenTaskEvent } from '../../../shared/types'

interface CalendarProps {
  focus: OpenTaskEvent | null
  dayKey: number
}

export default function Calendar(_props: CalendarProps): React.JSX.Element {
  return (
    <main className="h-screen overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[920px] px-12 pb-14 pt-9">
        {/* .mm-view__head — eyebrow + display title + calm sub-line */}
        <header className="mb-[26px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Your week
          </div>
          <h1 className="mt-[6px] font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Calendar
          </h1>
          <p className="mt-2 max-w-[540px] text-[17px] text-muted">
            Plan the week, one day at a time.
          </p>
        </header>
        <p className="text-[15px] text-muted">Coming in Phase 1.</p>
      </div>
    </main>
  )
}
