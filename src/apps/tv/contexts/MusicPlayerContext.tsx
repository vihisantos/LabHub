import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import type { TvMusicTrack } from '../types'
import { useAllMusicTracks } from '../hooks/useAllMusicTracks'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { isDesktopEnv, localStoreGet, localStoreSet } from '../../../lib/localStore'

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
  next: () => void
  prev: () => void
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
  const currentTrack = currentPlayIndex !== undefined ? allTracks[currentPlayIndex] : null

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

  const advance = useCallback(() => {
    setCurrentTrackIdx((i) => {
      if (i < playOrder.length - 1) return i + 1
      if (queueShuffle) {
        setPlayOrder(shuffleIndices(allTracks.length))
      }
      return 0
    })
  }, [playOrder.length, queueShuffle, allTracks.length])

  const goBack = useCallback(() => {
    setCurrentTrackIdx((i) => (i > 0 ? i - 1 : playOrder.length - 1))
  }, [playOrder.length])

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p)
  }, [])

  const setPlaying = useCallback((playing: boolean) => {
    setIsPlaying(playing)
  }, [])

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
        next: advance,
        prev: goBack,
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
                if (e.target.isMuted() && isPlaying) e.target.unMute()
              }
            }}
            onError={(e) => {
              console.error('[Music] erro no player (YouTube), code:', e.data, '- track:', currentTrack?.title)
            }}
            onEnd={() => {
              advance()
            }}
          />
        </div>
      )}
      {children}
    </MusicPlayerCtx.Provider>
  )
}
