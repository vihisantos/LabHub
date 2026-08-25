import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChamadosDisplay, CHAMADOS_POLL_MS } from '../useChamadosDisplay'

/* Sessão do kiosk mockada */
const mockSupabase = vi.hoisted(() => ({
  auth: { getSession: vi.fn() },
}))

vi.mock('../../../../lib/supabase', () => ({ defaultDb: mockSupabase }))

const SNAPSHOT = {
  generatedAt: '2026-06-25T12:00:00Z',
  summary: {
    total: 3, open: 2, inProgress: 1, highPriority: 1,
    avgResolutionHours: 5.3, satisfaction: 4.2,
  },
  tickets: [],
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status === 200, status, json: async () => body } as unknown as Response
}

/** Consome microtasks e, com ms > 0, dispara ciclos de polling (fake timers). */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  mockSupabase.auth.getSession.mockReset()
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'kiosk-token' } } })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ciclo de polling', () => {
  it('CHAMADOS_POLL_MS é 30s', () => {
    expect(CHAMADOS_POLL_MS).toBe(30_000)
  })

  it('faz o primeiro fetch imediato e mantém cadência de um por ciclo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.snapshot?.summary.total).toBe(3)

    await flush(CHAMADOS_POLL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await flush(CHAMADOS_POLL_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('request pendente não empilha fetch concorrente (guarda inFlight)', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(true)
    expect(result.current.snapshot).toBeNull()

    await flush(CHAMADOS_POLL_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('limpa o intervalo no unmount — sem fetch fantasma', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT))
    const { unmount } = renderHook(() => useChamadosDisplay())
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unmount()
    await flush(CHAMADOS_POLL_MS * 4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('não atualiza estado após unmount (cancelled)', async () => {
    let releaseFetch: ((value: Response) => void) | undefined
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releaseFetch = resolve
        }),
    )
    const { result, unmount } = renderHook(() => useChamadosDisplay())
    await flush()
    unmount()

    await act(async () => {
      releaseFetch?.(jsonResponse(SNAPSHOT))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.snapshot).toBeNull()
  })

  it('snapshot é substituído entre ciclos bem-sucedidos sem piscar', async () => {
    let call = 0
    fetchMock.mockImplementation(async () => {
      call += 1
      return jsonResponse({ ...SNAPSHOT, summary: { ...SNAPSHOT.summary, total: call } })
    })
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()
    expect(result.current.snapshot?.summary.total).toBe(1)

    await flush(CHAMADOS_POLL_MS)

    expect(result.current.snapshot?.summary.total).toBe(2)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe('Mapeamento de erros', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'server'],
  ] as const)('HTTP %i vira erro "%s"', async (status, kind) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(result.current.error).toBe(kind)
    expect(result.current.loading).toBe(false)
    expect(result.current.snapshot).toBeNull()
  })

  it('JSON inválido na resposta vira erro "server"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    } as unknown as Response)
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(result.current.error).toBe('server')
  })

  it('corpo sem campos obrigatórios vira erro "server"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ generatedAt: 'x', tickets: 'nope' }))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(result.current.error).toBe('server')
  })

  it('falha de rede vira erro "network" sem estourar exceção', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(result.current.error).toBe('network')
    expect(result.current.loading).toBe(false)
  })

  it('sem sessão do kiosk nem chega a chamar a API', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()

    expect(result.current.error).toBe('unauthorized')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('erro em ciclo posterior mantém o último snapshot válido', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SNAPSHOT))
    fetchMock.mockRejectedValue(new TypeError('down'))
    const { result } = renderHook(() => useChamadosDisplay())
    await flush()
    expect(result.current.snapshot?.summary.total).toBe(3)

    await flush(CHAMADOS_POLL_MS)

    expect(result.current.error).toBe('network')
    expect(result.current.snapshot?.summary.total).toBe(3)
  })
})
