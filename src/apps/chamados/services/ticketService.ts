import type { Ticket, TicketFormData } from '../types'
import { createSyncService } from '../../../lib/sync'
import { logService } from '../../../core/logs/service'

const service = createSyncService<Ticket>('chamados')

function getNextTicketNumber(): number {
  const tickets = service.getAll()
  if (tickets.length === 0) return 1
  return Math.max(...tickets.map((t) => t.ticketNumber)) + 1
}

function serialize(data: TicketFormData): Ticket {
  const now = new Date().toISOString()
  return {
    ...data,
    ticketNumber: getNextTicketNumber(),
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  } as Ticket
}

export const ticketService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: TicketFormData) => {
    const ticket = service.create(serialize(data))
    logService.log({
      userId: 'public',
      userName: data.reportedBy || 'Anônimo',
      action: 'created',
      entity: 'ticket',
      entityId: ticket.id,
      entityLabel: `#${ticket.ticketNumber}`,
      details: { roomName: data.roomName, assetName: data.assetName, problem: data.problemCategory },
    })
    return ticket
  },

  update: (id: string, data: Partial<Ticket>) => {
    const ticket = service.update(id, data)
    if (ticket) {
      logService.log({
        userId: 'system',
        userName: 'Sistema',
        action: data.status ? 'status_changed' : 'updated',
        entity: 'ticket',
        entityId: ticket.id,
        entityLabel: `#${ticket.ticketNumber}`,
        details: data.status ? { newStatus: data.status } : undefined,
      })
    }
    return ticket
  },

  remove: (id: string) => service.remove(id),

  query: (predicate: (item: Ticket) => boolean) => service.query(predicate),

  getOpenByAsset: (assetId: string, assetSource: string) => {
    return service.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource && (t.status === 'aberto' || t.status === 'em_atendimento')
    )
  },

  getOpenByRoom: (roomId: string) => {
    return service.query(
      (t) => t.roomId === roomId && (t.status === 'aberto' || t.status === 'em_atendimento')
    )
  },

  getHistoryByAsset: (assetId: string, assetSource: string) => {
    return service.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
}
