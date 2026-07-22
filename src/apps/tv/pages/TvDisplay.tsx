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
import { UpdateBadge } from '../components/UpdateBadge'
import { ClockDisplay } from '../components/ClockDisplay'
import { Greeting } from '../components/Greeting'
import { Ticker } from '../components/Ticker'
import { WeatherWidget } from '../components/WeatherWidget'
import { useUrgentAnnouncements } from '../hooks/useUrgentAnnouncements'
import { UrgentBanner } from '../components/UrgentBanner'
import { CountdownSlide } from '../components/CountdownSlide'
import { WelcomeSlide } from '../components/WelcomeSlide'
import { WeatherSlide } from '../components/WeatherSlide'
import { ScreenSaver } from '../components/ScreenSaver'
import { SeasonalEffects } from '../components/SeasonalEffects'
import { useYouTubeLive } from '../hooks/useYouTubeLive'

type Phase =
  | { type: 'video' }
  | { type: 'gallery'; galleryId: string }
  | { type: 'events' }
  | { type: 'weather' }
  | { type: 'countdown'; eventId: string }
  | { type: 'welcome'; eventId?: string }

export function TvDisplay() {
  const { events, loading: eventsLoading } = useEvents()
  const { playlists: videoPlaylists, loading: videoLoading } = usePlaylists()
  const { galleries: activeGalleries, photosMap, loading: galleryLoading } = useActiveGalleries()
  const { activeAnnouncement } = useUrgentAnnouncements()
  const { setPlaying: setMusicPlaying } = useMusicPlayer()
  const navigate = useNavigate()

  const [hasLoaded, setHasLoaded] = useState(false)
  const [paused, setPaused] = useState(false)

  /* ── Phase sequence: countdown / welcome → video → gallery[0] → events → weather ... ── */
  const phaseSequence = useMemo<Phase[]>(() => {
    const seq: Phase[] = []

    // 1. Countdown for upcoming events with show_countdown or within 7 days
    const countdownEvents = events.filter(e => {
      if (!e.start_date) return false
      const targetTime = new Date(e.start_date).getTime()
      const diffDays = (targetTime - Date.now()) / (1000 * 60 * 60 * 24)
      return e.show_countdown || (diffDays > 0 && diffDays <= 7)
    })
    for (const ce of countdownEvents) {
      seq.push({ type: 'countdown', eventId: ce.id })
    }

    // 2. Welcome slide if event has_welcome
    const welcomeEvent = events.find(e => e.has_welcome)
    if (welcomeEvent) {
      seq.push({ type: 'welcome', eventId: welcomeEvent.id })
    }

    // 3. Main rotation
    seq.push({ type: 'video' })
    for (const g of activeGalleries) {
      seq.push({ type: 'gallery', galleryId: g.id })
      seq.push({ type: 'events' })
    }
    seq.push({ type: 'weather' })
    seq.push({ type: 'events' })

    return seq.length > 0 ? seq : [{ type: 'video' }]
  }, [activeGalleries, events])

  const [phaseIdx, setPhaseIdx] = useState(0)
  const currentPhase = phaseSequence[phaseIdx] ?? { type: 'video' }

  const isVideoPhase = currentPhase.type === 'video'
  const showingVideo = isVideoPhase

  /* ── Pause music during video phase ── */
  useEffect(() => {
    setMusicPlaying(!isVideoPhase)
  }, [isVideoPhase, setMusicPlaying])

  const EVENT_DURATIONS = [10000, 15000, 30000, 60000] as const
  const [eventDurationIndex, setEventDurationIndex] = useState(2)
  const eventDisplayMs = EVENT_DURATIONS[eventDurationIndex]
  const EVENTS_BRIEF_MS = 16000

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
    if (currentPhase.type === 'countdown') {
      return 15_000
    }
    if (currentPhase.type === 'welcome') {
      return 20_000
    }
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
      {/* ── Layer 1: Background (events carousel always mounted) ── */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: !showingVideo && currentPhase.type === 'events' && events.length > 0 ? 1 : 0,
        pointerEvents: !showingVideo && currentPhase.type === 'events' ? 'auto' : 'none',
        transition: 'opacity 0.5s',
      }}>
        {events.length > 0 ? (
          <EventsCarousel events={events} interval={8000} fullBleed />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, #1e293b 0%, #080a14 100%)',
          }} />
        )}
      </div>

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

      {/* Countdown slide */}
      {currentPhase.type === 'countdown' && (() => {
        const targetEvent = events.find(e => e.id === currentPhase.eventId) || events[0]
        return targetEvent ? (
          <div style={{
            position: 'absolute', inset: 0,
            opacity: currentPhase.type === 'countdown' ? 1 : 0,
            pointerEvents: currentPhase.type === 'countdown' ? 'auto' : 'none',
            transition: 'opacity 0.5s',
          }}>
            <CountdownSlide event={targetEvent} />
          </div>
        ) : null
      })()}

      {/* Welcome slide */}
      {currentPhase.type === 'welcome' && (() => {
        const targetEvent = events.find(e => e.id === currentPhase.eventId)
        return (
          <div style={{
            position: 'absolute', inset: 0,
            opacity: currentPhase.type === 'welcome' ? 1 : 0,
            pointerEvents: currentPhase.type === 'welcome' ? 'auto' : 'none',
            transition: 'opacity 0.5s',
          }}>
            <WelcomeSlide event={targetEvent} />
          </div>
        )
      })()}

      {/* Weather slide — always rendered when weather phase is active */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: currentPhase.type === 'weather' ? 1 : 0,
        pointerEvents: currentPhase.type === 'weather' ? 'auto' : 'none',
        transition: 'opacity 0.5s',
      }}>
        <WeatherSlide />
      </div>

      {/* Urgent Banner Layer */}
      <UrgentBanner announcement={activeAnnouncement} />

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

      <UpdateBadge />
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

      {/* Seasonal particle effects (confetes, snow, leaves) */}
      <SeasonalEffects />

      {/* Live YouTube Indicator */}
      <TvLiveBadge />

      {/* Empty state → screensaver */}
      {hasLoaded && !hasContent && <ScreenSaver />}
    </div>
  )
}

/**
 * Badge flutuante que indica quando o canal da faculdade está ao vivo no YouTube
 */
function TvLiveBadge() {
  const { isLive, title, channelTitle, videoId, viewerCount } = useYouTubeLive()

  if (!isLive) return null

  return (
    <a
      href={videoId ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/@${encodeURIComponent(channelTitle)}/live`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        top: '1rem',
        left: '1rem',
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        background: 'rgba(220,38,38,0.2)',
        border: '1px solid rgba(220,38,38,0.3)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(220,38,38,0.3)',
        color: '#ffffff',
        textDecoration: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
    >
      {/* Live dot animado */}
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#ef4444',
          animation: 'pulse 1.5s ease-in-out infinite',
          boxShadow: '0 0 12px rgba(239,68,68,0.6)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 800,
          color: '#fca5a5',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          AO VIVO
        </span>
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#f1f5f9',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title || channelTitle || 'YouTube'}
        </span>
      </div>
      {viewerCount != null && viewerCount > 0 && (
        <span style={{
          fontSize: '0.6rem',
          fontWeight: 700,
          color: '#fca5a5',
          background: 'rgba(0,0,0,0.2)',
          padding: '0.15rem 0.5rem',
          borderRadius: '9999px',
        }}>
          {viewerCount} espectadores
        </span>
      )}
    </a>
  )
}
