// shared/types.ts
// DTOs shared across the main process (repositories + IPC), the preload bridge, and the
// renderer. These are the renderer-facing data shapes — derived from the design data contract
// (design_system/interactive-flows/data.js) and mapped from the SQLite schema by the repository
// layer. The SQLite tables (docs/database-overview.md + db.ts) are the storage source of truth;
// these types are what crosses the IPC boundary. MomentumApi at the bottom is the exact surface
// the preload exposes on window.api.

export type Category = 'work' | 'personal' | 'hobby' | 'goal'
export type LogSource = 'manual' | 'popup' | 'risk_factor'

// ---- Tasks ----

export interface TaskStep {
  id: number
  text: string
  estMinutes: number | null
  completed: boolean
  isNext: boolean // first incomplete step by ordinal — computed, not stored
}

// A daily row (one day's occurrence of a task). Completion lives on this row (D3). A projected
// row is a future occurrence of a repeating series that has no DB row yet: read-only, id null.
export interface DailyTask {
  id: number | null
  title: string
  category: Category | null
  date: number // local midnight, Unix seconds
  due: string | null // formatted for display, e.g. "2:00 PM"
  dueDate: number | null // Unix seconds
  reminderTime: number | null
  completed: boolean
  steps: TaskStep[]
  parentTaskId: number | null // the weekly row (series or single-entry mirror)
  recurring: boolean // the parent is a series (repeat_days != 0)
  riskFactor: string | null // label when the series came from a selected risk factor
  carried: boolean // a copy exists on a later day ("Carried to …")
  carriedTo: number | null // that copy's date
  carriedFrom: number | null // this row is the copy of that id
  projected: boolean
}

// A weekly row. For a series, target = occurrences this week and doneCount = completed dailies.
// A single-entry task has target 1; several dailies can hang off it (addToDaily), so doneCount
// may exceed target. completed = doneCount >= target with no daily still open, recomputed on
// every daily change (a new unticked day reopens a done weekly).
export interface WeeklyTask {
  id: number
  title: string
  category: Category | null
  completed: boolean
  doneCount: number
  target: number
  repeatDays: number // weekday mask, bit 0 = Mon … bit 6 = Sun; 0 = once
  repeatUntil: number | null // local midnight of the last day; null = until stopped
  startsOn: number | null // series start day (the dialog date)
  riskFactor: string | null
  carried: boolean // this row is a copy of an earlier week's single-entry weekly ("Carried over")
  carriedTo: number | null // the week_start of the copy made from this row ("Carried to …")
  scheduled: boolean // has a day (a live daily); "Add to a day" is offered only without one
}

export interface TaskStepInput {
  id?: number // on a patch: keep (and update) this existing step; absent = new step
  text: string
  estMinutes?: number | null
}

export interface TaskInput {
  type: 'weekly' | 'daily'
  title: string
  category?: Category | null
  weekStart?: number | null
  date?: number | null
  parentTaskId?: number | null
  dueDate?: number | null
  reminderTime?: number | null
  repeatDays?: number // non-zero creates a series (a weekly row + this week's dailies)
  repeatUntil?: number | null
  steps?: TaskStepInput[]
}

// Fields the edit dialog can change. Repeat fields only apply to a series (weekly) row and reach
// every week of the series; repeatDays 0 on a series is "Stop repeating" (it becomes a one-off
// task). `date` moves a single-entry daily (due / reminder times following), moves a single-entry
// weekly's day (or schedules one when it had none), moves a series' start, or moves one day of
// a series (the old day stays as a superseded slot, like a carried-over original). steps
// replaces the list (steps with an id are kept with their completion state).
export interface TaskPatch {
  title?: string
  category?: Category | null
  date?: number
  dueDate?: number | null
  reminderTime?: number | null
  repeatDays?: number
  repeatUntil?: number | null
  steps?: TaskStepInput[]
}

// One task row in full (edit dialog, reminder deep-link). tasks.get on a single-entry weekly
// that has a day returns that daily instead (the dialog edits the task, not its mirror), so a
// weekly here is either a series (date = its start) or an unscheduled single-entry one (date
// null). For a daily, the repeat fields are its parent's so the dialog knows it belongs to a
// series: a daily with repeatDays != 0 is a series day — it cannot be deleted on its own
// (tasks.remove throws), so the dialog offers no Delete for it. createdAt is when the task was
// first written (a carried-over copy keeps its original's); null only on rows older than that
// column.
export interface TaskDetail {
  id: number
  type: 'weekly' | 'daily'
  title: string
  category: Category | null
  weekStart: number | null
  date: number | null
  dueDate: number | null
  reminderTime: number | null
  completed: boolean
  parentTaskId: number | null
  repeatDays: number
  repeatUntil: number | null
  startsOn: number | null
  riskFactor: string | null
  carriedFrom: number | null
  createdAt: number | null
  steps: TaskStep[]
}

// Pushed main → renderer (push:openTask) when a reminder toast is clicked.
export interface OpenTaskEvent {
  taskId: number
  date: number
}

// ---- Session + trends (computed at query time from the sessions table) ----

export interface SessionTotals {
  productive: number // minutes
  unproductive: number
  notsure: number
}

export interface TodayFocus {
  focusedMinutes: number // productive minutes today (hero "focused today" pill)
  breakProgressMinutes: number // productive minutes in the current streak toward a break
  breakTargetMinutes: number // target before a break is suggested (50)
}

export interface TrendDay {
  day: string // 'Mon'..'Sun'
  date: number // local midnight, Unix seconds
  productive: number
  unproductive: number
  notsure: number
}

// One Mon–Sun week of a month view (minutes per classification).
export interface TrendWeek {
  weekStart: number
  weekEnd: number // the Sunday (local midnight)
  productive: number
  unproductive: number
  notsure: number
}

// An app or site ranked by minutes within one classification for one day.
export interface BreakdownItem {
  kind: 'app' | 'site'
  label: string // app name as recorded (incl. "Desktop"), or the host
  minutes: number
}

export interface Breakdown {
  productive: BreakdownItem[]
  unproductive: BreakdownItem[]
  notsure: BreakdownItem[]
}

// ---- Procrastination logs ----

export interface LogListItem {
  id: number
  label: string
  source: LogSource | null
  emotion: string | null
  createdAt: number
}

export interface LogStep {
  id?: number
  stepNumber: number
  description: string | null
  predictedDifficulty: number | null
  predictedTimeMins: number | null
  predictedSatisfaction: number | null
  actualDifficulty: number | null
  actualTimeMins: number | null
  actualSatisfaction: number | null
}

export interface ProcrastinationLog {
  id: number
  createdAt: number
  label: string
  source: LogSource | null
  taskText: string | null
  emotion: string | null
  temptingThought: string | null
  beliefBefore: number | null
  distortion: string | null
  selfControlThought: string | null
  beliefSelfControl: number | null
  beliefAfter: number | null
  takeaways: string | null
  riskFactor: string | null
  steps: LogStep[]
}

export interface LogInput {
  label?: string
  source?: LogSource
  taskText?: string | null
  emotion?: string | null
  temptingThought?: string | null
  beliefBefore?: number | null
  distortion?: string | null
  selfControlThought?: string | null
  beliefSelfControl?: number | null
  beliefAfter?: number | null
  takeaways?: string | null
  riskFactor?: string | null
  steps?: LogStep[]
}

// ---- Risk factors ----

export interface RiskFactorCatalogItem {
  id: number
  label: string
  isCustom: boolean
}

// ---- Classification (sessions.classification codes + productive/unproductive rules) ----

// Named codes for sessions.classification. Also used as a type (the union 1 | 2 | 3).
export const Classification = {
  PRODUCTIVE: 1,
  UNPRODUCTIVE: 2,
  NOT_SURE: 3
} as const
export type Classification = (typeof Classification)[keyof typeof Classification]

export type RuleKind = 'app' | 'site'

// One productive (1) / unproductive (2) list entry. pattern is lowercase; for sites it is the bare
// hostname (no scheme, path, or leading "www."), matched at a dot boundary (youtube.com also
// matches m.youtube.com).
export interface ClassificationRule {
  id: number
  kind: RuleKind
  pattern: string
  classification: 1 | 2
  createdAt: number
}

export interface RuleInput {
  kind: RuleKind
  pattern: string // raw user input; normalized by the repository
  classification: 1 | 2
}

// A not-sure app or site awaiting reclassification (Settings "Not sure yet" list).
export interface NotSureItem {
  kind: RuleKind
  pattern: string // app name as recorded, or lowercase host
  minutes: number
  lastSeen: number // Unix seconds
}

// ---- Settings + distraction push ----

// Typed view of the settings table. Durations are seconds.
export interface AppSettings {
  userName: string
  thresholdUnproductive: number
  thresholdNotSure: number
  // Time between nudges, per classification; each is at least its threshold.
  cooldownUnproductive: number
  cooldownNotSure: number
  // Master switch: off = no polling, no sidecar, no session rows, no nudges (Settings toggle).
  monitoringEnabled: boolean
  strictMode: boolean
}

// Pushed main → renderer (push:distraction) when a contiguous unproductive / not-sure run crosses
// its threshold. label is what the nudge names: the host for sites, the app name otherwise.
export interface DistractionEvent {
  classification: 2 | 3
  app: string
  url: string | null
  label: string
  runSeconds: number
}

// ---- The window.api surface exposed by the preload bridge ----

export interface MomentumApi {
  tasks: {
    listDaily(date?: number): Promise<DailyTask[]>
    // Daily rows with from <= date < to, plus projected future occurrences of active series.
    listDailyRange(from: number, to: number): Promise<DailyTask[]>
    listWeekly(weekStart?: number): Promise<WeeklyTask[]>
    get(taskId: number): Promise<TaskDetail | null>
    // Throws for a series weekly (it completes through its days).
    toggleComplete(taskId: number): Promise<{ completed: boolean }>
    create(input: TaskInput): Promise<number> // the daily's id, or the series' weekly id
    update(taskId: number, patch: TaskPatch): Promise<void>
    // A daily, a single-entry weekly (+ its daily), or a series (A5: keeps completed days). Throws
    // for a series day — the series would regenerate it; use update with repeatUntil, or remove
    // the series.
    remove(taskId: number): Promise<void>
    addToDaily(weeklyId: number, date: number): Promise<number>
  }
  taskSteps: {
    toggle(stepId: number): Promise<{ completed: boolean }>
    add(taskId: number, text: string, estMinutes?: number | null): Promise<number>
    remove(stepId: number): Promise<void>
  }
  session: {
    getCurrent(): Promise<SessionTotals>
    getTodayFocus(): Promise<TodayFocus>
  }
  trends: {
    getWeek(weekStart?: number): Promise<TrendDay[]>
    getDay(dayStart: number): Promise<SessionTotals>
    getBreakdown(from: number, to: number): Promise<Breakdown> // ranked apps / sites in [from, to)
    getMonth(monthStart: number): Promise<TrendWeek[]>
  }
  logs: {
    list(): Promise<LogListItem[]>
    get(id: number): Promise<ProcrastinationLog | null>
    create(input: LogInput): Promise<number>
    update(id: number, input: LogInput): Promise<void>
  }
  riskFactors: {
    listCatalog(): Promise<RiskFactorCatalogItem[]>
    addCustom(label: string): Promise<number>
    select(catalogId: number, recur?: boolean): Promise<number> // seeded log (+14-day recurrence if recur), returns its id
  }
  distortions: {
    list(): Promise<string[]>
  }
  rules: {
    list(): Promise<ClassificationRule[]>
    // Upserts the rule and rewrites matching past not-sure session rows; reclassified = rows changed.
    add(input: RuleInput): Promise<{ rule: ClassificationRule; reclassified: number }>
    remove(id: number): Promise<void> // never reverts session rows
    listNotSure(): Promise<NotSureItem[]>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    getAll(): Promise<AppSettings> // typed, with defaults for missing keys
  }
  app: {
    // Called when the cold-start splash finishes: resizes the 1100x700 splash window into the
    // normal resizable app window.
    splashDone(): Promise<void>
    // OS toast; clicking it brings the Momentum window forward.
    notify(title: string, body: string): Promise<void>
    // Called by the renderer once it has shown the nudge for a pushed DistractionEvent: bring the
    // window forward and show the OS toast. (The renderer owns the decision so a nudge it
    // suppresses — e.g. while a log is open — produces no toast either.)
    raiseDistraction(event: DistractionEvent): Promise<void>
  }
  events: {
    // Main → renderer push. Returns an unsubscribe function (for useEffect cleanup).
    onDistraction(cb: (e: DistractionEvent) => void): () => void
    // Monitoring paused (lock screen / sleep) or resumed; the timer store follows it.
    onMonitoringPaused(cb: (paused: boolean) => void): () => void
    // The daily routine ran (new day, or carry-over / generated rows at unlock): refetch tasks.
    onDayChanged(cb: () => void): () => void
    // A reminder toast was clicked: open Calendar on that task's week with it highlighted.
    onOpenTask(cb: (e: OpenTaskEvent) => void): () => void
  }
}
