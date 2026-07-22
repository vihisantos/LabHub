import { motion } from 'framer-motion'
import { Sparkles, Calendar, MapPin } from 'lucide-react'
import type { TvEvent } from '../types'
import { getSafeEventImageUrl } from '../utils/eventImageProvider'

interface WelcomeSlideProps {
  event?: TvEvent | null
}

export function WelcomeSlide({ event }: WelcomeSlideProps) {
  const bgUrl = event
    ? getSafeEventImageUrl(event.title, event.description, event.image_url)
    : 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1920&q=80'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', color: '#f8fafc' }}>
      {/* Background Image */}
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: 1.04 }}
        transition={{ duration: 20, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.3) blur(3px)',
        }}
      />

      {/* Gradient Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(8,10,20,0.7) 0%, rgba(8,10,20,0.92) 100%)',
        }}
      />

      {/* Main Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Welcome Tag */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.5rem 1.5rem',
            borderRadius: '9999px',
            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#f472b6',
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '2rem',
            boxShadow: '0 8px 32px rgba(236, 72, 153, 0.25)',
          }}
        >
          <Sparkles size={18} />
          Sejam Bem-Vindos
        </motion.div>

        {/* Institution / Event Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: '1rem',
            maxWidth: '1100px',
            background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {event ? event.title : 'Universidade Anhembi Morumbi'}
        </motion.h1>

        {/* Subtitle / Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          style={{
            fontSize: 'clamp(1.1rem, 2vw, 1.6rem)',
            color: '#94a3b8',
            lineHeight: 1.5,
            maxWidth: '850px',
            marginBottom: '2.5rem',
          }}
        >
          {event?.description || 'Campus Piracicaba · Inovação, Prática e Excelência Acadêmica'}
        </motion.p>

        {/* Location & Details Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0.85rem 2rem',
            borderRadius: '1rem',
            color: '#cbd5e1',
            fontSize: '1.05rem',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} className="text-rose-400" />
            <span>UAM Piracicaba</span>
          </div>
          {event?.start_date && (
            <>
              <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.2)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} className="text-indigo-400" />
                <span>
                  {new Date(event.start_date).toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
