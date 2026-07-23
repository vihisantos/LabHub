import { useCallback, useEffect, useState } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'
import { ticketService } from '../services/ticketService'

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = ticketService.getAll()
    setTickets(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: TicketFormData) => {
    const ticket = ticketService.create(data)
    setTickets((prev) => [ticket, ...prev])
    return ticket
  }, [])

  const update = useCallback((id: string, data: Partial<Ticket>) => {
    const ticket = ticketService.update(id, data)
    if (ticket) {
      setTickets((prev) => prev.map((t) => (t.id === id ? ticket : t)))
    }
    return ticket
  }, [])

  const updateStatus = useCallback((id: string, status: TicketStatus) => {
    const updates: Partial<Ticket> = { status }
    if (status === 'resolvido') {
      updates.resolvedAt = new Date().toISOString()
    }
    return update(id, updates)
  }, [update])

  const remove = useCallback((id: string) => {
    const ok = ticketService.remove(id)
    if (ok) {
      setTickets((prev) => prev.filter((t) => t.id !== id))
    }
    return ok
  }, [])

  return { tickets, loading, create, update, updateStatus, remove, reload: load }
}
