import { describe, it, expect, vi, beforeEach } from 'vitest'

/* ── Mock chain: supports both method chaining AND await ── */
function createMockChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    // Make chain thenable so `await chain` resolves correctly
    then: (resolve: any) => Promise.resolve(resolve(result)),
  }
  return chain
}

const { mockFrom, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  })),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    from: mockFrom,
  },
}))

/* ── Import after mock ── */
import {
  fetchEvents,
  fetchAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchPlaylists,
  fetchAllPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
} from '../supabase'

let chain: ReturnType<typeof createMockChain>

beforeEach(() => {
  chain = createMockChain()
  mockFrom.mockReturnValue(chain)
  mockFrom.mockClear()
})

/* ── Events ── */

describe('fetchEvents', () => {
  it('retorna eventos ativos ordenados por sort_order', async () => {
    const mockData = [{ id: '1', title: 'Evento A', is_active: true, sort_order: 0 }]
    chain = createMockChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await fetchEvents()
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('tv_events')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('retorna array vazio quando resultado é null', async () => {
    chain = createMockChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await fetchEvents()
    expect(result).toEqual([])
  })
})

describe('fetchAllEvents', () => {
  it('retorna todos os eventos sem filtro is_active', async () => {
    const mockData = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]
    chain = createMockChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await fetchAllEvents()
    expect(result).toEqual(mockData)
  })
})

describe('createEvent', () => {
  it('insere evento com valores corretos', async () => {
    const values = { title: 'Novo Evento', description: null, image_url: null, pdf_url: null, start_date: null, end_date: null, is_active: true, sort_order: 0 }
    await createEvent(values)
    expect(chain.insert).toHaveBeenCalled()
  })
})

describe('updateEvent', () => {
  it('atualiza evento por id', async () => {
    await updateEvent('evt-1', { title: 'Atualizado' })
    expect(chain.update).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })
})

describe('deleteEvent', () => {
  it('deleta evento por id', async () => {
    await deleteEvent('evt-1')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })
})

/* ── Playlists ── */

describe('fetchPlaylists', () => {
  it('retorna playlists ativas ordenadas por sort_order', async () => {
    const mockData = [{ id: '1', name: 'Playlist A', source: 'youtube', is_active: true }]
    chain = createMockChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await fetchPlaylists()
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('tv_playlists')
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })
})

describe('fetchAllPlaylists', () => {
  it('retorna todas as playlists sem filtro is_active', async () => {
    const mockData = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    chain = createMockChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await fetchAllPlaylists()
    expect(result).toEqual(mockData)
  })
})

describe('createPlaylist', () => {
  it('insere playlist com valores corretos', async () => {
    const values = { name: 'Nova Playlist', source: 'youtube' as const, youtube_url: 'https://youtube.com/watch?v=test', duration_seconds: 30, is_active: true, sort_order: 0 }
    await createPlaylist(values)
    expect(chain.insert).toHaveBeenCalled()
  })
})

describe('updatePlaylist', () => {
  it('atualiza playlist por id', async () => {
    await updatePlaylist('pl-1', { name: 'Atualizada' })
    expect(chain.update).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'pl-1')
  })
})

describe('deletePlaylist', () => {
  it('deleta playlist por id', async () => {
    await deletePlaylist('pl-1')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'pl-1')
  })
})
