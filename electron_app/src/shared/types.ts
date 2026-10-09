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

export interface DailyTask {
  id: number
  title: string
  category: Category | null
  due: string | null // formatted for display, e.g. "2:00 PM"
  completed: boolean
  steps: TaskStep[]
}

export interface WeeklyTask {
  id: number
  title: string
  category: Category | null
  completed: boolean
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
  productive: number
  unproductive: number
  notsure: number
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
    listWeekly(weekStart?: number): Promise<WeeklyTask[]>
    toggleComplete(taskId: number): Promise<{ completed: boolean }>
    create(input: TaskInput): Promise<number>
    addToDaily(weeklyId: number, date: number): Promise<number>
  }
  taskSteps: {
    toggle(stepId: number): Promise<{ completed: boolean }>
  }
  session: {
    getCurrent(): Promise<SessionTotals>
    getTodayFocus(): Promise<TodayFocus>
  }
  trends: {
    getWeek(): Promise<TrendDay[]>
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
  }
}
