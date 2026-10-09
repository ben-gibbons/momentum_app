// components/settings/RuleListEditor.tsx
// One classification list (Productive or Unproductive) on the Settings screen: the current rules as
// rows (kind pill + pattern + remove), an empty state, and an inline-add row in the
// TodayCard/RiskFactors style — a dashed "Add an app or site" button that expands into an
// App/Site select + text input + Add button. Enter adds, Escape cancels. The input's placeholder
// is the per-kind suggestion passed in by the screen (light grey, gone once the user types).
//
// Presentational: the screen owns the rules and the onAdd/onRemove handlers. When onAdd rejects
// (the repository throws for bad patterns, e.g. a site without a dot) the message is shown under
// the input and the typed value is kept so the user can fix it.
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ClassificationRule, RuleInput, RuleKind } from '../../../../shared/types'
import { Section } from './Section'
import { ipcErrorMessage } from '../../lib/api'

interface RuleListEditorProps {
  title: string
  caption: string
  classification: 1 | 2
  rules: ClassificationRule[]
  placeholders: { app: string; site: string }
  disabled?: boolean // greyed out while polling is switched off
  onAdd: (input: RuleInput) => Promise<void>
  onRemove: (id: number) => Promise<void>
}

const KIND_LABEL: Record<RuleKind, string> = { app: 'App', site: 'Site' }

// Kind pill — same styling as the task tag pill in TaskRow.
export function KindPill({ kind }: { kind: RuleKind }): React.JSX.Element {
  return (
    <span className="w-[42px] flex-none rounded-full bg-brand-soft px-[10px] py-[3px] text-center text-[11px] font-semibold text-brand">
      {KIND_LABEL[kind]}
    </span>
  )
}

export function RuleListEditor({
  title,
  caption,
  classification,
  rules,
  placeholders,
  disabled,
  onAdd,
  onRemove
}: RuleListEditorProps): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<RuleKind>('site')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function cancel(): void {
    setAdding(false)
    setValue('')
    setError(null)
  }

  async function submit(): Promise<void> {
    const pattern = value.trim()
    if (!pattern || busy) return
    setBusy(true)
    try {
      await onAdd({ kind, pattern, classification })
      cancel()
    } catch (e) {
      // Keep the typed value so it can be corrected in place.
      setError(ipcErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'min-w-0 flex-1 rounded-md border bg-input px-[13px] py-[10px] text-[15px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand'

  return (
    <Section title={title} caption={caption} disabled={disabled}>
      {rules.length === 0 ? (
        <p className="py-2 text-[15px] text-faint">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-[10px]">
              <KindPill kind={r.kind} />
              <span className="min-w-0 flex-1 truncate text-[15px] text-body">{r.pattern}</span>
              <button
                aria-label={`Remove ${r.pattern}`}
                onClick={() => onRemove(r.id)}
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-body"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        // Escape anywhere in the row cancels (bubbles from the select, input, or button).
        <div
          className="mt-[14px]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel()
          }}
        >
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as RuleKind)
                setError(null)
              }}
              className="rounded-md border border-border-strong bg-input px-[10px] py-[10px] text-[15px] text-body outline-none transition-colors focus:border-border-brand"
            >
              <option value="app">App</option>
              <option value="site">Site</option>
            </select>
            <input
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={placeholders[kind]}
              aria-invalid={error != null}
              className={`${inputClass} ${error ? 'border-unproductive' : 'border-border-strong'}`}
            />
            <button
              onClick={submit}
              disabled={busy || !value.trim()}
              className="inline-flex h-[42px] flex-none items-center rounded-md bg-brand px-4 text-[13px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              Add
            </button>
            <button
              onClick={cancel}
              className="inline-flex h-[42px] flex-none items-center rounded-md border border-border-strong bg-card px-3 text-[13px] font-semibold text-body transition-colors hover:bg-hover"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] text-unproductive">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-[14px] flex w-full items-center gap-[11px] rounded-md border border-dashed border-border-strong px-[13px] py-[12px] text-left text-[15px] text-muted transition-colors hover:bg-hover"
        >
          <Plus className="h-4 w-4 text-brand" /> Add an app or site
        </button>
      )}
    </Section>
  )
}
