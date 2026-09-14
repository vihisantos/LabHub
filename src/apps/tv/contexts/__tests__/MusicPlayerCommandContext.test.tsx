import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MusicPlayerCommandProvider, useMusicPlayerCommand } from '../MusicPlayerCommandContext'
import type { TvMusicTrack } from '../../types'

/* ── Mocks de infraestrutura ── */
const supabase = vi.hoisted(() => ({ defaultDb: { rpc: vi.fn() } as any }))
const access = vi.hoisted(() => ({ level: 'full' as string }))
const sendSignal = vi.hoisted(() => vi.fn())

vi.mock('../../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))
vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: 'ws-x', filter: <T,>(rows: T[]) => rows },
}))
vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({ getLevel: () => access.level }),
}))
vi.mock('../../../../lib/useRealtimeBroadcast', () => ({
  useRealtimeBroadcast: () => ({ send: sendSignal }),
}))

const snapshot = {
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
  ],
}

const commandResult = {
  result: 'ok',
  state: 'playing',
  position_seconds: 0,
  started_at: '2026-01-01T00:00:00Z',
  state_sequence: 6,
  queue_snapshot_id: 'snap-1',
  current_snapshot_track_id: 'snapt-1',
}

const track: TvMusicTrack = {
  id: 'trk-1',
  queue_id: 'queue-1',
  youtube_video_id: 'vid-1',
  title: 'Faixa 1',
  duration_seconds: 120,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MusicPlayerCommandProvider>{children}</MusicPlayerCommandProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  access.level = 'full'
  supabase.defaultDb.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'station_get_snapshot') return { data: snapshot, error: null }
    if (fn === 'station_track_change') return { data: commandResult, error: null }
    if (fn === 'station_stop' || fn === 'station_pause' || fn === 'station_resume' || fn === 'station_next' || fn === 'station_previous' || fn === 'station_seek') return { data: commandResult, error: null }
    return { data: null, error: null }
  })
})

describe('MusicPlayerCommandProvider — comando real (Fase 2.2)', () => {
  it('fornece superfície de comando SEM player/iframe/áudio', () => {
    renderHook(() => useMusicPlayerCommand(), { wrapper })

    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('com acesso full: emite station_track_change e sinal mínimo de broadcast', async () => {
    access.level = 'full'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await result.current.playNext(track)

    const changeCalls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_track_change')
    expect(changeCalls).toHaveLength(1)
    expect(changeCalls[0][1]).toMatchObject({ p_workspace: 'ws-x' })

    expect(sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'station_changed',
        workspace_id: 'ws-x',
        sequence: 6,
      }),
    )
    // Sinal é mínimo: não carrega a faixa/título.
    expect(sendSignal.mock.calls[0][0]).not.toHaveProperty('track')
    expect(sendSignal.mock.calls[0][0]).not.toHaveProperty('trackTitle')
    expect(sendSignal.mock.calls[0][0].request_id).toMatch(/^track-change:ws-x:/)
  })

  it('com acesso read: NÃO emite mutação (ACCESS_DENIED) e não transmite', async () => {
    access.level = 'read'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await expect(result.current.playNext(track)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })

    const changeCalls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_track_change')
    expect(changeCalls).toHaveLength(0)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('stop() com full: emite station_stop e sinal mínimo (sem áudio/iframe)', async () => {
    access.level = 'full'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await result.current.stop()

    const stopCalls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_stop')
    expect(stopCalls).toHaveLength(1)
    expect(stopCalls[0][1]).toMatchObject({ p_workspace: 'ws-x' })

    expect(sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'station_changed', workspace_id: 'ws-x', sequence: 6 }),
    )
    expect(sendSignal.mock.calls[0][0].request_id).toMatch(/^stop:ws-x:/)
    // Nenhuma faixa/título no sinal; sem iframe/áudio montados.
    expect(sendSignal.mock.calls[0][0]).not.toHaveProperty('track')
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('stop() com read: NÃO emite station_stop (ACCESS_DENIED)', async () => {
    access.level = 'read'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await expect(result.current.stop()).rejects.toMatchObject({ code: 'ACCESS_DENIED' })

    const stopCalls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_stop')
    expect(stopCalls).toHaveLength(0)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it.each(['pause', 'resume'] as const)('%s() com full: emite station_%s e sinal mínimo', async (op) => {
    access.level = 'full'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    if (op === 'pause') await result.current.pause()
    else await result.current.resume()

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === `station_${op}`)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ p_workspace: 'ws-x' })

    expect(sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'station_changed', workspace_id: 'ws-x', sequence: 6 }),
    )
    expect(sendSignal.mock.calls[0][0].request_id).toMatch(new RegExp(`^${op}:ws-x:`))
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it.each(['pause', 'resume'] as const)('%s() com read: NÃO emite station_%s (ACCESS_DENIED)', async (op) => {
    access.level = 'read'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    const p = op === 'pause' ? result.current.pause() : result.current.resume()
    await expect(p).rejects.toMatchObject({ code: 'ACCESS_DENIED' })

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === `station_${op}`)
    expect(calls).toHaveLength(0)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it.each(['next', 'previous'] as const)('%s() com full: emite station_%s e sinal mínimo', async (op) => {
    access.level = 'full'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    if (op === 'next') await result.current.next()
    else await result.current.previous()

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === `station_${op}`)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ p_workspace: 'ws-x' })

    expect(sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'station_changed', workspace_id: 'ws-x', sequence: 6 }),
    )
    expect(sendSignal.mock.calls[0][0].request_id).toMatch(new RegExp(`^${op}:ws-x:`))
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it.each(['next', 'previous'] as const)('%s() com read: NÃO emite station_%s (ACCESS_DENIED)', async (op) => {
    access.level = 'read'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    const p = op === 'next' ? result.current.next() : result.current.previous()
    await expect(p).rejects.toMatchObject({ code: 'ACCESS_DENIED' })

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === `station_${op}`)
    expect(calls).toHaveLength(0)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('seek() com full: emite station_seek com a posição e sinal mínimo', async () => {
    access.level = 'full'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await result.current.seek(42)

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_seek')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ p_workspace: 'ws-x', p_position: 42 })

    expect(sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'station_changed', workspace_id: 'ws-x', sequence: 6 }),
    )
    expect(sendSignal.mock.calls[0][0].request_id).toMatch(/^seek:ws-x:/)
    expect(sendSignal.mock.calls[0][0]).not.toHaveProperty('position')
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('seek() com read: NÃO emite station_seek (ACCESS_DENIED)', async () => {
    access.level = 'read'
    const { result } = renderHook(() => useMusicPlayerCommand(), { wrapper })

    await expect(result.current.seek(42)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })

    const calls = supabase.defaultDb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'station_seek')
    expect(calls).toHaveLength(0)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('lança erro quando usado fora do provider', () => {
    expect(() => renderHook(() => useMusicPlayerCommand())).toThrow(/within <MusicPlayerCommandProvider>/)
  })
})