import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock } from 'lucide-react'
import type { TvEvent } from '../types'
import { getSafeEventImageUrl } from '../utils/eventImageProvider'

interface CountdownSlideProps {
  event: TvEvent
}

export function CountdownSlide({ event }: CountdownSlideProps) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(event.start_date))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(event.start_date))
    }, 1000)
    return () => clearInterval(timer)
  }, [event.start_date])

  function calculateTimeLeft(targetStr: string | null) {
    if (!targetStr) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true }
    const target = new Date(targetStr).getTime()
    const diff = target - Date.now()

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true }
    }

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      isPast: false,
    }
  }

  const bgUrl = getSafeEventImageUrl(event.title, event.description, event.image_url)

  const pad = (num: number) => String(num).padStart(2, '0')

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', color: '#f8fafc' }}>
      {/* Background Image with Slow Zoom Animation */}
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: 1.05 }}
        transition={{ duration: 15, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.35) blur(2px)',
        }}
      />

      {/* Dark Radial Gradient Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.5) 0%, rgba(8, 10, 20, 0.95) 100%)',
        }}
      />

      {/* Content Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 3rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1.25rem',
            borderRadius: '9999px',
            background: 'rgba(99, 102, 241, 0.25)',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            color: '#a5b4fc',
            fontSize: '0.9rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
          }}
        >
          <Clock size={16} />
          Contagem Regressiva
        </motion.div>

        {/* Event Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            fontSize: 'clamp(2rem, 4.5vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: '0.75rem',
            maxWidth: '1000px',
            color: '#ffffff',
            textShadow: '0 4px 30px rgba(0,0,0,0.5)',
          }}
        >
          {event.title}
        </motion.h1>

        {/* Date string */}
        {event.start_date && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#cbd5e1',
              fontSize: '1.25rem',
              fontWeight: 500,
              marginBottom: '2.5rem',
            }}
          >
            <Calendar size={20} className="text-indigo-400" />
            <span>
              {new Date(event.start_date).toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </motion.div>
        )}

        {/* Countdown Flip Cards Grid */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{
            display: 'flex',
            gap: '1.5rem',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {[
            { label: 'DIAS', value: pad(timeLeft.days) },
            { label: 'HORAS', value: pad(timeLeft.hours) },
            { label: 'MINUTOS', value: pad(timeLeft.minutes) },
            { label: 'SEGUNDOS', value: pad(timeLeft.seconds) },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '110px',
              }}
            >
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '1.25rem',
                  padding: '1.25rem 1.5rem',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                  minWidth: '110px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    lineHeight: 1,
                  }}
                >
                  {item.value}
                </span>
              </div>
              <span
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#94a3b8',
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
