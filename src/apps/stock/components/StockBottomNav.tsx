import { useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { useMovements } from '../hooks/useMovements'
import { getOverdueCount } from '../utils/overdue'
import { icons } from '../../../lib/icons'
import { Popover, PopoverTrigger, PopoverContent } from '../../../lib/components/ui'

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
  { to: '/stock/maintenance', label: 'Manut.', icon: icons.nav.maintenance },
  { to: '/stock/qr', label: 'QR', icon: icons.ui.qrCode },
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
      <nav
        aria-label="Navegação principal"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '4px 8px',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow: '0 4px 32px rgba(0, 0, 0, 0.15)',
        }}
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
                  isActive ? 'text-indigo-400' : 'text-white/70 hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative mb-0.5">
                    <Icon size={18} />
                    {badge > 0 && (
                      <span className={`absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[8px] font-bold text-white leading-none shadow-sm ${
                        badgeKind === 'rose' ? 'bg-rose-500 shadow-rose-500/50' : 'bg-red-500 shadow-red-500/50'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="relative">
                    {label}
                    {isActive && (
                      <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
                    )}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}

        <Popover open={showMore} onOpenChange={setShowMore}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
                isInMore ? 'text-indigo-400' : 'text-white/70 hover:text-white/90'
              }`}
              aria-label="Mais opções"
            >
              <span className="relative mb-0.5">
                {moreActive ? <moreActive.icon size={18} /> : <MoreIcon size={18} />}
                {moreBadge > 0 && !isInMore && (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white leading-none shadow-sm shadow-red-500/50">
                    {moreBadge}
                  </span>
                )}
              </span>
              <span className="relative">
                {moreActive ? moreActive.label : 'Mais'}
                {isInMore && (
                  <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
                )}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-72 border border-white/15 bg-slate-900/95 p-2 backdrop-blur-2xl shadow-xl shadow-black/20">
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
                        ? 'bg-indigo-900/25 text-indigo-400'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </nav>
    </div>
  )
}
