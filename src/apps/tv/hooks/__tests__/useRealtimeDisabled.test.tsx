import { renderHook } from '@testing-library/react'

const { mockRealtime } = vi.hoisted(() => ({
  mockRealtime: vi.fn(),
}))

vi.mock('../../../../lib/useRealtimeSubscription', () => ({
  useRealtimeSubscription: (...args: unknown[]) => mockRealtime(...args),
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: null,
  pcareDb: null,
  stockDb: null,
}))

vi.mock('../../../../lib/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.mock('../../utils/kiosk', () => ({
  isDesktopEnv: () => true,
  isKiosk: () => false,
  kioskError: vi.fn(),
}))

/* Nenhuma função aqui pode abrir tráfego: o Desktop usa apenas mídia local. */
vi.mock('../../services/supabase', () => ({
  fetchPlaylists: vi.fn(() => Promise.resolve([])),
  createPlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  fetchActiveGalleries: vi.fn(() => Promise.resolve([])),
  fetchGalleryPhotos: vi.fn(() => Promise.resolve([])),
  fetchGalleries: vi.fn(() => Promise.resolve([])),
  createGallery: vi.fn(),
  deleteGallery: vi.fn(),
  toggleGalleryActive: vi.fn(),
  setGalleryOrder: vi.fn(),
  addGalleryPhoto: vi.fn(),
  deleteGalleryPhoto: vi.fn(),
}))

import { usePlaylists } from '../usePlaylists'
import { useActiveGalleries } from '../useGallery'

describe('hooks TV — Realtime desligado no Desktop institucional', () => {
  beforeEach(() => {
    mockRealtime.mockClear()
  })

  it('chama useRealtimeSubscription incondicionalmente com enabled: false', () => {
    renderHook(() => usePlaylists())
    renderHook(() => useActiveGalleries())

    const calls = mockRealtime.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)

    // Qualquer render de qualquer um dos dois hooks deve desligar o Realtime:
    // nenhuma chamada pode ficar sem `enabled: false` (isso abriria canal).
    for (const call of calls) {
      expect(call[1]).toBe('*')
      expect(call[3]).toEqual(expect.objectContaining({ enabled: false }))
    }
    expect(calls.some((call) => call[0] === 'tv_playlists')).toBe(true)
    expect(calls.some((call) => call[0] === 'tv_galleries')).toBe(true)
  })
})
