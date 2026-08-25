/**
 * Contrato de GET /api/tv/chamados/display (PR 7).
 * Espelha EXATAMENTE a projeção TV-safe do backend — fonte de verdade do
 * que pode ser exibido. Não adicionar campos aqui.
 */
import type { TicketPriority, TicketStatus } from '../chamados/types/ticket'

export interface ChamadosDisplayTicket {
  ticketNumber: number
  roomName: string
  problemArea: string
  problemCategory: string
  priority: TicketPriority
  status: TicketStatus
  createdAt: string | null
  resolvedAt: string | null
}

export interface ChamadosDisplaySummary {
  total: number
  open: number
  inProgress: number
  highPriority: number
  avgResolutionHours: number | null
  satisfaction: number | null
}

export interface ChamadosDisplaySnapshot {
  generatedAt: string
  summary: ChamadosDisplaySummary
  tickets: ChamadosDisplayTicket[]
}
