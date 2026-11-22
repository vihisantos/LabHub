import { renderHook, waitFor, act } from '@testing-library/react'

const { mockAddToast } = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
}))

vi.mock('../../../../lib/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: null,
  pcareDb: null,
  stockDb: null,
}))

vi.mock('../../utils/kiosk', () => ({
  isKiosk: () => false,
  kioskError: () => false,
  isDesktopEnv: () => true,
}))

vi.mock('../../../../lib/localStore', () => ({
  isDesktopEnv: () => true,
  isKiosk: () => false,
  kioskError: () => false,
  localStoreGet: () => Promise.resolve(null),
  localStoreSet: () => Promise.resolve(),
}))

import { useEvents } from '../useEvents'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useEvents', () => {
  it('em desktop, inicia sem tráfego Supabase com eventos vazios e loading=false', () => {
    const { result } = renderHook(() => useEvents())
    expect(result.current.loading).toBe(false)
    expect(result.current.events).toEqual([])
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('carrega eventos e desliga loading', async () => {
    const { result } = renderHook(() => useEvents())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.events).toEqual([])
  })

  it('reload (load) não falha', async () => {
    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.events).toEqual([])
  })
})