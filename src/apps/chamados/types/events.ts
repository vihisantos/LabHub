export type TicketEventType = 'comentario' | 'status' | 'foto' | 'prioridade' | 'atribuicao'

export interface TicketEvent {
  id: string
  ticket_id: string
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
