import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { partService } from '../services/partService'
import { maintenanceService } from '../services/maintenanceService'
import { icons } from '../../../lib/icons'
import { Popover, PopoverTrigger, PopoverContent } from '../../../lib/components/ui'

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
  { to: '/pcare/scanner',          label: 'Scanner',    icon: icons.ui.scanBarcode },
  { to: '/pcare/reports',          label: 'Relatórios', icon: icons.nav.reports },
  { to: '/pcare/checklists',       label: 'Checklist',  icon: icons.nav.checklists },
  { to: '/pcare/parts/consolidado', label: 'Consolidado', icon: icons.ui.fileBarChart },
  { to: '/pcare/qr',               label: 'QR Code',    icon: icons.ui.qrCode },
  { to: '/pcare/settings',         label: 'Config',     icon: icons.nav.settings },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showMore, setShowMore] = useState(false)
  const { overdue, lowStock } = useBadges()

  const isInMore = moreItems.some((i) => location.pathname.startsWith(i.to))
  const moreActive = moreItems.find((i) => location.pathname.startsWith(i.to))

  const MoreIcon = icons.nav.more

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegação principal"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '4px 6px',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow: '0 4px 32px rgba(0, 0, 0, 0.15)',
        }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium text-white/50 hover:text-white/90 transition-colors flex-shrink-0"
          style={{ padding: '8px 6px', minHeight: '36px' }}
          title="Início"
        >
          <icons.ui.home size={16} />
          <span>Início</span>
        </button>
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
                   isActive ? 'text-indigo-400' : 'text-white/70 hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative mb-0.5">
                    <Icon size={18} />
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white leading-none shadow-sm shadow-red-500/50">
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
              <span className="mb-0.5">
                {moreActive ? <moreActive.icon size={18} /> : <MoreIcon size={18} />}
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
                    end={to === '/pcare'}
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
