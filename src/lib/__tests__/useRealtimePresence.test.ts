import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

let presenceStateMock = {}
let currentChannel: Record<string, any> = {}

const { mockChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(() => {
    const ch: Record<string, any> = {
      on: vi.fn(() => ch),
      subscribe: vi.fn((cb?: Function) => {
        cb?.('SUBSCRIBED')
        return ch
      }),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      presenceState: () => presenceStateMock,
    }
    currentChannel = ch
    return ch
  }),
}))

const { mockRemoveChannel } = vi.hoisted(() => ({
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  defaultDb: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
  pcareDb: null,
  stockDb: null,
}))

import { useRealtimePresence } from '../useRealtimePresence'

beforeEach(() => {
  vi.clearAllMocks()
  presenceStateMock = {}
  currentChannel = {}
})

describe('useRealtimePresence', () => {
  it('cria canal com presence habilitado e key correta', () => {
    renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'my-tab-id',
        metadata: { app: 'pcare' },
      }),
    )

    expect(mockChannel).toHaveBeenCalledWith('labhub-online', {
      config: {
        presence: { key: 'my-tab-id', enabled: true },
      },
    })
    expect(currentChannel.subscribe).toHaveBeenCalled()
  })

  it('chama track() no subscribe quando SUBSCRIBED', () => {
    renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'my-tab-id',
        metadata: { app: 'pcare', name: 'Admin' },
      }),
    )

    expect(currentChannel.track).toHaveBeenCalledWith({
      key: 'my-tab-id',
      metadata: { app: 'pcare', name: 'Admin' },
      onlineAt: expect.any(String),
    })
  })

  it('não cria canal quando enabled=false', () => {
    renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'test',
        enabled: false,
      }),
    )

    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('faz untrack e removeChannel ao desmontar', () => {
    const { unmount } = renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'test',
        metadata: { app: 'pcare' },
      }),
    )

    unmount()

    expect(currentChannel.untrack).toHaveBeenCalled()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it('retorna onlineUsers vazio inicialmente', () => {
    const { result } = renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'test',
      }),
    )

    expect(result.current.onlineUsers).toEqual([])
    expect(result.current.onlineCount).toBe(0)
  })

  it('presenceState() retorna os dados mockados', () => {
    presenceStateMock = {
      'user-1': [
        { key: 'user-1', metadata: { app: 'pcare' }, onlineAt: '2026-01-01' },
      ],
      'user-2': [
        { key: 'user-2', metadata: { app: 'tv' }, onlineAt: '2026-01-01' },
      ],
    }

    renderHook(() =>
      useRealtimePresence('labhub-online', {
        key: 'my-tab-id',
        metadata: { app: 'admin' },
      }),
    )

    const state = currentChannel.presenceState()
    expect(Object.keys(state)).toHaveLength(2)
    expect(state['user-1'][0].metadata).toEqual({ app: 'pcare' })
    expect(state['user-2'][0].metadata).toEqual({ app: 'tv' })
  })

  it('re-trackeia com nova metadata quando ela muda', () => {
    const { rerender } = renderHook(
      ({ meta }) =>
        useRealtimePresence('labhub-online', {
          key: 'test',
          metadata: meta,
        }),
      { initialProps: { meta: { app: 'pcare' } as Record<string, any> } },
    )

    // Limpa chamadas do track inicial
    currentChannel.track.mockClear()

    rerender({ meta: { app: 'stock', page: 'items' } })

    // Com fake timers, effects rodam na próxima microtask.
    // act() + vi.advanceTimersToNextTimer() força a execução.
    act(() => { vi.advanceTimersByTime(0) })

    const calls = currentChannel.track.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall?.[0]?.metadata).toEqual({ app: 'stock', page: 'items' })
  })

  it('não recria canal quando metadata muda', () => {
    const { rerender } = renderHook(
      ({ meta }) =>
        useRealtimePresence('labhub-online', {
          key: 'test',
          metadata: meta,
        }),
      { initialProps: { meta: { app: 'pcare' } as Record<string, any> } },
    )

    const channelCalls = mockChannel.mock.calls.length

    rerender({ meta: { app: 'stock' } })

    expect(mockChannel.mock.calls.length).toBe(channelCalls)
  })

  it('recria canal quando key muda', () => {
    const { rerender } = renderHook(
      ({ k }: { k: string }) =>
        useRealtimePresence('labhub-online', {
          key: k,
        }),
      { initialProps: { k: 'tab-1' } },
    )

    expect(mockChannel.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = mockChannel.mock.calls.length

    rerender({ k: 'tab-2' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('recria canal quando channelName muda', () => {
    const { rerender } = renderHook(
      ({ name }: { name: string }) =>
        useRealtimePresence(name, {
          key: 'test',
        }),
      { initialProps: { name: 'channel-1' } },
    )

    const callsBefore = mockChannel.mock.calls.length

    rerender({ name: 'channel-2' })

    expect(mockChannel.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})
