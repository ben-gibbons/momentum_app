// components/Nudge.tsx
// The "Feeling distracted?" nudge — a centered modal dialog (design source: the `Dialog` in
// design_system/interactive-flows/index.html → App). Opened by App.tsx either when the main
// process pushes a DistractionEvent (a contiguous unproductive / not-sure run crossed its
// threshold) or manually from the sidebar. The body copy names the app/site and run length from
// the event; with no event (sidebar) it falls back to generic copy. Two stacked actions: a primary
// "Try a procrastination log" and a secondary "View risk factors". Presentational: open state +
// all handlers come from the parent. Backdrop click and the Escape key both close. Honors
// prefers-reduced-motion via motion-reduce on the fade/scale transition.
import { useEffect } from 'react'
import { Wind, X } from 'lucide-react'
import type { DistractionEvent } from '../../../shared/types'
import { distractionLines } from '../../../shared/format'

interface NudgeProps {
  open: boolean
  // The triggering event; null/undefined when opened manually from the sidebar.
  distraction?: DistractionEvent | null
  onClose?: () => void
  onTryLog?: () => void
  onViewRisk?: () => void
}

// Body copy, one array entry per line: a pushed event uses the shared lines (identical to the OS
// toast); a manual open from the sidebar gets a generic line.
function bodyCopy(d: DistractionEvent | null | undefined): string[] {
  return d ? distractionLines(d) : ["Let's take a look at what's pulling at you — no pressure."]
}

export function Nudge({
  open,
  distraction,
  onClose,
  onTryLog,
  onViewRisk
}: NudgeProps): React.JSX.Element | null {
  // The dialog unmounts when closed (returns null), so the entrance animation runs on mount via
  // the animate-* utilities — no transition state needed.

  // Escape closes while open.
  useEffect(() => {
    if (!open) return undefined
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(35,64,50,0.32)] p-6 animate-fade-in motion-reduce:animate-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nudge-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[400px] rounded-xl border border-border-default bg-card p-7 text-center shadow-sm animate-pop-in motion-reduce:animate-none"
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-body"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Wind className="h-6 w-6" />
        </div>
        <h2
          id="nudge-title"
          className="font-display text-[22px] font-medium tracking-[-0.01em] text-ink"
        >
          Feeling distracted?
        </h2>
        {bodyCopy(distraction).map((line) => (
          <p key={line} className="mx-auto mt-[10px] max-w-[320px] text-[15px] leading-[1.5] text-body">
            {line}
          </p>
        ))}

        <div className="mt-6 flex flex-col gap-[10px]">
          <button
            onClick={onTryLog}
            className="w-full rounded-lg bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Try a procrastination log
          </button>
          <button
            onClick={onViewRisk}
            className="w-full rounded-lg border border-border-strong bg-card px-5 py-3 text-[15px] font-semibold text-body transition-colors hover:bg-hover"
          >
            View risk factors
          </button>
        </div>
      </div>
    </div>
  )
}
