// components/tasks/TaskDialog.tsx
// The task create / edit dialog (V1 item 5, D7): title, date, due time, optional category, steps,
// reminder, repeat (D4). Phase 0 STUB — renders nothing. TaskDialogProps is the contract between
// Agent A (implements this component on Home) and Agent C (opens it from Calendar): neither may
// change it; a needed change goes through the lead.
//   mode 'create': initialDate (local midnight; the clicked day, default today) and
//                  initialRepeatDays (preset mask, e.g. from the weekly list's "+ Add") seed the form
//   mode 'edit':   taskId is loaded via api.tasks.get()
//   onSaved fires after a successful create / update / delete so the caller can refetch.
export interface TaskDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  taskId?: number
  initialDate?: number
  initialRepeatDays?: number
  onClose: () => void
  onSaved: () => void
}

export function TaskDialog(_props: TaskDialogProps): React.JSX.Element | null {
  return null
}
