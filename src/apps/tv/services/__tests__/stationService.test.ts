import { describe, it, expect, vi, beforeEach } from 'vitest'

/* ── Mocks de infraestrutura ── */
const supabase = vi.hoisted(() => ({
  defaultDb: { rpc: vi.fn() } as any,
}))

vi.mock('../../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))
vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: 'ws-x', filter: <T,>(rows: T[]) => rows },
}))

import { workspaceStore } from '../../../../core/workspaces/store'
import {
  getStationSnapshot,
  playTrackNow,
  stopStation,
  pauseStation,
  resumeStation,
  nextStation,
  previousStation,
  seekStation,
  resolveStationPosition,
  StationError,
  type StationSnapshot,
  type StationCommandResult,
} from '../stationService'
import type { TvMusicTrack } from '../../types'

const store = workspaceStore as unknown as { activeWorkspaceId: string | null }

const snapshot: StationSnapshot = {
  workspace_id: 'ws-x',
  state: 'stopped',
  position_seconds: 0,
  started_at: null,
  station_synced_at: null,
  state_sequence: 5,
  queue_snapshot_id: 'snap-1',
  current_snapshot_track_id: 'snapt-1',
  tracks: [
    { snapshot_track_id: 'snapt-1', position: 0, youtube_video_id: 'vid-1', title: 'Faixa 1', duration_seconds: 120, track_id: 'trk-1' },
    { snapshot_track_id: 'snapt-2', position: 1, youtube_video_id: 'vid-2', title: 'Faixa 2', duration_seconds: 100, track_id: 'trk-2' },
  ],
}

const commandResult: StationCommandResult = {
  result: 'ok',
  state: 'playing',
  position_seconds: 0,
  started_at: '2026-01-01T00:00:00Z',
  state_sequence: 6,
  queue_snapshot_id: 'snap-1',
  current_snapshot_track_id: 'snapt-1',
}

function mockRpc(fn: (fnName: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  supabase.defaultDb.rpc.mockImplementation(fn)
}

function rpcCalls(fnName: string): Array<Record<string, unknown>> {
  return supabase.defaultDb.rpc.mock.calls
    .filter((c: unknown[]) => c[0] === fnName)
    .map((c: unknown[]) => c[1] as Record<string, unknown>)
}

const queueTrack: TvMusicTrack = {
  id: 'trk-1',
  queue_id: 'queue-1',
  youtube_video_id: 'vid-1',
  title: 'Faixa 1',
  duration_seconds: 120,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
}

const requestTrack: TvMusicTrack = {
  id: 'req-1',
  queue_id: '',
  youtube_video_id: 'vid-2',
  title: 'Música solicitada',
  duration_seconds: 0,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  store.activeWorkspaceId = 'ws-x'
})

describe('getStationSnapshot — leitura via RPC (workspace da sessão)', () => {
  it('chama station_get_snapshot com o workspace ativo e devolve o snapshot', async () => {
    mockRpc(async (fn) => (fn === 'station_get_snapshot' ? { data: snapshot, error: null } : { data: null, error: null }))

    const result = await getStationSnapshot()

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('station_get_snapshot', { p_workspace: 'ws-x' })
    expect(result).toEqual(snapshot)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED (não chama RPC)', async () => {
    store.activeWorkspaceId = null
    await expect(getStationSnapshot()).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(supabase.defaultDb.rpc).not.toHaveBeenCalled()
  })
})

describe('playTrackNow — comando station_track_change (contract)', () => {
  it('resolve a faixa pela origem (track_id) e emite station_track_change com idempotência', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === 'station_track_change') return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    const outcome = await playTrackNow(queueTrack)

    const params = rpcCalls('station_track_change')[0]
    expect(params.p_workspace).toBe('ws-x')
    expect(params.p_snapshot_track_id).toBe('snapt-1')
    expect(params.p_expected_sequence).toBe(5)
    expect(params.p_idempotency_key).toMatch(/^track-change:ws-x:/)
    expect(params.p_request_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(outcome.workspace_id).toBe('ws-x')
    expect(outcome.request_id).toBe(params.p_idempotency_key)
    expect(outcome.result).toEqual(commandResult)
  })

  it('resolve pedido de música (sem queue_id) por youtube_video_id', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === 'station_track_change') return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    await playTrackNow(requestTrack)

    const params = rpcCalls('station_track_change')[0]
    expect(params.p_snapshot_track_id).toBe('snapt-2')
  })

  it('faixa fora do snapshot → TRACK_NOT_IN_SNAPSHOT (não emite mutação)', async () => {
    mockRpc(async (fn) => (fn === 'station_get_snapshot' ? { data: snapshot, error: null } : { data: null, error: null }))

    await expect(playTrackNow({ ...queueTrack, youtube_video_id: 'desconhecido', id: 'outro', queue_id: '' })).rejects.toMatchObject({
      code: 'TRACK_NOT_IN_SNAPSHOT',
    })
    expect(rpcCalls('station_track_change')).toHaveLength(0)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED', async () => {
    store.activeWorkspaceId = null
    await expect(playTrackNow(queueTrack)).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
  })
})

describe('playTrackNow — propagação de erro do RPC (nunca silencioso)', () => {
  it.each([
    ['42501', 'ACCESS_DENIED'],
    ['40900', 'SEQUENCE_CONFLICT'],
    ['40901', 'IDEMPOTENCY_KEY_REUSE'],
    ['40908', 'TRACK_NOT_IN_SNAPSHOT'],
  ])('sqlstate %s → StationError %s', async (sqlstate, code) => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: sqlstate, message: code } }
    })

    const err = await playTrackNow(queueTrack).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe(code)
  })

  it('erro sem sqlstate mapeado → RPC_ERROR cai no genérico (não some)', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { message: 'algo quebrou' } }
    })

    await expect(playTrackNow(queueTrack)).rejects.toMatchObject({ code: 'RPC_ERROR' })
  })
})

describe('stopStation — comando station_stop (contract)', () => {
  it('chama station_stop com workspace, expected_sequence e idempotência', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === 'station_stop') return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    const outcome = await stopStation()

    const params = rpcCalls('station_stop')[0]
    expect(params.p_workspace).toBe('ws-x')
    expect(params.p_expected_sequence).toBe(5)
    expect(params.p_idempotency_key).toMatch(/^stop:ws-x:/)
    expect(params.p_request_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(outcome.workspace_id).toBe('ws-x')
    expect(outcome.request_id).toBe(params.p_idempotency_key)
    expect(outcome.result).toEqual(commandResult)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED (não chama RPC)', async () => {
    store.activeWorkspaceId = null
    await expect(stopStation()).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(supabase.defaultDb.rpc).not.toHaveBeenCalled()
  })

  it('propaga erro do RPC (ACCESS_DENIED) como StationError', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '42501', message: 'ACCESS_DENIED' } }
    })

    const err = await stopStation().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('ACCESS_DENIED')
  })
})

describe.each(['pause', 'resume'] as const)('station_%s — contrato e idempotência', (op) => {
  const call = op === 'pause' ? pauseStation : resumeStation

  it('chama o RPC com workspace, expected_sequence e idempotência', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === `station_${op}`) return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    const outcome = await call()

    const params = rpcCalls(`station_${op}`)[0]
    expect(params.p_workspace).toBe('ws-x')
    expect(params.p_expected_sequence).toBe(5)
    expect(params.p_idempotency_key).toMatch(new RegExp(`^${op}:ws-x:`))
    expect(params.p_request_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(outcome.workspace_id).toBe('ws-x')
    expect(outcome.request_id).toBe(params.p_idempotency_key)
    expect(outcome.result).toEqual(commandResult)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED (não chama RPC)', async () => {
    store.activeWorkspaceId = null
    await expect(call()).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(supabase.defaultDb.rpc).not.toHaveBeenCalled()
  })

  it('propaga SEQUENCE_CONFLICT (stale) como StationError', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '40900', message: 'SEQUENCE_CONFLICT' } }
    })

    const err = await call().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('SEQUENCE_CONFLICT')
  })
})

describe.each(['next', 'previous'] as const)('station_%s — contrato e idempotência', (op) => {
  const call = op === 'next' ? nextStation : previousStation

  it('chama o RPC com workspace, expected_sequence e idempotência', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === `station_${op}`) return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    const outcome = await call()

    const params = rpcCalls(`station_${op}`)[0]
    expect(params.p_workspace).toBe('ws-x')
    expect(params.p_expected_sequence).toBe(5)
    expect(params.p_idempotency_key).toMatch(new RegExp(`^${op}:ws-x:`))
    expect(params.p_request_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(outcome.workspace_id).toBe('ws-x')
    expect(outcome.request_id).toBe(params.p_idempotency_key)
    expect(outcome.result).toEqual(commandResult)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED (não chama RPC)', async () => {
    store.activeWorkspaceId = null
    await expect(call()).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(supabase.defaultDb.rpc).not.toHaveBeenCalled()
  })

  it('propaga SEQUENCE_CONFLICT (stale) como StationError', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '40900', message: 'SEQUENCE_CONFLICT' } }
    })

    const err = await call().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('SEQUENCE_CONFLICT')
  })
})

describe('previousStation — início da fila (NO_PREVIOUS_TRACK)', () => {
  it('mapeia 40907 → StationError NO_PREVIOUS_TRACK', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '40907', message: 'NO_PREVIOUS_TRACK' } }
    })

    const err = await previousStation().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('NO_PREVIOUS_TRACK')
  })
})

describe('seekStation — comando station_seek (contract)', () => {
  it('chama station_seek com workspace, posição, expected_sequence e idempotência', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      if (fn === 'station_seek') return { data: commandResult, error: null }
      return { data: null, error: null }
    })

    const outcome = await seekStation(97.35)

    const params = rpcCalls('station_seek')[0]
    expect(params.p_workspace).toBe('ws-x')
    expect(params.p_position).toBe(97.35)
    expect(params.p_expected_sequence).toBe(5)
    expect(params.p_idempotency_key).toMatch(/^seek:ws-x:/)
    expect(params.p_request_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(outcome.workspace_id).toBe('ws-x')
    expect(outcome.request_id).toBe(params.p_idempotency_key)
    expect(outcome.result).toEqual(commandResult)
  })

  it('sem workspace ativo → WORKSPACE_REQUIRED (não chama RPC)', async () => {
    store.activeWorkspaceId = null
    await expect(seekStation(10)).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(supabase.defaultDb.rpc).not.toHaveBeenCalled()
  })

  it('mapeia SEEK_OUT_OF_RANGE (22023) como StationError', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '22023', message: 'SEEK_OUT_OF_RANGE' } }
    })

    const err = await seekStation(99999).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('SEEK_OUT_OF_RANGE')
  })

  it('mapeia SEQUENCE_CONFLICT (40900) como StationError', async () => {
    mockRpc(async (fn) => {
      if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
      return { data: null, error: { code: '40900', message: 'SEQUENCE_CONFLICT' } }
    })

    const err = await seekStation(10).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StationError)
    expect((err as StationError).code).toBe('SEQUENCE_CONFLICT')
  })
})

describe('resolveStationPosition — modelo temporal 039 (segundos)', () => {
  it('playing sem started_at → position_seconds', () => {
    expect(resolveStationPosition({ state: 'playing', position_seconds: 30, started_at: null })).toBe(30)
  })

  it('paused → position_seconds (posição congelada)', () => {
    expect(resolveStationPosition({ state: 'paused', position_seconds: 97.35, started_at: null })).toBe(97.35)
  })

  it('stopped → position_seconds', () => {
    expect(resolveStationPosition({ state: 'stopped', position_seconds: 0, started_at: null })).toBe(0)
  })

  it('playing com started_at → position_seconds + elapsed', () => {
    const start = new Date(Date.now() - 5000).toISOString()
    const pos = resolveStationPosition({ state: 'playing', position_seconds: 30, started_at: start })
    expect(pos).toBeGreaterThanOrEqual(30)
    expect(pos).toBeLessThan(35 + 1) // ~30 + 5s + tolerância
  })
})