import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
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
  { to: '/stock/items', label: 'Materiais', icon: icons.ui.package },
  { to: '/stock/equipamentos', label: 'Equipamentos', icon: icons.ui.hardDrive },
  { to: '/stock/entry-exit', label: 'Ent/Sai', icon: icons.ui.refresh },
]

const moreItems: LiquidNavItem[] = [
  { to: '/stock/movements', label: 'Mov.', icon: icons.ui.clock },
  { to: '/stock/maintenance', label: 'Manut.', icon: icons.nav.maintenance },
  { to: '/stock/inventory', label: 'Invent.', icon: icons.nav.checklists },
]

export function StockBottomNav() {
  const { inRepair, overdueCount } = useBadges()
  const { allowed: canViewEquipamentos } = useCanAccessAction('patrimonio.view')

  const items = canViewEquipamentos ? mainNav : mainNav.filter((i) => i.to !== '/stock/equipamentos')

  return (
    <LiquidBottomNav
      items={items}
      overflowItems={moreItems}
      getBadge={(to) => (to === '/stock' ? inRepair + overdueCount : 0)}
      normalizePath={normalizeStockPath}
      resolvePath={(pathname, to) => stockNavPath(pathname, to)}
    />
  )
}
