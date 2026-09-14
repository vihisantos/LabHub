import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import type { TvMusicTrack } from '../types'
import { useAllMusicTracks } from '../hooks/useAllMusicTracks'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { isDesktopEnv, localStoreGet, localStoreSet } from '../../../lib/localStore'
import { workspaceStore } from '../../../core/workspaces/store'
import { reportStationTrackEnded, type StationChangedSignal, type StationReconcileInput } from '../services/stationService'
import { DEFAULT_PLAYER_SETTINGS, loadPlayerSettings, savePlayerSettings, type TvPlayerSettings } from '../services/playerSettings'

const STORAGE_KEY = 'tv-music-player'

interface SavedState {
  trackIndex: number
  shuffle: boolean
  playOrder: number[]
}

async function loadSaved(): Promise<SavedState | null> {
  try {
    const raw = await localStoreGet(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedState) : null
  } catch {
    return null
  }
}

async function saveToDisk(state: SavedState) {
  try {
    await localStoreSet(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota exceeded / IPC indisponível */
  }
}

function shuffleIndices(len: number): number[] {
  const a = Array.from({ length: len }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface MusicPlayerValue {
  tracks: TvMusicTrack[]
  currentTrack: TvMusicTrack | null
  isPlaying: boolean
  shuffle: boolean
  currentTrackIndex: number
  playOrder: number[]
  togglePlay: () => void
  setPlaying: (playing: boolean) => void
  /**
   * Reconcilia o player local com o estado persistente da estação (039).
   * Presente apenas no TV Desktop (player real). Alinha faixa atual + play/pause.
   */
  reconcileStation?: (input: StationReconcileInput) => void
  /** Volume local do player (0..100). Proprietário: TV Desktop. */
  volume: number
  /** Mudo local do player. Diferente de volume 0. */
  muted: boolean
  /** Define o volume local (0..100, normalizado). */
  setVolume: (volume: number) => void
  /** Define o estado de mute local. */
  setMuted: (muted: boolean) => void
  /** Alterna o mute local preservando o volume. */
  toggleMute: () => void
}

const MusicPlayerCtx = createContext<MusicPlayerValue | null>(null)

// eslint-disable-next-line react/only-export-components
export function useMusicPlayer(): MusicPlayerValue {
  const v = useContext(MusicPlayerCtx)
  if (!v) throw new Error('useMusicPlayer must be used within <MusicPlayerProvider>')
  return v
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { tracks: allTracks, shuffle: queueShuffle } = useAllMusicTracks()
  const playerRef = useRef<any>(null)
  const { broadcast } = useNowPlaying()
  const initialized = useRef(false)

  // Electron permite autoplay sem gesto: música começa desmutada e mais rápida
  const desktopEnv = isDesktopEnv()

  /* Pré-carrega o IFrame API do YouTube no mount (paralelo ao fetch das tracks) */
  useEffect(() => {
    const w = window as any
    if (w.YT && w.YT.Player) return
    if (document.getElementById('youtube-iframe-api')) return
    const tag = document.createElement('script')
    tag.id = 'youtube-iframe-api'
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }, [])

  const [currentTrackIdx, setCurrentTrackIdx] = useState(0)
  const [playOrder, setPlayOrder] = useState<number[]>([])
  const [isPlaying, setIsPlaying] = useState(true)
  /* STOP da estação: quando true, não há faixa atual e o player fica parado
   * (semântica distinta de pausa, que mantém a faixa congelada). */
  const [stopped, setStopped] = useState(false)

  /* Volume/mute LOCAL do player (Fase 2.8 — proprietário: TV Desktop).
   * Não é estado da estação: não passa por RPC/Supabase/broadcast. */
  const [volume, setVolumeState] = useState<number>(DEFAULT_PLAYER_SETTINGS.volume)
  const [muted, setMutedState] = useState<boolean>(DEFAULT_PLAYER_SETTINGS.muted)
  const volumeRef = useRef(volume)
  const mutedRef = useRef(muted)
  useEffect(() => { volumeRef.current = volume }, [volume])
  useEffect(() => { mutedRef.current = muted }, [muted])

  /* Contador de montagens do YouTube player (onReady) p/ reaplicar settings. */
  const [playerTick, setPlayerTick] = useState(0)

  /* Restaura a configuração local persistida (após mount). */
  useEffect(() => {
    let active = true
    void loadPlayerSettings().then((settings) => {
      if (!active) return
      setVolumeState(settings.volume)
      setMutedState(settings.muted)
    })
    return () => { active = false }
  }, [])

  /* Persistência local (debounce 300ms p/ não gravar a cada pixel do slider). */
  useEffect(() => {
    const settings: TvPlayerSettings = { volume, muted }
    const timer = setTimeout(() => { void savePlayerSettings(settings) }, 300)
    return () => clearTimeout(timer)
  }, [volume, muted])

  /* Aplica volume/mute salvos no player real (e reaplica a cada onReady). */
  const applyPlayerSettings = useCallback(
    (player: { setVolume?: (v: number) => void; mute?: () => void; unMute?: () => void } | null) => {
      if (!player) return
      if (typeof player.setVolume === 'function') player.setVolume(volumeRef.current)
      if (mutedRef.current) {
        if (typeof player.mute === 'function') player.mute()
      } else if (desktopEnv && typeof player.unMute === 'function') {
        player.unMute()
      }
    },
    [desktopEnv],
  )

  useEffect(() => {
    applyPlayerSettings(playerRef.current)
  }, [applyPlayerSettings, volume, muted, playerTick])

  /* Setters LOCAIS: normalizam entrada de UX; não tocam em estação/RPC. */
  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return
    setVolumeState(Math.min(100, Math.max(0, value)))
  }, [])

  const setMuted = useCallback((value: boolean) => {
    setMutedState(!!value)
  }, [])

  const toggleMute = useCallback(() => {
    setMutedState((m) => !m)
  }, [])

  /* One-time init from storage when tracks arrive */
  useEffect(() => {
    if (allTracks.length === 0 || initialized.current) return
    initialized.current = true

    let active = true
    loadSaved().then((saved) => {
      if (!active) return
      const len = allTracks.length

      if (saved && saved.playOrder.length === len) {
        const idx = Math.min(saved.trackIndex, len - 1)
        setCurrentTrackIdx(idx)
        setPlayOrder(saved.playOrder)
      } else {
        setPlayOrder(queueShuffle ? shuffleIndices(len) : allTracks.map((_, i) => i))
        setCurrentTrackIdx(0)
      }
    })
    return () => {
      active = false
    }
  }, [allTracks.length, queueShuffle])

  /* Persist state on change */
  useEffect(() => {
    if (playOrder.length > 0) {
      void saveToDisk({ trackIndex: currentTrackIdx, shuffle: queueShuffle, playOrder })
    }
  }, [currentTrackIdx, queueShuffle, playOrder])

  /* Derive current track from state */
  const currentPlayIndex = playOrder[currentTrackIdx]
  const playlistTrack = currentPlayIndex !== undefined ? allTracks[currentPlayIndex] : null
  /* STOP (estação): sem faixa atual; pausa e playlist preservam o seletor. */
  const currentTrack = stopped ? null : playlistTrack

  /* Broadcast now-playing to Supabase channel (used by other tabs) */
  useEffect(() => {
    if (currentTrack) {
      broadcast({
        trackTitle: currentTrack.title,
        isPlaying,
        trackPosition: `${currentTrackIdx + 1}/${allTracks.length}`,
        shuffle: queueShuffle,
      })
    } else {
      broadcast({ trackTitle: '', isPlaying: false, trackPosition: '', shuffle: false })
    }
  }, [currentTrack?.id, currentTrack?.title, isPlaying, currentTrackIdx, allTracks.length, queueShuffle, broadcast])

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p)
  }, [])

  const setPlaying = useCallback((playing: boolean) => {
    setIsPlaying(playing)
  }, [])

  /**
   * Alinha o player local com o estado da estação: troca a faixa atual (por
   * youtube_video_id) e ajusta play/pause. Entrada vinda do `StationReconciler`.
   */
  const reconcileStation = useCallback(
    (input: StationReconcileInput) => {
      // STOP: interrompe e limpa a faixa atual (state='stopped' => sem current).
      if (input.state === 'stopped') {
        setStopped(true)
        setIsPlaying(false)
        return
      }

      // Fora de STOP: libera a faixa bloqueada e alinha faixa + play/pause.
      setStopped(false)
      if (input.youtubeVideoId) {
        const idx = allTracks.findIndex((t) => t.youtube_video_id === input.youtubeVideoId)
        if (idx >= 0) {
          const orderIdx = playOrder.indexOf(idx)
          if (orderIdx >= 0) {
            setCurrentTrackIdx(orderIdx)
          }
        }
      }
      if (input.state === 'playing') setIsPlaying(true)
      else if (input.state === 'paused') setIsPlaying(false)

      // SEEK: aplica a posição autoritativa (segundos) no player real.
      const player = playerRef.current
      if (typeof input.positionSeconds === 'number' && player && typeof player.seekTo === 'function') {
        player.seekTo(input.positionSeconds, true)
      }
    },
    [allTracks, playOrder],
  )

  /**
   * Fim de faixa (Fase 2.14): o Desktop NÃO calcula a próxima faixa. O fim
   * vira um SINAL para o servidor (station_auto_advance), que decide e aplica
   * a transição; aqui só re-aplicamos o resultado no player local e, se a
   * transição aconteceu, re-emitimos o sinal para os demais Desktops.
   */
  const handleTrackEnded = useCallback(() => {
    reportStationTrackEnded()
      .then((outcome) => {
        if ((outcome.status === 'applied' || outcome.status === 'replayed') && outcome.newVideoId) {
          reconcileStation({
            youtubeVideoId: outcome.newVideoId,
            state: 'playing',
            positionSeconds: 0,
          })
          window.dispatchEvent(
            new CustomEvent<StationChangedSignal>('tv-station-auto-advance-signal', {
              detail: {
                op: 'station_changed',
                workspace_id: workspaceStore.activeWorkspaceId ?? '',
                request_id: `auto-advance:${Date.now()}:${currentTrack?.youtube_video_id ?? ''}`,
                sequence: outcome.result?.state_sequence ?? 0,
              },
            }),
          )
        }
      })
      .catch((err) => {
        // Falha de rede/sessão: permanece parado; o backstop (≤5 min) cobre.
        console.warn('[Music] não foi possível reportar o fim da faixa:', err)
      })
  }, [reconcileStation, currentTrack?.youtube_video_id])

  /* Sync isPlaying to YouTube player */
  useEffect(() => {
    const p = playerRef.current
    if (!p || !p.playVideo) return
    if (isPlaying) {
      p.playVideo()
    } else {
      p.pauseVideo()
    }
  }, [isPlaying, currentTrack?.youtube_video_id])

  const opts: YouTubeProps['opts'] = {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: isPlaying ? 1 : 0,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 0,
      // Electron libera autoplay desmutado; no browser começa mudo até state=1
      mute: desktopEnv ? 0 : 1,
      // origin só em https (web): em http://127.0.0.1 (desktop) causa
      // "postMessage target origin mismatch" e o player trava no unstarted
      ...(window.location.protocol === 'https:' ? { origin: window.location.origin } : {}),
    },
  }

  return (
      <MusicPlayerCtx.Provider
        value={{
          tracks: allTracks,
          currentTrack,
          isPlaying,
          shuffle: queueShuffle,
          currentTrackIndex: currentTrackIdx,
          playOrder,
          togglePlay,
          setPlaying,
          reconcileStation,
          volume,
          muted,
          setVolume,
          setMuted,
          toggleMute,
        }}
      >
      {currentTrack && (
        <div style={{
          position: 'fixed', bottom: '0', right: '0',
          width: '1px', height: '1px', overflow: 'hidden',
          opacity: 0.01, pointerEvents: 'none', zIndex: 0,
        }}>
          <YouTube
            videoId={currentTrack.youtube_video_id}
            opts={opts}
            onReady={(e) => {
              playerRef.current = e.target
              setPlayerTick((t) => t + 1)
              // Autoplay sem gesto: browser começa mudo até o 1º play (desbloqueio);
              // Electron já inicia desmutado. O volume/mute persistido é aplicado
              // pelo efeito em [volume, muted, playerTick] (Fase 2.8).
              if (!desktopEnv) e.target.mute()
              if (isPlaying) {
                e.target.playVideo()
              } else {
                e.target.pauseVideo()
              }
            }}
            onStateChange={(e) => {
              if (e.data === 1) {
                console.log('[Music] tocando:', currentTrack?.title)
                // Desbloqueio de autoplay: só desmuta se o USUÁRIO não silenciou.
                if (e.target.isMuted() && isPlaying && !mutedRef.current) e.target.unMute()
              }
            }}
            onError={(e) => {
              console.error('[Music] erro no player (YouTube), code:', e.data, '- track:', currentTrack?.title)
            }}
            onEnd={handleTrackEnded}
          />
        </div>
      )}
      {children}
    </MusicPlayerCtx.Provider>
  )
}
