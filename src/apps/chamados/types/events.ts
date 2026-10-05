export type TicketEventType = 'comentario' | 'status' | 'foto' | 'prioridade' | 'atribuicao'

/**
 * Evento da timeline, como a API o entrega.
 *
 * `ticket_id` e `workspace_id` são OPCIONAIS de propósito: a minimização de
 * dados (#346) parou de devolvê-los — `ticket_id` é redundante numa timeline que
 * já é de um chamado só, e `workspace_id` é escopo interno. O frontend nunca leu
 * nenhum dos dois em runtime, então nada quebrou; o que estava errado era o tipo
 * prometer um campo que não chega.
 */
export interface TicketEvent {
  id: string
  ticket_id?: string
  workspace_id?: string
  type: TicketEventType
  content: string
  author: string
  photos: string[]
  createdAt: string
}

export interface TicketEventInput {
  content?: string
  author?: string
  photos?: string[]
}
