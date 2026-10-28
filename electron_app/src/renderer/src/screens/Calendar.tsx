// screens/Calendar.tsx
// The Calendar screen (V1 item 5, D6): Day / Week / Month views of tasks, each with a RangeNav
// (‹ › + "Today"; labels always carry the year), the weekly list with N/target counts (Week view),
// and the reminder deep-link highlight. Owns the range state, the single TaskDialog instance the
// views open (create with a preset date / repeat mask, or edit), and a reload counter so a dialog
// save or a day change (dayKey, from push:dayChanged) refetches whichever view is shown.
// Props are the contract with App.tsx:
//   focus          — set when a reminder toast was clicked (push:openTask): select the week of
//                    e.date and highlight task e.taskId
//   onFocusHandled — called once that focus has been applied; App clears it to null so a later
//                    visit to Calendar doesn't replay it
//   dayKey         — bumped by App on push:dayChanged so the views refetch
import { useEffect, useState } from 'react'
import type { OpenTaskEvent } from '../../../shared/types'
import {
  addDays,
  addMonths,
  startOfDay,
  startOfMonth,
  weekStartMonday
} from '../../../shared/dates'
import { RangeNav } from '../components/RangeNav'
import { Tabs, type TabItem } from '../components/Tabs'
import { TaskDialog, type TaskDialogProps } from '../components/tasks/TaskDialog'
import { DayView } from '../components/calendar/DayView'
import { WeekView } from '../components/calendar/WeekView'
import { MonthView } from '../components/calendar/MonthView'
import { dayLabel, monthLabel, weekLabel } from '../components/calendar/shared'

interface CalendarProps {
  focus: OpenTaskEvent | null
  onFocusHandled: () => void
  dayKey: number
}

type Tab = 'day' | 'week' | 'month'

const HIGHLIGHT_MS = 4000

const TABS: TabItem<Tab>[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' }
]

// What the dialog is open on; closed = null.
type DialogState = Pick<TaskDialogProps, 'mode' | 'taskId' | 'initialDate' | 'initialRepeatDays'>

export default function Calendar({
  focus,
  onFocusHandled,
  dayKey
}: CalendarProps): React.JSX.Element {
  // A reminder deep-link (focus) shows that task's week with it highlighted. The toast click
  // usually mounts this screen, so the initial state is seeded from it; a focus arriving while
  // mounted is applied with React's "adjust state when a prop changes" pattern (setState during
  // render, guarded by seenFocus) — the repo's react-hooks rules forbid setState inside an effect.
  const [tab, setTab] = useState<Tab>('week')
  const [dayStart, setDayStart] = useState(() => startOfDay())
  const [weekStart, setWeekStart] = useState(() =>
    focus ? weekStartMonday(focus.date) : weekStartMonday()
  )
  const [monthStart, setMonthStart] = useState(() => startOfMonth(startOfDay()))
  const [highlightId, setHighlightId] = useState<number | null>(focus?.taskId ?? null)
  const [seenFocus, setSeenFocus] = useState(focus)
  if (focus !== seenFocus) {
    setSeenFocus(focus)
    if (focus) {
      setTab('week')
      setWeekStart(weekStartMonday(focus.date))
      setHighlightId(focus.taskId)
    }
  }
  // Hand the applied event back so App clears it and a later visit doesn't replay it.
  useEffect(() => {
    if (focus) onFocusHandled()
  }, [focus, onFocusHandled])
  // The ring fades after a few seconds.
  useEffect(() => {
    if (highlightId == null) return
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlightId])

  const [dialog, setDialog] = useState<DialogState | null>(null)
  // Bumped after a dialog save. dayKey and version only ever increase, so their sum changes
  // whenever either does — one dependency for the views to refetch on.
  const [version, setVersion] = useState(0)
  const reloadKey = dayKey + version

  function openCreate(initialDate: number, initialRepeatDays?: number): void {
    setDialog({ mode: 'create', initialDate, initialRepeatDays })
  }
  function openEdit(taskId: number): void {
    setDialog({ mode: 'edit', taskId })
  }

  function goToday(): void {
    const today = startOfDay()
    setDayStart(today)
    setWeekStart(weekStartMonday(today))
    setMonthStart(startOfMonth(today))
  }
  // ‹ › step one day / week / month for the shown tab.
  function step(n: number): void {
    if (tab === 'day') setDayStart((d) => addDays(d, n))
    else if (tab === 'week') setWeekStart((w) => addDays(w, 7 * n))
    else setMonthStart((m) => addMonths(m, n))
  }
  const label =
    tab === 'day'
      ? dayLabel(dayStart)
      : tab === 'week'
        ? weekLabel(weekStart)
        : monthLabel(monthStart)

  return (
    <main className="h-screen overflow-y-auto bg-paper">
      {/* Much wider than the other screens (920px) so the Week / Month grids get room, but still
          with the same 48px gutters at the window edges (AP1). */}
      <div className="mx-auto max-w-[1480px] px-12 pb-14 pt-9">
        {/* .mm-view__head — display title + calm sub-line (page eyebrows were dropped 2026-10-27) */}
        <header className="mb-[26px]">
          <h1 className="mt-0 font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Calendar
          </h1>
          <p className="mt-2 max-w-[540px] text-[17px] text-muted">
            Plan the week, one day at a time.
          </p>
        </header>

        <Tabs items={TABS} tab={tab} onChange={setTab} />
        {/* Arrows, range label and Today centered over the calendar (AP2). */}
        <div className="mb-5 mt-4 flex justify-center">
          <RangeNav
            label={label}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={goToday}
          />
        </div>

        {tab === 'day' && (
          <DayView
            dayStart={dayStart}
            reloadKey={reloadKey}
            onEdit={openEdit}
            onCreate={openCreate}
          />
        )}
        {tab === 'week' && (
          <WeekView
            weekStart={weekStart}
            reloadKey={reloadKey}
            highlightId={highlightId}
            onEdit={openEdit}
            onCreate={openCreate}
          />
        )}
        {tab === 'month' && (
          <MonthView
            monthStart={monthStart}
            reloadKey={reloadKey}
            onSelectDay={(day) => {
              setDayStart(day)
              setTab('day')
            }}
            onEdit={openEdit}
          />
        )}
      </div>

      <TaskDialog
        open={dialog != null}
        mode={dialog?.mode ?? 'create'}
        taskId={dialog?.taskId}
        initialDate={dialog?.initialDate}
        initialRepeatDays={dialog?.initialRepeatDays}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null)
          setVersion((v) => v + 1)
        }}
      />
    </main>
  )
}
