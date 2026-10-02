import { useCallback, useEffect, useRef, useState } from 'react'
import { ticketService } from '../services/ticketService'
import type { Ticket } from '../types'

/**
 * Meus Chamados — conjunto de dados autorizado pelo SERVIDOR.
 *
 * `GET /api/chamados?mine=true` aplica `reportedByUserId = <identidade do JWT>`
 * no backend e não exige `ticket.view`. Este hook existe para que a tela de
 * Meus Chamados consuma essa consulta, e não a lista geral filtrada no cliente:
 * filtered `reportedByUserId` sobre `ticketService.pullRemote()` continuaria
 * sendo um filtro de apresentação, e o requisito é que o recorte seja decidido
 * onde a autorização acontece.
 *
 * ── Limites deliberados ──────────────────────────────────────────────────────
 * · Sem cache local (IndexedDB) e sem canal realtime. A coleção `chamados` é a
 *   fila de trabalho, compartilhada com a lista geral; gravar o escopo pessoal
 *   nela faria o filtro do cliente virar a única fronteira. O custo é que esta
 *   tela não funciona offline — aceitável, porque ela é uma leitura de histórico.
 * · O erro é exposto, nunca escondido: se a chamada falhar, a tela mostra o
 *   erro em vez de cair de volta na fila (que seria justamente o vazamento que
 *   esta via server-side elimina).
 */
export function useMyTickets(enabled: boolean) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const data = await ticketService.listMine()
      if (!alive.current) return
      setTickets(data)
    } catch (err) {
      if (!alive.current) return
      // Fail-closed: nada é exibido como "meus chamados" sem o servidor dizer
      // que são. Não volta para a lista geral.
      setTickets([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar seus chamados.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setTickets([])
      setLoading(false)
      setError(null)
      return
    }
    void reload()
  }, [enabled, reload])

  return { tickets, loading, error, reload }
}