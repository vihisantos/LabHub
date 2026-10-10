import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { getOverdueCount } from '../utils/overdue'
import { normalizeStockPath, stockNavPath } from '../utils/stockPath'
import { icons } from '../../../lib/icons'

function useBadges() {
  const { items } = useStock()
  const { movements } = useMovements()
  const inRepair = items.filter((i) => i.status === 'em_conserto').length
  const overdueCount = getOverdueCount(movements)
  return { inRepair, overdueCount }
}

const mainNav: LiquidNavItem[] = [
  { to: '/stock', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/stock/items', label: 'Estoque', icon: icons.ui.package },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
]

const moreItems: LiquidNavItem[] = [
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/maintenance', label: 'Manut.', icon: icons.nav.maintenance },
]

export function StockBottomNav() {
  const { inRepair, overdueCount } = useBadges()

  return (
    <LiquidBottomNav
      items={mainNav}
      overflowItems={moreItems}
      getBadge={(to) => (to === '/stock' ? inRepair + overdueCount : 0)}
      normalizePath={normalizeStockPath}
      resolvePath={(pathname, to) => stockNavPath(pathname, to)}
    />
  )
}
