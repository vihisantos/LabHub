import { useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { icons } from '../icons'
import { Popover, PopoverTrigger, PopoverContent } from './ui'

export interface LiquidNavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

interface LiquidBottomNavProps {
  items: LiquidNavItem[]
  overflowItems?: LiquidNavItem[]
  home?: boolean
  getBadge?: (to: string) => number
  overflowBadge?: number
  normalizePath?: (pathname: string) => string
  resolvePath?: (pathname: string, to: string) => string
}

export function LiquidBottomNav({
  items,
  overflowItems = [],
  home = true,
  getBadge,
  overflowBadge = 0,
  normalizePath,
  resolvePath,
}: LiquidBottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [showMore, setShowMore] = useState(false)

  const current = normalizePath ? normalizePath(location.pathname) : location.pathname
  const MoreIcon = icons.nav.more

  const resolve = (to: string) => (resolvePath ? resolvePath(location.pathname, to) : to)

  // Só a rota mais específica fica ativa: sem isso, uma aba pai (ex.: '/pc-care')
  // continua destacada quando uma rota filha (ex.: '/pc-care/parts') está aberta.
  const matchedTo = [...items, ...overflowItems]
    .map((i) => i.to)
    .filter((t) => t !== '/')
    .filter((t) => current === t || current.startsWith(t + '/'))
    .sort((a, b) => b.length - a.length)[0]

  const isActive = (to: string) => {
    if (to === '/') return current === '/'
    return to === matchedTo
  }

  const moreActive = overflowItems.find((i) => isActive(i.to))
  const isInMore = !!moreActive

  const badgeFor = (to: string) => (getBadge ? getBadge(to) : 0)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.875rem)' }}
      aria-label="Navegação principal"
    >
      <div className="liquid-glass flex max-w-lg flex-1 items-center justify-around rounded-full border border-white/15 bg-surface/60 px-1.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -inset-y-1/4 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[liquid-sheen_6s_ease-in-out_infinite]" />
        </span>

        {home && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex flex-col items-center gap-0.5 rounded-full px-2.5 py-1 text-[10px] font-medium text-fg-muted transition-all hover:text-fg"
            title="Início"
          >
            <icons.ui.home size={20} />
            <span>Início</span>
          </button>
        )}

        {items.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          const badge = badgeFor(to)
          return (
            <button
              key={to}
              type="button"
              onClick={() => navigate(resolve(to))}
              className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all ${
                active ? 'bg-white/10 text-indigo-500 shadow-inner' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <span className="relative">
                <Icon size={20} />
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          )
        })}

        {overflowItems.length > 0 && (
          <Popover open={showMore} onOpenChange={setShowMore}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all ${
                  isInMore ? 'bg-white/10 text-indigo-500 shadow-inner' : 'text-fg-muted hover:text-fg'
                }`}
                aria-label="Mais opções"
              >
                <span className="relative">
                  {moreActive ? <moreActive.icon size={20} /> : <MoreIcon size={20} />}
                  {overflowBadge > 0 && !isInMore && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                      {overflowBadge > 9 ? '9+' : overflowBadge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{moreActive ? moreActive.label : 'Mais'}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-72 border border-line bg-card p-2 shadow-xl">
              <div className="grid grid-cols-2 gap-1">
                {overflowItems.map(({ to, label, icon: Icon }) => {
                  const active = isActive(to)
                  return (
                    <button
                      key={to}
                      type="button"
                      onClick={() => { navigate(resolve(to)); setShowMore(false) }}
                      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-[11px] font-medium transition-colors ${
                        active ? 'bg-indigo-500/10 text-indigo-500' : 'text-fg-muted hover:bg-input hover:text-fg'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </nav>
  )
}
