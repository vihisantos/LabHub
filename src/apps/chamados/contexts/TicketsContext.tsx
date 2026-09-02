import { createContext, useContext } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'

export interface TicketsContextValue {
  tickets: Ticket[]
  loading: boolean
  syncing: boolean
  reload: (silent?: boolean) => Promise<void>
  create: (data: TicketFormData) => Promise<Ticket>
  update: (id: string, data: Partial<Ticket>) => Ticket | undefined
  updateStatus: (id: string, status: TicketStatus) => Ticket | undefined
  claim: (id: string) => Promise<Ticket>
  remove: (id: string) => boolean
}

export const TicketsContext = createContext<TicketsContextValue | null>(null)

export function useTicketsContext(): TicketsContextValue {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTicketsContext must be used within ChamadosLayout')
  return ctx
}
