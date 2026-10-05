import { LiquidBottomNav, type LiquidNavItem } from '../../../lib/components/LiquidBottomNav'
import { icons } from '../../../lib/icons'

const mainNav: LiquidNavItem[] = [
  { to: '/chamados', label: 'Dashboard', icon: icons.nav.dashboard },
  // "Chamados" é a fila de TRABALHO da equipe de TI (filtros, responsável,
  // SLA, ações de atendimento).
  { to: '/chamados/tickets', label: 'Chamados', icon: icons.ui.inbox },
  // "Meus Chamados" é a ÁREA PESSOAL do solicitante: o que EU abri. São duas
  // experiências distintas, por isso cada uma tem item e tela próprios — não é
  // uma segunda fila nem um chip dentro da lista. Já "Meus Atendimentos"
  // (atribuídos a mim) continua sendo um chip da fila, porque é recorte de
  // trabalho, não histórico pessoal.
  { to: '/chamados/meus', label: 'Meus Chamados', icon: icons.ui.user },
]

const moreItems: LiquidNavItem[] = [
  { to: '/chamados/reports', label: 'Relatórios', icon: icons.nav.reports },
  { to: '/chamados/settings', label: 'Config', icon: icons.nav.settings },
]

function normalizeChamadosPath(pathname: string): string {
  if (pathname === '/chamados' || pathname === '/chamados/') return '/chamados'
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2) return `/${segments[0]}/${segments[1]}`
  return pathname
}

export function ChamadosBottomNav({ openCount = 0 }: { openCount?: number }) {
  return (
    <LiquidBottomNav
      items={mainNav}
      overflowItems={moreItems}
      getBadge={(to) => (to === '/chamados/tickets' ? openCount : 0)}
      normalizePath={normalizeChamadosPath}
    />
  )
}
