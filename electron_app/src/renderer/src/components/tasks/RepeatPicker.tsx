// components/tasks/RepeatPicker.tsx
// The repeat preset control inside TaskDialog (D4): a segmented Daily / Custom switch over one
// weekday mask. Daily sets every bit; Custom shows the WeekdayPicker chips so any set of days can
// be built (one day a week is just Custom with one chip — a separate "Weekly" preset was the same
// control twice, dropped at Gate 1). The preset is UI state only: the mask is the data, so an
// existing mask opens on the preset that describes it (127 → Daily, anything else → Custom).
// Controlled: mask in, onChange(mask) out.
import { useState } from 'react'
import { ALL_DAYS } from '../../../../shared/dates'
import { WeekdayPicker } from './WeekdayPicker'

type Preset = 'daily' | 'custom'

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'custom', label: 'Custom' }
]

const presetFor = (mask: number): Preset => (mask === ALL_DAYS ? 'daily' : 'custom')

interface RepeatPickerProps {
  value: number // the repeat-day mask
  dateBit: number // weekdayBit() of the task date — where Custom starts from after Daily
  onChange: (mask: number) => void
}

export function RepeatPicker({ value, dateBit, onChange }: RepeatPickerProps): React.JSX.Element {
  const [preset, setPreset] = useState<Preset>(() => presetFor(value))

  function pick(p: Preset): void {
    setPreset(p)
    if (p === 'daily') onChange(ALL_DAYS)
    // Custom keeps the current mask unless it is "every day" (then the chips would all be on
    // and the user would be deselecting); it then starts from the task date's weekday.
    else if (value === ALL_DAYS) onChange(dateBit)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-md bg-sunken p-1" role="radiogroup">
        {PRESETS.map((p) => {
          const active = p.id === preset
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(p.id)}
              className={`rounded-[9px] px-4 py-[6px] text-[13px] font-semibold transition-colors ${
                active ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-body'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {preset !== 'daily' && <WeekdayPicker value={value} onChange={onChange} />}
    </div>
  )
}
