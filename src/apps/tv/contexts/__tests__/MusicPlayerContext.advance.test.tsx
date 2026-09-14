import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

/* Guarda da Fase 2.14: o Desktop NÃO calcula mais a próxima faixa. onEnd vira
 * um SINAL para o servidor (reportStationTrackEnded); se o servidor aplicou/
 * re-aplicou (applied/replayed), o player reconcilia o resultado e re-emite o
 * sinal (CustomEvent tv-station-auto-advance-signal) para os demais Desktops.
 * Erros de rede não corrompem o player (backstop de até 5 min cobre). */

const constants = vi.hoisted(() => ({
  REPORT_SIGNAL: 'tv-station-auto-advance-signal',
  WS_ID: 'ws-test',
  TRACK_A_ID: 'snap-track-a',
}))

const { REPORT_SIGNAL, WS_ID, TRACK_A_ID } = constants

const reporting = vi.hoisted(() => vi.fn())

const yt = vi.hoisted(() => {
  const players: Array<{
    setVolume: ReturnType<typeof vi.fn>
    mute: ReturnType<typeof vi.fn>
    unMute: ReturnType<typeof vi.fn>
    playVideo: ReturnType<typeof vi.fn>
    pauseVideo: ReturnType<typeof vi.fn>
    seekTo: ReturnType<typeof vi.fn>
    isMuted: ReturnType<typeof vi.fn>
  }> = []
  let endHandler: (() => void) | null = null
  function createPlayer() {
    const player = {
      setVolume: vi.fn(),
      mute: vi.fn(),
      unMute: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      isMuted: vi.fn(() => false),
    }
    players.push(player)
    return player
  }
  function setEndHandler(fn: (() => void) | null) {
    endHandler = fn
  }
  function fireEnd() {
    endHandler?.()
  }
  return { players, setEndHandler, fireEnd, createPlayer }
})

vi.mock('react-youtube', async () => {
  const { useEffect, useRef, createElement } = await import('react')
  return {
    default: function YouTubeMock(props: {
      videoId?: string
      onReady?: (e: { target: unknown }) => void
      onEnd?: () => void
    }) {
      const playerRef = useRef<any>(null)
      const lastVideo = useRef<string | null>(null)
      if (playerRef.current === null || lastVideo.current !== props.videoId) {
        playerRef.current = yt.createPlayer()
        lastVideo.current = props.videoId ?? null
      }
      useEffect(() => {
        props.onReady?.({ target: playerRef.current })
        yt.setEndHandler(props.onEnd ?? null)
      }, [props.videoId])
      return createElement('div', { 'data-testid': 'yt-mock', 'data-video': props.videoId })
    },
  }
})

vi.mock('../../hooks/useAllMusicTracks', () => ({
  useAllMusicTracks: () => ({
    tracks: [
      { id: 't-a', queue_id: 'q', youtube_video_id: 'vid-a', title: 'Faixa A', duration_seconds: 180, position: 0, created_at: '2026-01-01T00:00:00Z' },
      { id: 't-b', queue_id: 'q', youtube_video_id: 'vid-b', title: 'Faixa B', duration_seconds: 180, position: 1, created_at: '2026-01-01T00:00:00Z' },
    ],
    shuffle: false,
    loading: false,
  }),
}))

vi.mock('../../hooks/useNowPlaying', () => ({
  useNowPlaying: () => ({ nowPlaying: null, broadcast: vi.fn() }),
}))

vi.mock('../../../../lib/useRealtimeBroadcast', () => ({
  useRealtimeBroadcast: () => ({ send: vi.fn(), broadcast: vi.fn() }),
}))

vi.mock('../../../../lib/localStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/localStore')>()
  return { ...actual, isDesktopEnv: () => true }
})

vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: constants.WS_ID },
}))

vi.mock('../../services/stationService', () => ({
  reportStationTrackEnded: reporting,
}))

import { MusicPlayerProvider, useMusicPlayer } from '../MusicPlayerContext'

interface MutableRefLike<T> { ctx: T | null }
const capturedRef: MutableRefLike<ReturnType<typeof useMusicPlayer>> = { ctx: null }
function CaptureHarness() {
  const ctx = useMusicPlayer()
  useEffect(() => {
    capturedRef.ctx = ctx
  }, [ctx])
  return (
    <div>
      <span data-testid="title-out">{ctx.currentTrack?.title ?? 'none'}</span>
    </div>
  )
}

function renderProvider(children: ReactNode = <CaptureHarness />) {
  return render(<MusicPlayerProvider>{children}</MusicPlayerProvider>)
}

async function waitTrackPlaying(title: string, playerCount: number) {
  await waitFor(() => expect(screen.getByTestId('title-out')).toHaveTextContent(title))
  await waitFor(() => expect(yt.players.length).toBe(playerCount))
}

describe('MusicPlayerContext — Fase 2.14: onEnd reporta ao servidor, NÃO avança local', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    yt.players.length = 0
    capturedRef.ctx = null
    reporting.mockReset()
    reporting.mockResolvedValue({ status: 'no_op', reason: 'NOT_ELAPSED' })
  })

  it('next/prev foram removidos do contexto', async () => {
    renderProvider()
    await waitTrackPlaying('Faixa A', 1)
    const ctx = capturedRef.ctx as Record<string, unknown> | null
    expect(ctx?.next).toBeUndefined()
    expect(ctx?.prev).toBeUndefined()
  })

  it('fim da música (onEnd) NÃO avança faixa localmente (no_op)', async () => {
    reporting.mockResolvedValue({ status: 'no_op', reason: 'NOT_ELAPSED' })
    renderProvider()
    await waitTrackPlaying('Faixa A', 1)

    act(() => { yt.fireEnd() })

    // Permanece na Faixa A: sem advance local.
    await waitFor(() => expect(screen.getByTestId('title-out')).toHaveTextContent('Faixa A'))
    expect(yt.players.length).toBe(1)
    expect(reporting).toHaveBeenCalledTimes(1)
  })

  it('applied com newVideoId → reconcilia o player para a Faixa B', async () => {
    reporting.mockResolvedValue({
      status: 'applied',
      newVideoId: 'vid-b',
      result: { state_sequence: 7, current_snapshot_track_id: TRACK_A_ID },
    })
    renderProvider()
    await waitTrackPlaying('Faixa A', 1)

    act(() => { yt.fireEnd() })

    await waitTrackPlaying('Faixa B', 2)
    expect(reporting).toHaveBeenCalledTimes(1)
  })

  it('replayed (outro device já aplicou) também reconcilia', async () => {
    reporting.mockResolvedValue({
      status: 'replayed',
      newVideoId: 'vid-b',
      result: { state_sequence: 7, current_snapshot_track_id: TRACK_A_ID },
    })
    renderProvider()
    await waitTrackPlaying('Faixa A', 1)

    act(() => { yt.fireEnd() })

    await waitTrackPlaying('Faixa B', 2)
    expect(reporting).toHaveBeenCalledTimes(1)
  })

  it('falha de rede no report: permanece na faixa atual (backstop cobre)', async () => {
    reporting.mockRejectedValue(new Error('network'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderProvider()
    await waitTrackPlaying('Faixa A', 1)

    act(() => { yt.fireEnd() })

    await waitFor(() => expect(warnSpy).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('title-out')).toHaveTextContent('Faixa A'))
    expect(yt.players.length).toBe(1)
    warnSpy.mockRestore()
  })

  it('dispatch do CustomEvent com sinal pós-applied', async () => {
    reporting.mockResolvedValue({
      status: 'applied',
      newVideoId: 'vid-b',
      result: { state_sequence: 7, current_snapshot_track_id: TRACK_A_ID },
    })
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
    renderProvider()
    await waitTrackPlaying('Faixa A', 1)

    act(() => { yt.fireEnd() })

    await waitFor(() => expect(spy).toHaveBeenCalled())
    const event = spy.mock.calls.find((c) => (c[0] as any)?.type === REPORT_SIGNAL)
    expect(event).toBeTruthy()
    const detail = (event![0] as CustomEvent).detail
    expect(detail.op).toBe('station_changed')
    expect(detail.workspace_id).toBe(WS_ID)
    expect(detail.sequence).toBe(7)
    spy.mockRestore()
  })
})