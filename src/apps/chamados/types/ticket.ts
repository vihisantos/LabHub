export type TicketStatus = 'aberto' | 'a_caminho' | 'em_atendimento' | 'resolvido' | 'fechado'
export type TicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente'
export type AssetSource = 'stock' | 'pcare'
export type TicketProblemArea = 'administrativa' | 'academica'

export const TICKET_PRIORITIES: TicketPriority[] = ['baixa', 'normal', 'alta', 'urgente']

export interface Ticket {
  id: string
  ticketNumber: number
  workspace_id?: string
  roomId: string
  roomName: string
  assetId?: string
  assetSource?: AssetSource
  assetName: string
  assetPatrimony?: string
  problemCategory: string
  problemArea?: TicketProblemArea
  problemDescription: string
  status: TicketStatus
  priority?: TicketPriority
  reportedBy: string
  reportedByEmail: string
  assignedTo: string
  feedbackRating?: number
  feedbackComment?: string
  feedbackAt?: string
  archived?: boolean
  closedAt?: string | null
  closedBy?: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export type TicketFormData = Omit<Ticket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'resolvedAt'>

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  a_caminho: 'A caminho',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  a_caminho: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  em_atendimento: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  resolvido: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  fechado: 'bg-fg-muted/15 text-fg-muted',
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  baixa: 'bg-fg-muted/15 text-fg-muted',
  normal: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  alta: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  urgente: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export const DEFAULT_SLA_HOURS: Record<TicketPriority, number> = {
  baixa: 72,
  normal: 24,
  alta: 8,
  urgente: 2,
}

export const PROBLEM_AREA_LABELS: Record<TicketProblemArea, string> = {
  administrativa: 'Área Administrativa',
  academica: 'Área Acadêmica',
}

export const TICKET_PROBLEM_CATEGORIES = [
  'Internet',
  'Projetor',
  'Áudio',
  'Computador',
  'Outros',
]
