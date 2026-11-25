import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { channelOn, channelSubscribe, channelRemove, createChannel, getSession, setAuth } = vi.hoisted(() => ({
  channelOn: vi.fn().mockReturnThis(),
  channelSubscribe: vi.fn().mockReturnThis(),
  channelRemove: vi.fn(),
  createChannel: vi.fn(),
  getSession: vi.fn(),
  setAuth: vi.fn(),
}))
vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    auth: { getSession },
    realtime: { setAuth },
    channel: createChannel,
    removeChannel: channelRemove,
  },
}))
import { useTicketInvalidationBroadcast } from '../useTicketInvalidationBroadcast'

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-test' } } })
  setAuth.mockResolvedValue(undefined)
  createChannel.mockImplementation(() => ({ on: channelOn, subscribe: channelSubscribe }))
})

describe('canal privado de invalidação por campus', () => {
  it('não conecta nem consulta sem workspace', async () => {
    const invalidate = vi.fn(), status = vi.fn()
    renderHook(() => useTicketInvalidationBroadcast(null, invalidate, status))
    await act(async () => {})
    expect(createChannel).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(false)
  })

  it('usa JWT e tópico privado, dispara refresh só após evento e na reconexão', async () => {
    const invalidate = vi.fn(), status = vi.fn()
    const { unmount } = renderHook(() => useTicketInvalidationBroadcast('ws-a', invalidate, status))
    await act(async () => {})
    expect(setAuth).toHaveBeenCalledWith('jwt-test')
    expect(createChannel).toHaveBeenCalledWith('labhub:chamados:workspace:ws-a', { config: { private: true } })
    expect(channelOn).toHaveBeenCalledWith('broadcast', { event: 'changed' }, expect.any(Function))
    const event = channelOn.mock.calls[0][2]
    const lifecycle = channelSubscribe.mock.calls[0][0]
    act(() => { lifecycle('SUBSCRIBED'); event({ event: 'changed' }) })
    expect(status).toHaveBeenCalledWith(true)
    expect(invalidate).toHaveBeenCalledTimes(2)
    act(() => lifecycle('CHANNEL_ERROR'))
    expect(status).toHaveBeenCalledWith(false)
    unmount()
    expect(channelRemove).toHaveBeenCalledTimes(1)
  })

  it('sem token não abre canal de workspace', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const invalidate = vi.fn(), status = vi.fn()
    renderHook(() => useTicketInvalidationBroadcast('ws-a', invalidate, status))
    await act(async () => {})
    expect(createChannel).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(false)
  })

  it('trocar workspace remove canal anterior e assina o novo', async () => {
    const invalidate = vi.fn(), status = vi.fn()
    const { rerender } = renderHook(({ ws }) => useTicketInvalidationBroadcast(ws, invalidate, status), {
      initialProps: { ws: 'ws-a' },
    })
    await act(async () => {})
    rerender({ ws: 'ws-b' })
    await act(async () => {})
    expect(channelRemove).toHaveBeenCalledTimes(1)
    expect(createChannel).toHaveBeenLastCalledWith('labhub:chamados:workspace:ws-b', { config: { private: true } })
  })
})
