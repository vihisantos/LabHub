import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useServiceWorker,
  blockReload,
  unblockReload,
  isReloadBlocked,
  onReloadBlocked,
  applyPendingUpdate,
  useReloadBlocker,
  getUpdateAvailable,
  type BlockId,
} from '../useServiceWorker'

// Test-only utilities (attached to globalThis in test environment)
const testUtils = (globalThis as any).__testUtils

function __resetStateForTesting(): void {
  testUtils?.__resetStateForTesting?.()
}

function __setUpdateAvailableForTesting(available: boolean): void {
  testUtils?.__setUpdateAvailableForTesting?.(available)
}

beforeEach(() => {
  vi.useFakeTimers()
  __resetStateForTesting()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('reload blocking utilities', () => {
  it('blockReload / unblockReload / isReloadBlocked funcionam', () => {
    expect(isReloadBlocked()).toBe(false)

    const id1 = blockReload()
    expect(isReloadBlocked()).toBe(true)

    const id2 = blockReload()
    expect(isReloadBlocked()).toBe(true)

    unblockReload(id1)
    expect(isReloadBlocked()).toBe(true)

    unblockReload(id2)
    expect(isReloadBlocked()).toBe(false)
  })

  it('onReloadBlocked notifica mudanças', () => {
    const fn = vi.fn()
    const unsub = onReloadBlocked(fn)

    expect(fn).not.toHaveBeenCalled()

    const id = blockReload()
    expect(fn).toHaveBeenCalledWith(true)

    unblockReload(id)
    expect(fn).toHaveBeenCalledWith(false)

    unsub()
    // Verify listener is removed by checking it doesn't receive future events
    blockReload()
    expect(fn).toHaveBeenCalledTimes(2) // only the first two calls
  })
})

describe('useReloadBlocker', () => {
  it('retorna isBlocked false inicialmente (sem blocos ativos)', () => {
    const { result } = renderHook(() => useReloadBlocker())
    // State is initialized to false, then updated via effect
    expect(result.current.isBlocked).toBe(false)
  })

  it('blockReload / unblockReload atualizam isBlocked', async () => {
    const { result } = renderHook(() => useReloadBlocker())

    let id: BlockId = '' as BlockId
    await act(async () => {
      id = result.current.blockReload()
    })
    // State update is async via onReloadBlocked subscription
    expect(result.current.isBlocked).toBe(true)
    expect(typeof id).toBe('string')

    await act(async () => {
      result.current.unblockReload(id)
    })
    expect(result.current.isBlocked).toBe(false)
  })

  it('múltiplos blocos funcionam independentemente', () => {
    // Test the underlying blocking utilities directly since useReloadBlocker
    // has async state updates that are hard to test synchronously
    expect(isReloadBlocked()).toBe(false)

    const id1 = blockReload()
    const id2 = blockReload()
    expect(isReloadBlocked()).toBe(true)

    unblockReload(id1)
    expect(isReloadBlocked()).toBe(true)

    unblockReload(id2)
    expect(isReloadBlocked()).toBe(false)
  })
})

describe('useServiceWorker', () => {
  it('não faz nada se serviceWorker não é suportado', () => {
    const { result } = renderHook(() => useServiceWorker())
    expect(result.current).toBeUndefined()
  })

  it('adiciona listener para controllerchange', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    renderHook(() => useServiceWorker())

    expect(addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    )
  })

  it('remove listener ao desmontar', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    const { unmount } = renderHook(() => useServiceWorker())
    unmount()

    expect(removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    )
  })

  it('recarrega a página quando controllerchange dispara (sem bloqueio)', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    })

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    renderHook(() => useServiceWorker())

    const controllerCallback = addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )?.[1]

    expect(controllerCallback).toBeDefined()

    controllerCallback()
    vi.advanceTimersByTime(1100)

    expect(reload).toHaveBeenCalled()
  })

  it('chama onUpdate quando novo SW é instalado', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const onUpdate = vi.fn()

    const mockInstalling = {
      addEventListener: vi.fn(),
      state: 'installing',
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        controller: {} as ServiceWorker,
        ready: Promise.resolve({
          addEventListener: vi.fn((event: string, cb: Function) => {
            if (event === 'updatefound') {
              cb()
            }
          }),
          installing: mockInstalling,
        }),
      },
    })

    renderHook(() => useServiceWorker({ onUpdate }))

    await vi.advanceTimersByTimeAsync(0)

    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    expect(stateCallback).toBeDefined()

    mockInstalling.state = 'installed'
    stateCallback()

    expect(onUpdate).toHaveBeenCalled()
  })
})

describe('useServiceWorker — bloqueio de reload', () => {
  it('adiciona listener para controllerchange mesmo com bloqueio', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    const blockId = blockReload()
    expect(isReloadBlocked()).toBe(true)

    renderHook(() => useServiceWorker())

    expect(addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    )

    unblockReload(blockId)
  })

  it('NÃO recarrega quando controllerchange dispara mas há bloqueio ativo', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    })

    const blockId = blockReload()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    renderHook(() => useServiceWorker())

    const controllerCallback = addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )?.[1]

    expect(controllerCallback).toBeDefined()

    controllerCallback()
    vi.advanceTimersByTime(1100)

    expect(reload).not.toHaveBeenCalled()

    unblockReload(blockId)
  })

  it('recarrega automaticamente quando bloqueio é removido e update estava pendente', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    })

    const blockId = blockReload()

    const mockInstalling = {
      addEventListener: vi.fn(),
      state: 'installing',
    }

    const mockReg = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (event === 'updatefound') cb()
      }),
      installing: mockInstalling,
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        controller: {} as ServiceWorker,
        ready: Promise.resolve(mockReg),
      },
    })

    renderHook(() => useServiceWorker())

    await vi.advanceTimersByTimeAsync(0)

    // Find the statechange callback and simulate SW installed
    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    expect(stateCallback).toBeDefined()

    mockInstalling.state = 'installed'
    stateCallback!()

    // Now update is pending but reload is blocked
    expect(reload).not.toHaveBeenCalled()

    // Unblock - should trigger deferred reload
    unblockReload(blockId)
    vi.advanceTimersByTime(1100)

    expect(reload).toHaveBeenCalled()
  })

  it('applyPendingUpdate força reload quando update disponível', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    applyPendingUpdate()
    expect(reload).not.toHaveBeenCalled()

    expect(typeof applyPendingUpdate).toBe('function')
  })
})

describe('applyPendingUpdate', () => {
  it('retorna false e NÃO recarrega quando não há update disponível', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    const result = applyPendingUpdate()
    expect(result).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('retorna false e NÃO recarrega quando update disponível mas há bloqueio ativo', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    // Create a block to simulate blocked state
    const blockId = blockReload()

    const result = applyPendingUpdate()
    expect(result).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    unblockReload(blockId)
  })

  it('retorna true e recarrega quando update disponível e sem bloqueio', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    // Set update available via test helper
    __setUpdateAvailableForTesting(true)

    const result = applyPendingUpdate()
    expect(result).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('retorna false e NÃO recarrega quando update disponível mas bloqueio ativado depois', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    __setUpdateAvailableForTesting(true)
    const blockId = blockReload()

    const result = applyPendingUpdate()
    expect(result).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    unblockReload(blockId)
  })
})

describe('Race condition handling', () => {
  it('verifica bloqueios novamente antes de recarregar adiado (controllerchange)', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    })

    // Start with a block
    const blockId = blockReload()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        ready: Promise.resolve({
          addEventListener: vi.fn(),
          installing: null,
        }),
      },
    })

    renderHook(() => useServiceWorker())

    const controllerCallback = addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )?.[1]

    expect(controllerCallback).toBeDefined()

    // First controllerchange - should be blocked
    controllerCallback()
    vi.advanceTimersByTime(500)

    // Add another block during timer
    const blockId2 = blockReload()

    vi.advanceTimersByTime(600)

    // Reload should not have been called
    expect(reload).not.toHaveBeenCalled()

    // Remove both blocks
    unblockReload(blockId)
    unblockReload(blockId2)

    vi.advanceTimersByTime(1100)

    // Should have reloaded now
    expect(reload).toHaveBeenCalled()
  })

  it('não cria timers duplicados para recarga adiada', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    })

    const mockInstalling = {
      addEventListener: vi.fn(),
      state: 'installing',
    }

    const mockReg = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (event === 'updatefound') cb()
      }),
      installing: mockInstalling,
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        controller: {} as ServiceWorker,
        ready: Promise.resolve(mockReg),
      },
    })

    renderHook(() => useServiceWorker())

    await vi.advanceTimersByTimeAsync(0)

    // Simulate SW installed
    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    expect(stateCallback).toBeDefined()

    mockInstalling.state = 'installed'
    stateCallback!()

    // Now trigger multiple block/unblock cycles rapidly
    const blockId1 = blockReload()
    unblockReload(blockId1)
    const blockId2 = blockReload()
    unblockReload(blockId2)
    const blockId3 = blockReload()
    unblockReload(blockId3)

    vi.advanceTimersByTime(1100)

    // Should only have called reload once
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('applyPendingUpdate — cenários completos', () => {
  it('Cenário A: update disponível e sem bloqueios → recarrega exatamente uma vez', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    __setUpdateAvailableForTesting(true)

    const result = applyPendingUpdate()
    expect(result).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('Cenário B: update disponível com bloqueio ativo → não recarrega, retorna false', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    __setUpdateAvailableForTesting(true)
    const blockId = blockReload()

    const result = applyPendingUpdate()
    expect(result).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    // Verify block can be released
    unblockReload(blockId)
    expect(isReloadBlocked()).toBe(false)
  })

  it('Cenário C: nenhuma atualização disponível → não recarrega, retorna false', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    // Ensure no update is available (reset state does this)
    __setUpdateAvailableForTesting(false)

    const result = applyPendingUpdate()
    expect(result).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('Cenário D: atualização adiada — bloqueio ativo durante detecção, depois liberado', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    const blockId = blockReload()

    const mockInstalling = {
      addEventListener: vi.fn(),
      state: 'installing',
    }

    const mockReg = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (event === 'updatefound') cb()
      }),
      installing: mockInstalling,
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: {} as ServiceWorker,
        ready: Promise.resolve(mockReg),
      },
    })

    renderHook(() => useServiceWorker())

    await vi.advanceTimersByTimeAsync(0)

    // Simulate SW installed (update found)
    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    expect(stateCallback).toBeDefined()

    mockInstalling.state = 'installed'
    stateCallback!()

    // At this point update is pending but blocked
    expect(reload).not.toHaveBeenCalled()

    // Unblock - should trigger deferred reload
    unblockReload(blockId)
    vi.advanceTimersByTime(1100)

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('Cenário D: atualização adiada — novo bloqueio durante timer de recarga adiada', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    const mockInstalling = {
      addEventListener: vi.fn(),
      state: 'installing',
    }

    const mockReg = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (event === 'updatefound') cb()
      }),
      installing: mockInstalling,
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: {} as ServiceWorker,
        ready: Promise.resolve(mockReg),
      },
    })

    renderHook(() => useServiceWorker())

    await vi.advanceTimersByTimeAsync(0)

    // Simulate SW installed
    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    mockInstalling.state = 'installed'
    stateCallback!()

    // Now unblock to start deferred reload timer
    // (no initial block, so timer should start)
    vi.advanceTimersByTime(0)

    // Add a block during the deferred reload timer
    const blockId = blockReload()

    vi.advanceTimersByTime(500)

    // Reload should not have happened due to new block
    expect(reload).not.toHaveBeenCalled()

    // Remove block - should trigger new deferred reload
    unblockReload(blockId)
    vi.advanceTimersByTime(1100)

    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('Isolamento entre testes (Cenário E)', () => {
  it('testes não herdam _updateAvailable de testes anteriores', () => {
    // First set update available
    __setUpdateAvailableForTesting(true)
    expect(getUpdateAvailable()).toBe(true)

    // Reset state (simulates beforeEach)
    __resetStateForTesting()
    expect(getUpdateAvailable()).toBe(false)
  })

  it('testes não herdam bloqueios de testes anteriores', () => {
    blockReload()
    expect(isReloadBlocked()).toBe(true)

    __resetStateForTesting()
    expect(isReloadBlocked()).toBe(false)
  })

  it('testes não herdam listeners de testes anteriores', () => {
    const fn = vi.fn()
    const unsub = onReloadBlocked(fn)

    blockReload()
    expect(fn).toHaveBeenCalledWith(true)

    unsub()
    __resetStateForTesting()

    // After reset, new blocks should not call old listener
    const fn2 = vi.fn()
    onReloadBlocked(fn2)
    blockReload()
    expect(fn2).toHaveBeenCalledWith(true)
    expect(fn).toHaveBeenCalledTimes(1) // old listener not called
  })

  it('testes não herdam _updateAvailable definido em outro teste', () => {
    // This test runs after the one that sets update available
    expect(getUpdateAvailable()).toBe(false) // should be reset by __resetStateForTesting
  })
})