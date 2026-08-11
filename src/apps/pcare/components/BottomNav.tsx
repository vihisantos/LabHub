import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { partService } from '../services/partService'
import { maintenanceService } from '../services/maintenanceService'
import { icons } from '../../../lib/icons'

function useBadges() {
  const overdue = maintenanceService.getAll().filter((m) => new Date(m.scheduledDate).getTime() < Date.now()).length
  const lowStock = partService.getAll().filter((p) => p.quantity <= p.minQuantity).length
  return { overdue, lowStock }
}

const mainNav: LiquidNavItem[] = [
  { to: '/pc-care', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/pc-care/assets', label: 'Ativos', icon: icons.nav.pcs },
  { to: '/pc-care/parts', label: 'Estoque', icon: icons.nav.parts },
  { to: '/pc-care/maintenance', label: 'Manutenção', icon: icons.nav.maintenance },
]

const moreItems: LiquidNavItem[] = [
  { to: '/pc-care/scanner',          label: 'Scanner',    icon: icons.ui.scanBarcode },
  { to: '/pc-care/reports',          label: 'Relatórios', icon: icons.nav.reports },
  { to: '/pc-care/checklists',       label: 'Checklist',  icon: icons.nav.checklists },
  { to: '/pc-care/parts/consolidado', label: 'Consolidado', icon: icons.ui.fileBarChart },
  { to: '/pc-care/qr',               label: 'QR Code',    icon: icons.ui.qrCode },
  { to: '/pc-care/settings',         label: 'Config',     icon: icons.nav.settings },
]

export function BottomNav() {
  const { overdue, lowStock } = useBadges()

  return (
    <LiquidBottomNav
      items={mainNav}
      overflowItems={moreItems}
      getBadge={(to) => {
        if (to === '/pc-care/maintenance') return overdue
        if (to === '/pc-care/parts') return lowStock
        return 0
      }}
    />
  )
}
