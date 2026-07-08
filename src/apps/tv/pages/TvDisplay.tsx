import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Tv, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { usePlaylists } from '../hooks/usePlaylists'
import { useActiveGalleries } from '../hooks/useGallery'
import { useMusicPlayer } from '../contexts/MusicPlayerContext'
import { VideoPlayer } from '../components/VideoPlayer'
import { EventsCarousel } from '../components/EventsCarousel'
import { MusicQueuePlayer } from '../components/MusicQueuePlayer'
import { PhotoSlideshow } from '../components/PhotoSlideshow'
import { ClockDisplay } from '../components/ClockDisplay'
import { Greeting } from '../components/Greeting'
import { Ticker } from '../components/Ticker'
import { WeatherWidget } from '../components/WeatherWidget'
import { WeatherSlide } from '../components/WeatherSlide'
import { ScreenSaver } from '../components/ScreenSaver'

type Phase = { type: 'video' } | { type: 'gallery'; galleryId: string } | { type: 'events' } | { type: 'weather' }

export function TvDisplay() {
  const { events, loading: eventsLoading } = useEvents()
  const { playlists: videoPlaylists, loading: videoLoading } = usePlaylists()
  const { galleries: activeGalleries, photosMap, loading: galleryLoading } = useActiveGalleries()
  const { setPlaying: setMusicPlaying } = useMusicPlayer()
  const navigate = useNavigate()

  const [hasLoaded, setHasLoaded] = useState(false)
  const [paused, setPaused] = useState(false)

  /* ── Phase sequence: video → gallery[0] → events → gallery[1] → ... → weather → events ── */
  const phaseSequence = useMemo<Phase[]>(() => {
    const seq: Phase[] = [{ type: 'video' }]
    for (const g of activeGalleries) {
      seq.push({ type: 'gallery', galleryId: g.id })
      seq.push({ type: 'events' })
    }
    seq.push({ type: 'weather' })
    seq.push({ type: 'events' })
    return seq
  }, [activeGalleries])

  const [phaseIdx, setPhaseIdx] = useState(0)
  const currentPhase = phaseSequence[phaseIdx] ?? { type: 'video' }

  const isVideoPhase = currentPhase.type === 'video'
  const showingVideo = isVideoPhase

  /* ── Pause music during video phase ── */
  useEffect(() => {
    setMusicPlaying(!isVideoPhase)
  }, [isVideoPhase, setMusicPlaying])

  const EVENT_DURATIONS = [10000, 15000, 30000, 60000] as const
  const [eventDurationIndex, setEventDurationIndex] = useState(1)
  const eventDisplayMs = EVENT_DURATIONS[eventDurationIndex]
  const EVENTS_BRIEF_MS = 6000

  const PHOTO_DISPLAY_MS = 15_000
  const WEATHER_DISPLAY_MS = 10_000

  /* ── Track initial load complete ── */
  useEffect(() => {
    if (!eventsLoading && !videoLoading && !galleryLoading) {
      setHasLoaded(true)
    }
  }, [eventsLoading, videoLoading, galleryLoading])

  /* ── Video index cycles through playlists on natural end ── */
  const [videoIndex, setVideoIndex] = useState(0)
  const currentPlaylist = videoPlaylists[videoIndex]

  /* ── Reset index when current playlist is removed ── */
  useEffect(() => {
    if (videoPlaylists.length === 0) return
    if (videoIndex >= videoPlaylists.length) {
      setVideoIndex(0)
    }
  }, [videoPlaylists.length, videoIndex])

  const advancePhase = useCallback(() => {
    setPhaseIdx((i) => (i + 1) % phaseSequence.length)
  }, [phaseSequence.length])

  /* ── Auto-skip video phase when no playlists are configured ── */
  useEffect(() => {
    if (isVideoPhase && videoPlaylists.length === 0 && hasLoaded) {
      advancePhase()
    }
  }, [isVideoPhase, videoPlaylists.length, hasLoaded, advancePhase])

  /* ── Pre-compute current phase duration as a stable primitive ── */
  const currentPhaseDurationMs = useMemo(() => {
    if (isVideoPhase || paused) return null
    if (currentPhase.type === 'events') {
      const prevType = phaseIdx > 0 ? phaseSequence[phaseIdx - 1].type : null
      const isBrief = prevType === 'gallery' || prevType === 'weather'
      return events.length > 0 ? (isBrief ? EVENTS_BRIEF_MS : eventDisplayMs) : 1000
    }
    if (currentPhase.type === 'gallery') {
      const photos = photosMap[currentPhase.galleryId]
      return photos && photos.length > 0 ? photos.length * PHOTO_DISPLAY_MS : 3000
    }
    if (currentPhase.type === 'weather') {
      return WEATHER_DISPLAY_MS
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoPhase, paused, currentPhase.type, (currentPhase as any).galleryId, phaseIdx,
      phaseSequence, events.length, eventDisplayMs,
      // Use a stable key for photosMap: the number of photos in the current gallery
      currentPhase.type === 'gallery' ? (photosMap[(currentPhase as any).galleryId]?.length ?? 0) : 0])

  /* ── Phase timer — depends only on primitive duration ── */
  useEffect(() => {
    if (currentPhaseDurationMs === null) return
    const timer = setTimeout(advancePhase, currentPhaseDurationMs)
    return () => clearTimeout(timer)
  }, [currentPhaseDurationMs, advancePhase, phaseIdx])

  /* ── Reset phase sequence when active galleries change ── */
  useEffect(() => {
    setPhaseIdx(0)
  }, [activeGalleries.length])

  /* ── Keyboard shortcuts ── */
  const advanceToNextVideo = useCallback(() => {
    if (videoPlaylists.length > 1) {
      setVideoIndex((i) => (i + 1) % videoPlaylists.length)
    }
    advancePhase()
  }, [videoPlaylists.length, advancePhase])

  const goToPrevVideo = useCallback(() => {
    if (videoPlaylists.length > 0) {
      setVideoIndex((i) => (i - 1 + videoPlaylists.length) % videoPlaylists.length)
    }
    setPaused(false)
    setPhaseIdx(0)
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

  const hasContent = videoPlaylists.length > 0 || events.length > 0

  /* ── Current gallery for display ── */
  const currentGallery = currentPhase.type === 'gallery'
    ? activeGalleries.find(g => g.id === currentPhase.galleryId) ?? null
    : null
  const currentGalleryPhotos = currentPhase.type === 'gallery'
    ? photosMap[currentPhase.galleryId] ?? []
    : []

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#080a14',
        color: '#f1f5f9', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Layer 1: Background ── */}
      {!showingVideo && currentPhase.type === 'events' && events.length > 0 ? (
        <EventsCarousel events={events} interval={8000} fullBleed />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #080a14 100%)',
        }} />
      )}

      {/* ── Layer 2: Centered content (video / gallery / weather) ── */}
      {/* Video player — only mounted when playlists exist */}
      {videoPlaylists.length > 0 && currentPlaylist && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,10,20,0.85)',
          opacity: showingVideo ? 1 : 0,
          pointerEvents: showingVideo ? 'auto' : 'none',
          transition: 'opacity 0.5s',
        }}>
          <div style={{
            position: 'relative',
            width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
            borderRadius: '1rem', overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
          }}>
            <VideoPlayer
              key={currentPlaylist.id}
              url={currentPlaylist.youtube_url}
              source={currentPlaylist.source}
              isPlaying={isVideoPhase && !paused}
              onEnd={advanceToNextVideo}
            />
          </div>
        </div>
      )}

      {/* Gallery player — always rendered when a gallery phase is active */}
      {currentGallery && currentGalleryPhotos.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,10,20,0.85)',
          opacity: currentPhase.type === 'gallery' ? 1 : 0,
          pointerEvents: currentPhase.type === 'gallery' ? 'auto' : 'none',
          transition: 'opacity 0.5s',
        }}>
          <div style={{
            position: 'relative',
            width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
            borderRadius: '1rem', overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
          }}>
            <PhotoSlideshow photos={currentGalleryPhotos} title={currentGallery.title} />
          </div>
        </div>
      )}

      {/* Weather slide — always rendered when weather phase is active */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: currentPhase.type === 'weather' ? 1 : 0,
        pointerEvents: currentPhase.type === 'weather' ? 'auto' : 'none',
        transition: 'opacity 0.5s',
      }}>
        <WeatherSlide />
      </div>

      {/* ── Layer 3: Music ── */}
      <MusicQueuePlayer />

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
      {hasLoaded && !hasContent && <ScreenSaver />}
    </div>
  )
}
