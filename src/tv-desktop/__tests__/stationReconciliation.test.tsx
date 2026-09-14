import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { StationReconciler } from '../StationReconciler'

const reconcileStation = vi.hoisted(() => vi.fn())
const getSnapshot = vi.hoisted(() => vi.fn())

const reg = vi.hoisted(() => ({
  broadcast: null as null | ((p: unknown) => void),
  onStatus: null as null | ((s: string) => void),
  workspaceId: 'ws-a' as string | null,
  send: vi.fn(),
}))

vi.mock('../../apps/tv/contexts/MusicPlayerContext', () => ({
  useMusicPlayer: () => ({ reconcileStation }),
}))
vi.mock('../../apps/tv/services/stationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../apps/tv/services/stationService')>()
  return { ...actual, getStationSnapshot: getSnapshot }
})
vi.mock('../../core/workspaces/store', () => ({
  workspaceStore: { get activeWorkspaceId() { return reg.workspaceId } },
}))
vi.mock('../../lib/useRealtimeBroadcast', () => ({
  useRealtimeBroadcast: (_ch: string, _ev: string, cb: (p: unknown) => void, opts: { onStatus?: (s: string) => void }) => {
    reg.broadcast = cb
    if (opts?.onStatus) reg.onStatus = opts.onStatus
    return { send: reg.send }
  },
}))

function snap(seq: number, videoId: string | null = 'vid-1', state = 'playing', position = 0, startedAt: string | null = null) {
  return {
    state_sequence: seq,
    state,
    position_seconds: position,
    started_at: startedAt,
    current_snapshot_track_id: videoId ? 'snapt-1' : null,
    tracks: [
      { snapshot_track_id: 'snapt-1', position: 0, youtube_video_id: videoId, title: 'Faixa', duration_seconds: 120, track_id: 'trk-1' },
    ],
  }
}

async function triggerBroadcast(signal: unknown) {
  await act(async () => {
    reg.broadcast?.(signal)
  })
}

async function triggerStatus(status: string) {
  await act(async () => {
    reg.onStatus?.(status)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
  reg.broadcast = null
  reg.onStatus = null
  reg.workspaceId = 'ws-a'
})

describe('StationReconciler — reconciliação robusta (2.2-C)', () => {
  it('reconcilia no mount (estado inicial do Station)', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' }))
  })

  it('10 → 11 reconcilia (sequence maior)', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(11, 'vid-2'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-2', state: 'playing' }))
  })

  it('10 → 10 não reconcilia novamente', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })

    // Filtro rápido: sequence <= lastKnown → não busca snapshot nem reconcilia.
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('10 → 9 é ignorado (evento atrasado)', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 9 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('10 → 8 é ignorado', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 8 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('fora de ordem (12, 10, 11): estado final permanece em 12', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(12, 'vid-12'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 12 })
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    expect(getSnapshot).toHaveBeenCalledTimes(2) // só initial + signal 12
    expect(reconcileStation).toHaveBeenCalledTimes(2)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-12', state: 'playing' }))
  })

  it('duplicado (10, 10, 10) não gera reconciliações extras', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('resposta antiga de snapshot nunca sobrescreve a mais nova (guard monotônico)', async () => {
    getSnapshot.mockResolvedValue(snap(11))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // Snapshot "stale" (seq 10) retorna depois que 11 já foi aplicado.
    getSnapshot.mockResolvedValue(snap(10))
    await triggerStatus('SUBSCRIBED')
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))

    expect(reconcileStation).toHaveBeenCalledTimes(1) // 10 não é reaplicado
  })

  it('reconnect (SUBSCRIBED) recupera broadcasts perdidos no offline', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // Offline: 11, 12, 13 aconteceram sem broadcast recebido.
    getSnapshot.mockResolvedValue(snap(13, 'vid-13'))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-13', state: 'playing' }))
  })

  it('falha de snapshot não corrompe o estado (mantém último válido) e permite recovery', async () => {
    getSnapshot.mockRejectedValue(new Error('network down'))
    render(<StationReconciler />)

    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(1))
    expect(reconcileStation).not.toHaveBeenCalled() // sem corromper

    getSnapshot.mockResolvedValue(snap(12, 'vid-12'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 12 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))
    expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-12', state: 'playing' }))
  })

  it('sinal de outro workspace é ignorado (não consulta snapshot de B)', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-b', sequence: 11 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('status diferente de SUBSCRIBED não dispara reconciliação', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerStatus('TIMED_OUT')
    await triggerStatus('CLOSED')

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('STOP: playing → snapshot stopped → reconcilia para parado', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' })))

    getSnapshot.mockResolvedValue(snap(11, null, 'stopped'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' }))
  })

  it('STOP duplicado (11, 11) não gera transições extras', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(11, null, 'stopped'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })
    expect(reconcileStation).toHaveBeenCalledTimes(2)
    expect(getSnapshot).toHaveBeenCalledTimes(2)
  })

  it('STOP fora de ordem (12 stopped, 11 playing): permanece stopped', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(12, null, 'stopped'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 12 })
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))

    getSnapshot.mockResolvedValue(snap(11, 'vid-11', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    expect(reconcileStation).toHaveBeenCalledTimes(2)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' }))
  })

  it('STOP reconnect: recupera estado stopped após offline', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(13, null, 'stopped'))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' }))
  })

  it('STOP race: resposta antiga não desfaz o stopped', async () => {
    getSnapshot.mockResolvedValue(snap(11, 'vid-11', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // Snapshot stale (seq 10) chega depois que 11 já foi aplicado.
    getSnapshot.mockResolvedValue(snap(10))
    await triggerStatus('SUBSCRIBED')
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))

    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('desmonta sem erro (cleanup delegado ao useRealtimeBroadcast)', async () => {
    getSnapshot.mockResolvedValue(snap(10))
    const { unmount } = render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    expect(() => unmount()).not.toThrow()
  })
})

describe('StationReconciler — PAUSE/RESUME (2.4)', () => {
  it('playing → paused: mantém a mesma faixa e pausa', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' })))

    getSnapshot.mockResolvedValue(snap(11, 'vid-1', 'paused'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    // faixa preservada; só o estado vira paused (posição preservada pelo player).
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'paused' }))
  })

  it('paused → playing: mantém a mesma faixa e reproduz', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'paused'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'paused' })))

    getSnapshot.mockResolvedValue(snap(11, 'vid-1', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' }))
  })

  it('paused → stopped: STOP continua funcionando', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'paused'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(11, null, 'stopped'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' }))
  })

  it('stopped → playing: playNext continua funcionando (retoma faixa)', async () => {
    getSnapshot.mockResolvedValue(snap(10, null, 'stopped'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' })))

    getSnapshot.mockResolvedValue(snap(11, 'vid-2', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-2', state: 'playing' }))
  })

  it('sequence 11 playing → 10 paused: continua playing (evento atrasado não volta)', async () => {
    getSnapshot.mockResolvedValue(snap(11, 'vid-1', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'paused'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })

    expect(reconcileStation).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' }))
  })

  it('sequence 10 paused duplicado: sem reconciliação redundante', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'paused'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 10 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('race: paused@20 vs playing@21 → playing vence', async () => {
    getSnapshot.mockResolvedValue(snap(21, 'vid-1', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // stale paused (seq 20) chega depois — ignorado.
    getSnapshot.mockResolvedValue(snap(20, 'vid-1', 'paused'))
    await triggerStatus('SUBSCRIBED')
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))

    expect(reconcileStation).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing' }))
  })

  it('reconnect: offline paused@seq21 → recupera paused', async () => {
    getSnapshot.mockResolvedValue(snap(20, 'vid-1', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(21, 'vid-1', 'paused'))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'paused' }))
  })
})

describe('StationReconciler — NEXT/PREVIOUS (2.5)', () => {
  it('NEXT: track A → track B (snapshot aponta nova faixa)', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-a', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-a', state: 'playing' })))

    getSnapshot.mockResolvedValue(snap(11, 'vid-b', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-b', state: 'playing' }))
  })

  it('PREVIOUS: track B → track A', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-b', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(11, 'vid-a', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-a', state: 'playing' }))
  })

  it('NEXT → STOP: STOP continua funcionando após troca de faixa', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-a', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(11, null, 'stopped'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: null, state: 'stopped' }))
  })

  it('duplicado (seq 30, 30, 30) não avança múltiplas faixas', async () => {
    getSnapshot.mockResolvedValue(snap(30, 'vid-b', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 30 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 30 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 30 })

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('fora de ordem (32=C, 30=A, 31=B): permanece C', async () => {
    getSnapshot.mockResolvedValue(snap(30, 'vid-a', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(32, 'vid-c', 'playing'))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 32 })
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 30 })
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 31 })

    expect(reconcileStation).toHaveBeenCalledTimes(2)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-c', state: 'playing' }))
  })

  it('race: snapshot A=trackB@40 vs snapshot B=trackC@41 → C vence', async () => {
    getSnapshot.mockResolvedValue(snap(41, 'vid-c', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // stale B@40 chega depois — ignorado.
    getSnapshot.mockResolvedValue(snap(40, 'vid-b', 'playing'))
    await triggerStatus('SUBSCRIBED')
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))

    expect(reconcileStation).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-c', state: 'playing' }))
  })

  it('reconnect: offline sofreu NEXT → recupera track B diretamente', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-a', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // Offline: Station foi A → B; snapshot agora aponta B.
    getSnapshot.mockResolvedValue(snap(11, 'vid-b', 'playing'))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-b', state: 'playing' }))
  })

  it('missed broadcasts: AFINAl vai direto para a faixa do último snapshot', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-a', 'playing'))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    // Offline: A → B → C. Snapshot final = C.
    getSnapshot.mockResolvedValue(snap(13, 'vid-c', 'playing'))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-c', state: 'playing' }))
  })
})

describe('StationReconciler — SEEK (2.6)', () => {
  it('SEEK: snapshot com nova posição → reconcilia com positionSeconds', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'playing', 5))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing', positionSeconds: 5 })))

    getSnapshot.mockResolvedValue(snap(11, 'vid-1', 'playing', 30))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeVideoId: 'vid-1', state: 'playing', positionSeconds: 30 }))
  })

  it('SEEK paused: posição congelada repassada ao player', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'paused', 97))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledWith(expect.objectContaining({ positionSeconds: 97, state: 'paused' })))
  })

  it('SEEK duplicado (seq 20, 20) não reconcilia duas vezes', async () => {
    getSnapshot.mockResolvedValue(snap(20, 'vid-1', 'playing', 30))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 20 })
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenCalledTimes(1)
  })

  it('SEEK fora de ordem: posição mais nova vence (não volta)', async () => {
    getSnapshot.mockResolvedValue(snap(10, 'vid-1', 'playing', 5))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(12, 'vid-1', 'playing', 60))
    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 12 })
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))

    await triggerBroadcast({ workspace_id: 'ws-a', sequence: 11 })
    expect(reconcileStation).toHaveBeenCalledTimes(2)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ positionSeconds: 60 }))
  })

  it('SEEK race: snapshot antigo não sobrescreve posição nova', async () => {
    getSnapshot.mockResolvedValue(snap(41, 'vid-1', 'playing', 60))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(40, 'vid-1', 'playing', 10))
    await triggerStatus('SUBSCRIBED')
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))

    expect(reconcileStation).toHaveBeenCalledTimes(1)
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ positionSeconds: 60 }))
  })

  it('SEEK reconnect: recupera posição após offline', async () => {
    getSnapshot.mockResolvedValue(snap(20, 'vid-1', 'playing', 10))
    render(<StationReconciler />)
    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(1))

    getSnapshot.mockResolvedValue(snap(21, 'vid-1', 'playing', 45))
    await triggerStatus('SUBSCRIBED')

    await waitFor(() => expect(reconcileStation).toHaveBeenCalledTimes(2))
    expect(reconcileStation).toHaveBeenLastCalledWith(expect.objectContaining({ positionSeconds: 45, state: 'playing' }))
  })
})