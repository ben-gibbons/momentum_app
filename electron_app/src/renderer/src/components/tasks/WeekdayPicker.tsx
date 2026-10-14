// components/tasks/WeekdayPicker.tsx
// Seven Mon..Sun chips that toggle bits of a repeat-day mask (bit 0 = Mon … bit 6 = Sun, as in
// main/recurrence.ts). Used by RepeatPicker for the Weekly and Custom presets. Controlled only:
// mask in, onChange(mask) out. Selected chips are filled brand pills (the tag-pill idiom from
// TaskRow); unselected ones are outlined.
import { WEEKDAY_LABELS } from '../../lib/format'

interface WeekdayPickerProps {
  value: number
  onChange: (mask: number) => void
}

export function WeekdayPicker({ value, onChange }: WeekdayPickerProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-[6px]" role="group" aria-label="Repeat on">
      {WEEKDAY_LABELS.map((label, i) => {
        const bit = 1 << i
        const on = (value & bit) !== 0
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value & ~bit : value | bit)}
            className={`rounded-full border px-[12px] py-[5px] text-[12px] font-semibold transition-colors ${
              on
                ? 'border-brand bg-brand text-on-brand'
                : 'border-border-strong bg-card text-body hover:bg-hover'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
