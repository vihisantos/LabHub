export type TicketStatus = 'aberto' | 'em_atendimento' | 'resolvido' | 'fechado'
export type AssetSource = 'stock' | 'pcare'

export interface Ticket {
  id: string
  ticketNumber: number
  roomId: string
  roomName: string
  assetId: string
  assetSource: AssetSource
  assetName: string
  assetPatrimony: string
  problemCategory: string
  problemDescription: string
  status: TicketStatus
  reportedBy: string
  reportedByEmail: string
  assignedTo: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export type TicketFormData = Omit<Ticket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'resolvedAt'>

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  em_atendimento: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  resolvido: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  fechado: 'bg-fg-muted/15 text-fg-muted',
}
