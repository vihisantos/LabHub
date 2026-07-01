import { useState, useEffect } from 'react'
import { Settings, Tv } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { usePlaylists } from '../hooks/usePlaylists'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { MusicPlayer } from '../components/MusicPlayer'
import { EventsCarousel } from '../components/EventsCarousel'
import { BackgroundAudio } from '../components/BackgroundAudio'

export function TvDisplay() {
  const { events } = useEvents()
  const { playlists: videoPlaylists } = usePlaylists('video')
  const { playlists: musicPlaylists } = usePlaylists('music')

  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  /* ── Video index cycles through playlists on natural end ── */
  const [videoIndex, setVideoIndex] = useState(0)
  const currentPlaylist = videoPlaylists[videoIndex]

  /* ── Toggle: video vs events ── */
  const [showingVideo, setShowingVideo] = useState(true)

  /* ── Video timer: after duration_seconds, pause & show events ── */
  useEffect(() => {
    if (!showingVideo || !currentPlaylist) return
    const ms = currentPlaylist.duration_seconds * 1000
    const timer = setTimeout(() => setShowingVideo(false), ms)
    return () => clearTimeout(timer)
  }, [showingVideo, currentPlaylist?.id, currentPlaylist?.duration_seconds])

  /* ── Events timer: after 15s, resume video ── */
  useEffect(() => {
    if (showingVideo || videoPlaylists.length === 0) return
    const timer = setTimeout(() => setShowingVideo(true), events.length > 0 ? 15000 : 6000)
    return () => clearTimeout(timer)
  }, [showingVideo, videoPlaylists.length, events.length])

  const advanceToNextVideo = () => {
    if (videoPlaylists.length > 1) {
      setVideoIndex((i) => (i + 1) % videoPlaylists.length)
    }
    setShowingVideo(true)
  }

  /* ── Music: plays during events, pauses during video ── */
  const [musicPlaying, setMusicPlaying] = useState(false)
  useEffect(() => {
    setMusicPlaying(!showingVideo)
  }, [showingVideo])

  /* ── Formatting ── */
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const formatDate = (d: Date) =>
    d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const hasContent = videoPlaylists.length > 0 || events.length > 0
  const hasMusic = musicPlaylists.length > 0

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#080a14',
        color: '#f1f5f9', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Layer 1: Background ── */}
      {!showingVideo && events.length > 0 ? (
        <EventsCarousel events={events} interval={8000} fullBleed />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #080a14 100%)',
        }} />
      )}

      {/* ── Layer 2: Video player (always mounted once available) ── */}
      {videoPlaylists.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: showingVideo ? 1 : 0,
          pointerEvents: showingVideo ? 'auto' : 'none',
          transition: 'opacity 0.5s',
          background: 'rgba(8,10,20,0.85)',
        }}>
          {currentPlaylist && (
            <div style={{
              width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
              borderRadius: '1rem', overflow: 'hidden',
              boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
            }}>
              <YouTubePlayer
                key={currentPlaylist.id}
                url={currentPlaylist.youtube_url}
                isPlaying={showingVideo}
                onEnd={advanceToNextVideo}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Layer 3: Background audio ── */}
      <BackgroundAudio playlists={musicPlaylists} isPlaying={musicPlaying} />

      {/* ── Layer 4: UI overlay ── */}

      {/* Admin button */}
      <a
        href="/tv/admin"
        style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 50,
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
          textDecoration: 'none', transition: 'all 0.2s',
        }}
        title="Admin"
      >
        <Settings size={18} />
      </a>

      {/* Clock */}
      <div style={{
        position: 'fixed', top: '2.5rem', left: '3rem', zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: '0.25rem',
      }}>
        <span style={{
          fontSize: '4rem', fontWeight: 300, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em', lineHeight: 1,
          background: 'linear-gradient(180deg, #f1f5f9 0%, #94a3b8 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {formatTime(clock)}
        </span>
        <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 400, textTransform: 'capitalize' }}>
          {formatDate(clock)}
        </span>
      </div>

      {/* Greeting */}
      <div style={{
        position: 'fixed', top: '12%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 10,
        pointerEvents: 'none', userSelect: 'none',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          fontSize: 'clamp(2.5rem, 5vw, 5rem)',
          fontWeight: 800,
          lineHeight: 1.2,
          color: '#f1f5f9',
          textShadow: '0 0 40px rgba(129,140,248,0.4), 0 0 80px rgba(99,102,241,0.15)',
          animation: 'hue-shift 4s linear infinite',
        }}>
          {clock.getHours() >= 5 && clock.getHours() < 12
            ? 'Bom dia, Campus!'
            : clock.getHours() >= 12 && clock.getHours() < 18
            ? 'Boa tarde, Campus!'
            : 'Boa noite, Campus!'}
        </span>
      </div>

      {/* Music visualizer widget */}
      {hasMusic && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '3rem', zIndex: 10,
        }}>
          <MusicPlayer compact />
        </div>
      )}

      {/* Status dots */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: '0.5rem',
      }}>
        <div style={{
          width: showingVideo ? '24px' : '8px',
          height: '6px', borderRadius: '3px',
          background: showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)',
          transition: 'all 0.3s',
        }} />
        <div style={{
          width: !showingVideo ? '24px' : '8px',
          height: '6px', borderRadius: '3px',
          background: !showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)',
          transition: 'all 0.3s',
        }} />
      </div>

      {/* Branding */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '3rem', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155',
      }}>
        <Tv size={16} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Lab Hub TV</span>
      </div>

      {/* Empty state */}
      {!hasContent && !hasMusic && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '1rem', color: '#475569',
        }}>
          <Tv size={80} strokeWidth={1} />
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>Nenhum conteúdo configurado</p>
          <a
            href="/tv/admin"
            style={{
              color: '#6366f1', fontSize: '1rem', textDecoration: 'none',
              padding: '0.75rem 1.5rem', borderRadius: '0.5rem',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
          >
            Configurar
          </a>
        </div>
      )}
    </div>
  )
}
