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

import { usePlaylists } from '../usePlaylists'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('usePlaylists', () => {
  it('em desktop, inicia sem tráfego Supabase com playlists vazias e loading=false', () => {
    const { result } = renderHook(() => usePlaylists())
    expect(result.current.loading).toBe(false)
    expect(result.current.playlists).toEqual([])
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('em desktop, carrega playlists vazias e desliga loading', async () => {
    const { result } = renderHook(() => usePlaylists())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.playlists).toEqual([])
  })

  it('refresh não falha', async () => {
    const { result } = renderHook(() => usePlaylists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.playlists).toEqual([])
  })
})