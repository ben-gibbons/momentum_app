// components/settings/NotSureList.tsx
// The "Not sure yet" list on the Settings screen: apps and sites that have been used but are on
// neither list, each with its not-sure minutes and last-seen stamp, plus Productive / Unproductive
// buttons. Choosing one hands the item back to the screen, which adds the matching rule (and the
// repository rewrites past not-sure rows — see rules.add). Presentational only.
import { useState } from 'react'
import type { NotSureItem } from '../../../../shared/types'
import { formatHM, formatStamp } from '../../lib/format'
import { ipcErrorMessage } from '../../lib/api'
import { KindPill } from './RuleListEditor'

interface NotSureListProps {
  items: NotSureItem[]
  onClassify: (item: NotSureItem, classification: 1 | 2) => Promise<void>
}

const itemKey = (i: NotSureItem): string => `${i.kind}:${i.pattern}`

export function NotSureList({ items, onClassify }: NotSureListProps): React.JSX.Element {
  // Key of the row whose classify call is in flight, so its buttons can't double-fire.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Per-row error from a rejected classify (the repository throws for patterns it can't use).
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function classify(item: NotSureItem, classification: 1 | 2): Promise<void> {
    if (busyKey) return
    const key = itemKey(item)
    setBusyKey(key)
    try {
      await onClassify(item, classification)
      setErrors((e) => ({ ...e, [key]: '' }))
    } catch (e) {
      setErrors((errs) => ({ ...errs, [key]: ipcErrorMessage(e) }))
    } finally {
      setBusyKey(null)
    }
  }

  if (items.length === 0) {
    return <p className="py-2 text-[15px] text-faint">Nothing to sort yet.</p>
  }

  const buttonClass =
    'inline-flex h-8 flex-none items-center rounded-md border border-border-strong bg-card px-3 text-[12px] font-semibold transition-colors hover:bg-hover disabled:opacity-60'

  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((item) => {
        const busy = busyKey === itemKey(item)
        return (
          <li key={itemKey(item)} className="flex items-center gap-3 py-[10px]">
            <KindPill kind={item.kind} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] text-body">{item.pattern}</div>
              <div className="font-data text-xs text-muted">
                {formatHM(item.minutes)} · last seen {formatStamp(item.lastSeen)}
              </div>
              {errors[itemKey(item)] && (
                <div className="mt-1 text-[13px] text-unproductive">{errors[itemKey(item)]}</div>
              )}
            </div>
            <button
              onClick={() => classify(item, 1)}
              disabled={busy}
              className={`${buttonClass} text-productive`}
            >
              Productive
            </button>
            <button
              onClick={() => classify(item, 2)}
              disabled={busy}
              className={`${buttonClass} text-unproductive`}
            >
              Unproductive
            </button>
          </li>
        )
      })}
    </ul>
  )
}
