import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'
import { ticketService } from '../services/ticketService'
import { syncNewTicketAlerts, alertForNewTickets, markLocalTicket } from '../services/ticketAlerts'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { getCol } from '../../../lib/db'

/**
 * Corrige tickets antigos no IndexedDB que estejam sem createdAt ou ticketNumber.
 * Roda apenas na primeira carga para não impactar performance.
 */
export function sanitizeStaleTickets(): void {
  const items = getCol<Ticket>('chamados')
  const now = new Date().toISOString()
  let dirty = false
  for (const t of items) {
    if (!t.createdAt || isNaN(new Date(t.createdAt).getTime())) {
      t.createdAt = now
      dirty = true
    }
    if (t.ticketNumber == null) {
      t.ticketNumber = 0
      dirty = true
    }
  }
  if (dirty) ticketService.persistTickets(items)
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const sanitizedRef = useRef(false)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    // Na primeira carga, corrige tickets antigos no IndexedDB.
    if (!sanitizedRef.current) {
      sanitizedRef.current = true
      sanitizeStaleTickets()
    }
    const data = ticketService.getAll()
    setTickets(data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    if (!silent) setLoading(false)
  }, [])

  const syncRemote = useCallback(async (silent = true) => {
    if (!silent) setSyncing(true)
    try {
      await ticketService.pullRemote()
    } catch {
      // Sem conexão: mantém o cache local.
    } finally {
      load(silent)
      setSyncing(false)
      // Alerta o TI sobre chamados novos vindos do formulário público.
      const created = syncNewTicketAlerts()
      if (created.length > 0) alertForNewTickets(created)
    }
  }, [load])

  useEffect(() => {
    load()
    // Polling a cada 15s como fallback (Realtime é o canal primário).
    const timer = setInterval(() => syncRemote(), 15000)
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
        const raw = payload.new as Ticket
        // Normaliza campos obrigatórios vindos do Realtime.
        if (!raw.createdAt || isNaN(new Date(raw.createdAt).getTime())) raw.createdAt = new Date().toISOString()
        if (raw.ticketNumber == null) raw.ticketNumber = 0
        const newTicket = raw
        setTickets((prev) => {
          if (prev.some((t) => t.id === newTicket.id)) return prev
          const created = syncNewTicketAlerts()
          if (created.length > 0) alertForNewTickets(created)
          return [newTicket, ...prev].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        })
        // Persiste no IndexedDB para sobreviver a refresh/reabertura.
        ticketService.persistTickets(
          getCol<Ticket>('chamados').some((t) => t.id === newTicket.id)
            ? getCol<Ticket>('chamados')
            : [...getCol<Ticket>('chamados'), newTicket].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        )
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Ticket
        if (!updated.createdAt || isNaN(new Date(updated.createdAt).getTime())) updated.createdAt = new Date().toISOString()
        if (updated.ticketNumber == null) updated.ticketNumber = 0
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
        )
        // Merge no IndexedDB: atualiza o ticket mantendo os dados locais mais recentes.
        const items = getCol<Ticket>('chamados')
        const idx = items.findIndex((t) => t.id === updated.id)
        if (idx !== -1) items[idx] = { ...items[idx], ...updated }
        ticketService.persistTickets(items)
      } else if (payload.eventType === 'DELETE') {
        const deleted = payload.old as Pick<Ticket, 'id'>
        setTickets((prev) => prev.filter((t) => t.id !== deleted.id))
        ticketService.persistTickets(
          getCol<Ticket>('chamados').filter((t) => t.id !== deleted.id),
        )
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

  /**
   * COMEÇAR ATENDIMENTO — assume o chamado para o usuário atual.
   * Lança erro 409 se outro técnico assumiu primeiro.
   */
  const claim = useCallback(async (id: string) => {
    const ticket = await ticketService.claim(id)
    setTickets((prev) => prev.map((t) => (t.id === id ? ticket : t)))
    return ticket
  }, [])

  const remove = useCallback((id: string) => {
    const ok = ticketService.remove(id)
    if (ok) {
      setTickets((prev) => prev.filter((t) => t.id !== id))
    }
    return ok
  }, [])

  const reload = useCallback(() => syncRemote(false), [syncRemote])

  return { tickets, loading, syncing, create, update, updateStatus, claim, remove, reload }
}
