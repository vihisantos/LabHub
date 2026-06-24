import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const mainNav = [
  { to: '/pcare', label: 'Dashboard', icon: '📊' },
  { to: '/pcare/pcs', label: 'PCs', icon: '🖥️' },
  { to: '/pcare/parts', label: 'Estoque', icon: '🔧' },
  { to: '/pcare/maintenance', label: 'Manutenção', icon: '📅' },
]

const moreItems = [
  { to: '/pcare/reports', label: 'Relatórios', icon: '📄' },
  { to: '/pcare/checklists', label: 'Checklist', icon: '📋' },
  { to: '/pcare/scanner', label: 'QR', icon: '📷' },
  { to: '/pcare/asset-scanner', label: 'Patrimônio', icon: '🏷️' },
]

export function BottomNav() {
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)

  const isInMore = moreItems.some((i) => location.pathname.startsWith(i.to))
  const moreActive = moreItems.find((i) => location.pathname.startsWith(i.to))

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4">
      {showMore && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-full left-4 right-4 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-2 backdrop-blur-2xl shadow-xl shadow-black/50">
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map(({ to, label, icon }) => {
                const active = location.pathname.startsWith(to)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/pcare'}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-cyan-900/25 text-cyan-400'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">{icon}</span>
                    <span>{label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </>
      )}

      <nav className="flex items-stretch rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-1 backdrop-blur-2xl shadow-lg shadow-black/50">
        {mainNav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/pcare'}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="mb-0.5 text-lg leading-none">{icon}</span>
                <span className="relative">
                  {label}
                  {isActive && (
                    <span className="absolute -bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                  )}
                </span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors ${
            isInMore ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="mb-0.5 text-lg leading-none font-bold">{moreActive ? moreActive.icon : '⋯'}</span>
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
