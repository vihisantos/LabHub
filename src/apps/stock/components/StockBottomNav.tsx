import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { useMovements } from '../hooks/useMovements'
import { getOverdueCount } from '../utils/overdue'
import { normalizeStockPath, stockNavPath } from '../utils/stockPath'
import { icons } from '../../../lib/icons'

function useBadges() {
  const { items } = useStock()
  const { kits } = useKits()
  const { movements } = useMovements()
  const inRepair = items.filter((i) => i.status === 'em_conserto').length
  const incompleteKits = kits.filter((k) => k.status === 'incompleto').length
  const overdueCount = getOverdueCount(movements)
  return { inRepair, incompleteKits, overdueCount }
}

const mainNav: LiquidNavItem[] = [
  { to: '/stock', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/stock/items', label: 'Estoque', icon: icons.ui.package },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
]

const moreItems: LiquidNavItem[] = [
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/kits', label: 'Kits', icon: icons.ui.check },
  { to: '/stock/pipeline', label: 'Pipeline', icon: icons.ui.folder },
  { to: '/stock/maintenance', label: 'Manut.', icon: icons.nav.maintenance },
  { to: '/stock/qr', label: 'QR', icon: icons.ui.qrCode },
]

export function StockBottomNav() {
  const { inRepair, incompleteKits, overdueCount } = useBadges()

  return (
    <LiquidBottomNav
      items={mainNav}
      overflowItems={moreItems}
      overflowBadge={incompleteKits}
      getBadge={(to) => (to === '/stock' ? inRepair + overdueCount : 0)}
      normalizePath={normalizeStockPath}
      resolvePath={(pathname, to) => stockNavPath(pathname, to)}
    />
  )
}
