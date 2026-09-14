import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

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
  return { players, createPlayer }
})

vi.mock('react-youtube', async () => {
  const { useEffect, useRef, createElement } = await import('react')
  return {
    default: function YouTubeMock(props: { videoId?: string; onReady?: (e: { target: unknown }) => void }) {
      const playerRef = useRef<any>(null)
      const lastVideo = useRef<string | null>(null)
      if (playerRef.current === null || lastVideo.current !== props.videoId) {
        playerRef.current = yt.createPlayer()
        lastVideo.current = props.videoId ?? null
      }
      useEffect(() => {
        props.onReady?.({ target: playerRef.current })
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

import { MusicPlayerProvider, useMusicPlayer } from '../MusicPlayerContext'
import { PlayerVolumeControls } from '../../../../tv-desktop/PlayerVolumeControls'
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_KEY,
} from '../../services/playerSettings'

function Harness() {
  const { volume, muted, setVolume, setMuted, toggleMute, reconcileStation } = useMusicPlayer()
  return (
    <div>
      <span data-testid="volume-out">{volume}</span>
      <span data-testid="muted-out">{String(muted)}</span>
      <button data-testid="setvol" onClick={() => setVolume(50)}>v50</button>
      <button data-testid="setvol30" onClick={() => setVolume(30)}>v30</button>
      <button data-testid="setvol0" onClick={() => setVolume(0)}>v0</button>
      <button data-testid="mute" onClick={() => setMuted(true)}>mute</button>
      <button data-testid="unmute" onClick={() => setMuted(false)}>unmute</button>
      <button data-testid="togglemute" onClick={toggleMute}>toggle</button>
      {typeof reconcileStation === 'function' && (
        <button
          data-testid="reconcile-b"
          onClick={() => reconcileStation({ youtubeVideoId: 'vid-b', state: 'playing', positionSeconds: 0 })}
        >
          rb
        </button>
      )}
    </div>
  )
}

function renderProvider(children: ReactNode = <Harness />) {
  return render(<MusicPlayerProvider>{children}</MusicPlayerProvider>)
}

function seedSettings(settings: unknown) {
  localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings))
}

async function waitFirstPlayerApplied(volume: number) {
  return waitFor(() => expect(yt.players[0].setVolume).toHaveBeenCalledWith(volume))
}

describe('MusicPlayerContext — Volume/Mute LOCAL (Fase 2.8)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    yt.players.length = 0
  })

  it('defaults (sem configuração): volume 100, muted false, aplicado no player', async () => {
    renderProvider()
    expect(screen.getByTestId('volume-out')).toHaveTextContent(String(DEFAULT_PLAYER_SETTINGS.volume))
    expect(screen.getByTestId('muted-out')).toHaveTextContent('false')
    await waitFirstPlayerApplied(100)
    await waitFor(() => expect(yt.players[0].unMute).toHaveBeenCalled())
  })

  it('setVolume(50): atualiza estado local e persiste na chave dedicada', async () => {
    renderProvider()
    await waitFirstPlayerApplied(100)
    fireEvent.click(screen.getByTestId('setvol'))
    expect(screen.getByTestId('volume-out')).toHaveTextContent('50')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('false')
    await waitFor(() => expect(yt.players[0].setVolume).toHaveBeenLastCalledWith(50))
    await waitFor(() =>
      expect(localStorage.getItem(PLAYER_SETTINGS_KEY)).toBe(JSON.stringify({ volume: 50, muted: false })),
    )
  })

  it('setMuted(true): chama mute() no player e persiste', async () => {
    renderProvider()
    await waitFirstPlayerApplied(100)
    fireEvent.click(screen.getByTestId('mute'))
    expect(screen.getByTestId('muted-out')).toHaveTextContent('true')
    await waitFor(() => expect(yt.players[0].mute).toHaveBeenCalled())
    await waitFor(() =>
      expect(localStorage.getItem(PLAYER_SETTINGS_KEY)).toBe(JSON.stringify({ volume: 100, muted: true })),
    )
  })

  it('load: configuração salva {volume:40, muted:true} é restaurada e aplicada no onReady', async () => {
    seedSettings({ volume: 40, muted: true })
    renderProvider()
    await waitFirstPlayerApplied(40)
    await waitFor(() => expect(yt.players[0].mute).toHaveBeenCalled())
    expect(yt.players[0].unMute).not.toHaveBeenCalled()
    expect(screen.getByTestId('volume-out')).toHaveTextContent('40')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('true')
  })

  it('load: dados inválidos caem nos defaults (vol -1, muted "true")', async () => {
    seedSettings({ volume: -1, muted: 'true' })
    renderProvider()
    await waitFirstPlayerApplied(100)
    await waitFor(() => expect(yt.players[0].unMute).toHaveBeenCalled())
    expect(yt.players[0].mute).not.toHaveBeenCalled()
    expect(screen.getByTestId('volume-out')).toHaveTextContent('100')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('false')
  })

  it('troca de faixa (reconcileStation → vid-b) preserva volume/mute e reaplica no novo player', async () => {
    seedSettings({ volume: 40, muted: true })
    renderProvider()
    await waitFirstPlayerApplied(40)
    await waitFor(() => expect(screen.getByTestId('volume-out')).toHaveTextContent('40'))

    fireEvent.click(screen.getByTestId('reconcile-b'))

    await waitFor(() => expect(yt.players.length).toBe(2))
    await waitFor(() => expect(yt.players[1].setVolume).toHaveBeenCalledWith(40))
    await waitFor(() => expect(yt.players[1].mute).toHaveBeenCalled())
    expect(screen.getByTestId('volume-out')).toHaveTextContent('40')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('true')
  })

  it('mute → unmute preserva o volume (não vira 100)', async () => {
    seedSettings({ volume: 40, muted: false })
    renderProvider()
    await waitFirstPlayerApplied(40)

    fireEvent.click(screen.getByTestId('togglemute'))
    expect(screen.getByTestId('muted-out')).toHaveTextContent('true')
    await waitFor(() => expect(yt.players[0].mute).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('togglemute'))
    expect(screen.getByTestId('muted-out')).toHaveTextContent('false')
    await waitFor(() => expect(yt.players[0].unMute).toHaveBeenCalled())

    expect(screen.getByTestId('volume-out')).toHaveTextContent('40')
    const volumes = yt.players[0].setVolume.mock.calls.map((c: number[]) => c[0])
    expect(volumes).not.toContain(100)
    await waitFor(() =>
      expect(localStorage.getItem(PLAYER_SETTINGS_KEY)).toBe(JSON.stringify({ volume: 40, muted: false })),
    )
  })

  it('volume 0 NÃO vira mudo', async () => {
    renderProvider()
    await waitFirstPlayerApplied(100)
    fireEvent.click(screen.getByTestId('setvol0'))
    expect(screen.getByTestId('volume-out')).toHaveTextContent('0')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('false')
    await waitFor(() => expect(yt.players[0].setVolume).toHaveBeenLastCalledWith(0))
    expect(yt.players[0].mute).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(localStorage.getItem(PLAYER_SETTINGS_KEY)).toBe(JSON.stringify({ volume: 0, muted: false })),
    )
  })

  it('reconcileStation não altera volume/mute', async () => {
    seedSettings({ volume: 65, muted: true })
    renderProvider()
    await waitFirstPlayerApplied(65)

    fireEvent.click(screen.getByTestId('reconcile-b'))
    await waitFor(() => expect(yt.players.length).toBe(2))

    expect(screen.getByTestId('volume-out')).toHaveTextContent('65')
    expect(screen.getByTestId('muted-out')).toHaveTextContent('true')
  })

  it('multi-instância: players com volumes diferentes não compartilham estado React', async () => {
    function A() {
      const { volume, setVolume } = useMusicPlayer()
      return (
        <div>
          <span data-testid="vol-a">{volume}</span>
          <button onClick={() => setVolume(20)}>a20</button>
        </div>
      )
    }
    function B() {
      const { volume, setVolume } = useMusicPlayer()
      return (
        <div>
          <span data-testid="vol-b">{volume}</span>
          <button onClick={() => setVolume(70)}>b70</button>
        </div>
      )
    }
    render(
      <div>
        <MusicPlayerProvider><A /></MusicPlayerProvider>
        <MusicPlayerProvider><B /></MusicPlayerProvider>
      </div>,
    )

    fireEvent.click(screen.getByText('a20'))
    fireEvent.click(screen.getByText('b70'))

    expect(screen.getByTestId('vol-a')).toHaveTextContent('20')
    expect(screen.getByTestId('vol-b')).toHaveTextContent('70')
  })
})

describe('PlayerVolumeControls — UI Desktop do volume/mute', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    yt.players.length = 0
  })

  it('renderiza slider acessível + botão mute (aria-pressed)', async () => {
    render(
      <MusicPlayerProvider>
        <PlayerVolumeControls />
      </MusicPlayerProvider>,
    )
    const slider = await screen.findByRole('slider', { name: /volume/i })
    expect(slider).toHaveValue('100')
    const muteBtn = screen.getByRole('button', { name: /silenciar/i })
    expect(muteBtn).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('slider muda o volume e botão mute alterna o estado', async () => {
    render(
      <MusicPlayerProvider>
        <PlayerVolumeControls />
      </MusicPlayerProvider>,
    )
    const slider = await screen.findByRole('slider', { name: /volume/i })
    fireEvent.change(slider, { target: { value: '30' } })
    expect(slider).toHaveValue('30')
    expect(screen.getByText('30%')).toBeInTheDocument()

    const muteBtn = screen.getByRole('button', { name: /silenciar/i })
    fireEvent.click(muteBtn)
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Mudo')).toBeInTheDocument()
    expect(muteBtn).toHaveAttribute('aria-label', 'Ativar som')
  })
})