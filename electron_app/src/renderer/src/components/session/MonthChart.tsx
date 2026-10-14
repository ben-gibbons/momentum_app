// components/session/MonthChart.tsx
// Stacked bar chart for the Productivity Trends → This month tab: one column per Mon–Sun week
// touching the month (trends.getMonth, A6), using the same column math as TrendsChart — a vertical
// StatBar whose height scales with that week's total relative to the busiest week, the rounded
// hour total, and a label. The label is the week's actual date range ("Oct 6–12"; a week that
// straddles a month boundary reads "Sep 28–Oct 4"). Presentational — rows come from the screen.
import type { TrendWeek } from '../../../../shared/types'
import { StatBar } from './StatBar'

const BARWRAP_HEIGHT = 168 // .mm-chart__barwrap fixed height (px)
const MAX_BAR = 150 // tallest bar fills this; +8 floor keeps quiet weeks visible

// "Oct 6–12", or "Sep 28–Oct 4" when the week crosses into the next month.
function rangeLabel(weekStart: number, weekEnd: number): string {
  const a = new Date(weekStart * 1000)
  const b = new Date(weekEnd * 1000)
  const mon = (d: Date): string => d.toLocaleDateString(undefined, { month: 'short' })
  const sameMonth = a.getMonth() === b.getMonth()
  return sameMonth
    ? `${mon(a)} ${a.getDate()}–${b.getDate()}`
    : `${mon(a)} ${a.getDate()}–${mon(b)} ${b.getDate()}`
}

export function MonthChart({ weeks }: { weeks: TrendWeek[] }): React.JSX.Element {
  const totals = weeks.map((w) => w.productive + w.unproductive + w.notsure)
  // Guard against an all-zero month so the height ratio never divides by zero.
  const max = Math.max(1, ...totals)

  return (
    // .mm-chart: columns aligned to a shared baseline, evenly spaced
    <div className="flex items-end justify-between gap-[14px] px-1 pt-2">
      {weeks.map((w) => {
        const total = w.productive + w.unproductive + w.notsure
        const h = Math.round((total / max) * MAX_BAR) + 8
        return (
          // .mm-chart__col
          <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-2">
            {/* .mm-chart__barwrap: fixed-height area, bars grow up from the baseline */}
            <div className="flex items-end" style={{ height: BARWRAP_HEIGHT }}>
              <div style={{ height: h, width: 18 }}>
                <StatBar
                  orientation="vertical"
                  productive={w.productive}
                  unproductive={w.unproductive}
                  notsure={w.notsure}
                />
              </div>
            </div>
            {/* .mm-chart__total: rounded hours, data font */}
            <span className="font-data text-[12px] text-muted">{Math.round(total / 60)}h</span>
            {/* .mm-chart__day — here the week's date range */}
            <span className="whitespace-nowrap text-[12px] font-semibold text-faint">
              {rangeLabel(w.weekStart, w.weekEnd)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
