import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Registro de chamadas + builder encadeável e thenable ── */
type Call = { m: string; a: unknown[] }

const state = {
  calls: [] as Call[],
  fromCalls: [] as string[],
  result: { data: [] as unknown[], error: null } as { data: unknown; error: unknown },
  /** Fila de resultados: quando preenchida, cada chamada consome o próximo item. */
  resultQueue: [] as { data: unknown; error: unknown }[],
}

function record(m: string, a: unknown[] = []) {
  state.calls.push({ m, a })
}

function makeBuilder(table?: string) {
  if (table) state.fromCalls.push(table)
  const builder: Record<string, unknown> = {}
  const method = (m: string) => (...a: unknown[]) => {
    record(m, a)
    return builder
  }
  Object.assign(builder, {
    select: method('select'),
    insert: method('insert'),
    update: method('update'),
    delete: method('delete'),
    upsert: method('upsert'),
    eq: method('eq'),
    order: method('order'),
    limit: method('limit'),
    single: () => { const r = dequeue(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return Promise.resolve({ data: d, error: r.error }) },
    maybeSingle: () => { const r = dequeue(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return Promise.resolve({ data: d, error: r.error }) },
    then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
      const r = dequeue()
      return Promise.resolve(
        resolve({
          data: r.data as unknown[] | null,
          error: r.error,
        }),
      )
    },
    catch: (reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.result.data, error: state.result.error }).catch(reject),
  })
  return builder
}

const lastCall = (m: string) => {
  const found = state.calls.filter((c) => c.m === m)
  return found[found.length - 1]
}

function dequeue(): { data: unknown; error: unknown } {
  if (state.resultQueue.length > 0) return state.resultQueue.shift()!
  return state.result
}

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    from: (table: string) => makeBuilder(table),
    rpc: (fn: string, args: unknown) => {
      record('rpc', [fn, args])
      const r = dequeue()
      const data = Array.isArray(r.data) ? r.data[0] ?? null : r.data
      return Promise.resolve({ data, error: r.error })
    },
  },
}))

vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: {
    activeWorkspaceId: 'ws-x',
    filter: <T,>(rows: T[]) => rows,
  },
}))

import { workspaceStore } from '../../../../core/workspaces/store'
import {
  fetchScheduledContent,
  fetchPlaylists,
  fetchAllPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  fetchAnnouncements,
  fetchAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  fetchActiveGalleries,
  fetchGalleries,
  createGallery,
  deleteGallery,
  toggleGalleryActive,
  setGalleryOrder,
  fetchGalleryPhotos,
  addGalleryPhoto,
  deleteGalleryPhoto,
  reorderGalleryPhotos,
  fetchDevices,
  fetchDeviceById,
  upsertDevice,
  heartbeatDevice,
  updateDevice,
  deleteDevice,
} from '../supabase'

const store = workspaceStore as unknown as { activeWorkspaceId: string | null }

beforeEach(() => {
  store.activeWorkspaceId = 'ws-x'
  state.calls = []
  state.fromCalls = []
  state.result = { data: [], error: null }
  state.resultQueue = []
})

/* ── Scheduled Content ── */

describe('fetchScheduledContent', () => {
  it('chama tv_resolve_scheduled_content e busca o evento por event_id', async () => {
    const mockEvent = { id: 'evt-1', title: 'Reserva Lab', is_active: true, sort_order: 0 }
    state.resultQueue = [
      { data: [{ event_id: 'evt-1', schedule_id: 'sch-1', origin: 'scheduled' }], error: null },
      { data: [mockEvent], error: null },
    ]

    const result = await fetchScheduledContent('tv-a')

    expect(lastCall('rpc')?.a[0]).toBe('tv_resolve_scheduled_content')
    const rpcArgs = lastCall('rpc')?.a[1] as Record<string, unknown>
    expect(rpcArgs.p_workspace_id).toBe('ws-x')
    expect(rpcArgs.p_device_id).toBe('tv-a')
    expect(typeof rpcArgs.p_date).toBe('string')
    expect(typeof rpcArgs.p_time).toBe('string')
    expect(result).toEqual(mockEvent)
  })

  it('retorna null quando o resolver retorna NULL (sem conteúdo)', async () => {
    state.result = { data: null, error: null }
    const result = await fetchScheduledContent('tv-a')
    expect(result).toBeNull()
    expect(lastCall('rpc')?.a[0]).toBe('tv_resolve_scheduled_content')
  })

  it('retorna null quando workspace não está ativo', async () => {
    store.activeWorkspaceId = null
    const result = await fetchScheduledContent('tv-a')
    expect(result).toBeNull()
    expect(lastCall('rpc')).toBeUndefined()
  })

  it('envia p_device_id null quando deviceId é null (device campus)', async () => {
    const mockEvent = { id: 'evt-campus', title: 'Evento Campus', is_active: true }
    state.resultQueue = [
      { data: [{ event_id: 'evt-campus', schedule_id: null, origin: 'legacy' }], error: null },
      { data: [mockEvent], error: null },
    ]

    const result = await fetchScheduledContent(null)
    expect(result).toEqual(mockEvent)
    const rpcArgs = lastCall('rpc')?.a[1] as Record<string, unknown>
    expect(rpcArgs.p_device_id).toBeNull()
  })
})

/* ── Playlists ── */

describe('fetchPlaylists', () => {
  it('retorna playlists ativas ordenadas por sort_order', async () => {
    const mockData = [{ id: '1', name: 'Playlist A', source: 'youtube', is_active: true }]
    state.result = { data: mockData, error: null }

    const result = await fetchPlaylists()
    expect(result).toEqual(mockData)
    expect(state.fromCalls).toEqual(['tv_playlists'])
    expect(lastCall('eq')?.a).toEqual(['is_active', true])
    expect(lastCall('order')?.a).toEqual(['sort_order', { ascending: true }])
  })
})

describe('fetchAllPlaylists', () => {
  it('retorna todas as playlists sem filtro is_active', async () => {
    const mockData = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    state.result = { data: mockData, error: null }

    const result = await fetchAllPlaylists()
    expect(result).toEqual(mockData)
    expect(lastCall('eq')).toBeUndefined()
  })
})

describe('createPlaylist', () => {
  it('insere playlist com valores e workspace ativo', async () => {
    const values = { name: 'Nova Playlist', source: 'google_drive' as const, youtube_url: '', is_active: true, sort_order: 0 }
    await createPlaylist(values)
    expect(lastCall('insert')?.a).toEqual([
      { ...values, workspace_id: 'ws-x' },
    ])
  })
})

describe('updatePlaylist', () => {
  it('atualiza playlist por id com workspace scoping', async () => {
    await updatePlaylist('pl-1', { name: 'Atualizada' })
    expect(lastCall('update')?.a).toEqual([{ name: 'Atualizada' }])
    const eqCalls = state.calls.filter((c) => c.m === 'eq')
    expect(eqCalls[eqCalls.length - 2]?.a).toEqual(['id', 'pl-1'])
    expect(eqCalls[eqCalls.length - 1]?.a).toEqual(['workspace_id', 'ws-x'])
  })
})

describe('deletePlaylist', () => {
  it('deleta playlist por id com workspace scoping', async () => {
    await deletePlaylist('pl-1')
    expect(state.calls.some((c) => c.m === 'delete')).toBe(true)
    const eqCalls = state.calls.filter((c) => c.m === 'eq')
    expect(eqCalls[eqCalls.length - 2]?.a).toEqual(['id', 'pl-1'])
    expect(eqCalls[eqCalls.length - 1]?.a).toEqual(['workspace_id', 'ws-x'])
  })
})

/* ── Announcements ── */

describe('fetchAnnouncements', () => {
  it('retorna anúncios ativos ordenados por sort_order', async () => {
    const mockData = [{ id: '1', text: 'Anúncio A', is_active: true }]
    state.result = { data: mockData, error: null }

    const result = await fetchAnnouncements()
    expect(result).toEqual(mockData)
    expect(state.fromCalls).toEqual(['tv_announcements'])
  })
})

describe('fetchAllAnnouncements', () => {
  it('retorna todos os anúncios sem filtro is_active', async () => {
    const mockData = [{ id: '1', text: 'A' }]
    state.result = { data: mockData, error: null }

    const result = await fetchAllAnnouncements()
    expect(result).toEqual(mockData)
    expect(lastCall('eq')).toBeUndefined()
  })
})

describe('createAnnouncement', () => {
  it('insere anúncio com workspace_id', async () => {
    await createAnnouncement({ text: 'Teste', is_active: true, sort_order: 0 })
    expect(lastCall('insert')?.a[0]).toHaveProperty('workspace_id', 'ws-x')
  })
})

describe('updateAnnouncement', () => {
  it('atualiza anúncio com workspace scoping', async () => {
    await updateAnnouncement('a-1', { text: 'Updated text' })
    const eqCalls = state.calls.filter((c) => c.m === 'eq')
    expect(eqCalls[eqCalls.length - 1]?.a).toEqual(['workspace_id', 'ws-x'])
  })
})

describe('deleteAnnouncement', () => {
  it('deleta anúncio com workspace scoping', async () => {
    await deleteAnnouncement('a-1')
    expect(state.calls.some((c) => c.m === 'delete')).toBe(true)
  })
})

/* ── Photo Galleries ── */

describe('fetchActiveGalleries', () => {
  it('retorna galerias ativas', async () => {
    state.result = { data: [{ id: '1', title: 'Gallery A', is_active: true }], error: null }
    const result = await fetchActiveGalleries()
    expect(result[0].title).toBe('Gallery A')
  })
})

describe('fetchGalleries', () => {
  it('retorna todas as galerias', async () => {
    state.result = { data: [{ id: '1', title: 'A' }], error: null }
    const result = await fetchGalleries()
    expect(result).toEqual([{ id: '1', title: 'A' }])
  })
})

describe('createGallery', () => {
  it('cria galeria com sort_order 0', async () => {
    await createGallery('Minha Galeria')
    expect(lastCall('insert')?.a).toEqual([{ title: 'Minha Galeria', sort_order: 0, workspace_id: 'ws-x' }])
  })
})

describe('deleteGallery', () => {
  it('deleta galeria com workspace scoping', async () => {
    await deleteGallery('g-1')
    expect(state.calls.some((c) => c.m === 'delete')).toBe(true)
  })
})

describe('toggleGalleryActive', () => {
  it('ativa galeria quando inativa', async () => {
    state.result = { data: [{ is_active: false }], error: null }
    await toggleGalleryActive('g-1')
    expect(lastCall('update')?.a).toEqual([{ is_active: true }])
  })
})

describe('setGalleryOrder', () => {
  it('atualiza ordem das galerias', async () => {
    await setGalleryOrder(['g-1', 'g-2', 'g-3'])
    expect(state.calls.filter((c) => c.m === 'update')).toHaveLength(3)
  })
})

describe('fetchGalleryPhotos', () => {
  it('retorna fotos da galeria', async () => {
    state.result = { data: [{ id: 'p-1', image_url: 'http://x' }], error: null }
    const result = await fetchGalleryPhotos('g-1')
    expect(result).toHaveLength(1)
  })
})

describe('addGalleryPhoto', () => {
  it('adiciona foto com proxima posicao', async () => {
    state.result = { data: [{ sort_order: 2 }], error: null }
    await addGalleryPhoto('g-1', 'http://image.jpg')
    expect(lastCall('insert')?.a[0]).toHaveProperty('image_url', 'http://image.jpg')
    expect(lastCall('insert')?.a[0]).toHaveProperty('sort_order', 3)
  })
})

describe('deleteGalleryPhoto', () => {
  it('deleta foto pelo id', async () => {
    // Mock fetch para evitar chamada real
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    } as Response)

    state.result = { data: null, error: null }
    await deleteGalleryPhoto('p-1')

    global.fetch = originalFetch
    expect(lastCall('delete')).toBeDefined()
    expect(lastCall('eq')?.a).toEqual(['id', 'p-1'])
  })
})

describe('reorderGalleryPhotos', () => {
  it('atualiza posicoes das fotos', async () => {
    await reorderGalleryPhotos(['p-1', 'p-2'])
    expect(state.calls.filter((c) => c.m === 'update')).toHaveLength(2)
  })
})

/* ── TV Devices ── */

describe('fetchDevices', () => {
  it('retorna todas as TVs', async () => {
    state.result = { data: [{ id: 't1', name: 'TV 1' }], error: null }
    const result = await fetchDevices()
    expect(result).toHaveLength(1)
  })
})

describe('fetchDeviceById', () => {
  it('retorna TV especifica', async () => {
    state.result = { data: { id: 't1' }, error: null }
    const result = await fetchDeviceById('t1')
    expect(result?.id).toBe('t1')
  })
})

describe('heartbeatDevice', () => {
  it('atualiza last_seen', async () => {
    state.result = { data: null, error: null }
    await heartbeatDevice('t1')
    expect(lastCall('update')?.a).toEqual([{ last_seen: expect.any(String) }])
  })
})

describe('upsertDevice', () => {
  it('executa upsert da TV', async () => {
    await upsertDevice({ id: 't1', name: 'TV Lab', workspace_id: 'ws-1' })
    expect(lastCall('upsert')).toBeDefined()
  })
})

describe('updateDevice', () => {
  it('atualiza dispositivo', async () => {
    await updateDevice('t1', { name: 'Nova TV' })
    expect(lastCall('update')?.a).toEqual([{ name: 'Nova TV' }])
  })
})

describe('deleteDevice', () => {
  it('deleta dispositivo', async () => {
    await deleteDevice('t1')
    expect(lastCall('delete')).toBeDefined()
  })
})