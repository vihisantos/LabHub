import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { partService } from '../services/partService'
import { maintenanceService } from '../services/maintenanceService'
import { icons } from '../../../lib/icons'

function useBadges() {
  const overdue = maintenanceService.getAll().filter((m) => new Date(m.scheduledDate).getTime() < Date.now()).length
  const lowStock = partService.getAll().filter((p) => p.quantity <= p.minQuantity).length
  return { overdue, lowStock }
}

const mainNav = [
  { to: '/pcare', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/pcare/pcs', label: 'PCs', icon: icons.nav.pcs },
  { to: '/pcare/parts', label: 'Estoque', icon: icons.nav.parts },
  { to: '/pcare/maintenance', label: 'Manutenção', icon: icons.nav.maintenance },
]

const moreItems = [
  { to: '/pcare/scanner', label: 'Scanner', icon: icons.ui.scanBarcode },
  { to: '/pcare/reports', label: 'Relatórios', icon: icons.nav.reports },
  { to: '/pcare/checklists', label: 'Checklist', icon: icons.nav.checklists },
  { to: '/stock/qr', label: 'QR Code', icon: icons.ui.qrCode },
  { to: '/pcare/settings', label: 'Config', icon: icons.nav.settings },
]

export function BottomNav() {
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const { overdue, lowStock } = useBadges()

  const isInMore = moreItems.some((i) => location.pathname.startsWith(i.to))
  const moreActive = moreItems.find((i) => location.pathname.startsWith(i.to))

  const MoreIcon = icons.nav.more

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {showMore && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-full left-4 right-4 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-card/95 p-2 backdrop-blur-2xl shadow-xl shadow-black/50 animate-[fade-in-up_0.2s_ease-out]">
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map(({ to, label, icon: Icon }) => {
                const active = location.pathname.startsWith(to)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/pcare'}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-cyan-100 dark:bg-cyan-900/25 text-cyan-700 dark:text-cyan-400'
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

      <nav aria-label="Navegação principal" className="flex items-stretch rounded-2xl border border-white/10 bg-card/80 px-2 py-1 backdrop-blur-2xl shadow-lg shadow-black/50">
        {mainNav.map(({ to, label, icon: Icon }) => {
          const badge = to === '/pcare/maintenance' ? overdue : to === '/pcare/parts' ? lowStock : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/pcare'}
              viewTransition
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
                   isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-fg-muted hover:text-fg-dim'
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
              <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-600 dark:bg-cyan-400 shadow-sm shadow-cyan-400/50" />
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
            isInMore ? 'text-cyan-600 dark:text-cyan-400' : 'text-fg-muted hover:text-fg-dim'
          }`}
          aria-label="Mais opções"
        >
          <span className="mb-0.5">
            {moreActive ? <moreActive.icon size={18} /> : <MoreIcon size={18} />}
          </span>
          <span className="relative">
            {moreActive ? moreActive.label : 'Mais'}
            {isInMore && (
              <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
            )}
          </span>
        </button>
      </nav>
    </div>
  )
}
