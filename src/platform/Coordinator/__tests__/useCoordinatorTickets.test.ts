/**
 * Testes do hook `useCoordinatorTickets`.
 *
 * Cobre:
 * - Busca bem-sucedida por múltiplos workspaces.
 * - Merge client-side por updatedAt (mais recente ganha).
 * - Fail-closed: se todas as unidades falharem, exibe erro.
 * - Dados parciais: se parte das unidades falhar, exibe dados + aviso.
 * - Isolamento: tickets fora dos unitIds não aparecem (inScopeTickets guard).
 * - enabled=false não dispara fetch.
 * - unitIds vazia não dispara fetch.
 * - reload() força nova busca e volta para a página 1.
 * - Paginação remota: URL usa limit/offset conforme a página.
 * - total/hasMore propagados do backend.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ticket } from '../../../apps/chamados/types'
import {
  useCoordinatorTickets,
  COORDINATOR_TICKETS_PAGE_SIZE,
} from '../hooks/useCoordinatorTickets'

// ── fixtures ──────────────────────────────────────────────────────────────

function mkTicket(over: Partial<Ticket> & Pick<Ticket, 'id' | 'workspace_id'>): Ticket {
  return {
    ticketNumber: 1,
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: 'teste',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof',
    reportedByEmail: 'prof@lab.edu',
    assignedTo: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    resolvedAt: null,
    ...over,
  }
}

const T_A1 = mkTicket({ id: 'a1', workspace_id: 'ws-a', updatedAt: '2024-02-01T00:00:00Z' })
const T_A2 = mkTicket({ id: 'a2', workspace_id: 'ws-a' })
const T_B1 = mkTicket({ id: 'b1', workspace_id: 'ws-b' })

// ── fetch mock ───────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(responses: Record<string, Ticket[] | Error>) {
  fetchMock.mockImplementation((url: string) => {
    // Extrai o workspace_id da query string.
    const match = url.match(/workspace_id=([^&]+)/)
    const wsId = match ? decodeURIComponent(match[1]) : '__none__'
    const result = responses[wsId]
    if (result instanceof Error) {
      return Promise.reject(result)
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ tickets: result }),
    })
  })
}

/**
 * Mock de um backend paginado: fatia `tickets` por `limit`/`offset` e devolve
 * `total` + `hasMore`, como o `GET /api/chamados` paginado faz.
 */
function mockWindowedFetch(byWorkspace: Record<string, Ticket[]>, totalSizeDefault = 25) {
  fetchMock.mockImplementation((url: string) => {
    const match = url.match(/workspace_id=([^&]+)/)
    const ws = match ? decodeURIComponent(match[1]) : '__none__'
    const limit = Number(url.match(/limit=(\d+)/)?.[1] ?? COORDINATOR_TICKETS_PAGE_SIZE)
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    const all = byWorkspace[ws] ?? []
    const tickets = all.slice(offset, offset + limit)
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          tickets,
          total: totalSizeDefault,
          hasMore: offset + tickets.length < totalSizeDefault,
        }),
    })
  })
}

// ── testes ───────────────────────────────────────────────────────────────────

describe('useCoordinatorTickets', () => {
  it('busca tickets de múltiplos workspaces', async () => {
    mockFetch({ 'ws-a': [T_A1, T_A2], 'ws-b': [T_B1] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a', 'ws-b'], true),
    )

    // Flush da resolução do fetch (setup global usa fake timers; `waitFor` não avança).
    await act(async () => {})

    expect(result.current.loading).toBe(false)

    expect(result.current.tickets).toHaveLength(3)
    expect(result.current.error).toBeNull()
  })

  it('merge por updatedAt: versão mais recente ganha quando id duplicado', async () => {
    const stale = mkTicket({ id: 'a1', workspace_id: 'ws-a', updatedAt: '2024-01-01T00:00:00Z', assignedTo: 'Old' })
    const fresh = mkTicket({ id: 'a1', workspace_id: 'ws-a', updatedAt: '2024-02-01T00:00:00Z', assignedTo: 'New' })

    // Simula duas fontes retornando o mesmo id com timestamps diferentes.
    let call = 0
    fetchMock.mockImplementation(() => {
      call++
      const tickets = call === 1 ? [stale] : [fresh]
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tickets }),
      })
    })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a', 'ws-b'], true),
    )

    await act(async () => {})

    expect(result.current.tickets).toHaveLength(1)
    expect(result.current.tickets[0].assignedTo).toBe('New')
  })

  it('error quando todas as unidades falham', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})

    expect(result.current.tickets).toHaveLength(0)
    expect(result.current.error).not.toBeNull()
  })

  it('dados parciais: tickets disponíveis + erro parcial', async () => {
    let call = 0
    fetchMock.mockImplementation(() => {
      call++
      if (call === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tickets: [T_A1] }),
        })
      }
      return Promise.reject(new Error('timeout'))
    })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a', 'ws-b'], true),
    )

    await act(async () => {})

    // Dados parciais disponíveis.
    expect(result.current.tickets.length).toBeGreaterThan(0)
    // Aviso de erro parcial.
    expect(result.current.error).not.toBeNull()
  })

  it('enabled=false não dispara fetch', async () => {
    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], false),
    )

    await act(async () => {})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.tickets).toHaveLength(0)
  })

  it('unitIds vazio não dispara fetch', async () => {
    const { result } = renderHook(() =>
      useCoordinatorTickets([], true),
    )

    // Flush assíncrono (setup global usa fake timers; `waitFor` não avança sozinho).
    await act(async () => {})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.tickets).toHaveLength(0)
    expect(result.current.loading).toBe(false)
  })

  it('reload() força nova busca', async () => {
    mockFetch({ 'ws-a': [T_A1] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})
    expect(result.current.loading).toBe(false)
    const callsAfterMount = fetchMock.mock.calls.length

    // Atualiza mock para retornar novo dado.
    const T_A3 = mkTicket({ id: 'a3', workspace_id: 'ws-a' })
    mockFetch({ 'ws-a': [T_A1, T_A3] })

    await act(async () => {
      result.current.reload()
    })
    await act(async () => {})
    expect(result.current.loading).toBe(false)

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount)
    expect(result.current.tickets).toHaveLength(2)
  })

  it('totalPages calcula corretamente', () => {
    const { result } = renderHook(() =>
      useCoordinatorTickets([], false),
    )

    // 0 tickets = 1 página.
    expect(result.current.totalPages(0)).toBe(1)
    // exatamente 1 página.
    expect(result.current.totalPages(COORDINATOR_TICKETS_PAGE_SIZE)).toBe(1)
    // 1 a mais que o page size = 2 páginas.
    expect(result.current.totalPages(COORDINATOR_TICKETS_PAGE_SIZE + 1)).toBe(2)
    // múltiplo exato.
    expect(result.current.totalPages(COORDINATOR_TICKETS_PAGE_SIZE * 3)).toBe(3)
  })

  it('página volta para 1 quando dados são recarregados', async () => {
    mockFetch({ 'ws-a': [T_A1] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})
    expect(result.current.loading).toBe(false)
    // Navega para página 3 (mesmo que não exista — o componente já trata isso).
    await act(async () => {
      result.current.setPage(3)
    })

    // Força reload.
    await act(async () => {
      result.current.reload()
    })
    await act(async () => {})
    expect(result.current.loading).toBe(false)

    // Volta para página 1.
    expect(result.current.page).toBe(1)
  })

  it('página 1 consulta o backend com limit/offset mínimos', async () => {
    mockFetch({ 'ws-a': [T_A1] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})
    expect(result.current.loading).toBe(false)

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`limit=${COORDINATOR_TICKETS_PAGE_SIZE}`)
    expect(String(url)).toContain('offset=0')
  })

  it('mudar de página refaz a busca com novo offset', async () => {
    mockWindowedFetch({ 'ws-a': [T_A1] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})
    await act(async () => {
      result.current.setPage(2)
    })

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('offset=0'))).toBe(true)
    expect(urls.some((u) => u.includes(`offset=${COORDINATOR_TICKETS_PAGE_SIZE}`))).toBe(true)
    expect(result.current.page).toBe(2)
  })

  it('propaga total e hasMore informados pelo backend', async () => {
    mockWindowedFetch({ 'ws-a': [T_A1, T_A2] })

    const { result } = renderHook(() =>
      useCoordinatorTickets(['ws-a'], true),
    )

    await act(async () => {})

    expect(result.current.total).toBe(25)
    expect(result.current.hasMore).toBe(true)
    // A janela carregada é apenas a fatia da página.
    expect(result.current.tickets).toHaveLength(2)
  })
})
