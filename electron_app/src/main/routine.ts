// routine.ts
// The daily task routine (V1 item 5): what happens to tasks when a new day starts. Runs at
// launch, at local midnight and after unlock / wake (dayChange.ts). Idempotent per day via the
// `last_routine_day` settings key, and every step is also safe to repeat (each checks for the
// row it would create), so a reset of that key re-runs harmlessly. One transaction. The SQL for
// each step lives in repositories/tasks.ts; this file only sequences them:
//   1. series rows for this week — continue every active series (D4) and start a series for each
//      selected risk factor still in its window (D9)
//   2. weekly carry-over — incomplete single-entry weeklies copy into this week (D5)
//   3. daily carry-over — incomplete single-entry dailies from any past day copy to today (D1)
//   4. generate today's (and this week's remaining) daily rows for every series (A3)
//   5. record the day
import { getDb } from './db'
import * as tasks from './repositories/tasks'
import * as settings from './repositories/settings'
import { startOfDay, weekStartMonday } from './repositories/util'

const LAST_RUN_KEY = 'last_routine_day'

// Returns false when the routine already ran for `today`.
export function runDailyRoutine(today: number = startOfDay()): boolean {
  if (settings.get(LAST_RUN_KEY) === String(today)) return false
  const thisWeek = weekStartMonday(today)
  getDb().transaction(() => {
    tasks.continueSeries(thisWeek)
    tasks.ensureRiskFactorSeries(today, thisWeek)
    tasks.carryWeeklies(thisWeek)
    tasks.carryDailies(today, thisWeek)
    tasks.generateThisWeek(today, thisWeek)
    settings.set(LAST_RUN_KEY, String(today))
  })()
  return true
}
