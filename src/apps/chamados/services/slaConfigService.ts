import type { SlaConfig, TicketPriority } from '../types'
import { createSyncService } from '../../../lib/sync'
import { getCol } from '../../../lib/db'
import { DEFAULT_SLA_HOURS, TICKET_PRIORITIES } from '../types'
import { permissionService } from '../../../core/permissions/service'

const service = createSyncService<SlaConfig>('sla_configs')

function ensureConfig(workspaceId: string): SlaConfig {
  if (!workspaceId) return { ...makeConfig('__default__') }
  const existing = getCol<SlaConfig>('sla_configs').find((c) => c.workspace_id === workspaceId)
  if (existing) return existing
  const config = service.create(makeConfig(workspaceId))
  return config
}

function makeConfig(workspaceId: string): SlaConfig & { id: string } {
  const now = new Date().toISOString()
  return {
    id: workspaceId,
    workspace_id: workspaceId,
    hours: { ...DEFAULT_SLA_HOURS },
    createdAt: now,
    updatedAt: now,
  }
}

export const slaConfigService = {
  getFor(workspaceId: string): SlaConfig {
    return ensureConfig(workspaceId)
  },

  getHours(workspaceId: string): Record<TicketPriority, number> {
    return { ...ensureConfig(workspaceId).hours }
  },

  getHoursForTickets(): Record<string, Record<TicketPriority, number>> {
    const map: Record<string, Record<TicketPriority, number>> = {}
    for (const config of getCol<SlaConfig>('sla_configs')) {
      const hours: Record<TicketPriority, number> = { ...DEFAULT_SLA_HOURS }
      for (const p of TICKET_PRIORITIES) {
        if (config.hours[p] !== undefined) hours[p] = config.hours[p]
      }
      map[config.workspace_id] = hours
    }
    return map
  },

  update(workspaceId: string, hours: Record<TicketPriority, number>) {
    permissionService.requireWrite('chamados')
    ensureConfig(workspaceId)
    const clean: Record<TicketPriority, number> = { ...DEFAULT_SLA_HOURS }
    for (const p of TICKET_PRIORITIES) {
      const value = hours[p]
      clean[p] = value !== undefined && Number.isFinite(value) ? Math.max(0, Math.round(value)) : DEFAULT_SLA_HOURS[p]
    }
    return service.update(workspaceId, { hours: clean, updatedAt: new Date().toISOString() })
  },
}
