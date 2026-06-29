import { useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { useMovements } from '../hooks/useMovements'
import { getOverdueCount } from '../utils/overdue'
import { icons } from '../../../lib/icons'

function useBadges() {
  const { items } = useStock()
  const { kits } = useKits()
  const { movements } = useMovements()
  const inRepair = items.filter((i) => i.status === 'em_conserto').length
  const incompleteKits = kits.filter((k) => k.status === 'incompleto').length
  const overdueCount = useMemo(() => getOverdueCount(movements), [movements])
  return { inRepair, incompleteKits, overdueCount }
}

const mainNav = [
  { to: '/stock', label: 'Dashboard', icon: icons.nav.dashboard, end: true },
  { to: '/stock/items', label: 'Estoque', icon: icons.ui.package },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
]

const moreItems = [
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/kits', label: 'Kits', icon: icons.ui.check },
]

export function StockBottomNav() {
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const { inRepair, incompleteKits, overdueCount } = useBadges()

  const moreBadge = incompleteKits

  const isInMore = moreItems.some((i) => location.pathname.startsWith(i.to))
  const moreActive = moreItems.find((i) => location.pathname.startsWith(i.to))

  const MoreIcon = icons.nav.more

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showMore && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-full left-3 right-3 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-card/95 p-2 backdrop-blur-2xl shadow-xl shadow-black/50 animate-[fade-in-up_0.2s_ease-out]">
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map(({ to, label, icon: Icon }) => {
                const active = location.pathname.startsWith(to)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-emerald-100 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400'
                        : 'text-fg-dim hover:bg-input/50 hover:text-fg'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </>
      )}

      <nav
        aria-label="Navegação principal"
        className="flex items-stretch rounded-2xl border border-white/10 bg-card/80 px-2 py-1 backdrop-blur-2xl shadow-lg shadow-black/50"
      >
        {mainNav.map(({ to, label, icon: Icon, end }) => {
          const badge = to === '/stock' ? (inRepair + overdueCount) : 0
          const badgeKind = to === '/stock' && badge > 0 ? (overdueCount > 0 ? 'rose' : 'amber') : 'default'
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
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
                      <span className={`absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[8px] font-bold text-fg leading-none shadow-sm ${
                        badgeKind === 'rose' ? 'bg-rose-500 shadow-rose-500/50' : 'bg-red-500 shadow-red-500/50'
                      }`}>
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

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
            isInMore ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-muted hover:text-fg-dim'
          }`}
          aria-label="Mais opções"
        >
          <span className="relative mb-0.5">
            {moreActive ? <moreActive.icon size={18} /> : <MoreIcon size={18} />}
            {moreBadge > 0 && !isInMore && (
              <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-fg leading-none shadow-sm shadow-red-500/50">
                {moreBadge}
              </span>
            )}
          </span>
          <span className="relative">
            {moreActive ? moreActive.label : 'Mais'}
            {isInMore && (
              <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            )}
          </span>
        </button>
      </nav>
    </div>
  )
}
