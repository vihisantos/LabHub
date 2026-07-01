import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar } from 'lucide-react'
import type { TvEvent } from '../types'

interface EventsCarouselProps {
  events: TvEvent[]
  interval?: number
}

export function EventsCarousel({ events, interval = 8000 }: EventsCarouselProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (events.length <= 1) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % events.length)
    }, interval)
    return () => clearInterval(timer)
  }, [events.length, interval])

  if (events.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#475569', gap: '1rem',
      }}>
        <Calendar size={64} strokeWidth={1} />
        <p style={{ fontSize: '1.25rem' }}>Nenhum evento programado</p>
      </div>
    )
  }

  const event = events[index]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: '3rem',
    }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.5 }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', maxWidth: '800px', gap: '1.5rem',
          }}
        >
          {event.image_url && (
            <img
              src={event.image_url}
              alt={event.title}
              style={{
                width: '100%', maxHeight: '300px', objectFit: 'cover',
                borderRadius: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
            />
          )}
          <h2 style={{
            fontSize: '2.5rem', fontWeight: 800, color: '#f1f5f9',
            lineHeight: 1.2,
          }}>
            {event.title}
          </h2>
          {event.description && (
            <p style={{
              fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6,
              maxWidth: '600px',
            }}>
              {event.description}
            </p>
          )}
          <div style={{ display: 'flex', gap: '2rem', color: '#64748b', fontSize: '1rem' }}>
            {event.start_date && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} />
                {new Date(event.start_date).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {events.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === index ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === index ? '#6366f1' : '#334155',
                  transition: 'all 0.3s',
                }}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
