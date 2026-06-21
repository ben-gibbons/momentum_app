// components/session/TrendsChart.tsx
// 7-day stacked bar chart for the Productivity Trends view. One column per day: a vertical StatBar
// (productive / unproductive / not-sure) whose height scales with that day's total minutes relative
// to the busiest day, plus the day's rounded hour total and its label. Recreates kit.css .mm-chart*.
// Presentational — the week of TrendDay rows comes from the Session screen.
import type { TrendDay } from '../../../../shared/types'
import { StatBar } from './StatBar'

const BARWRAP_HEIGHT = 168 // .mm-chart__barwrap fixed height (px)
const MAX_BAR = 150 // tallest bar fills this; +8 floor keeps quiet days visible (matches Session.jsx)

export function TrendsChart({ week }: { week: TrendDay[] }): React.JSX.Element {
  const totals = week.map((d) => d.productive + d.unproductive + d.notsure)
  // Guard against an all-zero week so the height ratio never divides by zero.
  const max = Math.max(1, ...totals)

  return (
    // .mm-chart: columns aligned to a shared baseline, evenly spaced
    <div className="flex items-end justify-between gap-[14px] px-1 pt-2">
      {week.map((d) => {
        const total = d.productive + d.unproductive + d.notsure
        const h = Math.round((total / max) * MAX_BAR) + 8
        return (
          // .mm-chart__col
          <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
            {/* .mm-chart__barwrap: fixed-height area, bars grow up from the baseline */}
            <div className="flex items-end" style={{ height: BARWRAP_HEIGHT }}>
              <div style={{ height: h, width: 18 }}>
                <StatBar
                  orientation="vertical"
                  productive={d.productive}
                  unproductive={d.unproductive}
                  notsure={d.notsure}
                />
              </div>
            </div>
            {/* .mm-chart__total: rounded hours, data font */}
            <span className="font-data text-[12px] text-muted">{Math.round(total / 60)}h</span>
            {/* .mm-chart__day */}
            <span className="text-[12px] font-semibold text-faint">{d.day}</span>
          </div>
        )
      })}
    </div>
  )
}
