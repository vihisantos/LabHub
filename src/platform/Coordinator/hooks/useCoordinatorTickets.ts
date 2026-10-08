import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ticket } from '../../../apps/chamados/types'
import { ticketService } from '../../../apps/chamados/services/ticketService'

/**
 * Hook de consulta DIRETA ao backend para a aba Chamados da Central do
 * Coordenador.
 *
 * Por que existe?
 * ──────────────────────────────────────────────────────────────────────────
 * A `CoordinatorTicketsTab` dependia de `cachedTickets()` — o cache local da
 * fila operacional — que só é populado quando o usuário passa pelo módulo
 * `/chamados` (via `pullRemote`). Um coordenador que entra diretamente em
 * `/coordenador` verá a lista vazia mesmo que existam chamados no backend.
 *
 * Este hook resolve isso consultando `GET /api/chamados` por workspace_id para
 * cada unidade do escopo. Por ser a rota operacional (requer `ticket.view`),
 * o backend autoriza corretamente por membership — sem alterar RBAC, RLS nem
 * schema.
 *
 * Decisões de projeto:
 * - SEM `archived` filter: queremos histórico completo (resolvidos + fechados).
 * - Paginação REMOTA via `limit`/`offset` (opcionais no backend): só uma janela
 *   do histórico de cada unidade é baixada por vez — o volume que cabe na
 *   página atual. A navegação troca a janela (re-fetch com novo `offset`).
 * - Busca/SLA/filtros continuam CLIENT-SIDE sobre a janela carregada. Limitação
 *   documentada: filtros não cruzam páginas que ainda não foram baixadas.
 * - Merging client-side por `updatedAt` (mais recente ganha): idempotente e
 *   sem duplicatas mesmo com workspaces sobrepostos.
 * - `total`: quando o backend informa (Content-Range), alimenta a paginação
 *   numérica; sem `total`, navegação por `hasMore` (página cheia ⇒ há próxima).
 * - O cache local (`cachedTickets()`) é ainda a fonte primária dos KPIs do
 *   shell; este hook é só para a lista da aba. Não grava no IndexedDB.
 * - Sem poll nem realtime: carregar sob demanda (lazy quando aba é aberta).
 */

export const COORDINATOR_TICKETS_PAGE_SIZE = 20

export interface UseCoordinatorTicketsResult {
  /** Chamados da janela carregada (todas as unidades do escopo). */
  tickets: Ticket[]
  /** Está buscando pela primeira vez ou recarregando. */
  loading: boolean
  /** Houve erro em alguma requisição. */
  error: string | null
  /** Página atual (1-indexed). */
  page: number
  /** Total conhecido de chamados (quando o backend informa; senão, janela mínima). */
  total: number
  /** Há página seguinte segundo o backend (`hasMore`) ou janela cheia. */
  hasMore: boolean
  /** Total de páginas para um conjunto filtrado (compatibilidade). */
  totalPages: (filteredCount: number) => number
  /** Navega para uma página (dispara re-fetch da janela remota). */
  setPage: (p: number) => void
  /** Força re-busca imediata voltando para a página 1 (ex: após atribuição). */
  reload: () => void
}

/**
 * Busca uma janela de chamados das unidades coordenadas diretamente do backend.
 *
 * @param unitIds - IDs dos workspaces coordenados (do `useCoordinator`).
 * @param enabled - Ativa a busca (false = lazy/não-montado, evita req no boot).
 * @param pageSize - Tamanho da janela remota (default 20).
 */
export function useCoordinatorTickets(
  unitIds: readonly string[],
  enabled: boolean,
  pageSize: number = COORDINATOR_TICKETS_PAGE_SIZE,
): UseCoordinatorTicketsResult {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPageState] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Ref para controlar abort de fetches em flight quando as deps mudam.
  const abortRef = useRef<AbortController | null>(null)
  // Contador de reload forçado.
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => {
    setPageState(1)
    setReloadKey((k) => k + 1)
  }, [])

  const setPage = useCallback((p: number) => {
    setPageState(p)
  }, [])

  const totalPages = useCallback(
    (filteredCount: number) => Math.max(1, Math.ceil(filteredCount / pageSize)),
    [pageSize],
  )

  useEffect(() => {
    if (!enabled || unitIds.length === 0) {
      setTickets([])
      setTotal(0)
      setHasMore(false)
      setLoading(false)
      setError(null)
      return
    }

    // Abort fetch anterior se ainda em flight.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const offset = (page - 1) * pageSize

    const fetchAll = async () => {
      try {
        // Busca em paralelo por workspace, pedindo só a janela `offset..offset+pageSize`.
        const results = await Promise.allSettled(
          unitIds.map((wsId) =>
            fetch(
              `/api/chamados?workspace_id=${encodeURIComponent(wsId)}&limit=${pageSize}&offset=${offset}`,
              {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal,
              },
            ).then(async (res) => {
              const body = await res.json()
              if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`)
              return {
                tickets: (body.tickets ?? []) as Ticket[],
                hasMore: Boolean(body.hasMore),
                total: typeof body.total === 'number' ? body.total : null,
              }
            }),
          ),
        )

        if (controller.signal.aborted) return

        // Merge: mais recente por updatedAt ganha (sem duplicatas por id).
        const map = new Map<string, Ticket>()
        let anyUnitHasMore = false
        let anyUnitFullPage = false
        // total global conhecido (soma dos totais explícitos do backend).
        let explicitTotal = 0
        // fallback honesto quando o backend não informa total.
        let windowFloor = 0

        for (const result of results) {
          if (result.status !== 'fulfilled') continue
          const unit = result.value
          for (const t of unit.tickets) {
            const existing = map.get(t.id)
            if (!existing || (t.updatedAt || '') > (existing.updatedAt || '')) {
              map.set(t.id, t)
            }
          }
          anyUnitHasMore = anyUnitHasMore || unit.hasMore
          anyUnitFullPage = anyUnitFullPage || unit.tickets.length === pageSize
          if (unit.total != null) explicitTotal += unit.total
          if (unit.tickets.length > 0) {
            windowFloor = Math.max(windowFloor, offset + unit.tickets.length)
          }
        }

        // Reporta erros parciais sem bloquear a UI.
        const failures = results.filter((r) => r.status === 'rejected')
        if (failures.length > 0 && map.size === 0) {
          setError('Não foi possível carregar os chamados. Verifique a conexão e tente novamente.')
        } else if (failures.length > 0) {
          setError(`Dados parciais: ${failures.length} unidade(s) não respondeu(ram). Recarregue para tentar novamente.`)
        }

        setTickets([...map.values()])
        setTotal(explicitTotal > 0 ? explicitTotal : windowFloor)
        setHasMore(anyUnitHasMore || anyUnitFullPage)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setError('Erro ao carregar chamados. Verifique a conexão.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchAll()

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, unitIds.join('|'), page, reloadKey, pageSize])

  return { tickets, loading, error, page, total, hasMore, totalPages, setPage, reload }
}

/**
 * Serviço de atribuição para a Central do Coordenador.
 *
 * Usa `ticketService.patchRemote` (PATCH individual, sem gravar no cache da
 * fila), garantindo que a atribuição feita pelo coordenador não misture a fila
 * operacional com o escopo da Central. O backend valida:
 * - `ticket.assign` (Action RBAC) → coordenador tem esta permissão
 * - `_is_assigner` → membership ativa no workspace do ticket
 * - `assignedToUserId` membership no workspace (hardening adicionado)
 */
export async function assignCoordinatorTicket(
  ticketId: string,
  assignedTo: string,
  assignedToUserId: string,
): Promise<Ticket> {
  return ticketService.patchRemote(ticketId, { assignedTo, assignedToUserId })
}

/**
 * Remove o responsável de um chamado (atribuição para vazio).
 * O backend trata string vazia como "sem responsável".
 */
export async function unassignCoordinatorTicket(ticketId: string): Promise<Ticket> {
  return ticketService.patchRemote(ticketId, { assignedTo: '', assignedToUserId: '' })
}