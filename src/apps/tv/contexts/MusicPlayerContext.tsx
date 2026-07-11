import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import type { TvMusicTrack } from '../types'
import { useAllMusicTracks } from '../hooks/useAllMusicTracks'
import { useNowPlaying } from '../hooks/useNowPlaying'

const STORAGE_KEY = 'tv-music-player'

interface SavedState {
  trackIndex: number
  shuffle: boolean
  playOrder: number[]
}

function loadSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedState) : null
  } catch {
    return null
  }
}

function saveToDisk(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota exceeded */
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

  const [currentTrackIdx, setCurrentTrackIdx] = useState(0)
  const [playOrder, setPlayOrder] = useState<number[]>([])
  const [isPlaying, setIsPlaying] = useState(true)

  /* One-time init from localStorage when tracks arrive */
  useEffect(() => {
    if (allTracks.length === 0 || initialized.current) return
    initialized.current = true

    const saved = loadSaved()
    const len = allTracks.length

    if (saved && saved.playOrder.length === len) {
      const idx = Math.min(saved.trackIndex, len - 1)
      setCurrentTrackIdx(idx)
      setPlayOrder(saved.playOrder)
    } else {
      setPlayOrder(queueShuffle ? shuffleIndices(len) : allTracks.map((_, i) => i))
      setCurrentTrackIdx(0)
    }
  }, [allTracks.length, queueShuffle])

  /* Persist state on change */
  useEffect(() => {
    if (playOrder.length > 0) {
      saveToDisk({ trackIndex: currentTrackIdx, shuffle: queueShuffle, playOrder })
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
      mute: 1,
      origin: window.location.origin,
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
              e.target.mute()
              if (isPlaying) {
                e.target.playVideo()
              } else {
                e.target.pauseVideo()
              }
            }}
            onStateChange={(e) => {
              // Unmute only when actually playing (state=1)
              if (e.data === 1 && e.target.isMuted() && isPlaying) {
                e.target.unMute()
              }
            }}
            onEnd={advance}
          />
        </div>
      )}
      {children}
    </MusicPlayerCtx.Provider>
  )
}
