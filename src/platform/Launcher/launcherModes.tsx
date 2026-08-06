import type { ReactNode } from 'react'
import { icons } from '../../lib/icons'

export type LauncherMode = 'compact' | 'dynamic'

export const LAUNCHER_MODES: { value: LauncherMode; label: string }[] = [
  { value: 'compact', label: 'Compacto' },
  { value: 'dynamic', label: 'Dinâmico' },
]

export interface QuickAction {
  label: string
  icon: ReactNode
  route: string
  color: string
}

/** Ações rápidas por app (id do appRegistry). Usadas no modo dinâmico. */
export const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  chamados: [
    { label: 'Escanear', icon: <icons.ui.scanBarcode size={18} />, route: '/chamados-publico', color: '#f59e0b' },
    { label: 'Chamados', icon: <icons.ui.alertCircle size={18} />, route: '/chamados/tickets', color: '#f59e0b' },
    { label: 'Salas', icon: <icons.ui.mapPin size={18} />, route: '/chamados/rooms', color: '#f59e0b' },
  ],
  'pc-care': [
    { label: 'PCs', icon: <icons.nav.pcs size={18} />, route: '/pc-care/pcs', color: '#8b5cf6' },
    { label: 'Novo Ativo', icon: <icons.ui.plus size={18} />, route: '/pc-care/pcs/new', color: '#8b5cf6' },
    { label: 'Manutenção', icon: <icons.nav.maintenance size={18} />, route: '/pc-care/maintenance', color: '#8b5cf6' },
  ],
  stock: [
    { label: 'Itens', icon: <icons.ui.package size={18} />, route: '/stock/items', color: '#10b981' },
    { label: 'Entrada/Saída', icon: <icons.ui.refresh size={18} />, route: '/stock/entry-exit', color: '#10b981' },
    { label: 'Movimentações', icon: <icons.ui.clock size={18} />, route: '/stock/movements', color: '#10b981' },
    { label: 'Escanear', icon: <icons.ui.scanBarcode size={18} />, route: '/stock/qr-scan', color: '#10b981' },
  ],
  reservalab: [
    { label: 'Reservas', icon: <icons.ui.flaskConical size={18} />, route: '/reservalab', color: '#6366f1' },
    { label: 'Dashboard', icon: <icons.nav.dashboard size={18} />, route: '/reservalab/dashboard', color: '#6366f1' },
    { label: 'Tablets', icon: <icons.ui.tv size={18} />, route: '/reservalab/tablets', color: '#6366f1' },
  ],
  tv: [
    { label: 'Canal', icon: <icons.ui.tv size={18} />, route: '/tv', color: '#ef4444' },
  ],
  admin: [
    { label: 'Logs', icon: <icons.ui.fileBarChart size={18} />, route: '/admin/logs', color: '#64748b' },
    { label: 'Usuários', icon: <icons.ui.user size={18} />, route: '/admin/users', color: '#64748b' },
  ],
}

export function getQuickActions(appId: string): QuickAction[] {
  return QUICK_ACTIONS[appId] ?? []
}
