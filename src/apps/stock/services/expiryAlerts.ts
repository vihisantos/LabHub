import { notificationService } from '../../../core/notifications/service'
import { workspaceStore } from '../../../core/workspaces/store'
import { stockService } from './stockService'
import type { StockItem } from '../types'
import { getExpiryState, formatExpiryDate } from '../utils/expiry'

export interface ExpiryAlert {
  severity: 'warning' | 'critical'
  title: string
  body: string
}

export function getExpiryAlert(item: StockItem): ExpiryAlert | null {
  if (!item.expiresAt || item.status === 'descartado') return null
  const { status, days } = getExpiryState(item.expiresAt)
  if (status === 'expired') {
    return {
      severity: 'critical',
      title: 'Item vencido',
      body: `${item.name} venceu em ${formatExpiryDate(item.expiresAt)}`,
    }
  }
  if (status === 'soon') {
    return {
      severity: 'warning',
      title: 'Validade próxima',
      body:
        days === 0
          ? `${item.name} vence hoje`
          : `${item.name} vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${formatExpiryDate(item.expiresAt)})`,
    }
  }
  return null
}

export function hasExpiryNotification(itemId: string): boolean {
  return notificationService
    .getAll()
    .some((n) => n.module === 'stock' && n.actionUrl === `/stock/items/${itemId}`)
}

/** Cria notificações de validade para itens vencidos/vencendo. Idempotente. */
export function syncExpiryNotifications(): number {
  let created = 0
  for (const item of stockService.getAll()) {
    const alert = getExpiryAlert(item)
    if (!alert) continue
    if (hasExpiryNotification(item.id)) continue
    notificationService.create({
      ...alert,
      type: 'asset',
      module: 'stock',
      actionUrl: `/stock/items/${item.id}`,
      audience: 'workspace',
      workspace_id: item.workspace_id ?? workspaceStore.activeWorkspaceId ?? undefined,
    })
    created++
  }
  return created
}
