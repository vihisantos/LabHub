import type { Ticket, TicketFormData, ChamadosReport } from '../types'
import type { TicketEvent, TicketEventInput } from '../types'
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

/** Garante que campos obrigatórios estejam presentes no ticket. */
function normalizeTicket<T extends Ticket>(ticket: T): T {
  if (!ticket.createdAt || isNaN(new Date(ticket.createdAt).getTime())) {
    ticket.createdAt = new Date().toISOString()
  }
  if (ticket.ticketNumber == null) {
    ticket.ticketNumber = 0
  }
  return ticket
}

function persistLocal(ticket: Ticket) {
  normalizeTicket(ticket)
  const items = getCol<Ticket>('chamados')
  const idx = items.findIndex((t) => t.id === ticket.id)
  if (idx === -1) items.push(ticket)
  else items[idx] = ticket
  setCol('chamados', items)
}

function persistTickets(tickets: Ticket[]) {
  tickets.forEach(normalizeTicket)
  setCol('chamados', tickets)
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

  persistTickets,

  getById: (id: string) => local.getById(id),

  getByIdNoFilter: (id: string) => getCol<Ticket>('chamados').find((t) => t.id === id),

  isArchived: (ticket: Ticket) => ticket.archived === true || ticket.status === 'fechado',

  getActive: () => local.query((t) => !(t.archived === true || t.status === 'fechado')),

  getArchived: () => local.query((t) => t.archived === true || t.status === 'fechado'),

  /** Cria um chamado na API (fonte de verdade) e persiste localmente como cache. */
  create: async (data: TicketFormData): Promise<Ticket> => {
    const { ticket } = await request<{ ticket: Ticket }>(API_BASE, {
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
    if (!id || id === 'undefined') throw new Error('ID do chamado inválido')
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

  /** Histórico (timeline) de eventos de um chamado, do mais novo ao mais antigo. */
  getEvents: async (id: string): Promise<TicketEvent[]> => {
    const { events } = await request<{ events: TicketEvent[] }>(`${API_BASE}/${id}/events`)
    return events || []
  },

  /** Adiciona um comentário ao chamado (máx 2 fotos por evento). */
  addEvent: async (id: string, data: TicketEventInput): Promise<TicketEvent> => {
    const { event } = await request<{ event: TicketEvent }>(`${API_BASE}/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return event
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
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  },

  /** Puxa os chamados do servidor e mescla no cache local (mais recente por updatedAt). */
  pullRemote: async (): Promise<void> => {
    const { tickets } = await request<{ tickets: Ticket[] }>(API_BASE)
    mergeRemote(tickets || [])
  },

  /** Relatório agregado no servidor (período opcional em ISO: from/to). */
  getReports: async (params: { from?: string; to?: string; workspace_id?: string } = {}): Promise<ChamadosReport> => {
    const qs = new URLSearchParams()
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const { report } = await request<{ report: ChamadosReport }>(`${API_BASE}/reports${suffix}`)
    return report
  },
}
