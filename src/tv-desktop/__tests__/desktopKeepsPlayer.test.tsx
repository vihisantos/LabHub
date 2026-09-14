import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayShell } from '../DisplayShell'
import type { DeviceConfig } from '../config'

const realProviderSpy = vi.hoisted(() => vi.fn())

/* Guarda arquitetural (Fase 2.1): o TV Desktop é o ÚNICO lugar que mantém o
 * MusicPlayerProvider real. Se alguém removê-lo daqui, este teste falha. */
vi.mock('../../apps/tv/contexts/MusicPlayerContext', () => ({
  MusicPlayerProvider: ({ children }: { children: React.ReactNode }) => {
    realProviderSpy()
    return <div data-testid="real-music-player">{children}</div>
  },
  useMusicPlayer: () => ({
    currentTrack: null,
    isPlaying: false,
    shuffle: false,
    currentTrackIndex: 0,
    tracks: [],
    playOrder: [],
    togglePlay: vi.fn(),
    setPlaying: vi.fn(),
  }),
}))

vi.mock('../ScreenRenderer', () => ({
  ScreenRenderer: () => <div data-testid="screen-renderer-stub" />,
}))

const config = {
  deviceId: 'dev-9',
  name: 'TV Lab 2',
  workspace: { id: 'ws-1', name: 'Campus A' },
  createdAt: '2026-06-25T12:00:00Z',
  screenApp: 'tv',
} as unknown as DeviceConfig

describe('Guarda arquitetural — TV Desktop mantém o player real (Fase 2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('DisplayShell monta o MusicPlayerProvider real', () => {
    render(<DisplayShell config={config} onReconfigure={() => {}} />)

    expect(realProviderSpy).toHaveBeenCalled()
    expect(screen.getByTestId('real-music-player')).toBeInTheDocument()
    expect(screen.getByTestId('screen-renderer-stub')).toBeInTheDocument()
  })
})