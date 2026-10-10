import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { StrictMode } from 'react'

const mockSyncAll = vi.hoisted(() => vi.fn())
const mockGetPendingChanges = vi.hoisted(() => vi.fn(() => 0))

vi.mock('../sync', () => ({
  syncAll: mockSyncAll,
  getPendingChanges: mockGetPendingChanges,
  getSyncLog: vi.fn(() => []),
  getLastSyncedAt: vi.fn(() => null),
}))

import { useOnlineSync, __resetOnlineSyncForTests } from '../useOnlineSync'

/**
 * Regressão da sincronização compartilhada (single-flight + intervalo único).
 *
 * Números medidos ANTES da correção (mesmo cenário, 4 instâncias montadas — a
 * composição real do RootLayout do PC Care: layout + useSyncToasts +
 * OnlineBanner + SyncStatusBadge):
 *   - mount: 4 chamadas de syncAll, pico de 4 EXECUÇÕES SIMULTÂNEAS;
 *   - +30s: +4 chamadas (um intervalo por instância).
 * Com 1 instância sob StrictMode o mount já disparava a sincronização uma
 * única vez por sorte do guarda por instância — o problema era multi-instância.
 */

let inFlightNow = 0
let maxInFlight = 0

function makeSlowSyncAll(delayMs = 10) {
  inFlightNow = 0
  maxInFlight = 0
  return () => {
    inFlightNow++
    maxInFlight = Math.max(maxInFlight, inFlightNow)
    return new Promise<{ synced: number; failed: string[] }>((resolve) => {
      setTimeout(() => {
        inFlightNow--
        resolve({ synced: 0, failed: [] })
      }, delayMs)
    })
  }
}

function mountMany(n: number) {
  const hooks = Array.from({ length: n }, () => renderHook(() => useOnlineSync()))
  return {
    hooks,
    unmountAll: () => hooks.forEach((h) => h.unmount()),
  }
}

async function flush(ms = 100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  __resetOnlineSyncForTests()
  vi.clearAllMocks()
  mockSyncAll.mockImplementation(makeSlowSyncAll())
  mockGetPendingChanges.mockReturnValue(0)
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
})

afterEach(() => {
  __resetOnlineSyncForTests()
  vi.useRealTimers()
})

describe('useOnlineSync — runtime compartilhado entre consumidores', () => {
  it('múltiplos consumidores disparam UMA sincronização no mount (antes: 1 por instância, em paralelo)', async () => {
    const { unmountAll } = mountMany(4)

    await flush()

    expect(mockSyncAll).toHaveBeenCalledTimes(1)
    expect(maxInFlight).toBe(1)

    unmountAll()
  })

  it('um único intervalo de 30s (antes: um por instância)', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { unmountAll } = mountMany(4)

    await flush()

    expect(intervalSpy).toHaveBeenCalledTimes(1)
    const afterMount = mockSyncAll.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(mockSyncAll.mock.calls.length).toBe(afterMount + 1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(mockSyncAll.mock.calls.length).toBe(afterMount + 2)

    intervalSpy.mockRestore()
    unmountAll()
  })

  it('triggerSync concorrente compartilha a execução em andamento', async () => {
    const a = renderHook(() => useOnlineSync())
    await flush()

    mockSyncAll.mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      void a.result.current.triggerSync()
    })
    const callsInFlight = mockSyncAll.mock.calls.length
    expect(callsInFlight).toBeGreaterThan(0)

    // Segundo consumidor chega durante a execução: não inicia outra.
    const b = renderHook(() => useOnlineSync())
    await act(async () => {
      void b.result.current.triggerSync()
    })

    expect(mockSyncAll.mock.calls.length).toBe(callsInFlight)
    // Estado compartilhado: ambas as instâncias veem a mesma execução.
    expect(a.result.current.syncing).toBe(true)
    expect(b.result.current.syncing).toBe(true)

    b.unmount()
    a.unmount()
  })

  it('StrictMode não duplica a sincronização inicial nem o intervalo', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const Wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>

    renderHook(() => useOnlineSync(), { wrapper: Wrapper })
    await flush()

    expect(mockSyncAll).toHaveBeenCalledTimes(1)
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    intervalSpy.mockRestore()
  })

  it('desmontar todos os consumidores encerra intervalo e listeners; desmontar um mantém a rotina', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { hooks, unmountAll } = mountMany(2)
    await flush()

    const callsBefore = mockSyncAll.mock.calls.length

    // Desmonta UM consumidor: a rotina continua (há outro montado).
    hooks[0].unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(mockSyncAll.mock.calls.length).toBe(callsBefore + 1)

    // Desmonta o ÚLTIMO: listeners removidos e nenhum tick novo.
    hooks[1].unmount()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))

    const afterUnmount = mockSyncAll.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65000)
    })
    expect(mockSyncAll.mock.calls.length).toBe(afterUnmount)

    removeSpy.mockRestore()
    unmountAll()
  })

  it('reconexão dispara exatamente uma sincronização, mesmo com vários consumidores', async () => {
    const { unmountAll } = mountMany(3)
    await flush()

    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    const callsBefore = mockSyncAll.mock.calls.length
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await flush()

    expect(mockSyncAll.mock.calls.length).toBe(callsBefore + 1)

    unmountAll()
  })

  it('erros não geram loop de requisições (sem retry além do intervalo)', async () => {
    mockSyncAll.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useOnlineSync())
    await flush()

    expect(result.current.syncError).toBe('Network error')

    const afterError = mockSyncAll.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000)
    })

    // Exatamente 1 tentativa por janela de 30s (3 janelas), nenhuma retentativa extra.
    expect(mockSyncAll.mock.calls.length).toBe(afterError + 3)

    // O erro não trava a retomada: próximo sucesso limpa o estado.
    mockSyncAll.mockImplementation(makeSlowSyncAll())
    await act(async () => {
      void result.current.triggerSync()
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.syncError).toBeNull()
    expect(result.current.syncing).toBe(false)
  })

  it('offline: nada é sincronizado, mas pendingChanges segue visível (gravações locais preservadas)', async () => {
    const { result } = renderHook(() => useOnlineSync())
    await flush()

    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.online).toBe(false)

    mockGetPendingChanges.mockReturnValue(7)
    act(() => {
      window.dispatchEvent(new Event('storage'))
    })
    expect(result.current.pendingChanges).toBe(7)

    const callsBefore = mockSyncAll.mock.calls.length
    await act(async () => {
      await result.current.triggerSync()
    })
    expect(mockSyncAll.mock.calls.length).toBe(callsBefore)

    // De volta ao online: o acúmulo local é sincronizado pelo próprio syncAll.
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await flush()
    expect(mockSyncAll.mock.calls.length).toBe(callsBefore + 1)
  })
})
