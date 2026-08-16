import { useCallback, useEffect, useState } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'
import { ticketService } from '../services/ticketService'
import { syncNewTicketAlerts, alertForNewTickets, markLocalTicket } from '../services/ticketAlerts'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'

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
    // Polling a cada 60s como fallback (Realtime é o canal primário).
    const timer = setInterval(() => syncRemote(), 60000)
    return () => clearInterval(timer)
  }, [load, syncRemote])

  useEffect(() => {
    const onOnline = () => syncRemote()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncRemote])

  // ── Realtime: recebe inserções/atualizações do Supabase via WebSocket ──
  useRealtimeSubscription<Ticket>(
    'chamados_tickets',
    '*',
    (payload) => {
      if (payload.eventType === 'INSERT') {
        const newTicket = payload.new as Ticket
        // Persiste no cache local e adiciona ao state (sem re-fetch)
        setTickets((prev) => {
          if (prev.some((t) => t.id === newTicket.id)) return prev
          const created = syncNewTicketAlerts()
          if (created.length > 0) alertForNewTickets(created)
          return [newTicket, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        })
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Ticket
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
        )
      } else if (payload.eventType === 'DELETE') {
        const deleted = payload.old as Pick<Ticket, 'id'>
        setTickets((prev) => prev.filter((t) => t.id !== deleted.id))
      }
    },
    { channelName: 'chamados:tickets:all' },
  )

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
      updates.statusNote = ''
    }
    if (status === 'fechado') {
      updates.archived = true
      updates.closedAt = new Date().toISOString()
      updates.statusNote = ''
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
