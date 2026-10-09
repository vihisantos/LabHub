export type TicketStatus =
  | 'aberto'
  | 'a_caminho'
  | 'em_atendimento'
  | 'em_espera'
  | 'resolvido'
  | 'indeferido'
  | 'fechado'
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
  /**
   * UUID do solicitante autenticado — `auth.uid()` no momento da criação.
   *
   * ÚNICA identidade de solicitante confiável: o backend preenche a partir do
   * JWT e ignora qualquer valor vindo do body (`api/app.py:2315-2320,2387`).
   * `reportedBy`/`reportedByEmail` são TEXTO LIVRE digitado pelo solicitante e
   * não podem ser usados para identificar ninguém.
   *
   * `null`/ausente = chamado anônimo (professor sem sessão), ou criado antes da
   * migration 056 (que não tem backfill).
   */
  reportedByUserId?: string | null
  assignedTo: string
  assignedToUserId?: string
  feedbackRating?: number
  feedbackComment?: string
  feedbackAt?: string
  archived?: boolean
  closedAt?: string | null
  closedBy?: string
  statusNote?: string
  /**
   * Motivo ESTRUTURADO de espera/indeferimento (issue #367) — `reasonCode` é
   * um código predefinido escolhido no modal; `reasonLabel` é resolvido pelo
   * backend a partir do código e `reasonNote` é a observação opcional.
   * Texto livre nunca identifica o motivo. `null`/ausente = sem motivo.
   */
  reasonCode?: string | null
  reasonLabel?: string | null
  reasonNote?: string | null
  photos?: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

/**
 * `reportedByUserId` fica DE FORA de propósito: a identidade do solicitante é
 * sempre derivada do JWT pelo servidor, nunca escolhida pelo cliente. Excluir o
 * campo do tipo de formulário faz essa regra verificável pelo compilador — não é
 * possível montar um payload de criação que declare de quem é o chamado.
 */
export type TicketFormData = Omit<
  Ticket,
  'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'reportedByUserId'
>

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  a_caminho: 'A caminho',
  em_atendimento: 'Em atendimento',
  em_espera: 'Em espera',
  resolvido: 'Resolvido',
  indeferido: 'Indeferido',
  fechado: 'Fechado',
}

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  a_caminho: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  em_atendimento: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  em_espera: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  resolvido: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  indeferido: 'bg-red-500/15 text-red-600 dark:text-red-400',
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

export const TICKET_STATUS_NOTE_PRESETS = [
  'Em outro chamado, atendimento em 5 minutos',
  'Técnico a caminho',
  'Atendendo agora',
  'Aguardando peça/retorno',
  'Aguardando vaga de manutenção',
]
