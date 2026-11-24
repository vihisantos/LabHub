import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ticket, TicketFormData, TicketStatus } from '../types'
import { ticketService, cachedTickets } from '../services/ticketService'
import { syncNewTicketAlerts, alertForNewTickets, markLocalTicket, syncSlaAlerts } from '../services/ticketAlerts'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { useTicketInvalidationBroadcast } from './useTicketInvalidationBroadcast'
import { readTicketQueueRevision } from '../services/ticketQueueRevision'

/**
 * Corrige tickets antigos no IndexedDB que estejam sem createdAt ou ticketNumber.
 * Roda apenas na primeira carga para não impacting performance.
 *
 * `cachedTickets()` é o cache do USUÁRIO DA SESSÃO (`chamados:<userId>`), pelo
 * mesmo resolvedor do serviço — não pela chave literal, que era compartilhada
 * entre usuários (#344).
 */
export function sanitizeStaleTickets(): void {
  const items = cachedTickets()
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
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [, setBroadcastConnected] = useState(false)
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? null
  const invalidationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeConnectedRef = useRef(false)
  const realtimeStatusSeenRef = useRef(false)
  const sanitizedRef = useRef(false)
  const pendingSync = useRef<Promise<boolean> | null>(null)
  const lastFullSuccess = useRef(0)
  const lastSyncAttempt = useRef(0)
  const syncAgain = useRef(false)

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
    if (pendingSync.current) {
      syncAgain.current = true
      return pendingSync.current
    }
    const run = async (): Promise<boolean> => {
      let success = false
      do {
        syncAgain.current = false
        lastSyncAttempt.current = Date.now()
        try {
          await ticketService.pullRemote()
          success = true
          lastFullSuccess.current = Date.now()
        } catch {
          success = false
          // Sem conexão: mantém o cache local.
        } finally {
          load(silent)
          const created = syncNewTicketAlerts()
          if (created.length > 0) alertForNewTickets(created)
          syncSlaAlerts()
        }
      } while (syncAgain.current)
      return success
    }
    const task = run()
    pendingSync.current = task
    try {
      return await task
    } finally {
      pendingSync.current = null
      setSyncing(false)
    }
  }, [load])

  // Checagem pontual de arquivamento: nunca é acoplada ao syncRemote,
  // pois syncRemote também roda no fallback periódico de 45s.
  const checkAutoArchive = useCallback(async (): Promise<number> => {
    try {
      return await ticketService.autoArchiveResolved()
    } catch {
      // Falha temporária não bloqueia a fila; uma nova abertura/refresh/online tenta novamente.
      return 0
    }
  }, [])

  useEffect(() => {
    load()
    // Só refaz o pull inicial quando houve arquivamento; sem alterações,
    // evita uma segunda leitura desnecessária e preserva o fluxo de carga local.
    void checkAutoArchive().then((archivedCount) => {
      if (archivedCount > 0) return syncRemote()
    })
  }, [load, checkAutoArchive, syncRemote])

  // Broadcast is primary. Every 45s compare a tiny transactional marker.
  // A periodic full read is retained for defense in depth and RBAC changes.
  useEffect(() => {
    let active = true
    let checking = false
    let knownRevision: string | null = null
    const tick = async () => {
      if (!active || checking || pendingSync.current) return
      checking = true
      lastSyncAttempt.current = Date.now()
      try {
        const revision = await readTicketQueueRevision(workspaceId)
        if (!active) return
        const fullDue = Date.now() - lastFullSuccess.current >= 600000
        if (revision !== null && revision === knownRevision && !fullDue) {
          // Keep time-dependent alerts running even when data is unchanged.
          syncSlaAlerts()
          return
        }
        // Read the marker BEFORE the full pull. A mutation during the pull
        // changes the next marker, ensuring a conservative retry.
        const success = await syncRemote()
        if (active) knownRevision = success ? revision : null
      } finally {
        checking = false
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' &&
          Date.now() - lastSyncAttempt.current >= 45000) void tick()
    }
    let worker: Worker | undefined
    let timer: number | undefined
    const fallback = () => {
      if (!active) return
      worker?.terminate()
      worker = undefined
      if (timer === undefined) timer = window.setInterval(() => void tick(), 45000)
    }
    try {
      worker = new Worker(new URL('./ticketWatchdog.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = () => void tick()
      worker.onerror = fallback
    } catch {
      fallback()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      worker?.terminate()
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncRemote, workspaceId])

  // Cada INSERT/UPDATE/DELETE em um chamado emite somente um sinal de invalidação;
  // a API autenticada continua responsável por fornecer os dados e aplicar RBAC.
  const onTicketInvalidated = useCallback(() => {
    if (invalidationTimer.current !== null) clearTimeout(invalidationTimer.current)
    invalidationTimer.current = setTimeout(() => {
      invalidationTimer.current = null
      void syncRemote()
    }, 250)
  }, [syncRemote])

  useTicketInvalidationBroadcast(workspaceId, onTicketInvalidated, setBroadcastConnected)

  useEffect(() => () => {
    if (invalidationTimer.current !== null) clearTimeout(invalidationTimer.current)
  }, [])

  // Selecionar outro campus precisa reconciliar a fila, não esperar o próximo evento.
  useEffect(() => {
    if (workspaceId) void syncRemote()
  }, [workspaceId, syncRemote])

  useEffect(() => {
    const onOnline = () => {
      void checkAutoArchive().then(() => syncRemote())
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [checkAutoArchive, syncRemote])

  const handleRealtimeStatus = useCallback((status: string) => {
    const connected = status === 'SUBSCRIBED'
    const wasConnected = realtimeConnectedRef.current
    const isFirstStatus = !realtimeStatusSeenRef.current
    realtimeStatusSeenRef.current = true
    realtimeConnectedRef.current = connected
    setRealtimeConnected(connected)

    // Se a primeira resposta do canal já indicar falha, não esperamos o
    // intervalo de 45s: buscamos o remoto imediatamente. Falhas posteriores
    // só disparam novo pull quando representam uma transição de estado.
    if (connected !== wasConnected || (isFirstStatus && !connected)) {
      void syncRemote()
    }
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
          syncSlaAlerts()
          return [newTicket, ...prev].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        })
        // Persiste no IndexedDB para sobreviver a refresh/reabertura, no
        // namespace do usuário da sessão (#344).
        const atual = cachedTickets()
        ticketService.persistTickets(
          atual.some((t) => t.id === newTicket.id)
            ? atual
            : [...atual, newTicket].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        )
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Ticket
        if (!updated.createdAt || isNaN(new Date(updated.createdAt).getTime())) updated.createdAt = new Date().toISOString()
        if (updated.ticketNumber == null) updated.ticketNumber = 0
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
        )
        // Merge no IndexedDB: atualiza o ticket mantendo os dados locais mais recentes.
        const items = cachedTickets()
        const idx = items.findIndex((t) => t.id === updated.id)
        if (idx !== -1) items[idx] = { ...items[idx], ...updated }
        ticketService.persistTickets(items)
      } else if (payload.eventType === 'DELETE') {
        const deleted = payload.old as Pick<Ticket, 'id'>
        setTickets((prev) => prev.filter((t) => t.id !== deleted.id))
        ticketService.persistTickets(
          cachedTickets().filter((t) => t.id !== deleted.id),
        )
      }
    },
    { channelName: 'chamados:tickets:all', onStatus: handleRealtimeStatus },
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

  /**
   * RETOMADA — técnico com `ticket.status` retoma chamado `em_espera` de outro
   * responsável (P3 #371). Erro 409 se outro técnico retomou primeiro.
   */
  const resume = useCallback(async (id: string) => {
    const ticket = await ticketService.resume(id)
    setTickets((prev) => prev.map((t) => (t.id === id ? ticket : t)))
    return ticket
  }, [])

  /**
   * TRANSFERÊNCIA — responsável atual (ou assigner) passa o atendimento ativo
   * a outro técnico do workspace (P3 #371).
   */
  const transfer = useCallback(async (id: string, assignedToUserId: string) => {
    const ticket = await ticketService.transfer(id, assignedToUserId)
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

  const reload = useCallback(async () => {
    // Sinaliza o refresh imediatamente, inclusive enquanto a checagem da RPC ocorre.
    setSyncing(true)
    try {
      // O refresh explícito sempre atualiza a fila, após aplicar os fechamentos elegíveis.
      await checkAutoArchive()
      await syncRemote(false)
    } catch {
      setSyncing(false)
    }
  }, [checkAutoArchive, syncRemote])

  return { tickets, loading, syncing, realtimeConnected, create, update, updateStatus, claim, resume, transfer, remove, reload }
}
