import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useUpcomingReservations } from '../useUpcomingReservations'

const mocks = vi.hoisted(() => ({
  fetchReservas: vi.fn(),
  fetchTabletReservas: vi.fn(),
}))

vi.mock('../../services/api', () => ({ fetchReservas: mocks.fetchReservas }))
vi.mock('../../services/supabase', () => ({ fetchTabletReservas: mocks.fetchTabletReservas }))

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.fetchReservas.mockResolvedValue({ lab1_reservas: [], lab2_reservas: [] })
  mocks.fetchTabletReservas.mockResolvedValue([])
})

afterEach(() => {
  delete (document as unknown as { visibilityState?: string }).visibilityState
  vi.useRealTimers()
})

describe('useUpcomingReservations — polling econômico', () => {
  it('não consulta em segundo plano e atualiza imediatamente ao voltar', async () => {
    const { unmount } = renderHook(() => useUpcomingReservations('piracicaba', 'ws-1'))
    await flushPromises()
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await flushPromises()
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('evita consultas simultâneas da mesma tela', async () => {
    let resolveTablet!: (rows: unknown[]) => void
    mocks.fetchTabletReservas.mockImplementationOnce(
      () => new Promise((resolve) => { resolveTablet = resolve }),
    )
    const { unmount } = renderHook(() => useUpcomingReservations('piracicaba', 'ws-1'))
    await flushPromises()
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(1)

    await act(async () => { resolveTablet([]) })
    await flushPromises()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.fetchTabletReservas).toHaveBeenCalledTimes(2)
    unmount()
  })
})
