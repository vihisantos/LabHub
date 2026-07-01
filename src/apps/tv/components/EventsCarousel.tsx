import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar } from 'lucide-react'
import type { TvEvent } from '../types'

interface EventsCarouselProps {
  events: TvEvent[]
  interval?: number
  fullBleed?: boolean
}

export function EventsCarousel({ events, interval = 8000, fullBleed }: EventsCarouselProps) {
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

  if (fullBleed) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={event.id + '-bg'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.title}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'radial-gradient(ellipse at center, #1e293b 0%, #080a14 100%)',
              }} />
            )}
            {/* Gradient overlay for readability */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(8,10,20,0.3) 0%, rgba(8,10,20,0.6) 50%, rgba(8,10,20,0.9) 100%)',
            }} />
          </motion.div>
        </AnimatePresence>

        {/* Event info overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', alignItems: 'center',
          padding: '0 3rem 12rem',
          textAlign: 'center',
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={event.id + '-text'}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              style={{ maxWidth: '900px' }}
            >
              <h2 style={{
                fontSize: 'clamp(2rem, 4vw, 3.5rem)',
                fontWeight: 800, color: '#f1f5f9',
                lineHeight: 1.15, marginBottom: '0.75rem',
                textShadow: '0 2px 20px rgba(0,0,0,0.3)',
              }}>
                {event.title}
              </h2>
              {event.description && (
                <p style={{
                  fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                  color: '#cbd5e1', lineHeight: 1.5,
                  maxWidth: '700px', margin: '0 auto',
                  textShadow: '0 1px 10px rgba(0,0,0,0.2)',
                }}>
                  {event.description}
                </p>
              )}
              {event.start_date && (
                <p style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.5rem', marginTop: '1rem',
                  color: '#94a3b8', fontSize: '1rem',
                }}>
                  <Calendar size={18} />
                  {new Date(event.start_date).toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots */}
        <div style={{
          position: 'absolute', bottom: '6rem', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: '0.5rem',
        }}>
          {events.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === index ? '24px' : '8px',
                height: '8px', borderRadius: '4px',
                background: i === index ? '#6366f1' : 'rgba(255,255,255,0.2)',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

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
