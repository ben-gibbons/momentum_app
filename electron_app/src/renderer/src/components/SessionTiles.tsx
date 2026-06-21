// components/SessionTiles.tsx
// The two tiles below the Today card: "This session" (productive big-number + a productive/
// unproductive/not-sure stat bar) and "Toward a break" (an SVG progress ring toward the 50-min
// break target). Data comes from session.getCurrent + session.getTodayFocus.
import type { SessionTotals, TodayFocus } from '../../../shared/types'
import { formatHM } from '../lib/format'

const RING_RADIUS = 24
const RING_CIRC = 2 * Math.PI * RING_RADIUS // ≈ 150.8

interface SessionTilesProps {
  current: SessionTotals
  focus: TodayFocus
}

function StatBar({ current }: { current: SessionTotals }): React.JSX.Element {
  const total = current.productive + current.unproductive + current.notsure
  if (total === 0) {
    return <div className="mt-4 h-[9px] overflow-hidden rounded-full bg-sand-200" />
  }
  return (
    <div className="mt-4 flex h-[9px] overflow-hidden rounded-full">
      <span style={{ flex: current.productive }} className="bg-green-500" />
      <span style={{ flex: current.unproductive }} className="bg-unproductive" />
      <span style={{ flex: current.notsure }} className="bg-notsure" />
    </div>
  )
}

function BreakRing({ focus }: { focus: TodayFocus }): React.JSX.Element {
  const pct =
    focus.breakTargetMinutes > 0 ? focus.breakProgressMinutes / focus.breakTargetMinutes : 0
  const offset = RING_CIRC * (1 - Math.min(pct, 1))
  return (
    <div className="flex items-center gap-4">
      <svg width="58" height="58" viewBox="0 0 58 58" className="flex-none">
        <circle cx="29" cy="29" r={RING_RADIUS} fill="none" stroke="#e1d7c1" strokeWidth="6" />
        <circle
          cx="29"
          cy="29"
          r={RING_RADIUS}
          fill="none"
          stroke="#3c704f"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 29 29)"
        />
      </svg>
      <div>
        <div className="font-data text-[24px] font-semibold text-ink">
          {focus.breakProgressMinutes}
          <span className="text-[14px] text-muted">/{focus.breakTargetMinutes}</span>
        </div>
        <div className="mt-[3px] text-[13px] text-muted">min focused — keep going</div>
      </div>
    </div>
  )
}

export function SessionTiles({ current, focus }: SessionTilesProps): React.JSX.Element {
  return (
    <div className="mt-5 grid grid-cols-2 gap-[18px]">
      <div className="rounded-xl bg-green-800 px-[22px] py-5 shadow-sm">
        <div className="mb-[14px] text-[13px] font-semibold text-green-100">This session</div>
        <div className="font-data text-[34px] font-semibold leading-none tracking-[-0.02em] text-white">
          {formatHM(current.productive)}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.06em] text-green-200">
          productive
        </div>
        <StatBar current={current} />
      </div>

      <div className="rounded-xl border border-border-default bg-card px-[22px] py-5 shadow-sm">
        <div className="mb-[14px] text-[13px] font-semibold text-ink">Toward a break</div>
        <BreakRing focus={focus} />
      </div>
    </div>
  )
}
