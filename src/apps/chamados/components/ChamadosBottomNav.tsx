import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { useTickets } from '../hooks/useTickets'
import { isTicketOpen } from '../services/sla'
import { icons } from '../../../lib/icons'

const mainNav: LiquidNavItem[] = [
  { to: '/chamados', label: 'Dashboard', icon: icons.nav.dashboard },
  { to: '/chamados/tickets', label: 'Chamados', icon: icons.ui.inbox },
]

const moreItems: LiquidNavItem[] = [
  { to: '/chamados/reports', label: 'Relatórios', icon: icons.nav.reports },
  { to: '/chamados/qr', label: 'QR Code', icon: icons.ui.qrCode },
  { to: '/chamados/settings', label: 'Config', icon: icons.nav.settings },
]

function normalizeChamadosPath(pathname: string): string {
  if (pathname === '/chamados' || pathname === '/chamados/') return '/chamados'
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2) return `/${segments[0]}/${segments[1]}`
  return pathname
}

export function ChamadosBottomNav() {
  const { tickets } = useTickets()
  const openCount = tickets.filter((t) => isTicketOpen(t.status)).length

  return (
    <LiquidBottomNav
      items={mainNav}
      overflowItems={moreItems}
      getBadge={(to) => (to === '/chamados/tickets' ? openCount : 0)}
      normalizePath={normalizeChamadosPath}
    />
  )
}
