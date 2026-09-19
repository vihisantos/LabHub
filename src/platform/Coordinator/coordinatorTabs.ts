import type { LucideIcon } from 'lucide-react'
import { icons } from '../../lib/icons'

export type CoordinatorTabId =
  | 'overview'
  | 'people'
  | 'tickets'
  | 'reservalab'
  | 'reports'
  | 'audit'
  | 'ecosystem'

export interface CoordinatorTabDef {
  id: CoordinatorTabId
  label: string
  icon: LucideIcon
}

export const COORDINATOR_TABS: readonly CoordinatorTabDef[] = [
  { id: 'overview', label: 'Visão Geral', icon: icons.ui.home },
  { id: 'people', label: 'Pessoal', icon: icons.ui.userCheck },
  { id: 'tickets', label: 'Chamados', icon: icons.ui.inbox },
  { id: 'reservalab', label: 'ReservaLab', icon: icons.ui.flaskConical },
  { id: 'reports', label: 'Relatórios', icon: icons.ui.fileBarChart },
  { id: 'audit', label: 'Auditoria', icon: icons.ui.shield },
  { id: 'ecosystem', label: 'Ecossistema', icon: icons.ui.package },
]

export function isCoordinatorTabId(value: string | null): value is CoordinatorTabId {
  return COORDINATOR_TABS.some((tab) => tab.id === value)
}