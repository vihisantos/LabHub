import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Tv, Pause, Play, SkipBack, SkipForward, Info } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { usePlaylists } from '../hooks/usePlaylists'
import { useActiveGalleries } from '../hooks/useGallery'
import { useYouTubeLive } from '../hooks/useYouTubeLive'
import { useUrgentAnnouncements } from '../hooks/useUrgentAnnouncements'
import { isKiosk } from '../utils/kiosk'
import { useProgramming, type ProgrammingQueueItem } from '../contexts/ProgrammingContext'
import type { TvInformativo } from '../types'
import { VideoPlayer } from '../components/VideoPlayer'
import { EventsCarousel } from '../components/EventsCarousel'
import { PhotoSlideshow } from '../components/PhotoSlideshow'
import { UpdateBadge } from '../components/UpdateBadge'
import { ClockDisplay } from '../components/ClockDisplay'
import { Greeting } from '../components/Greeting'
import { Ticker } from '../components/Ticker'
import { WeatherWidget } from '../components/WeatherWidget'
import { UrgentBanner } from '../components/UrgentBanner'
import { CountdownSlide } from '../components/CountdownSlide'
import { WelcomeSlide } from '../components/WelcomeSlide'
import { WeatherSlide } from '../components/WeatherSlide'
import { ScreenSaver } from '../components/ScreenSaver'
import { SeasonalEffects } from '../components/SeasonalEffects'

export function TvDisplay({ deviceName, deviceId }: { deviceName?: string; deviceId?: string | null }) {
  const { events, loading: eventsLoading } = useEvents(deviceId)
  const { playlists: videoPlaylists, loading: videoLoading } = usePlaylists()
  const { galleries: activeGalleries, photosMap, loading: galleryLoading } = useActiveGalleries()
  const { activeAnnouncement } = useUrgentAnnouncements()
  const navigate = useNavigate()

  // Novo sistema de programação acadêmica
  const programming = useProgramming()
  const { queue, isFixedDue, nextFixedId, nextInformativo, informativoDue } = programming

  const [hasLoaded, setHasLoaded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [failedGalleries, setFailedGalleries] = useState(new Set<string>())

  useEffect(function() {
    if (!isKiosk()) return
    let offlineSince: number | null = null
    const onOffline = function() { offlineSince = Date.now(); console.warn('[TV kiosk] offline') }
    const onOnline = function() {
      if (offlineSince !== null) {
        console.info('[TV kiosk] reconnect after ' + Math.round((Date.now() - offlineSince) / 1000) + 's')
        offlineSince = null
      }
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return function() {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  /* ── Phase sequence ── */
  interface PhaseCountdown { type: 'countdown'; eventId: string }
  interface PhaseWelcome { type: 'welcome'; eventId: string }
  interface PhaseVideo { type: 'video' }
  interface PhaseGallery { type: 'gallery'; galleryId: string }
  interface PhaseEvents { type: 'events' }
  interface PhaseWeather { type: 'weather' }
  interface PhaseAcademic { type: 'academic'; item: ProgrammingQueueItem }
  interface PhaseInformative { type: 'informativo'; item: TvInformativo }
  type Phase = PhaseCountdown | PhaseWelcome | PhaseVideo | PhaseGallery | PhaseEvents | PhaseWeather | PhaseAcademic | PhaseInformative

  const phaseSequence = useMemo<Phase[]>(function() {
    const seq: Phase[] = []

    // 1. Countdown for upcoming events
    const countdownEvents = events.filter(function(e) {
      if (!e.start_date) return false
      const targetTime = new Date(e.start_date).getTime()
      const diffDays = (targetTime - Date.now()) / (1000 * 60 * 60 * 24)
      return e.show_countdown || (diffDays > 0 && diffDays <= 7)
    })
    for (const ce of countdownEvents) {
      seq.push({ type: 'countdown', eventId: ce.id })
    }

    // 2. Welcome slide if event has_welcome
    const welcomeEvent = events.find(function(e) { return e.has_welcome })
    if (welcomeEvent) {
      seq.push({ type: 'welcome', eventId: welcomeEvent.id })
    }

    // 3. Informativo (ocasional, quando devido)
    if (informativoDue && nextInformativo) {
      seq.push({ type: 'informativo', item: nextInformativo })
    }

    // 4. Conteúdo fixo (comercial) quando devido
    if (isFixedDue && nextFixedId) {
      const fixedItem = queue.find(function(i) { return i.id === nextFixedId })
      if (fixedItem) {
        seq.push({ type: 'academic', item: fixedItem })
      }
    }

    // 5. Main rotation video playlist
    seq.push({ type: 'video' })
    
    for (const g of activeGalleries.filter(function(gItem) { return !failedGalleries.has(gItem.id) })) {
      seq.push({ type: 'gallery', galleryId: g.id })
      seq.push({ type: 'events' })
    }
    seq.push({ type: 'weather' })
    seq.push({ type: 'events' })

    return seq.length > 0 ? seq : [{ type: 'video' }]
  }, [events, failedGalleries, informativoDue, nextInformativo, isFixedDue, nextFixedId, queue, activeGalleries])

  const [phaseIdx, setPhaseIdx] = useState(0)
  const currentPhase = phaseSequence[phaseIdx]
  const isVideoPhase = currentPhase && currentPhase.type === 'video'
  const showingVideo = isVideoPhase

  const EVENT_DURATIONS = [10000, 15000, 30000, 60000]
  const [eventDurationIndex, setEventDurationIndex] = useState(2)
  const eventDisplayMs = EVENT_DURATIONS[eventDurationIndex]
  const EVENTS_BRIEF_MS = 16000
  const PHOTO_DISPLAY_MS = 15000
  const WEATHER_DISPLAY_MS = 10000

  useEffect(function() {
    if (!eventsLoading && !videoLoading && !galleryLoading) {
      setHasLoaded(true)
    }
  }, [eventsLoading, videoLoading, galleryLoading])

  const [videoIndex, setVideoIndex] = useState(0)
  const currentPlaylist = videoPlaylists[videoIndex]

  useEffect(function() {
    if (videoPlaylists.length === 0) return
    if (videoIndex >= videoPlaylists.length) {
      setVideoIndex(0)
    }
  }, [videoPlaylists.length, videoIndex])

  const advancePhase = useCallback(function() {
    setPhaseIdx(function(i) { return (i + 1) % phaseSequence.length })
  }, [phaseSequence.length])

  useEffect(function() {
    if (isVideoPhase && videoPlaylists.length === 0 && hasLoaded) {
      advancePhase()
    }
  }, [isVideoPhase, videoPlaylists.length, hasLoaded, advancePhase])

  // Type guard for gallery phase
  function isGalleryPhase(phase: Phase | undefined): phase is PhaseGallery {
    return phase?.type === 'gallery' && phase.galleryId !== undefined
  }

  const currentPhaseDurationMs = useMemo(function() {
    if (isVideoPhase || paused) return null
    if (!currentPhase) return null
    
    if (currentPhase.type === 'countdown') return 15000
    if (currentPhase.type === 'welcome') return 20000
    if (currentPhase.type === 'weather') return WEATHER_DISPLAY_MS
    if (currentPhase.type === 'academic') {
      const item = currentPhase.item as ProgrammingQueueItem
      return item.file_type === 'image' ? 15000 : null
    }
    if (currentPhase.type === 'informativo') {
      const item = currentPhase.item as TvInformativo
      return item.file_type === 'image' ? 15000 : null
    }
    if (isGalleryPhase(currentPhase)) {
      const photos = photosMap[currentPhase.galleryId]
      return photos && photos.length > 0 ? photos.length * PHOTO_DISPLAY_MS : 3000
    }
    if (currentPhase.type === 'events') {
      const prevType = phaseIdx > 0 ? phaseSequence[phaseIdx - 1].type : null
      const isBrief = prevType === 'gallery' || prevType === 'weather'
      return events.length > 0 ? (isBrief ? EVENTS_BRIEF_MS : eventDisplayMs) : 1000
    }
    return null
  }, [isVideoPhase, paused, currentPhase, phaseIdx, phaseSequence, events.length, eventDisplayMs, photosMap, PHOTO_DISPLAY_MS, EVENTS_BRIEF_MS])

  useEffect(function() {
    if (currentPhaseDurationMs === null) return
    const timer = setTimeout(advancePhase, currentPhaseDurationMs)
    return function() { clearTimeout(timer) }
  }, [currentPhaseDurationMs, advancePhase, phaseIdx])

  useEffect(function() {
    setPhaseIdx(0)
  }, [queue.length, informativoDue, isFixedDue])

  const advanceToNextVideo = useCallback(function() {
    if (videoPlaylists.length > 1) {
      setVideoIndex(function(i) { return (i + 1) % videoPlaylists.length })
    }
    advancePhase()
  }, [videoPlaylists.length, advancePhase])

  const goToPrevVideo = useCallback(function() {
    if (videoPlaylists.length > 0) {
      setVideoIndex(function(i) { return (i - 1 + videoPlaylists.length) % videoPlaylists.length })
    }
    setPaused(false)
    setPhaseIdx(0)
  }, [videoPlaylists.length])

  const togglePause = useCallback(function() {
    setPaused(function(p) { return !p })
  }, [])

  const toggleFullscreen = useCallback(function() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function() {})
    } else {
      document.exitFullscreen().catch(function() {})
    }
  }, [])

  useEffect(function() {
    const onKeyDown = function(e: KeyboardEvent) {
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
    return function() { window.removeEventListener('keydown', onKeyDown) }
  }, [togglePause, advanceToNextVideo, goToPrevVideo, toggleFullscreen])

  useEffect(function() {
    document.documentElement.requestFullscreen().catch(function() {})
  }, [])

  let wakeLock: WakeLockSentinel | null = null
  useEffect(function() {
    if ('wakeLock' in navigator) {
      (navigator.wakeLock as { request: (type: string) => Promise<WakeLockSentinel> }).request('screen')
        .then(function(wl) { wakeLock = wl })
        .catch(function() {})
    }
    return function() { wakeLock?.release().catch(function() {}) }
  }, [])

  const hasContent = videoPlaylists.length > 0 || events.length > 0 || queue.length > 0
  const currentGallery = isGalleryPhase(currentPhase)
    ? activeGalleries.find(function(g) { return g.id === currentPhase.galleryId }) ?? null
    : null
  const currentGalleryPhotos = isGalleryPhase(currentPhase)
    ? photosMap[currentPhase.galleryId] ?? []
    : []

  const handleAcademicEnd = useCallback(function() {
    advancePhase()
  }, [advancePhase])

  const handleInformativeEnd = useCallback(function() {
    advancePhase()
  }, [advancePhase])

  // Live YouTube data
  const ytLive = useYouTubeLive()
  const isLive = ytLive.isLive
  const ytTitle = ytLive.title
  const ytChannelTitle = ytLive.channelTitle
  const ytVideoId = ytLive.videoId
  const ytViewerCount = ytLive.viewerCount

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#080a14',
      color: '#f1f5f9', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Layer 1: Background */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: (showingVideo === false && currentPhase && currentPhase.type === 'events' && events.length > 0) ? 1 : 0,
        pointerEvents: (showingVideo === false && currentPhase && currentPhase.type === 'events') ? 'auto' : 'none',
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

      {/* Academic content phase */}
      {currentPhase?.type === 'academic' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: showingVideo ? 1 : 0,
          pointerEvents: showingVideo ? 'auto' : 'none',
          transition: 'opacity 0.5s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            position: 'relative',
            width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
            borderRadius: '1rem', overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
          }}>
            <VideoPlayer
              url={currentPhase.item.file_path}
              source="local"
              contentType={currentPhase.item.file_type}
              isPlaying={!paused}
              onEnd={handleAcademicEnd}
            />
          </div>
        </div>
      )}

      {/* Informativo phase */}
      {currentPhase?.type === 'informativo' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 0.5s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,10,20,0.85)',
        }}>
          <div style={{
            position: 'relative',
            width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
            borderRadius: '1rem', overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
          }}>
            <VideoPlayer
              url={currentPhase.item.file_path}
              source="local"
              contentType={currentPhase.item.file_type}
              isPlaying={!paused}
              onEnd={handleInformativeEnd}
            />
          </div>
        </div>
      )}

      {/* Video playlist phase */}
      {videoPlaylists.length > 0 && currentPlaylist && isVideoPhase && (
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

      {/* Gallery phase */}
      {isGalleryPhase(currentPhase) && currentGallery && currentGalleryPhotos.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,10,20,0.85)',
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 0.5s',
        }}>
          <div style={{
            position: 'relative',
            width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
            borderRadius: '1rem', overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
          }}>
            <PhotoSlideshow photos={currentGalleryPhotos} title={currentGallery.title} onAllFailed={function() { setFailedGalleries(function(prev) { const next = new Set(prev); next.add(currentPhase.galleryId); return next }) }} />
          </div>
        </div>
      )}

      {/* Countdown slide */}
      {currentPhase && currentPhase.type === 'countdown' && (() => {
        const targetEvent = events.find(function(e) { return e.id === currentPhase.eventId }) || events[0]
        return targetEvent ? (
          <div style={{
            position: 'absolute', inset: 0,
            opacity: 1,
            pointerEvents: 'auto',
          }}>
            <CountdownSlide event={targetEvent} />
          </div>
        ) : null
      })()}

      {/* Welcome slide */}
      {currentPhase && currentPhase.type === 'welcome' && (() => {
        const targetEvent = events.find(function(e) { return e.id === currentPhase.eventId })
        return targetEvent ? (
          <div style={{
            position: 'absolute', inset: 0,
            opacity: 1,
            pointerEvents: 'auto',
          }}>
            <WelcomeSlide event={targetEvent} />
          </div>
        ) : null
      })()}

      {/* Weather slide */}
      {currentPhase && currentPhase.type === 'weather' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
        }}>
          <WeatherSlide />
        </div>
      )}

      {/* Events fallback */}
      {currentPhase && currentPhase.type === 'events' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
        }}>
          <EventsCarousel events={events} interval={8000} fullBleed />
        </div>
      )}

      {/* Urgent Banner Layer */}
      <UrgentBanner announcement={activeAnnouncement} />

      {/* Playback controls */}
      {videoPlaylists.length > 0 && showingVideo && (
        <div style={{
          position: 'fixed', bottom: '4.5rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.35rem 0.75rem', borderRadius: '9999px',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button onClick={goToPrevVideo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '0.35rem', display: 'flex', borderRadius: '50%' }} title="Anterior">
            <SkipBack size={16} />
          </button>
          <button onClick={togglePause} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', color: '#fff', padding: '0.4rem', display: 'flex', borderRadius: '50%' }} title={paused ? 'Continuar' : 'Pausar'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button onClick={advanceToNextVideo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '0.35rem', display: 'flex', borderRadius: '50%' }} title="Próximo">
            <SkipForward size={16} />
          </button>
        </div>
      )}

      {/* Próximo informativo badge */}
      {nextInformativo && !isVideoPhase && !isGalleryPhase(currentPhase) && currentPhase?.type !== 'academic' && currentPhase?.type !== 'informativo' && (
        <div style={{
          position: 'fixed', top: '1rem', left: '1rem', zIndex: 45,
          background: 'rgba(59, 130, 246, 0.2)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <Info size={16} style={{ color: '#60a5fa' }} />
          <span style={{ fontSize: '0.8rem', color: '#bfdbfe' }}>Próximo: {nextInformativo.file_name}</span>
        </div>
      )}

      {/* Status dots */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: '0.5rem', alignItems: 'center',
      }}>
        <div style={{ width: showingVideo ? '24px' : '8px', height: '6px', borderRadius: '3px', background: showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />
        <div onClick={function() { setEventDurationIndex(function(i) { return (i + 1) % EVENT_DURATIONS.length }) }} title={"Eventos: " + eventDisplayMs / 1000 + "s"} style={{ cursor: events.length > 0 ? 'pointer' : 'default', width: !showingVideo ? '24px' : '8px', height: '6px', borderRadius: '3px', background: !showingVideo ? '#6366f1' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />
        {events.length > 0 && !showingVideo && (<span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginLeft: '0.25rem' }}>{eventDisplayMs / 1000}s</span>)}
      </div>

      {/* Branding */}
      <div style={{ position: 'fixed', bottom: '2rem', left: '3rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155' }}>
        <Tv size={16} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{deviceName ? 'Lab Hub TV · ' + deviceName : 'Lab Hub TV'}</span>
      </div>

      {/* Admin button */}
      <button onClick={function() {
        if (window.desktop?.openAdmin) {
          window.desktop.openAdmin()
        } else {
          navigate('/tv')
        }
      }} style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} title="Painel">
        <Settings size={18} />
      </button>

      <UpdateBadge />
      <ClockDisplay />
      <WeatherWidget />
      <Greeting />
      <Ticker />

      {/* Seasonal particle effects */}
      <SeasonalEffects />

      {/* Live YouTube Indicator */}
      {isLive && (
        <a href={ytVideoId ? "https://www.youtube.com/watch?v=" + ytVideoId : "https://www.youtube.com/@" + encodeURIComponent(ytChannelTitle || '') + "/live"} target="_blank" rel="noopener noreferrer" style={{
          position: 'fixed', top: '1rem', left: '1rem', zIndex: 45,
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.5rem 1rem', borderRadius: '9999px',
          background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.3)',
          backdropFilter: 'blur(12px)', boxShadow: '0 4px 20px rgba(220,38,38,0.3)',
          color: '#ffffff', textDecoration: 'none', fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'all 0.2s', cursor: 'pointer',
        }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s ease-in-out infinite', boxShadow: '0 0 12px rgba(239,68,68,0.6)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.05em', textTransform: 'uppercase' }}>AO VIVO</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f1f5f9', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ytTitle || ytChannelTitle || 'YouTube'}</span>
          </div>
          {ytViewerCount != null && ytViewerCount > 0 && (<span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fca5a5', background: 'rgba(0,0,0,0.2)', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>{ytViewerCount} espectadores</span>)}
        </a>
      )}

      {/* Empty state → screensaver */}
      {hasLoaded && !hasContent && <ScreenSaver />}
    </div>
  )
}