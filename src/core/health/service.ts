import type { HealthMetrics } from './types'
import { pcService } from '../../apps/pcare/services/pcService'
import { stockService } from '../../apps/stock/services/stockService'
import { ticketService } from '../../apps/chamados/services/ticketService'
import { getLastSyncedAt, getDirtyCollections } from '../../lib/sync'

export const healthService = {
  getMetrics: (): HealthMetrics => {
    const pcs = pcService.getAll()
    const stockItems = stockService.getAll()
    const tickets = ticketService.getAll()

    const openTickets = tickets.filter((t) => t.status === 'aberto' || t.status === 'em_atendimento')
    const criticalTickets = openTickets.filter((t) => {
      const age = Date.now() - new Date(t.createdAt).getTime()
      return age > 24 * 60 * 60 * 1000
    })

    const dirtyCount = getDirtyCollections().length

    return {
      totalAssets: pcs.length + stockItems.length,
      openTickets: openTickets.length,
      criticalTickets: criticalTickets.length,
      computersOnline: pcs.length,
      pendingMaintenance: 0,
      lastSyncAt: getLastSyncedAt()?.toISOString() || null,
      syncStatus: dirtyCount > 0 ? 'syncing' : 'ok',
    }
  },
}
