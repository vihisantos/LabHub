import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Use vi.hoisted to ensure mocks are defined before vi.mock is hoisted
const { mockChannelSend, mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannelSend: vi.fn().mockResolvedValue('ok' as const),
  mockChannelOn: vi.fn().mockReturnThis(),
  mockChannelSubscribe: vi.fn().mockReturnThis(),
  mockRemoveChannel: vi.fn(),
}))

const { mockChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(() => ({
    on: mockChannelOn,
    subscribe: mockChannelSubscribe,
    send: mockChannelSend,
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

import { useRealtimeBroadcast } from '../useRealtimeBroadcast'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRealtimeBroadcast', () => {
  it('cria um canal com as opções corretas', () => {
    renderHook(() =>
      useRealtimeBroadcast('tv-now-playing', 'track-change', vi.fn()),
    )

    expect(mockChannel).toHaveBeenCalledWith('tv-now-playing', {
      config: { broadcast: { self: false } },
    })
    expect(mockChannelOn).toHaveBeenCalledWith(
      'broadcast',
      { event: 'track-change' },
      expect.any(Function),
    )
    expect(mockChannelSubscribe).toHaveBeenCalled()
  })

  it('ativa self broadcast quando solicitado', () => {
    renderHook(() =>
      useRealtimeBroadcast('my-channel', 'my-event', vi.fn(), {
        self: true,
      }),
    )

    expect(mockChannel).toHaveBeenCalledWith('my-channel', {
      config: { broadcast: { self: true } },
    })
  })

  it('não cria canal quando enabled=false', () => {
    renderHook(() =>
      useRealtimeBroadcast('test', 'event', vi.fn(), {
        enabled: false,
      }),
    )

    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('remove o canal ao desmontar', () => {
    const { unmount } = renderHook(() =>
      useRealtimeBroadcast('test', 'event', vi.fn()),
    )

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it('chama o callback com o payload quando recebe broadcast', () => {
    const callback = vi.fn()

    renderHook(() =>
      useRealtimeBroadcast('test', 'event', callback),
    )

    // Extrai o callback registrado no .on()
    const onCallback = mockChannelOn.mock.calls[0][2]

    const broadcastPayload = {
      type: 'broadcast',
      event: 'event',
      meta: { id: 'abc123' },
      payload: { data: 'hello', value: 42 },
    }

    act(() => {
      onCallback(broadcastPayload)
    })

    expect(callback).toHaveBeenCalledWith({ data: 'hello', value: 42 })
  })

  it('send() envia broadcast pelo canal', async () => {
    const { result } = renderHook(() =>
      useRealtimeBroadcast('test', 'custom-event', vi.fn()),
    )

    const payload = { message: 'Hello!' }
    await act(async () => {
      await result.current.send(payload)
    })

    expect(mockChannelSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'custom-event',
      payload,
    })
  })

  it('usa o callback mais recente sem re-inscrever', () => {
    const callback1 = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: typeof callback1 }) => useRealtimeBroadcast('test', 'event', cb),
      { initialProps: { cb: callback1 } },
    )

    const channelCalls = mockChannel.mock.calls.length

    const callback2 = vi.fn()
    rerender({ cb: callback2 })

    // Não deve criar novo canal
    expect(mockChannel.mock.calls.length).toBe(channelCalls)

    // O callback ref deve apontar para o mais recente
    const onCallback = mockChannelOn.mock.calls[0][2]
    const broadcastPayload = {
      type: 'broadcast',
      event: 'event',
      meta: { id: 'xyz' },
      payload: { updated: true },
    }

    act(() => {
      onCallback(broadcastPayload)
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledWith({ updated: true })
  })

  it('recria canal quando channelName muda', () => {
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useRealtimeBroadcast(name, 'event', vi.fn()),
      { initialProps: { name: 'channel-1' } },
    )

    expect(mockChannel.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = mockChannel.mock.calls.length

    rerender({ name: 'channel-2' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('recria canal quando event muda', () => {
    const { rerender } = renderHook(
      ({ evt }: { evt: string }) => useRealtimeBroadcast('test', evt, vi.fn()),
      { initialProps: { evt: 'event-1' } },
    )

    const callsBefore = mockChannel.mock.calls.length

    rerender({ evt: 'event-2' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('recria canal quando self muda', () => {
    const { rerender } = renderHook(
      ({ self }: { self: boolean }) => useRealtimeBroadcast('test', 'event', vi.fn(), { self }),
      { initialProps: { self: false } },
    )

    expect(mockChannel.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = mockChannel.mock.calls.length

    rerender({ self: true })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})
