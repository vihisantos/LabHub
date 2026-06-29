import { NavLink } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { icons } from '../../../lib/icons'

function useBadges() {
  const { items } = useStock()
  const { kits } = useKits()
  const inRepair = items.filter((i) => i.status === 'em_conserto').length
  const incompleteKits = kits.filter((k) => k.status === 'incompleto').length
  return { inRepair, incompleteKits }
}

const navItems = [
  { to: '/stock', label: 'Dashboard', icon: icons.nav.dashboard, end: true },
  { to: '/stock/items', label: 'Estoque', icon: icons.ui.package },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/kits', label: 'Kits', icon: icons.ui.check },
]

export function StockBottomNav() {
  const { inRepair, incompleteKits } = useBadges()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pb-[max(0px,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegação principal"
        className="flex items-stretch border-t border-line bg-surface select-none"
      >
        {navItems.map(({ to, label, icon: Icon, end }) => {
          const badge = to === '/stock' ? inRepair : to === '/stock/kits' ? incompleteKits : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              viewTransition
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors duration-200 btn-interactive ${
                   isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-muted hover:text-fg-dim'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
