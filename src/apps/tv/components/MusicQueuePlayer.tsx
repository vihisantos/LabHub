import { useState, useEffect, useRef } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { Music } from 'lucide-react'
import { useNowPlaying } from '../hooks/useNowPlaying'
import type { TvMusicTrack } from '../types'

const THUMB_BASE = 'https://img.youtube.com/vi/'
const THUMB_SIZE = 'mqdefault.jpg' // 320×180, boa qualidade

interface MusicQueuePlayerProps {
  tracks: TvMusicTrack[]
  shuffle: boolean
  isPlaying: boolean
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function MusicQueuePlayer({ tracks, shuffle, isPlaying }: MusicQueuePlayerProps) {
  const playerRef = useRef<any>(null)
  const wasPlayingRef = useRef(false)
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0)
  const [playOrder, setPlayOrder] = useState<number[]>(() =>
    tracks.map((_, i) => i)
  )
  const { broadcast } = useNowPlaying()

  const currentPlayIndex = playOrder[currentTrackIdx]
  const currentTrack = tracks[currentPlayIndex]

  /* Broadcast current track info to admin in real-time */
  useEffect(() => {
    if (currentTrack) {
      broadcast({
        trackTitle: currentTrack.title,
        isPlaying,
        trackPosition: `${currentTrackIdx + 1}/${tracks.length}`,
        shuffle,
      })
    } else {
      /* No track available — notify admin music stopped */
      broadcast({
        trackTitle: '',
        isPlaying: false,
        trackPosition: '',
        shuffle: false,
      })
    }
  }, [currentTrack?.id, currentTrack?.title, isPlaying, currentTrackIdx, tracks.length, shuffle, broadcast])

  /* Reset play order when tracks or shuffle mode changes */
  useEffect(() => {
    const indices = tracks.map((_, i) => i)
    setPlayOrder(shuffle ? shuffleArray(indices) : indices)
    setCurrentTrackIdx(0)
  }, [tracks.length, shuffle])

  /* Sync isPlaying prop to YouTube player */
  useEffect(() => {
    if (!playerRef.current) return
    if (isPlaying === wasPlayingRef.current) return
    wasPlayingRef.current = isPlaying
    if (isPlaying) {
      playerRef.current.playVideo()
    } else {
      playerRef.current.pauseVideo()
    }
  }, [isPlaying])

  if (tracks.length === 0 || !currentTrack) return null

  const advance = () => {
    if (currentTrackIdx < playOrder.length - 1) {
      setCurrentTrackIdx((i) => i + 1)
    } else {
      /* End of queue: reshuffle or restart */
      if (shuffle) {
        setPlayOrder(shuffleArray(tracks.map((_, i) => i)))
      }
      setCurrentTrackIdx(0)
    }
  }

  const opts: YouTubeProps['opts'] = {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 0,
      origin: window.location.origin,
    },
  }

  return (
    <>
      {/* Hidden player (opacity + off-screen p/ não cortar o áudio) */}
      <div style={{
        position: 'absolute', top: '-9999px', left: '-9999px',
        width: '1px', height: '1px', overflow: 'hidden',
        opacity: 0, pointerEvents: 'none',
      }}>
        <YouTube
          videoId={currentTrack.youtube_video_id}
          opts={opts}
          onReady={(e) => {
            playerRef.current = e.target
            if (isPlaying) e.target.playVideo()
          }}
          onEnd={advance}
        />
      </div>

      {/* Now playing overlay */}
      <div style={{
        position: 'fixed', bottom: '2rem', right: '3rem', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 14px 8px 8px',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(16px)',
        borderRadius: '9999px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}>
        {/* Thumbnail */}
        <img
          key={currentTrack.youtube_video_id}
          src={`${THUMB_BASE}${currentTrack.youtube_video_id}/${THUMB_SIZE}`}
          alt={currentTrack.title}
          style={{
            width: '44px', height: '44px', borderRadius: '10px',
            objectFit: 'cover', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          onError={(e) => {
            /* Fallback: replace with gradient placeholder */
            const target = e.currentTarget
            target.style.display = 'none'
            const fallback = target.nextElementSibling as HTMLElement | null
            if (fallback) fallback.style.display = 'flex'
          }}
        />
        {/* Fallback placeholder (hidden by default) */}
        <div style={{
          display: 'none',
          width: '36px', height: '36px', borderRadius: '9999px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          alignItems: 'center', justifyContent: 'center',
          animation: 'spin 6s linear infinite',
          flexShrink: 0,
        }}>
          <Music size={14} color="#fff" />
        </div>

        <div style={{ maxWidth: '160px', overflow: 'hidden' }}>
          <div style={{
            fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {currentTrack.title}
          </div>
          <div style={{
            fontSize: '0.65rem', color: '#94a3b8',
          }}>
            {shuffle ? 'Aleatório' : 'Sequencial'} · {currentTrackIdx + 1}/{tracks.length}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '20px' }}>
          {[10, 16, 8, 20, 12, 6, 22].map((h, i) => (
            <div
              key={i}
              style={{
                width: '3px', height: `${h}px`, borderRadius: '2px',
                background: '#6366f1',
                animation: 'equalizer 0.5s ease-in-out infinite alternate',
                animationDelay: `${i * 0.07}s`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
