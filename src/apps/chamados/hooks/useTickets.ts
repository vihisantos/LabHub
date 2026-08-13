import { useCallback, useEffect, useState } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'
import { ticketService } from '../services/ticketService'
import { syncNewTicketAlerts, alertForNewTickets, markLocalTicket } from '../services/ticketAlerts'

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    const data = ticketService.getAll()
    setTickets(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    if (!silent) setLoading(false)
  }, [])

  const syncRemote = useCallback(async (silent = true) => {
    try {
      await ticketService.pullRemote()
    } catch {
      // Sem conexão: mantém o cache local.
    } finally {
      load(silent)
      // Alerta o TI sobre chamados novos vindos do formulário público.
      const created = syncNewTicketAlerts()
      if (created.length > 0) alertForNewTickets(created)
    }
  }, [load])

  useEffect(() => {
    load()
    // Puxa do servidor a cada 10s (chamados criados pelo formulário público).
    const timer = setInterval(() => syncRemote(), 10000)
    return () => clearInterval(timer)
  }, [load, syncRemote])

  useEffect(() => {
    const onOnline = () => syncRemote()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncRemote])

  const create = useCallback(async (data: TicketFormData) => {
    const ticket = await ticketService.create(data)
    markLocalTicket(ticket.id)
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
    if (status === 'fechado') {
      updates.archived = true
      updates.closedAt = new Date().toISOString()
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
