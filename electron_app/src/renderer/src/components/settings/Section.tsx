// components/settings/Section.tsx
// One Settings card: the Session/Trends card idiom (rounded-xl, bg-card, shadow-sm) with a
// display-face title and an optional muted caption above the section's controls. Every Settings
// section (and RuleListEditor) renders inside one of these so the screen reads as a single system.

interface SectionProps {
  title: string
  caption?: string
  action?: React.ReactNode // right-aligned control on the title row (e.g. a Switch)
  disabled?: boolean // grey out the body (title row stays live so the control can re-enable)
  footer?: string // muted note under the body (e.g. defaults)
  children: React.ReactNode
}

export function Section({
  title,
  caption,
  action,
  disabled,
  footer,
  children
}: SectionProps): React.JSX.Element {
  return (
    <section className="relative rounded-xl border border-border-default bg-card p-7 shadow-sm">
      {/* The action is pinned to the card's top-right corner, out of the header's flow, so a tall
          control (a switch with a note under it) doesn't push the body down. */}
      {action && <div className="absolute right-7 top-7">{action}</div>}
      <div className="mb-[18px]">
        <h2 className="font-display text-[20px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {caption && <p className="mt-[2px] text-[13px] text-muted">{caption}</p>}
      </div>
      <div
        aria-disabled={disabled || undefined}
        className={disabled ? 'pointer-events-none select-none opacity-45' : undefined}
      >
        {children}
        {footer && <p className="mt-[18px] text-[13px] text-muted">{footer}</p>}
      </div>
    </section>
  )
}
