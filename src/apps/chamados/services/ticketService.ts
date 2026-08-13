import type { Ticket, TicketFormData } from '../types'
import { createSyncService } from '../../../lib/sync'
import { getCol, setCol } from '../../../lib/db'
import { logService } from '../../../core/logs/service'
import { permissionService } from '../../../core/permissions/service'

const local = createSyncService<Ticket>('chamados')

const API_BASE = '/api/chamados'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Erro na requisição (${res.status})`)
  }
  return body as T
}

function persistLocal(ticket: Ticket) {
  const items = getCol<Ticket>('chamados')
  const idx = items.findIndex((t) => t.id === ticket.id)
  if (idx === -1) items.push(ticket)
  else items[idx] = ticket
  setCol('chamados', items)
}

function mergeRemote(remote: Ticket[]) {
  const items = getCol<Ticket>('chamados')
  const map = new Map(items.map((t) => [t.id, t]))
  for (const t of remote) {
    const existing = map.get(t.id)
    if (!existing || (t.updatedAt || '') > (existing.updatedAt || '')) {
      map.set(t.id, t)
    }
  }
  setCol('chamados', [...map.values()])
}

export const ticketService = {
  getAll: () => local.getAll(),

  getById: (id: string) => local.getById(id),

  getByIdNoFilter: (id: string) => getCol<Ticket>('chamados').find((t) => t.id === id),

  isArchived: (ticket: Ticket) => ticket.archived === true || ticket.status === 'fechado',

  getActive: () => local.query((t) => !(t.archived === true || t.status === 'fechado')),

  getArchived: () => local.query((t) => t.archived === true || t.status === 'fechado'),

  /** Cria um chamado na API (fonte de verdade) e persiste localmente como cache. */
  create: async (data: TicketFormData): Promise<Ticket> => {
    const ticket = await request<Ticket>(API_BASE, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    persistLocal(ticket)
    logService.log({
      userId: 'public',
      userName: data.reportedBy || 'Anônimo',
      action: 'created',
      entity: 'ticket',
      entityId: ticket.id,
      entityLabel: `#${ticket.ticketNumber}`,
      details: { roomName: data.roomName, problem: data.problemCategory, area: data.problemArea },
    })
    return ticket
  },

  update: (id: string, data: Partial<Ticket>) => {
    permissionService.requireWrite('chamados')
    const ticket = local.update(id, data)
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
      request<{ ticket: Ticket }>(`${API_BASE}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
        .then((res) => persistLocal(res.ticket))
        .catch(() => {
          // Falha de rede: mantém local; próximo pullRemote reconcilia.
        })
    }
    return ticket
  },

  remove: (id: string) => {
    permissionService.requireWrite('chamados')
    const ok = local.remove(id)
    if (ok) {
      request(`${API_BASE}/${id}`, { method: 'DELETE' }).catch(() => {})
    }
    return ok
  },

  /** Busca um chamado direto na API (professor/feedback — sem guarda de escrita). */
  getByIdRemote: async (id: string): Promise<Ticket> => {
    const { ticket } = await request<{ ticket: Ticket }>(`${API_BASE}/${id}`)
    persistLocal(ticket)
    return ticket
  },

  /** Busca chamados pelo nome do professor na API (público). */
  getByReporter: async (name: string): Promise<Ticket[]> => {
    const { tickets } = await request<{ tickets: Ticket[] }>(
      `${API_BASE}?reportedBy=${encodeURIComponent(name)}`,
    )
    return tickets || []
  },

  /** Registra o feedback do professor (nota 1-5) após a resolução. */
  submitFeedback: async (id: string, rating: number, comment: string): Promise<Ticket> => {
    const { ticket } = await request<{ ticket: Ticket }>(`${API_BASE}/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    })
    persistLocal(ticket)
    return ticket
  },

  query: (predicate: (item: Ticket) => boolean) => local.query(predicate),

  getOpenByAsset: (assetId: string, assetSource: string) => {
    return local.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource && (t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento')
    )
  },

  getOpenByRoom: (roomId: string) => {
    return local.query(
      (t) => t.roomId === roomId && (t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento')
    )
  },

  getHistoryByAsset: (assetId: string, assetSource: string) => {
    return local.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  /** Puxa os chamados do servidor e mescla no cache local (mais recente por updatedAt). */
  pullRemote: async (): Promise<void> => {
    const { tickets } = await request<{ tickets: Ticket[] }>(API_BASE)
    mergeRemote(tickets || [])
  },
}
