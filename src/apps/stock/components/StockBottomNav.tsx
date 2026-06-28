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
  { to: '/stock', label: 'Estoque', icon: icons.ui.package, end: true },
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/kits', label: 'Kits', icon: icons.ui.check },
]

export function StockBottomNav() {
  const { inRepair, incompleteKits } = useBadges()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegação principal"
        className="flex items-stretch rounded-2xl border border-white/10 bg-card/80 px-2 py-1 backdrop-blur-2xl shadow-lg shadow-black/50"
      >
        {navItems.map(({ to, label, icon: Icon }) => {
          const badge = to === '/stock' ? inRepair : to === '/stock/kits' ? incompleteKits : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/stock'}
              viewTransition
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
                   isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-muted hover:text-fg-dim'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative mb-0.5">
                    <Icon size={18} />
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-fg leading-none shadow-sm shadow-red-500/50">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="relative">
                    {label}
                    {isActive && (
                      <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-600 dark:bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    )}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
