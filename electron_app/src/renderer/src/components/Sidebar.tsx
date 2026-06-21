// components/Sidebar.tsx
// The fixed 264px navigation rail from design_system/home-screen/index.html (source of truth for
// the sidebar). Lucide icons via lucide-react. Navigation is data-driven (NAV_ITEMS) and reports
// selection via onNavigate; actual view switching is wired in Phase 3 — for now `active` controls
// the highlighted item. Style values mirror the design exactly (token utilities + arbitrary px).
import {
  Activity,
  BarChart3,
  CalendarDays,
  HeartPulse,
  ListChecks,
  NotebookPen,
  Settings,
  Wind,
  type LucideIcon
} from 'lucide-react'
import markUrl from '../assets/brand/momentum-mark.svg'

export type NavId =
  | 'daily'
  | 'calendar'
  | 'session'
  | 'trends'
  | 'logs'
  | 'risk'
  | 'distracted'
  | 'settings'

interface NavItemDef {
  id: NavId
  icon: LucideIcon
  label: string
}

const MAIN_ITEMS: NavItemDef[] = [
  { id: 'daily', icon: ListChecks, label: 'Daily tasks' },
  { id: 'calendar', icon: CalendarDays, label: 'Calendar' },
  { id: 'session', icon: Activity, label: 'Current session' },
  { id: 'trends', icon: BarChart3, label: 'Productivity Trends' }
]
const REFLECT_ITEMS: NavItemDef[] = [
  { id: 'logs', icon: NotebookPen, label: 'Procrastination logs' },
  { id: 'risk', icon: HeartPulse, label: 'Risk factors' }
]
const FOOT_ITEMS: NavItemDef[] = [
  { id: 'distracted', icon: Wind, label: 'Feeling distracted?' },
  { id: 'settings', icon: Settings, label: 'Settings' }
]

interface NavItemProps {
  item: NavItemDef
  active: boolean
  badge?: number
  onNavigate: (id: NavId) => void
}

function NavItem({ item, active, badge, onNavigate }: NavItemProps): React.JSX.Element {
  const Icon = item.icon
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`flex w-full items-center gap-3 rounded-md px-[11px] py-[10px] text-left text-[15px] font-medium transition-colors ${
        active ? 'bg-brand-soft text-brand' : 'text-body hover:bg-hover'
      }`}
    >
      <span className="inline-flex flex-none opacity-85">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="flex-1">{item.label}</span>
      {badge != null && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-100 px-1.5 font-data text-[11px] font-bold text-green-800">
          {badge}
        </span>
      )}
    </button>
  )
}

interface SidebarProps {
  active: NavId
  dailyBadge?: number
  onNavigate?: (id: NavId) => void
}

export function Sidebar({
  active,
  dailyBadge,
  onNavigate = () => {}
}: SidebarProps): React.JSX.Element {
  return (
    <nav className="flex flex-col border-r border-border-default bg-card px-4 py-5">
      <div className="flex items-center gap-[5.5px] px-2 pb-[22px] pt-[6px]">
        <img src={markUrl} alt="" className="h-[39px] w-[39px]" />
        <span className="font-display text-[30px] font-medium leading-none tracking-[-0.01em] text-brand">
          Momentum
        </span>
      </div>

      {MAIN_ITEMS.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          active={active === item.id}
          badge={item.id === 'daily' ? dailyBadge : undefined}
          onNavigate={onNavigate}
        />
      ))}

      <div className="px-[10px] pb-[6px] pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Reflect
      </div>
      {REFLECT_ITEMS.map((item) => (
        <NavItem key={item.id} item={item} active={active === item.id} onNavigate={onNavigate} />
      ))}

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5 border-t border-border-default pt-3">
        {FOOT_ITEMS.map((item) => (
          <NavItem key={item.id} item={item} active={active === item.id} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  )
}
