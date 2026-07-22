import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Use vi.hoisted to ensure mocks are defined before vi.mock is hoisted
const { mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannelOn: vi.fn().mockReturnThis(),
  mockChannelSubscribe: vi.fn().mockReturnThis(),
  mockRemoveChannel: vi.fn(),
}))

const { mockChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(() => ({
    on: mockChannelOn,
    subscribe: mockChannelSubscribe,
  })),
}))

vi.mock('../../lib/supabase', () => ({
  defaultDb: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
  pcareDb: null,
  stockDb: null,
}))

import { useRealtimeSubscription } from '../useRealtimeSubscription'
import type { RealtimePostgresChangesEvent } from '../useRealtimeSubscription'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRealtimeSubscription', () => {
  it('cria um canal com o nome correto', () => {
    renderHook(() =>
      useRealtimeSubscription('tv_events', '*', vi.fn()),
    )

    expect(mockChannel).toHaveBeenCalledWith(expect.stringMatching(/^public:tv_events:\*:\d+$/))
    expect(mockChannelOn).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tv_events' },
      expect.any(Function),
    )
    expect(mockChannelSubscribe).toHaveBeenCalled()
  })

  it('usa schema e channelName customizados', () => {
    renderHook(() =>
      useRealtimeSubscription('stock_items', 'INSERT', vi.fn(), {
        schema: 'stock',
        channelName: 'custom-channel',
      }),
    )

    expect(mockChannel).toHaveBeenCalledWith(expect.stringMatching(/^custom-channel:\d+$/))
    expect(mockChannelOn).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'stock', table: 'stock_items' },
      expect.any(Function),
    )
  })

  it('não cria canal quando enabled=false', () => {
    renderHook(() =>
      useRealtimeSubscription('tv_events', '*', vi.fn(), {
        enabled: false,
      }),
    )

    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('remove o canal ao desmontar', () => {
    const { unmount } = renderHook(() =>
      useRealtimeSubscription('tv_events', '*', vi.fn()),
    )

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it('chama o callback quando o evento ocorre', () => {
    const callback = vi.fn()

    renderHook(() =>
      useRealtimeSubscription('tv_events', '*', callback),
    )

    // Extrai o callback registrado no .on()
    const onCallback = mockChannelOn.mock.calls[0][2]

    const mockPayload = {
      schema: 'public',
      table: 'tv_events',
      commit_timestamp: '2026-06-25T12:00:00Z',
      eventType: 'INSERT' as const,
      new: { id: '1', title: 'Evento' },
      old: {},
      errors: [] as string[],
    }

    act(() => {
      onCallback(mockPayload)
    })

    expect(callback).toHaveBeenCalledWith(mockPayload)
  })

  it('usa o callback mais recente sem re-inscrever', () => {
    const callback1 = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: typeof callback1 }) => useRealtimeSubscription('tv_events', '*', cb),
      { initialProps: { cb: callback1 } },
    )

    const channelCalls = mockChannel.mock.calls.length

    const callback2 = vi.fn()
    rerender({ cb: callback2 })

    // Não deve criar novo canal
    expect(mockChannel.mock.calls.length).toBe(channelCalls)

    // O callback ref deve apontar para o mais recente
    const onCallback = mockChannelOn.mock.calls[0][2]
    const mockPayload = {
      schema: 'public',
      table: 'tv_events',
      commit_timestamp: '2026-06-25T12:00:00Z',
      eventType: 'UPDATE' as const,
      new: { id: '1', title: 'Atualizado' },
      old: { id: '1', title: 'Original' },
      errors: [] as string[],
    }

    act(() => {
      onCallback(mockPayload)
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledWith(mockPayload)
  })

  it('recria canal quando table muda', () => {
    const { rerender } = renderHook(
      ({ table }: { table: string }) => useRealtimeSubscription(table, '*', vi.fn()),
      { initialProps: { table: 'tv_events' } },
    )

    expect(mockChannel.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = mockChannel.mock.calls.length

    rerender({ table: 'tv_playlists' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('recria canal quando event muda', () => {
    const { rerender } = renderHook(
      ({ event }: { event: RealtimePostgresChangesEvent }) => useRealtimeSubscription('tv_events', event, vi.fn()),
      { initialProps: { event: '*' } },
    )

    expect(mockChannel.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = mockChannel.mock.calls.length

    rerender({ event: 'INSERT' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('recria canal quando enabled transita de false para true', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRealtimeSubscription('tv_events', '*', vi.fn(), { enabled }),
      { initialProps: { enabled: false } },
    )

    expect(mockChannel).not.toHaveBeenCalled()

    rerender({ enabled: true })

    expect(mockChannel).toHaveBeenCalled()
  })
})
