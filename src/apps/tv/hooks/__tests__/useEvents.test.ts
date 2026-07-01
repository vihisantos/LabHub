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

import { useEvents, useAllEvents } from '../useEvents'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useEvents', () => {
  it('inicia com loading=true e eventos vazios', () => {
    const { result } = renderHook(() => useEvents())
    expect(result.current.loading).toBe(true)
    expect(result.current.events).toEqual([])
  })

  it('carrega eventos e desliga loading', async () => {
    const { result } = renderHook(() => useEvents())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.events).toEqual([])
  })

  it('refresh retorna vazio', async () => {
    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.events).toEqual([])
  })
})

describe('useAllEvents', () => {
  it('carrega eventos e desliga loading', async () => {
    const { result } = renderHook(() => useAllEvents())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.events).toEqual([])
  })

  it('add não falha', async () => {
    const { result } = renderHook(() => useAllEvents())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.add({ title: 'X', description: null, image_url: null, start_date: null, end_date: null, is_active: true, sort_order: 0 })
    })

    expect(result.current.events).toEqual([])
  })

  it('edit não falha', async () => {
    const { result } = renderHook(() => useAllEvents())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.edit('evt-1', { title: 'X' })
    })

    expect(result.current.events).toEqual([])
  })

  it('remove não falha', async () => {
    const { result } = renderHook(() => useAllEvents())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.remove('evt-1')
    })

    expect(result.current.events).toEqual([])
  })
})
