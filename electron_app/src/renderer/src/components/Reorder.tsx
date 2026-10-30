// components/Reorder.tsx
// The number + drag-handle system shared by every reorderable list (V2 item 7: the Home / Day
// view task list, the Calendar's weekly list, and the steps inside a task). `ListNumber` is the
// "1." … "n." that sits between a row's checkbox and its text; `ReorderHandle` is the
// three-line button at the row's right edge. `useReorder` wires the handle to native HTML5
// drag-and-drop: dragging starts from the handle only (the row's title stays clickable), the
// row under the pointer shows a brand line above or below it for the drop slot, and the drop
// reports (from, to) indexes — the list owner moves the item (`moveItem`) and persists or keeps
// the new order. The handle also moves its row one step with the Up / Down arrow keys.
// A component plus the hook that drives it, like lib/timers.tsx, so the fast-refresh rule is off.
/* eslint-disable react-refresh/only-export-components */
import { useRef, useState } from 'react'
import { Menu } from 'lucide-react'

// list with the item at `from` moved to index `to` (indexes in the original list).
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// A completed task's / step's line: an underline raised into the text rather than the font's own
// line-through, which sits too high — this one crosses the middle of the lowercase letters — and
// drawn through descenders too (skip-ink would leave gaps). The number applies it as well: an
// inline-block is not decorated by its parent, so it draws its own at the same position.
export const STRIKE_CLASS =
  'underline [text-underline-offset:-0.25em] [text-decoration-skip-ink:none] text-faint'

// Put this between a ListNumber and the text that follows it: a WORD JOINER forbids a line break
// there, so a word too long for the line is broken by overflow-wrap where it overflows (or at a
// slash, see breakable) rather than dropped whole onto the next line under the number.
export const NO_BREAK = '\u2060'

// The number is the first thing inside the title / step text element, so it shares that text's
// font, size and baseline. Its box is 1em of digits + the gap to the text, right-aligned so the
// text always starts at the same place; `wide` (a list of ten or more) makes room for two digits.
// The gap is two no-break spaces inside the content rather than padding, so the strike-through
// (the number's own, see STRIKE_CLASS) runs through the gap and meets the text's line. The text
// element takes numberedText() — a hanging indent of the same width — so a wrapped title's later
// lines start under its first word, not under the number. (The data font's digits read larger
// and sit higher than the body font at the same size, so it is not used here.)
export function ListNumber({
  n,
  wide,
  completed,
  className = ''
}: {
  n: number
  wide?: boolean
  completed?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={`inline-block text-right font-normal ${wide ? 'w-[2.1em]' : 'w-[1.5em]'} ${
        completed ? STRIKE_CLASS : 'text-muted'
      } ${className}`}
    >
      {n}.{'\u00a0\u00a0'}
    </span>
  )
}

// Hanging indent for the text element that holds a ListNumber: the padding keeps wrapped lines
// under the text, the negative indent pulls the first line (the number) back to the edge.
export const numberedText = (wide: boolean): string =>
  wide ? 'pl-[2.1em] -indent-[2.1em]' : 'pl-[1.5em] -indent-[1.5em]'

// Where the drop line shows on a row while something is dragged over the list.
type Slot = 'before' | 'after' | null

// Classes for the drop line (an inset shadow, so the row doesn't shift) and the dragged row.
const SLOT_CLASS: Record<'before' | 'after', string> = {
  before: 'shadow-[inset_0_2px_0_0_var(--color-brand)]',
  after: 'shadow-[inset_0_-2px_0_0_var(--color-brand)]'
}

export interface Reorder {
  // Spread onto each row's element (the drop target): data attribute for the drag image, the
  // drop-slot line while dragging over it, and dimming while it is the one being dragged.
  rowProps(i: number): {
    'data-reorder-row': true
    className: string
    onDragOver: (e: React.DragEvent<HTMLElement>) => void
    onDrop: (e: React.DragEvent<HTMLElement>) => void
  }
  // The handle for row i.
  handle(i: number, label: string): React.JSX.Element
}

// count = rows in the list; onMove(from, to) = the user asked to move row `from` so it ends up
// at index `to`; canMove (optional) vetoes a move — a slot it refuses shows no drop line and
// takes no drop, and the arrow keys skip it (the weekly list keeps one-off tasks above series).
export function useReorder(
  count: number,
  onMove: (from: number, to: number) => void,
  canMove: (from: number, to: number) => boolean = () => true
): Reorder {
  // State draws the drop line; the refs hold the same values for the drag handlers, which can
  // fire (a quick flick) before the re-render that would refresh their closures.
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null) // insertion index, 0..count
  const fromRef = useRef<number | null>(null)
  const overRef = useRef<number | null>(null)

  function setFromBoth(v: number | null): void {
    fromRef.current = v
    setFrom(v)
  }
  function setOverBoth(v: number | null): void {
    overRef.current = v
    setOver(v)
  }
  function reset(): void {
    setFromBoth(null)
    setOverBoth(null)
  }

  // Where row `f` would land if dropped at insertion slot `s` (removing it first shifts the
  // slots after it up by one), or null when that is no move or not an allowed one.
  function target(s: number, f: number | null): number | null {
    if (f == null) return null
    const to = s > f ? s - 1 : s
    return to !== f && canMove(f, to) ? to : null
  }

  function slot(i: number): Slot {
    if (from == null || over == null) return null
    if (target(over, from) == null) return null
    if (over === i) return 'before'
    if (over === i + 1 && i === count - 1) return 'after'
    return null
  }

  return {
    rowProps(i) {
      const s = slot(i)
      return {
        'data-reorder-row': true,
        className: `${s ? SLOT_CLASS[s] : ''} ${from === i ? 'opacity-40' : ''}`,
        onDragOver(e) {
          const f = fromRef.current
          if (f == null) return
          const r = e.currentTarget.getBoundingClientRect()
          const s = e.clientY < r.top + r.height / 2 ? i : i + 1
          setOverBoth(s)
          // Not calling preventDefault leaves the slot un-droppable (no-drop cursor).
          if (target(s, f) == null) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        },
        onDrop(e) {
          e.preventDefault()
          const f = fromRef.current
          const s = overRef.current
          const to = s == null ? null : target(s, f)
          if (f != null && to != null) onMove(f, to)
          reset()
        }
      }
    },
    handle(i, label) {
      return (
        <button
          type="button"
          draggable
          aria-label={`Reorder ${label}`}
          title="Drag to reorder (or press ↑ / ↓)"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(i))
            // Drag the whole row's picture, not just the handle.
            const row = e.currentTarget.closest<HTMLElement>('[data-reorder-row]')
            if (row) {
              const r = row.getBoundingClientRect()
              e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top)
            }
            setFromBoth(i)
          }}
          onDragEnd={reset}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && i > 0 && canMove(i, i - 1)) onMove(i, i - 1)
            else if (e.key === 'ArrowDown' && i < count - 1 && canMove(i, i + 1)) onMove(i, i + 1)
            else return
            e.preventDefault()
          }}
          className="inline-flex h-7 w-7 flex-none cursor-grab items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-body active:cursor-grabbing"
        >
          <Menu className="h-4 w-4" />
        </button>
      )
    }
  }
}
