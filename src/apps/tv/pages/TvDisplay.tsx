import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Tv, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { usePlaylists } from '../hooks/usePlaylists'
import { VideoPlayer } from '../components/VideoPlayer'
import { EventsCarousel } from '../components/EventsCarousel'
import { MusicQueuePlayer } from '../components/MusicQueuePlayer'
import { ClockDisplay } from '../components/ClockDisplay'
import { Greeting } from '../components/Greeting'
import { Ticker } from '../components/Ticker'
import { WeatherWidget } from '../components/WeatherWidget'
import { ScreenSaver } from '../components/ScreenSaver'
import { useAllMusicTracks } from '../hooks/useAllMusicTracks'

export function TvDisplay() {
  const { events, loading: eventsLoading } = useEvents()
  const { playlists: videoPlaylists, loading: videoLoading } = usePlaylists()
  const { tracks: musicQueueTracks, shuffle: musicShuffle } = useAllMusicTracks()
  const navigate = useNavigate()

  const [hasLoaded, setHasLoaded] = useState(false)
  const [paused, setPaused] = useState(false)

  /* ── Toggle: video vs events ── */
  const [showingVideo, setShowingVideo] = useState(true)

  const isVideoPlaying = showingVideo && !paused

  const EVENT_DURATIONS = [10000, 15000, 30000, 60000] as const
  const [eventDurationIndex, setEventDurationIndex] = useState(1)
  const eventDisplayMs = EVENT_DURATIONS[eventDurationIndex]

  /* ── Track initial load complete ── */
  useEffect(() => {
    if (!eventsLoading && !videoLoading) {
      setHasLoaded(true)
    }
  }, [eventsLoading, videoLoading])

  /* ── Video index cycles through playlists on natural end ── */
  const [videoIndex, setVideoIndex] = useState(0)
  const currentPlaylist = videoPlaylists[videoIndex]

  /* ── Reset index when current playlist is removed, switch to events ── */
  useEffect(() => {
    if (videoPlaylists.length === 0) {
      setShowingVideo(false)
      return
    }
    if (videoIndex >= videoPlaylists.length) {
      setVideoIndex(0)
    }
  }, [videoPlaylists.length, videoIndex])

  /* ── Video timer: after duration_seconds, pause & show events ── */
  useEffect(() => {
    if (!showingVideo || !currentPlaylist) return
    const ms = currentPlaylist.duration_seconds * 1000
    const timer = setTimeout(() => setShowingVideo(false), ms)
    return () => clearTimeout(timer)
  }, [showingVideo, currentPlaylist?.id, currentPlaylist?.duration_seconds])

  /* ── Events timer: after eventDisplayMs, resume video ── */
  useEffect(() => {
    if (showingVideo || paused || videoPlaylists.length === 0) return
    const timer = setTimeout(() => setShowingVideo(true), events.length > 0 ? eventDisplayMs : 6000)
    return () => clearTimeout(timer)
  }, [showingVideo, paused, videoPlaylists.length, events.length, eventDisplayMs])

  /* ── Keyboard shortcuts ── */
  const advanceToNextVideo = useCallback(() => {
    if (videoPlaylists.length > 1) {
      setVideoIndex((i) => (i + 1) % videoPlaylists.length)
    }
    setShowingVideo(true)
  }, [videoPlaylists.length])

  const goToPrevVideo = useCallback(() => {
    if (videoPlaylists.length > 0) {
      setVideoIndex((i) => (i - 1 + videoPlaylists.length) % videoPlaylists.length)
    }
    setPaused(false)
    setShowingVideo(true)
  }, [videoPlaylists.length])

  const togglePause = useCallback(() => setPaused((p) => !p), [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePause()
          break
        case 'ArrowRight':
          advanceToNextVideo()
          break
        case 'ArrowLeft':
          goToPrevVideo()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePause, advanceToNextVideo, goToPrevVideo, toggleFullscreen])

  /* ── Auto-fullscreen on mount ── */
  useEffect(() => {
    document.documentElement.requestFullscreen().catch(() => {})
  }, [])

  /* ── WakeLock: prevent screen sleep ── */
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((wl) => { wakeLock = wl }).catch(() => {})
    }
    return () => { wakeLock?.release().catch(() => {}) }
  }, [])

  /* ── Music: plays during events, pauses during video ── */
  const [musicPlaying, setMusicPlaying] = useState(false)
  useEffect(() => {
    setMusicPlaying(!showingVideo && !paused)
  }, [showingVideo, paused])

  const hasContent = videoPlaylists.length > 0 || events.length > 0
  const hasMusic = musicQueueTracks.length > 0

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
      {videoPlaylists.length > 0 && currentPlaylist && (
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
              <VideoPlayer
                key={currentPlaylist.id}
                url={currentPlaylist.youtube_url}
                source={currentPlaylist.source}
                isPlaying={isVideoPlaying}
                onEnd={advanceToNextVideo}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Layer 3: Music ── */}
      <MusicQueuePlayer
        tracks={musicQueueTracks}
        shuffle={musicShuffle}
        isPlaying={musicPlaying}
      />

      {/* ── Layer 4: Playback controls ── */}
      {videoPlaylists.length > 0 && showingVideo && (
        <div style={{
          position: 'fixed', bottom: '4.5rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.35rem 0.75rem', borderRadius: '9999px',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            onClick={goToPrevVideo}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', padding: '0.35rem',
              display: 'flex', borderRadius: '50%', transition: 'color 0.2s',
            }}
            title="Anterior"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={togglePause}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
              color: '#fff', padding: '0.4rem',
              display: 'flex', borderRadius: '50%', transition: 'background 0.2s',
            }}
            title={paused ? 'Continuar' : 'Pausar'}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            onClick={advanceToNextVideo}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', padding: '0.35rem',
              display: 'flex', borderRadius: '50%', transition: 'color 0.2s',
            }}
            title="Próximo"
          >
            <SkipForward size={16} />
          </button>
        </div>
      )}

      {/* ── Layer 5: UI overlay ── */}

      {/* Admin button */}
      <button
        onClick={() => navigate('/tv')}
        style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 50,
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
          textDecoration: 'none', transition: 'all 0.2s',
        }}
        title="Admin"
      >
        <Settings size={18} />
      </button>

      <ClockDisplay />
      <WeatherWidget />
      <Greeting />
      <Ticker />

      {/* Status dots */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: '0.5rem', alignItems: 'center',
      }}>
        <div
          style={{
            width: showingVideo ? '24px' : '8px',
            height: '6px', borderRadius: '3px',
            background: showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)',
            transition: 'all 0.3s',
          }}
        />
        <div
          onClick={() => {
            setEventDurationIndex((i) => (i + 1) % EVENT_DURATIONS.length)
          }}
          title={`Eventos: ${eventDisplayMs / 1000}s`}
          style={{
            cursor: events.length > 0 ? 'pointer' : 'default',
            width: !showingVideo ? '24px' : '8px',
            height: '6px', borderRadius: '3px',
            background: !showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)',
            transition: 'all 0.3s',
          }}
        />
        {events.length > 0 && !showingVideo && (
          <span style={{
            fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)',
            marginLeft: '0.25rem', fontVariantNumeric: 'tabular-nums',
          }}>
            {eventDisplayMs / 1000}s
          </span>
        )}
      </div>

      {/* Branding */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '3rem', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155',
      }}>
        <Tv size={16} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Lab Hub TV</span>
      </div>

      {/* Empty state → screensaver */}
      {hasLoaded && !hasContent && !hasMusic && <ScreenSaver />}
    </div>
  )
}
