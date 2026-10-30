// components/tasks/StepsEditor.tsx
// The Steps section of TaskDialog (A9: plain text + optional minutes, no AI). Rows of
// text + "min" inputs with a remove button, and a dashed "Add a step" row in the TodayCard
// add-row idiom. Works on StepDraft rows (strings, so a half-typed minutes box never fights the
// input); TaskDialog converts them to TaskStepInput on save. A draft keeps the step's id in edit
// mode so tasks.update can update that step in place and preserve its completion state
// (TaskPatch.steps). Rows are numbered and carry a drag handle after the X (V2 item 7): a drop
// reorders the drafts in place, and the save writes each step's ordinal from its position.
import { Plus, X } from 'lucide-react'
import { ListNumber, moveItem, useReorder } from '../Reorder'

export interface StepDraft {
  id?: number // existing step (edit mode); absent = new
  key: string // stable React key: a saved step's id, or a counter for a new draft (newDraft)
  text: string
  estMinutes: string // '' = none
}

// A blank draft with a key of its own, so a reorder keeps each row's DOM node (and focus on its
// handle) with the step it belongs to — an index key would hand the node to whatever moved in.
let draftSeq = 0
const newDraft = (): StepDraft => ({ key: `n${++draftSeq}`, text: '', estMinutes: '' })

interface StepsEditorProps {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
}

const INPUT =
  'rounded-md border border-border-strong bg-input py-[8px] text-[14px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand'

export function StepsEditor({ steps, onChange }: StepsEditorProps): React.JSX.Element {
  function patch(i: number, change: Partial<StepDraft>): void {
    onChange(steps.map((s, j) => (j === i ? { ...s, ...change } : s)))
  }
  const reorder = useReorder(steps.length, (from, to) => onChange(moveItem(steps, from, to)))

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, i) => {
        const row = reorder.rowProps(i)
        return (
          <div key={step.key} {...row} className={`flex items-center gap-2 ${row.className}`}>
            <ListNumber n={i + 1} wide={steps.length >= 10} className="text-[14px]" />
            <input
              // A freshly added (empty, unsaved) last row gets focus so typing can continue.
              autoFocus={step.id == null && step.text === '' && i === steps.length - 1}
              value={step.text}
              onChange={(e) => patch(i, { text: e.target.value })}
              placeholder={`Step ${i + 1}`}
              className={`${INPUT} min-w-0 flex-1 px-[12px]`}
            />
            <span className="inline-flex items-center gap-[6px] font-data text-[12px] text-muted">
              <input
                type="number"
                min={1}
                value={step.estMinutes}
                onChange={(e) => patch(i, { estMinutes: e.target.value })}
                aria-label={`Step ${i + 1} minutes`}
                className={`${INPUT} w-[62px] px-[8px] font-data`}
              />
              min
            </span>
            <button
              type="button"
              aria-label={`Remove step ${i + 1}`}
              onClick={() => onChange(steps.filter((_, j) => j !== i))}
              className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-body"
            >
              <X className="h-4 w-4" />
            </button>
            {reorder.handle(i, `step ${i + 1}`)}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...steps, newDraft()])}
        className="flex w-full items-center gap-[9px] rounded-md border border-dashed border-border-strong px-[12px] py-[9px] text-left text-[14px] text-muted transition-colors hover:bg-hover"
      >
        <Plus className="h-4 w-4 text-brand" /> Add a step
      </button>
    </div>
  )
}
