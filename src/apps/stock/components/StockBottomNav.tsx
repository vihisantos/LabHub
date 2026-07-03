import { useState, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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
  { to: '/stock', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/stock/items', label: 'Estoque', icon: icons.ui.package },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
]

const moreItems = [
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/kits', label: 'Kits', icon: icons.ui.check },
  { to: '/stock/pipeline', label: 'Pipeline', icon: icons.ui.folder },
  { to: '/stock/maintenance', label: 'Manut.', icon: icons.nav.maintenance },
  { to: '/stock/qr', label: 'QR', icon: icons.ui.qrCode },
]

export function StockBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const navRef = useRef<HTMLElement>(null)
  const tabPositionsRef = useRef<{ left: number, width: number }[]>([])
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const { inRepair, incompleteKits, overdueCount } = useBadges()

  const moreBadge = incompleteKits

  const isInMore = moreItems.some((i) => location.pathname.startsWith(i.to))
  const moreActive = moreItems.find((i) => location.pathname.startsWith(i.to))

  const MoreIcon = icons.nav.more

  const isActive = (to: string) => {
    if (to === '/stock') return location.pathname === '/stock' || location.pathname === '/stock/'
    return location.pathname.startsWith(to + '/') || location.pathname === to
  }
  const activeTab = mainNav.find(n => isActive(n.to))
  const displayTab = hoveredTab ? mainNav.find(n => n.to === hoveredTab) : activeTab

  const measureTabPositions = () => {
    if (!navRef.current) return
    const children = Array.from(navRef.current.children).filter(c => c.tagName === 'BUTTON' && c.getAttribute('aria-label') !== 'Mais opções')
    const containerRect = navRef.current.getBoundingClientRect()
    const positions: { left: number, width: number }[] = []
    for (let i = 0; i < mainNav.length; i++) {
      const btn = children[i + 1]
      if (!btn) continue
      const rect = btn.getBoundingClientRect()
      positions.push({ left: rect.left - containerRect.left, width: rect.width })
    }
    tabPositionsRef.current = positions
  }

  const handleTouchStart = () => {
    measureTabPositions()
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!navRef.current) return
    const containerRect = navRef.current.getBoundingClientRect()
    const relX = e.touches[0].clientX - containerRect.left
    const firstPos = tabPositionsRef.current[0]
    const lastPos = tabPositionsRef.current[mainNav.length - 1]
    if (!firstPos || !lastPos) return
    const areaStart = firstPos.left
    const areaWidth = (lastPos.left + lastPos.width) - areaStart
    if (areaWidth <= 0) return
    const proportion = Math.max(0, Math.min(1, (relX - areaStart) / areaWidth))
    const index = Math.min(Math.floor(proportion * mainNav.length), mainNav.length - 1)
    setHoveredTab(mainNav[index].to)
  }

  const handleTouchEnd = () => {
    if (hoveredTab && hoveredTab !== activeTab?.to) {
      navigate(hoveredTab)
    }
    setHoveredTab(null)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        ref={navRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
          const active = (displayTab?.to ?? activeTab?.to) === to
          const badge = to === '/stock' ? (inRepair + overdueCount) : 0
          const badgeKind = to === '/stock' && badge > 0 ? (overdueCount > 0 ? 'rose' : 'amber') : 'default'
          return (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="relative flex flex-1 flex-col items-center justify-center gap-0 py-1.5 text-[10px] font-medium transition-colors flex-shrink-0"
              style={{
                color: active ? '#818cf8' : 'rgba(255,255,255,0.7)',
                fontWeight: active ? 700 : 500,
                padding: '6px 10px',
                minHeight: '36px',
                position: 'relative',
              }}
            >
              {active && (
                <motion.div
                  layoutId="stockActiveTab"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  style={{
                    position: 'absolute',
                    inset: 2,
                    background: 'rgba(99, 102, 241, 0.2)',
                    borderRadius: '9999px',
                  }}
                />
              )}
              <span className="relative mb-0.5" style={{ zIndex: 1 }}>
                <Icon size={16} />
                {badge > 0 && (
                  <span className={`absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[8px] font-bold text-white leading-none shadow-sm ${
                    badgeKind === 'rose' ? 'bg-rose-500 shadow-rose-500/50' : 'bg-red-500 shadow-red-500/50'
                  }`}>
                    {badge}
                  </span>
                )}
              </span>
              <span className="relative" style={{ zIndex: 1 }}>{label}</span>
            </button>
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
                {moreActive ? <moreActive.icon size={16} /> : <MoreIcon size={16} />}
                {moreBadge > 0 && !isInMore && (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white leading-none shadow-sm shadow-red-500/50">
                    {moreBadge}
                  </span>
                )}
              </span>
              <span className="relative">
                {moreActive ? moreActive.label : 'Mais'}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-72 border border-white/15 bg-slate-900/95 p-2 backdrop-blur-2xl shadow-xl shadow-black/20">
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map(({ to, label, icon: Icon }) => {
                const active = location.pathname.startsWith(to)
                return (
                  <button
                    key={to}
                    onClick={() => { navigate(to); setShowMore(false) }}
                    className={`flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-indigo-900/25 text-indigo-400'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/90'
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
      </nav>
    </div>
  )
}
