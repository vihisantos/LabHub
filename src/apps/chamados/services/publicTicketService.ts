import type { Ticket, TicketEvent, TicketStatus } from '../types'

/**
 * Cliente da API pública do chamado (acesso do professor via tracking token).
 *
 * O professor NÃO tem conta autenticada. Ele prova posse do chamado com o
 * tracking token (recebido em /api/chamados na criação). O token é uma
 * credencial bearer de escopo limitado: dá acesso SOMENTE ao chamado
 * associado — nunca ao workspace nem a endpoints internos.
 *
 * O token viaja no header X-Tracking-Token (não na URL após o fluxo inicial).
 */

const PUBLIC_BASE = '/api/public/chamados'

/**
 * Segmento neutro para o parâmetro <tracking_token> da rota. O token de fato
 * viaja APENAS no header X-Tracking-Token — nunca na URL (evita vazar a
 * credencial para logs de servidor/proxy/analytics). O roteador Flask usa o
 * segmento apenas para casar a rota; o decorator valida o header.
 */
const PATH_TOKEN = '_'

async function publicRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${PUBLIC_BASE}/${PATH_TOKEN}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Tracking-Token': token,
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: string }).error
    if (res.status === 404 && !msg) throw new Error('Chamado não encontrado')
    throw new Error(msg || `Erro na requisição (${res.status})`)
  }
  return body as T
}

/** Formato do ticket retornado pela API pública (projeção limitada do backend). */
export interface PublicTicket {
  id: string
  ticketNumber?: number
  status?: TicketStatus
  roomName?: string
  problemCategory?: string
  problemArea?: string
  problemDescription?: string
  reportedBy?: string
  photos?: string
  feedbackRating?: number | null
  createdAt?: string
  updatedAt?: string
  closedAt?: string | null
}

export const publicTicketService = {
  /** Status + dados básicos do chamado (token-scoped). */
  async getByToken(token: string): Promise<PublicTicket> {
    const { ticket } = await publicRequest<{ ticket: PublicTicket }>(token, '')
    return ticket
  },

  /** Timeline (eventos) do chamado (token-scoped). */
  async getEvents(token: string): Promise<TicketEvent[]> {
    const { events } = await publicRequest<{ events: TicketEvent[] }>(token, '/events')
    return events || []
  },

  /** Submete feedback (1-5) para o próprio chamado (token-scoped). */
  async submitFeedback(token: string, rating: number, comment: string): Promise<PublicTicket> {
    const { ticket } = await publicRequest<{ ticket: PublicTicket }>(token, '/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    })
    return ticket
  },

  /** Registra push subscription do professor para o próprio chamado (token-scoped). */
  async subscribe(token: string, subscription: Record<string, unknown>): Promise<void> {
    await publicRequest<{ status: string }>(token, '/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    })
  },
}

/** Converte a projeção pública em um Ticket completo o suficiente para a UI. */
export function toTicket(p: PublicTicket): Ticket {
  return {
    id: p.id,
    ticketNumber: p.ticketNumber ?? 0,
    roomId: '',
    roomName: p.roomName ?? '',
    assetName: '',
    problemCategory: p.problemCategory ?? '',
    problemArea: p.problemArea as Ticket['problemArea'],
    problemDescription: p.problemDescription ?? '',
    status: p.status ?? 'aberto',
    reportedBy: p.reportedBy ?? '',
    reportedByEmail: '',
    assignedTo: '',
    feedbackRating: p.feedbackRating ?? undefined,
    photos: p.photos,
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    resolvedAt: null,
  }
}
