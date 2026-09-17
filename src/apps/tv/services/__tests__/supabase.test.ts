import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Registro de chamadas + builder encadeável e thenable ── */
type Call = { m: string; a: unknown[] }

const state = {
  calls: [] as Call[],
  fromCalls: [] as string[],
  result: { data: [] as unknown[], error: null } as { data: unknown[] | null; error: unknown },
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
    single: () => { const r = dequeue(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return Promise.resolve({ data: d, error: r.error }) },
    maybeSingle: () => { const r = dequeue(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return Promise.resolve({ data: d, error: r.error }) },
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
  fetchEvents,
  fetchAllEvents,
  fetchScheduledContent,
  createEvent,
  updateEvent,
  deleteEvent,
  reserveEventUpsert,
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
  state.resultQueue = []
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

describe('fetchEvents — escopo por TV', () => {
  it('mostra evento do campus (device_id null) para qualquer TV', async () => {
    state.result = {
      data: [{ id: 'campus', title: 'Campus', device_id: null }],
      error: null,
    }
    const out = await fetchEvents('tv-a')
    expect(out.map((e: any) => e.id)).toEqual(['campus'])
  })

  it('esconde evento de outra TV e mostra o da própria TV', async () => {
    state.result = {
      data: [
        { id: 'a', title: 'A', device_id: 'tv-a' },
        { id: 'b', title: 'B', device_id: 'tv-b' },
      ],
      error: null,
    }
    const out = await fetchEvents('tv-a')
    expect(out.map((e: any) => e.id)).toEqual(['a'])
  })

  it('sem deviceId retorna tudo (painel/legado)', async () => {
    state.result = {
      data: [
        { id: 'a', title: 'A', device_id: 'tv-a' },
        { id: 'b', title: 'B', device_id: 'tv-b' },
      ],
      error: null,
    }
    const out = await fetchEvents()
    expect(out.map((e: any) => e.id)).toEqual(['a', 'b'])
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

describe('reserveEventUpsert', () => {
  it('chama o RPC tv_reserve_event_upsert com workspace ativo e payload canônico', async () => {
    state.result = { data: [{ event_id: 'evt-1', schedule_id: 'sch-1' }], error: null }

    const result = await reserveEventUpsert({
      reservationDate: '2026-09-20',
      title: 'Reserva Lab A',
      description: 'Aula prática',
      reservationId: 'chave-abc',
      timeStart: '09:30',
      timeEnd: '11:00',
      additionalDates: ['2026-09-27'],
      targetDeviceIds: ['dev-1', 'dev-2'],
    })

    expect(result).toEqual({ event_id: 'evt-1', schedule_id: 'sch-1' })
    expect(lastCall('rpc')?.a).toEqual([
      'tv_reserve_event_upsert',
      {
        p_workspace_id: 'ws-x',
        p_reservation_date: '2026-09-20',
        p_title: 'Reserva Lab A',
        p_description: 'Aula prática',
        p_image_url: null,
        p_pdf_url: null,
        p_reservation_id: 'chave-abc',
        p_reservation_time_start: '09:30',
        p_reservation_time_end: '11:00',
        p_additional_dates: ['2026-09-27'],
        p_target_device_ids: ['dev-1', 'dev-2'],
        p_event_id: null,
        p_sort_order: 0,
      },
    ])
  })

  it('envia nulls quando não há horário, datas adicionais ou TVs (todas do workspace)', async () => {
    state.result = { data: [{ event_id: 'evt-2', schedule_id: 'sch-2' }], error: null }

    const result = await reserveEventUpsert({
      reservationDate: '2026-09-20',
      title: 'Sem horário',
      reservationId: null,
    })

    expect(result).toEqual({ event_id: 'evt-2', schedule_id: 'sch-2' })
    const payload = lastCall('rpc')?.a[1] as Record<string, unknown>
    expect(payload.p_reservation_id).toBeNull()
    expect(payload.p_reservation_time_start).toBeNull()
    expect(payload.p_reservation_time_end).toBeNull()
    expect(payload.p_additional_dates).toBeNull()
    expect(payload.p_target_device_ids).toBeNull()
    expect(payload.p_event_id).toBeNull()
  })

  it('propaga erro do RPC (falha de permissão)', async () => {
    state.result = { data: [], error: { code: '42501', message: 'TV_WORKSPACE_FULL_REQUIRED' } }
    await expect(
      reserveEventUpsert({ reservationDate: '2026-09-20', title: 'x' }),
    ).rejects.toThrow()
  })

  it('falha sem workspace ativo', async () => {
    store.activeWorkspaceId = null
    await expect(
      reserveEventUpsert({ reservationDate: '2026-09-20', title: 'x' }),
    ).rejects.toThrow()
    expect(lastCall('rpc')).toBeUndefined()
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
    expect(lastCall('delete')).toBeDefined()
    const eqCalls = state.calls.filter((c) => c.m === 'eq')
    expect(eqCalls[eqCalls.length - 2]?.a).toEqual(['id', 'pl-1'])
    expect(eqCalls[eqCalls.length - 1]?.a).toEqual(['workspace_id', 'ws-x'])
  })
})
