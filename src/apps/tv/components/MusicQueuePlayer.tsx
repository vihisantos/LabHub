import { useState, useEffect, useRef, useCallback } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { Music } from 'lucide-react'
import { useNowPlaying } from '../hooks/useNowPlaying'
import type { TvMusicTrack } from '../types'

const THUMB_BASE = 'https://img.youtube.com/vi/'
const THUMB_SIZE = 'mqdefault.jpg'

interface MusicQueuePlayerProps {
  tracks: TvMusicTrack[]
  shuffle: boolean
  isPlaying: boolean
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function MusicQueuePlayer({ tracks, shuffle, isPlaying }: MusicQueuePlayerProps) {
  const playerRef = useRef<any>(null)
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0)
  const [playOrder, setPlayOrder] = useState<number[]>(() =>
    tracks.map((_, i) => i)
  )
  const { broadcast } = useNowPlaying()

  const currentPlayIndex = playOrder[currentTrackIdx]
  const currentTrack = tracks[currentPlayIndex]

  /* Broadcast track info */
  useEffect(() => {
    if (currentTrack) {
      broadcast({ trackTitle: currentTrack.title, isPlaying, trackPosition: `${currentTrackIdx + 1}/${tracks.length}`, shuffle })
    } else {
      broadcast({ trackTitle: '', isPlaying: false, trackPosition: '', shuffle: false })
    }
  }, [currentTrack?.id, currentTrack?.title, isPlaying, currentTrackIdx, tracks.length, shuffle, broadcast])

  /* Reset play order on tracks/shuffle change */
  useEffect(() => {
    const indices = tracks.map((_, i) => i)
    setPlayOrder(shuffle ? shuffleArray(indices) : indices)
    setCurrentTrackIdx(0)
  }, [tracks.length, shuffle])

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

  /* Load next video when track changes, with autoplay */
  const advance = useCallback(() => {
    if (currentTrackIdx < playOrder.length - 1) {
      setCurrentTrackIdx((i) => i + 1)
    } else {
      if (shuffle) {
        setPlayOrder(shuffleArray(tracks.map((_, i) => i)))
      }
      setCurrentTrackIdx(0)
    }
  }, [currentTrackIdx, playOrder.length, shuffle, tracks])

  if (tracks.length === 0 || !currentTrack) return null

  const opts: YouTubeProps['opts'] = {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 0,
      mute: 1,
      origin: window.location.origin,
    },
  }

  return (
    <>
      {/* Player visível em 1×1 no canto (não offscreen — browsers bloqueiam áudio offscreen) */}
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
            if (isPlaying) e.target.playVideo()
          }}
          onStateChange={(e) => {
            /* Unmute after first play (autoplay policy workaround) */
            if (e.data === 1 && e.target.isMuted()) {
              e.target.unMute()
            }
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
      }}>
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
            const t = e.currentTarget
            t.style.display = 'none'
            const fb = t.nextElementSibling as HTMLElement | null
            if (fb) fb.style.display = 'flex'
          }}
        />
        <div style={{
          display: 'none', width: '36px', height: '36px', borderRadius: '9999px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {shuffle ? 'Aleatório' : 'Sequencial'} · {currentTrackIdx + 1}/{tracks.length}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '20px' }}>
          {[10, 16, 8, 20, 12, 6, 22].map((h, i) => (
            <div key={i} style={{
              width: '3px', height: `${h}px`, borderRadius: '2px',
              background: '#6366f1',
              animation: 'equalizer 0.5s ease-in-out infinite alternate',
              animationDelay: `${i * 0.07}s`,
            }} />
          ))}
        </div>
      </div>
    </>
  )
}
