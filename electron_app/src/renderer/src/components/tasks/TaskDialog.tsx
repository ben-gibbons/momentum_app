// components/tasks/TaskDialog.tsx
// The task create / edit dialog (V1 item 5, D7): title, date, due time, optional category, steps,
// reminder, repeat (D4). A centered scrim modal in the Nudge idiom (Escape / backdrop close,
// fade + pop-in), sized like the design-system Dialog wide variant (560px, radius 2xl), with the
// form controls styled like components/log/fields.tsx. Opened from Home (create for today, or
// edit via a task row) and from Calendar (create for a clicked day / with a repeat preset, edit).
//
// TaskDialogProps is the contract between Agent A (this component + Home) and Agent C
// (Calendar): neither may change it; a needed change goes through the lead.
//   mode 'create': initialDate (local midnight; the clicked day, default today) and
//                  initialRepeatDays (preset mask, e.g. from the weekly list's "+ Add") seed the form
//   mode 'edit':   taskId is loaded via api.tasks.get()
//   onSaved fires after a successful create / update / delete so the caller can refetch.
//
// Edit-mode rules follow TaskDetail / TaskPatch (shared/types.ts) and A5:
//   - the due date is editable on anything not yet done (a finished task keeps its date)
//   - a single daily: due date moves it; Repeat (on + Save) turns the task into a series from
//     that day; "Delete" removes the row. A single-entry weekly that has a day opens as that day
//     (tasks.get returns the daily).
//   - a series day (daily whose parent repeats): due date moves that one occurrence (the old day
//     stays as a superseded slot), repeat shown read-only with a note, no Delete — the series
//     would regenerate it; repeats are edited on the weekly row
//   - a single-entry weekly with no day: due date empty; saving one schedules it on that day
//   - a series weekly: due date = its start (moves the start), repeat editable; switching Repeat
//     off and saving is "Stop repeating" (it becomes a one-off task; the repository drops its
//     unfinished days after today); "Delete series" keeps ticked days as plain tasks and removes
//     everything else
// "Created on" under the due date is the task's createdAt (a carried-over task keeps its
// original's), so an old task that keeps being carried shows how long it has been waiting.
// Form state is initialised once at mount (the dialog unmounts when closed, and edit mode mounts
// the form only after the task has loaded), so no prop → state syncing is needed.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Category, TaskDetail, TaskStepInput } from '../../../../shared/types'
import { startOfDay, weekdayBit } from '../../../../shared/dates'
import { api, ipcErrorMessage } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import {
  categoryLabel,
  fromDateInput,
  repeatLabel,
  shortDate,
  timeOnDay,
  toDateInput,
  toTimeInput
} from '../../lib/format'
import { TextField } from '../log/fields'
import { Switch } from '../settings/Switch'
import { RepeatPicker } from './RepeatPicker'
import { StepsEditor, type StepDraft } from './StepsEditor'

export interface TaskDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  taskId?: number
  initialDate?: number
  initialRepeatDays?: number
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES: Category[] = ['work', 'personal', 'hobby', 'goal']

// Native-input strings are kept as typed; they are converted to timestamps only on save.
interface FormState {
  title: string
  date: string // "YYYY-MM-DD"
  due: string // "HH:MM" or ''
  reminder: string // "HH:MM" or ''
  category: '' | Category // '' = none
  steps: StepDraft[]
  repeatOn: boolean
  repeatDays: number // weekday mask (kept while the switch is off so toggling back restores it)
  ends: string // "YYYY-MM-DD" or '' = until stopped
}

function fromProps(
  initialDate: number | undefined,
  initialRepeatDays: number | undefined
): FormState {
  const day = initialDate ?? startOfDay()
  const mask = initialRepeatDays ?? 0
  return {
    title: '',
    date: toDateInput(day),
    due: '',
    reminder: '',
    category: '',
    steps: [],
    repeatOn: mask !== 0,
    repeatDays: mask,
    ends: ''
  }
}

function fromDetail(d: TaskDetail): FormState {
  return {
    title: d.title,
    date: d.date == null ? '' : toDateInput(d.date), // null = an unscheduled weekly

    due: toTimeInput(d.dueDate),
    reminder: toTimeInput(d.reminderTime),
    category: d.category ?? '',
    steps: d.steps.map((s) => ({
      id: s.id,
      text: s.text,
      estMinutes: s.estMinutes == null ? '' : String(s.estMinutes)
    })),
    repeatOn: d.repeatDays !== 0,
    repeatDays: d.repeatDays,
    ends: d.repeatUntil == null ? '' : toDateInput(d.repeatUntil)
  }
}

const INPUT =
  'w-full rounded-md border border-border-strong bg-input px-[13px] py-[11px] text-[15px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand disabled:opacity-50'
const BTN_PRIMARY =
  'rounded-lg bg-brand px-5 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-50'
const BTN_SECONDARY =
  'rounded-lg border border-border-strong bg-card px-5 py-[10px] text-[14px] font-semibold text-body transition-colors hover:bg-hover disabled:opacity-50'
const BTN_DANGER_TEXT =
  'rounded-lg px-3 py-[10px] text-[14px] font-semibold text-unproductive transition-colors hover:bg-unproductive-soft disabled:opacity-50'

// Label + control, matching fields.tsx's FieldShell (not exported there).
function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="text-[13px] font-semibold text-body">{label}</span>
      {children}
    </label>
  )
}

interface TaskFormProps {
  initial: FormState
  detail: TaskDetail | null // null in create mode
  onClose: () => void
  onSaved: () => void
}

function TaskForm({ initial, detail, onClose, onSaved }: TaskFormProps): React.JSX.Element {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (change: Partial<FormState>): void => setForm((f) => ({ ...f, ...change }))

  const isWeekly = detail?.type === 'weekly'
  const isSeries = isWeekly && detail.repeatDays !== 0
  const isSeriesDay = detail?.type === 'daily' && detail.repeatDays !== 0
  // A finished task keeps its date; anything still open can be moved.
  const dateLocked = detail?.completed === true
  // Only a single-entry weekly may have no date (unscheduled); everything else needs one.
  const dateOptional = isWeekly && !isSeries
  // Repeat is set on create, on a weekly row, or on a plain daily (its task becomes a series);
  // a series day shows its parent's repeat read-only instead.
  const showRepeat = !isSeriesDay
  const baseDay = fromDateInput(form.date) ?? startOfDay()

  // Runs one API call, then tells the caller to refetch and closes; errors show in the dialog.
  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
      onClose()
    } catch (e) {
      setError(ipcErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function save(): void {
    const title = form.title.trim()
    const day = fromDateInput(form.date)
    const repeatOn = showRepeat && form.repeatOn
    const ends = repeatOn ? fromDateInput(form.ends) : null
    if (!title) return setError('Give the task a title.')
    if (day == null && !dateOptional) return setError('Pick a date.')
    if (repeatOn && form.repeatDays === 0) return setError('Pick at least one day to repeat on.')
    // A one-off day becoming a series is its first occurrence, so its weekday must be in the mask
    // (the repository would otherwise prune the very row being edited).
    if (repeatOn && detail?.type === 'daily' && !(form.repeatDays & weekdayBit(baseDay))) {
      const weekday = new Date(baseDay * 1000).toLocaleDateString(undefined, { weekday: 'long' })
      return setError(`Include this task's own day (${weekday}) in the repeat days.`)
    }
    if (ends != null && day != null && ends < day)
      return setError('The end date is before the start date.')

    const steps: TaskStepInput[] = form.steps
      .filter((s) => s.text.trim() !== '')
      .map((s) => ({
        ...(s.id != null ? { id: s.id } : {}),
        text: s.text.trim(),
        estMinutes: s.estMinutes === '' ? null : Number(s.estMinutes)
      }))
    const common = {
      title,
      category: form.category || null,
      dueDate: timeOnDay(baseDay, form.due),
      reminderTime: timeOnDay(baseDay, form.reminder),
      steps
    }
    const repeat = showRepeat
      ? { repeatDays: repeatOn ? form.repeatDays : 0, repeatUntil: ends }
      : {}

    void run(() =>
      detail
        ? api.tasks.update(detail.id, {
            ...common,
            ...repeat,
            ...(dateLocked || day == null ? {} : { date: day })
          })
        : api.tasks.create({ type: 'daily', date: day, ...common, ...repeat })
    )
  }

  function remove(): void {
    if (detail) void run(() => api.tasks.remove(detail.id))
  }

  // "Created on 10/13/26" — shown under the due date in edit mode.
  const createdOn =
    detail?.createdAt == null
      ? null
      : new Date(detail.createdAt * 1000).toLocaleDateString(undefined, {
          month: '2-digit',
          day: '2-digit',
          year: '2-digit'
        })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="mt-5 flex flex-col gap-[18px]"
    >
      <TextField
        label="Title"
        value={form.title}
        onChange={(v) => set({ title: v })}
        placeholder="What needs doing?"
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-[6px]">
          <Field label="Due date">
            <input
              type="date"
              value={form.date}
              disabled={dateLocked}
              onChange={(e) => set({ date: e.target.value })}
              className={INPUT}
            />
          </Field>
          {createdOn && <span className="text-[12px] text-faint">Created on {createdOn}</span>}
        </div>
        <Field label="Due time">
          <input
            type="time"
            value={form.due}
            onChange={(e) => set({ due: e.target.value })}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => set({ category: e.target.value as FormState['category'] })}
            className={`${INPUT} ${form.category ? 'text-body' : 'text-faint'}`}
          >
            <option value="">None</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="text-body">
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reminder">
          <input
            type="time"
            value={form.reminder}
            onChange={(e) => set({ reminder: e.target.value })}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-[7px]">
        <span className="text-[13px] font-semibold text-body">Steps</span>
        <StepsEditor steps={form.steps} onChange={(steps) => set({ steps })} />
      </div>

      {showRepeat && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-[11px]">
            <Switch
              checked={form.repeatOn}
              onChange={(on) =>
                set({
                  repeatOn: on,
                  // First switch-on starts from the task date's weekday.
                  repeatDays: on && form.repeatDays === 0 ? weekdayBit(baseDay) : form.repeatDays
                })
              }
            />
            <span
              className={`text-[13px] font-semibold ${form.repeatOn ? 'text-body' : 'text-faint'}`}
            >
              Repeat
            </span>
            {/* Switching a series off is "Stop repeating": saved as repeatDays 0. */}
            {isSeries && !form.repeatOn && (
              <span className="text-[12px] text-faint">
                Saving makes this a one-off task; unfinished days after today are removed.
              </span>
            )}
          </div>
          {form.repeatOn && (
            <>
              <RepeatPicker
                value={form.repeatDays}
                dateBit={weekdayBit(baseDay)}
                onChange={(repeatDays) => set({ repeatDays })}
              />
              <label className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-body">Ends</span>
                <input
                  type="date"
                  value={form.ends}
                  min={form.date}
                  onChange={(e) => set({ ends: e.target.value })}
                  className={`${INPUT} w-auto`}
                />
                <span className="text-[12px] text-faint">Leave empty to repeat until stopped.</span>
              </label>
            </>
          )}
        </div>
      )}
      {isSeriesDay && detail && (
        <p className="rounded-md bg-sunken px-4 py-3 text-[13px] text-muted">
          One day of a task that repeats {repeatLabel(detail.repeatDays).toLowerCase()}
          {detail.repeatUntil != null && ` until ${shortDate(detail.repeatUntil)}`}. Repeats are
          edited on the weekly task.
        </p>
      )}

      {error && <p className="text-[13px] text-unproductive">{error}</p>}

      {confirmDelete && detail ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-unproductive-soft px-4 py-3">
          <p className="text-[13px] text-body">
            {isSeries
              ? 'Delete this series? Ticked days are kept as plain tasks; everything else is removed.'
              : 'Delete this task?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className={BTN_SECONDARY}
            >
              Keep
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg bg-unproductive px-5 py-[10px] text-[14px] font-semibold text-on-brand transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {isSeries ? 'Delete series' : 'Delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {detail && !isSeriesDay && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className={BTN_DANGER_TEXT}
              >
                {isSeries ? 'Delete series' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-[10px]">
            <button type="button" onClick={onClose} disabled={busy} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>
              Save
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

// Edit mode: load the task, then mount the form with its values.
function EditForm({
  taskId,
  onClose,
  onSaved
}: {
  taskId: number
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const detail = useAsync(() => api.tasks.get(taskId), [taskId])
  if (detail.loading) return <p className="py-10 text-center text-[15px] text-muted">Loading…</p>
  if (!detail.data) {
    return <p className="py-10 text-center text-[15px] text-muted">This task no longer exists.</p>
  }
  return (
    <TaskForm
      initial={fromDetail(detail.data)}
      detail={detail.data}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}

export function TaskDialog({
  open,
  mode,
  taskId,
  initialDate,
  initialRepeatDays,
  onClose,
  onSaved
}: TaskDialogProps): React.JSX.Element | null {
  // Escape closes while open (same as Nudge).
  useEffect(() => {
    if (!open) return undefined
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const editing = mode === 'edit' && taskId != null

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(35,64,50,0.32)] p-6 animate-fade-in motion-reduce:animate-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[calc(100vh-48px)] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-border-default bg-card p-7 shadow-sm animate-pop-in motion-reduce:animate-none"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-body"
        >
          <X className="h-4 w-4" />
        </button>
        <h2
          id="task-dialog-title"
          className="font-display text-[22px] font-medium tracking-[-0.01em] text-ink"
        >
          {editing ? 'Edit task' : 'New task'}
        </h2>
        {editing ? (
          <EditForm taskId={taskId} onClose={onClose} onSaved={onSaved} />
        ) : (
          <TaskForm
            initial={fromProps(initialDate, initialRepeatDays)}
            detail={null}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  )
}
