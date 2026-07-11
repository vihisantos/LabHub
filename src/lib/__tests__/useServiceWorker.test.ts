import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useServiceWorker } from '../useServiceWorker'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

  it('recarrega a página quando controllerchange dispara', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const reload = vi.fn()

    // Mock location.reload
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

    // Extrai o callback do controllerchange
    const controllerCallback = addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )?.[1]

    expect(controllerCallback).toBeDefined()

    // Dispara o evento
    controllerCallback()

    // Avança o tempo para passar o debounce de 1s
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
              // Simula o evento updatefound com o installing worker
              cb()
            }
          }),
          installing: mockInstalling,
        }),
      },
    })

    renderHook(() => useServiceWorker({ onUpdate }))

    await vi.advanceTimersByTimeAsync(0)

    // Encontra o statechange callback
    const stateCallback = mockInstalling.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'statechange'
    )?.[1]

    expect(stateCallback).toBeDefined()

    // Simula o SW instalado
    mockInstalling.state = 'installed'
    stateCallback()

    expect(onUpdate).toHaveBeenCalled()
  })
})
