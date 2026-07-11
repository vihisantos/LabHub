import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../db'

const mockSyncAll = vi.fn()

vi.mock('../sync', () => ({
  syncAll: (...args: any[]) => mockSyncAll(...args),
  getPendingChanges: vi.fn(() => 0),
  getSyncLog: vi.fn(() => []),
  getLastSyncedAt: vi.fn(() => null),
}))

import { useOnlineSync } from '../useOnlineSync'
import { getPendingChanges, getSyncLog, getLastSyncedAt } from '../sync'

beforeEach(() => {
  vi.useFakeTimers()
  resetCache()
  vi.clearAllMocks()
  mockSyncAll.mockResolvedValue({ synced: 0, failed: [] })
  ;(getPendingChanges as any).mockReturnValue(0)
  ;(getSyncLog as any).mockReturnValue([])
  ;(getLastSyncedAt as any).mockReturnValue(null)
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useOnlineSync', () => {
  it('retorna estado inicial correto', async () => {
    const { result } = renderHook(() => useOnlineSync())

    // Espera o sync inicial do mount completar
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(true)
    expect(result.current.syncing).toBe(false)
    expect(result.current.syncError).toBeNull()
    expect(result.current.pendingChanges).toBe(0)
    expect(result.current.syncLog).toEqual([])
    expect(result.current.lastSync).toBeNull()
  })

  it('chama syncAll no mount quando online', async () => {
    renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockSyncAll).toHaveBeenCalled()
  })

  it('não chama syncAll no mount quando offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })

    renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockSyncAll).not.toHaveBeenCalled()
  })

  it('define online=false ao disparar evento offline', async () => {
    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.online).toBe(false)
  })

  it('define online=true e dispara sync ao evento online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const callsBefore = mockSyncAll.mock.calls.length

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.online).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockSyncAll.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('triggerSync define syncing=true durante a sincronização', async () => {
    let resolveSync!: () => void
    mockSyncAll.mockImplementation(
      () => new Promise((resolve) => { resolveSync = () => resolve({ synced: 0, failed: [] }) }),
    )

    const { result } = renderHook(() => useOnlineSync())

    // Espera o sync inicial completar
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Prepara um novo sync que fica pendurado
    mockSyncAll.mockImplementation(
      () => new Promise((resolve) => { resolveSync = () => resolve({ synced: 0, failed: [] }) }),
    )

    act(() => {
      result.current.triggerSync()
    })

    expect(result.current.syncing).toBe(true)

    await act(async () => {
      resolveSync()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.syncing).toBe(false)
  })

  it('triggerSync não dispara sync se já está sincronizando', async () => {
    mockSyncAll.mockImplementation(() => new Promise(() => {})) // nunca resolve

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // syncAll ainda está pendurado do mount
    const callsBefore = mockSyncAll.mock.calls.length

    act(() => {
      result.current.triggerSync()
    })

    // Não deve chamar syncAll novamente
    expect(mockSyncAll.mock.calls.length).toBe(callsBefore)
  })

  it('triggerSync não dispara se offline', async () => {
    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })

    const callsBefore = mockSyncAll.mock.calls.length

    act(() => {
      result.current.triggerSync()
    })

    expect(mockSyncAll.mock.calls.length).toBe(callsBefore)
  })

  it('define syncError quando syncAll falha', async () => {
    mockSyncAll.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.syncError).toBe('Network error')
  })

  it('define syncError com mensagem genérica quando erro não é Error', async () => {
    mockSyncAll.mockRejectedValue('string error')

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.syncError).toBe('Erro desconhecido')
  })

  it('define syncError com coleções que falharam', async () => {
    mockSyncAll.mockResolvedValue({ synced: 10, failed: ['pcs', 'parts'] })

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.syncError).toBe('Falha ao sincronizar: pcs, parts')
  })

  it('refreshLog atualiza pendingChanges, syncLog e lastSync', async () => {
    ;(getPendingChanges as any).mockReturnValue(5)
    ;(getSyncLog as any).mockReturnValue([{ collection: 'pcs', itemCount: 10, status: 'ok', at: '2026-01-01' }])
    ;(getLastSyncedAt as any).mockReturnValue(new Date('2026-01-01'))

    const { result } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    act(() => {
      result.current.refreshLog()
    })

    expect(result.current.pendingChanges).toBe(5)
    expect(result.current.syncLog).toHaveLength(1)
    expect(result.current.lastSync).toBeInstanceOf(Date)
  })

  it('remove listener de storage ao desmontar', async () => {
    const spy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOnlineSync())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    unmount()

    expect(spy).toHaveBeenCalledWith('storage', expect.any(Function))
    spy.mockRestore()
  })
})
