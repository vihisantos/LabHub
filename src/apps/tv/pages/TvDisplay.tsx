import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings, Tv } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { usePlaylists } from '../hooks/usePlaylists'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { MusicPlayer } from '../components/MusicPlayer'
import { EventsCarousel } from '../components/EventsCarousel'
import type { ContentType, TvPlaylist } from '../types'

export function TvDisplay() {
  const { events } = useEvents()
  const { playlists: videoPlaylists } = usePlaylists('video')
  const { playlists: musicPlaylists } = usePlaylists('music')

  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  /* ── Content rotation ── */
  const [contentQueue, setContentQueue] = useState<{ type: ContentType; playlist?: TvPlaylist }[]>([])
  const [queueIndex, setQueueIndex] = useState(0)

  const buildQueue = useCallback(() => {
    const queue: { type: ContentType; playlist?: TvPlaylist }[] = []
    const hasEvents = events.length > 0
    const hasVideo = videoPlaylists.length > 0
    const hasMusic = musicPlaylists.length > 0

    if (hasVideo) {
      for (const p of videoPlaylists) {
        queue.push({ type: 'video', playlist: p })
      }
    }
    if (hasMusic) {
      for (const p of musicPlaylists) {
        queue.push({ type: 'music', playlist: p })
      }
    }
    if (hasEvents) {
      queue.push({ type: 'events' })
    }

    if (queue.length === 0) {
      queue.push({ type: 'events' })
    }

    setContentQueue(queue)
    setQueueIndex(0)
  }, [events.length, videoPlaylists, musicPlaylists])

  useEffect(() => {
    buildQueue()
  }, [buildQueue])

  const currentItem = contentQueue[queueIndex] || { type: 'events' as ContentType }
  const hasContent = videoPlaylists.length > 0 || musicPlaylists.length > 0 || events.length > 0

  const [mediaReady, setMediaReady] = useState(false)

  const handleMediaEnd = () => {
    setMediaReady(false)
    advance()
  }

  const advance = () => {
    setQueueIndex((i) => (i + 1) % contentQueue.length)
  }

  /* ── Timer for auto-advance (fallback for non-YT items) ── */
  useEffect(() => {
    if (currentItem.type !== 'events') {
      setMediaReady(true)
    }
  }, [currentItem])

  useEffect(() => {
    if (currentItem.type === 'events') {
      const timer = setInterval(() => {
        advance()
      }, events.length > 0 ? 12000 : 6000)
      return () => clearInterval(timer)
    }
  }, [currentItem.type, events.length])

  useEffect(() => {
    const scheduleNext = () => {
      const item = contentQueue[queueIndex]
      if (item?.type === 'video' && item.playlist) {
        return item.playlist.duration_seconds * 1000
      }
      if (item?.type === 'music' && item.playlist) {
        return item.playlist.duration_seconds * 1000
      }
      return null
    }

    const ms = scheduleNext()
    if (ms !== null) {
      const timer = setTimeout(() => {
        setMediaReady(false)
        advance()
      }, ms)
      return () => clearTimeout(timer)
    }
  }, [queueIndex, contentQueue])

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const formatDate = (d: Date) =>
    d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#080a14',
        color: '#f1f5f9', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Background gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.06) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Admin button (corner) */}
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

      {/* Clock — top left */}
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

      {/* Main content area */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentItem.type}-${currentItem.playlist?.id || 'events'}-${queueIndex}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {currentItem.type === 'video' && currentItem.playlist && (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '80%', maxWidth: '1200px', aspectRatio: '16/9',
                  borderRadius: '1rem', overflow: 'hidden',
                  boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
                }}>
                  {mediaReady && (
                    <YouTubePlayer
                      url={currentItem.playlist.youtube_url}
                      onEnd={handleMediaEnd}
                    />
                  )}
                </div>
              </div>
            )}

            {currentItem.type === 'music' && currentItem.playlist && (
              <MusicPlayer
                url={currentItem.playlist.youtube_url}
                onEnd={handleMediaEnd}
              />
            )}

            {currentItem.type === 'events' && (
              <EventsCarousel events={events} interval={8000} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Corner decoration */}
      <div style={{
        position: 'fixed', bottom: '2rem', left: '3rem', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155',
      }}>
        <Tv size={16} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Lab Hub TV</span>
      </div>

      {/* Content type indicator */}
      <div style={{
        position: 'fixed', bottom: '2rem', right: '3rem', zIndex: 10,
        display: 'flex', gap: '0.5rem',
      }}>
        {contentQueue.map((_item, i) => (
          <div
            key={i}
            style={{
              width: i === queueIndex ? '24px' : '8px',
              height: '6px',
              borderRadius: '3px',
              background: i === queueIndex ? '#6366f1' : '#1e293b',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* Empty state */}
      {!hasContent && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: '1rem', color: '#475569',
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
