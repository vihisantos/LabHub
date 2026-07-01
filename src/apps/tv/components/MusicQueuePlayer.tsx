import { useState, useEffect, useRef } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { Music } from 'lucide-react'
import type { TvMusicTrack } from '../types'

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

  const currentPlayIndex = playOrder[currentTrackIdx]
  const currentTrack = tracks[currentPlayIndex]

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
      {/* Hidden player */}
      <div style={{ display: 'none' }}>
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
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        borderRadius: '9999px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
