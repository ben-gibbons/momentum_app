// components/settings/Switch.tsx
// On/off toggle for settings (Strict Mode). Port of the design-system Switch
// (design_system/_ds_bundle.js components/forms/Switch.jsx): a <label> wrapping a visually-hidden
// checkbox with role="switch", a 42x24 pill track that turns brand-green when checked, and an
// 18px thumb that slides 18px. Controlled only — checked in, onChange(boolean) out.
//
// The input, track, and thumb are siblings inside one relative wrapper so Tailwind's `peer-*`
// utilities (sibling combinator) can style both the track and the thumb from the input's state.

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false
}: SwitchProps): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-[11px] text-[15px] text-body">
      <span className="relative inline-block h-6 w-[42px] flex-none">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        {/* Track */}
        <span className="absolute inset-0 rounded-full bg-sand-300 transition-colors duration-200 peer-checked:bg-brand peer-focus-visible:shadow-[var(--ring-focus)] peer-disabled:opacity-50" />
        {/* Thumb — 3px inset, slides 18px when checked (42 - 18 - 2*3) */}
        <span className="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-[18px]" />
      </span>
      {label != null && <span>{label}</span>}
    </label>
  )
}
