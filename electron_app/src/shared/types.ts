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
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  app: {
    // Called when the cold-start splash finishes: resizes the 1100x700 splash window into the
    // normal resizable app window.
    splashDone(): Promise<void>
  }
}
