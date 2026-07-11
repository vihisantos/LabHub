import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineSync } from '../useOnlineSync'

vi.mock('../../../../lib/sync', () => ({
  syncAll: vi.fn(),
  getPendingChanges: vi.fn(() => 0),
  getSyncLog: vi.fn(() => []),
  getLastSyncedAt: vi.fn(() => null),
}))

import { syncAll, getPendingChanges } from '../../../../lib/sync'

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  ;(syncAll as any).mockResolvedValue({ synced: 13, failed: [] })
  ;(getPendingChanges as any).mockReturnValue(0)
})

describe('useOnlineSync', () => {
  it('online é true quando navigator.onLine é true', () => {
    const { result } = renderHook(() => useOnlineSync())
    expect(result.current.online).toBe(true)
  })

  it('pendingChanges é 0 inicialmente', () => {
    const { result } = renderHook(() => useOnlineSync())
    expect(result.current.pendingChanges).toBe(0)
  })

  it('syncError é null inicialmente', () => {
    const { result } = renderHook(() => useOnlineSync())
    expect(result.current.syncError).toBeNull()
  })

  it('triggerSync chama syncAll', async () => {
    // Impedir sync no mount para controle manual
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineSync())

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    await act(async () => {
      await result.current.triggerSync()
    })

    expect(syncAll).toHaveBeenCalledOnce()
  })

  it('triggerSync define syncError quando syncAll falha', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineSync())
    ;(syncAll as any).mockRejectedValue(new Error('Network error'))

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    await act(async () => {
      await result.current.triggerSync()
    })

    expect(result.current.syncError).toBe('Network error')
  })

  it('triggerSync define syncError quando syncAll retorna falhas', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineSync())
    ;(syncAll as any).mockResolvedValue({ synced: 10, failed: ['pcs', 'parts'] })

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    await act(async () => {
      await result.current.triggerSync()
    })

    expect(result.current.syncError).toBe('Falha ao sincronizar: pcs, parts')
  })

  it('evento offline atualiza online para false', () => {
    const { result } = renderHook(() => useOnlineSync())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.online).toBe(false)
  })

  it('evento storage atualiza pendingChanges', () => {
    ;(getPendingChanges as any).mockReturnValue(3)
    // Impedir sync no mount para não conflitar
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineSync())

    act(() => {
      window.dispatchEvent(new Event('storage'))
    })

    expect(result.current.pendingChanges).toBe(3)
  })

  it('limpa event listeners e intervalo ao desmontar', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { unmount } = renderHook(() => useOnlineSync())
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
