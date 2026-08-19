import { createContext, useContext } from 'react'
import type { Ticket } from '../types'

export interface TicketsContextValue {
  tickets: Ticket[]
  loading: boolean
  syncing: boolean
  reload: (silent?: boolean) => Promise<void>
}

export const TicketsContext = createContext<TicketsContextValue | null>(null)

export function useTicketsContext(): TicketsContextValue {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTicketsContext must be used within ChamadosLayout')
  return ctx
}
