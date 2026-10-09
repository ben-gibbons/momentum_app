// shared/format.ts
// Formatting shared by the main process (OS toast body) and the renderer (nudge copy), so the two
// never disagree about how a distraction run length reads. Pure; no Electron or DOM imports.

// The lines of a distraction nudge / toast, one entry per line: unproductive runs name the site
// or app and how long; not-sure runs first say why Momentum is asking. Used verbatim by both the
// in-app Nudge and the OS toast so the two never drift.
export function distractionLines(e: {
  classification: 2 | 3
  url: string | null
  label: string
  runSeconds: number
}): string[] {
  const been = `You've been on ${e.label} for ${formatRun(e.runSeconds)}.`
  return e.classification === 3
    ? [`We aren't sure if this ${e.url ? 'site' : 'app'} is productive or not.`, been]
    : [`${been} Let's take a look — no pressure.`]
}

// Seconds → the exact run length ("45 seconds", "2 minutes", "2 minutes 10 seconds"), so the copy
// agrees with whatever threshold the user set.
export function formatRun(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const mins = `${m} minute${m === 1 ? '' : 's'}`
  return s === 0 ? mins : `${mins} ${s} seconds`
}
