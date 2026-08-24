import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Registro de chamadas + builder encadeável e thenable ── */
type Call = { m: string; a: unknown[] }

const state = {
  calls: [] as Call[],
  fromCalls: [] as string[],
  result: { data: [] as unknown[], error: null } as { data: unknown[] | null; error: unknown },
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
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
      Promise.resolve(resolve(state.result)),
    catch: (reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.result.data, error: state.result.error }).catch(reject),
  })
  return builder
}

const lastCall = (m: string) => {
  const found = state.calls.filter((c) => c.m === m)
  return found[found.length - 1]
}

// Fábricas autocontidas (sem referências externas — vi.mock é hoisted).
vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    from: (table: string) => makeBuilder(table),
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

const store = workspaceStore as unknown as { activeWorkspaceId: string | null }

beforeEach(() => {
  store.activeWorkspaceId = 'ws-x'
  state.calls = []
  state.fromCalls = []
  state.result = { data: [], error: null }
})

/* ── Events ── */

describe('fetchEvents', () => {
  it('retorna eventos ativos ordenados por sort_order', async () => {
    const mockData = [{ id: '1', title: 'Evento A', is_active: true, sort_order: 0 }]
    state.result = { data: mockData, error: null }

    const result = await fetchEvents()
    expect(result).toEqual(mockData)
    expect(state.fromCalls).toEqual(['tv_events'])
    expect(lastCall('select')?.a).toEqual(['*'])
    expect(lastCall('eq')?.a).toEqual(['is_active', true])
    expect(lastCall('order')?.a).toEqual(['sort_order', { ascending: true }])
  })

  it('retorna array vazio quando resultado é null', async () => {
    state.result = { data: null, error: null }
    expect(await fetchEvents()).toEqual([])
  })
})

describe('fetchAllEvents', () => {
  it('retorna todos os eventos sem filtro is_active', async () => {
    const mockData = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]
    state.result = { data: mockData, error: null }

    const result = await fetchAllEvents()
    expect(result).toEqual(mockData)
    expect(lastCall('eq')).toBeUndefined()
  })
})

describe('createEvent', () => {
  it('insere evento com valores e workspace ativo', async () => {
    const values = { title: 'Novo Evento', description: null, image_url: null, pdf_url: null, start_date: null, end_date: null, is_active: true, sort_order: 0 }
    await createEvent(values)
    expect(lastCall('insert')?.a).toEqual([
      { ...values, workspace_id: 'ws-x' },
    ])
  })

  it('falha sem workspace ativo (evita criar registro legado global)', async () => {
    store.activeWorkspaceId = null
    await expect(createEvent({ title: 'x' } as never)).rejects.toThrow()
    expect(lastCall('insert')).toBeUndefined()
  })
})

describe('updateEvent', () => {
  it('atualiza evento por id E workspace_id', async () => {
    await updateEvent('evt-1', { title: 'Atualizado' })
    expect(lastCall('update')?.a).toEqual([{ title: 'Atualizado' }])
    expect(state.calls.filter((c) => c.m === 'eq').map((c) => c.a)).toEqual([
      ['id', 'evt-1'],
      ['workspace_id', 'ws-x'],
    ])
  })

  it('falha sem workspace ativo (nao vaza UPDATE cross-workspace)', async () => {
    store.activeWorkspaceId = null
    await expect(updateEvent('evt-1', { title: 'x' })).rejects.toThrow()
    expect(lastCall('eq')).toBeUndefined()
  })
})

describe('deleteEvent', () => {
  it('deleta evento por id E workspace_id', async () => {
    await deleteEvent('evt-1')
    expect(lastCall('delete')).toBeDefined()
    expect(state.calls.filter((c) => c.m === 'eq').map((c) => c.a)).toEqual([
      ['id', 'evt-1'],
      ['workspace_id', 'ws-x'],
    ])
  })

  it('falha sem workspace ativo', async () => {
    store.activeWorkspaceId = null
    await expect(deleteEvent('evt-1')).rejects.toThrow()
    expect(lastCall('eq')).toBeUndefined()
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
    const values = { name: 'Nova Playlist', source: 'youtube' as const, youtube_url: 'https://youtube.com/watch?v=test', is_active: true, sort_order: 0 }
    await createPlaylist(values)
    expect(lastCall('insert')?.a).toEqual([
      { ...values, workspace_id: 'ws-x' },
    ])
  })
})

describe('updatePlaylist', () => {
  it('atualiza playlist por id', async () => {
    await updatePlaylist('pl-1', { name: 'Atualizada' })
    expect(lastCall('update')?.a).toEqual([{ name: 'Atualizada' }])
    expect(lastCall('eq')?.a).toEqual(['id', 'pl-1'])
  })
})

describe('deletePlaylist', () => {
  it('deleta playlist por id', async () => {
    await deletePlaylist('pl-1')
    expect(lastCall('delete')).toBeDefined()
    expect(lastCall('eq')?.a).toEqual(['id', 'pl-1'])
  })
})
