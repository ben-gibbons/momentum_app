// components/Tabs.tsx
// Underline tabs — recreates the design-system Tabs (variant="underline"): a brand underline under
// the active tab, muted labels otherwise. Generic over the tab id so Calendar (Day / Week / Month)
// and Trends (Today / This week / This month) share one component (Phase 2 cleanup: each screen
// used to carry its own copy).
export interface TabItem<T extends string> {
  id: T
  label: string
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  tab: T
  onChange: (t: T) => void
}

export function Tabs<T extends string>({ items, tab, onChange }: TabsProps<T>): React.JSX.Element {
  return (
    <div className="flex gap-[22px] border-b border-border-default" role="tablist">
      {items.map((t) => {
        const active = t.id === tab
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px py-[10px] text-[13px] font-semibold transition-colors ${
              active
                ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-brand after:content-[""]'
                : 'text-muted hover:text-body'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
