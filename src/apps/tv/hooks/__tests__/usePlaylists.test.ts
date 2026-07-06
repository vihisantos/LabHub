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

import { usePlaylists, useAllPlaylists } from '../usePlaylists'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('usePlaylists', () => {
  it('inicia com loading=true e playlists vazias', () => {
    const { result } = renderHook(() => usePlaylists())
    expect(result.current.loading).toBe(true)
    expect(result.current.playlists).toEqual([])
  })

  it('carrega playlists e desliga loading', async () => {
    const { result } = renderHook(() => usePlaylists())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.playlists).toEqual([])
  })

  it('refresh retorna vazio', async () => {
    const { result } = renderHook(() => usePlaylists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.playlists).toEqual([])
  })
})

describe('useAllPlaylists', () => {
  it('carrega playlists e desliga loading', async () => {
    const { result } = renderHook(() => useAllPlaylists())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.playlists).toEqual([])
  })

  it('add não falha', async () => {
    const { result } = renderHook(() => useAllPlaylists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.add({ name: 'X', source: 'youtube', youtube_url: 'url', duration_seconds: 30, is_active: true, sort_order: 0 })
    })

    expect(result.current.playlists).toEqual([])
  })

  it('edit não falha', async () => {
    const { result } = renderHook(() => useAllPlaylists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.edit('pl-1', { name: 'X' })
    })

    expect(result.current.playlists).toEqual([])
  })

  it('remove não falha', async () => {
    const { result } = renderHook(() => useAllPlaylists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.remove('pl-1')
    })

    expect(result.current.playlists).toEqual([])
  })
})
