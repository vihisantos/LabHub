import { describe, it, expect, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setAuth: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
}))
vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    auth: { getSession: mocks.getSession },
    realtime: { setAuth: mocks.setAuth },
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}))
import { subscribeNotificationInvalidation } from '../notificationRealtime'

const channel = { on: mocks.on, subscribe: mocks.subscribe }
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'token' } }, error: null })
  mocks.setAuth.mockResolvedValue(undefined)
  mocks.channel.mockReturnValue(channel)
  mocks.on.mockReturnValue(channel)
  mocks.subscribe.mockReturnValue(channel)
  mocks.removeChannel.mockResolvedValue('ok')
})

describe('private notification channel', () => {
  it('subscribes only to own topic and ignores callbacks after disposal', async () => {
    const changed = vi.fn()
    const connected = vi.fn()
    const dispose = subscribeNotificationInvalidation('a', changed, connected)
    await flush()
    expect(mocks.channel).toHaveBeenCalledWith('labhub:notifications:user:a', { config: { private: true } })
    expect(mocks.on.mock.calls[0].slice(0, 2)).toEqual(['broadcast', { event: 'changed' }])
    const event = mocks.on.mock.calls[0][2]
    const status = mocks.subscribe.mock.calls[0][0]
    status('SUBSCRIBED')
    event({ payload: { v: 1 } })
    expect(connected).toHaveBeenCalledWith(true)
    expect(changed).toHaveBeenCalledTimes(1)
    status('CHANNEL_ERROR')
    expect(connected).toHaveBeenCalledWith(false)
    dispose()
    event({})
    status('SUBSCRIBED')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(connected).toHaveBeenCalledTimes(2)
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('never subscribes using another user session', async () => {
    const dispose = subscribeNotificationInvalidation('b', vi.fn(), vi.fn())
    await flush()
    expect(mocks.channel).not.toHaveBeenCalled()
    dispose()
  })

  it('cleanup before auth resolves prevents a stale channel', async () => {
    const dispose = subscribeNotificationInvalidation('a', vi.fn(), vi.fn())
    dispose()
    await flush()
    expect(mocks.channel).not.toHaveBeenCalled()
  })
})
