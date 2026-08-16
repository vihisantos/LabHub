import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useOnlineStatus } from '../useOnlineStatus'

const mockFetch = vi.fn()

function stubOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, writable: true, configurable: true })
}

function svgResponse() {
  return {
    ok: true,
    headers: { get: () => 'image/svg+xml' },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  stubOnline(true)
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useOnlineStatus', () => {
  it('reporta offline quando entra sem internet e não faz probe', async () => {
    stubOnline(false)

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('reporta online quando o probe recebe o favicon', async () => {
    mockFetch.mockResolvedValue(svgResponse())

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(true)
    expect(mockFetch).toHaveBeenCalled()
  })

  it('reporta offline quando o probe falha (sem acesso de verdade)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(false)
  })

  it('reporta offline quando o portal devolve HTML em vez do favicon', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
    })

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(false)
  })

  it('fica offline ao disparar o evento offline', async () => {
    mockFetch.mockResolvedValue(svgResponse())

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.online).toBe(true)

    stubOnline(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.online).toBe(false)
  })

  it('volta a online no evento online quando o portal já autenticou', async () => {
    stubOnline(false)

    const { result } = renderHook(() => useOnlineStatus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.online).toBe(false)

    stubOnline(true)
    mockFetch.mockResolvedValue(svgResponse())
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.online).toBe(true)
  })

  it('limpa o intervalo ao desmontar', async () => {
    mockFetch.mockResolvedValue(svgResponse())

    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()

    const calls = mockFetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(mockFetch.mock.calls.length).toBe(calls)
  })
})
