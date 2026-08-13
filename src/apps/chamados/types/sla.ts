import type { TicketPriority } from './ticket'

export interface SlaConfig {
  id: string
  workspace_id: string
  hours: Record<TicketPriority, number>
  createdAt: string
  updatedAt: string
}
