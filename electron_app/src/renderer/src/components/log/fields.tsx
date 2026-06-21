// components/log/fields.tsx
// Presentational form primitives for the Procrastination Log CBT flow. These recreate the design
// system's field controls used inside the log card (design_system/interactive-flows/kit.css
// `.mm-fields*` + the Input/Textarea/Select/Slider primitives the .jsx source pulls from the kit).
// Everything is styled with the Momentum token utilities so the flow matches the rest of the app.
// Controlled components only — value in, onChange out; the screen owns all state.

interface FieldShellProps {
  label: string
  children: React.ReactNode
}

// Shared label + control wrapper so every field reads consistently.
function FieldShell({ label, children }: FieldShellProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="text-[13px] font-semibold text-body">{label}</span>
      {children}
    </label>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextField({
  label,
  value,
  onChange,
  placeholder
}: TextFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border-strong bg-input px-[13px] py-[11px] text-[15px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand"
      />
    </FieldShell>
  )
}

interface TextAreaFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3
}: TextAreaFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-md border border-border-strong bg-input px-[13px] py-[11px] text-[15px] leading-[1.5] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand"
      />
    </FieldShell>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder
}: SelectFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-border-strong bg-input px-[13px] py-[11px] text-[15px] outline-none transition-colors focus:border-border-brand ${
          value ? 'text-body' : 'text-faint'
        }`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt} value={opt} className="text-body">
            {opt}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

interface SliderFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
}

// 0–100 percentage slider, matching the design system's Slider (_ds_bundle.js .mm-slider):
// a filled green track up to the thumb, the live value in data type (text-md, brand), 0%/100%
// ticks underneath, and a 22px brand thumb with a white ring.
export function SliderField({ label, value, onChange }: SliderFieldProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-[10px]">
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-body">{label}</span>
        <span className="font-data text-[17px] font-semibold text-brand">{value}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // Filled portion (left of the thumb) is green-500; the rest is the sunken track.
        style={{
          background: `linear-gradient(to right, var(--green-500) 0%, var(--green-500) ${value}%, var(--surface-sunken) ${value}%, var(--surface-sunken) 100%)`
        }}
        className="h-[8px] w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:shadow-sm"
      />
      <span className="flex justify-between font-data text-[11px] text-faint">
        <span>0%</span>
        <span>100%</span>
      </span>
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
}

// Whole-minutes input (predicted/actual time). Empty string maps to null so unset stays null.
export function NumberField({
  label,
  value,
  onChange,
  placeholder
}: NumberFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={placeholder}
        className="w-24 rounded-md border border-border-strong bg-input px-[13px] py-[11px] font-data text-[15px] text-body outline-none transition-colors placeholder:text-faint focus:border-border-brand"
      />
    </FieldShell>
  )
}
