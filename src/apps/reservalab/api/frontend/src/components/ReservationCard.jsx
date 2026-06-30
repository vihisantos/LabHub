import { motion } from 'framer-motion'
import { Clock, BookOpen, User } from 'lucide-react'

export default function ReservationCard({ reservation, onClick }) {
  const getStatusColor = (isLive, isEnded, isEmBreve) => {
    if (isLive) {
      return { 
        border: '1px solid rgba(239,68,68,0.5)',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 0 20px rgba(239,68,68,0.12)'
      }
    }
    if (isEmBreve) {
      return { 
        border: '1px solid rgba(245,158,11,0.5)',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 0 20px rgba(245,158,11,0.12)'
      }
    }
    if (isEnded) {
      return { 
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(255,255,255,0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }
    }
    return { 
      border: '1px solid rgba(99,102,241,0.15)',
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)'
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      key={reservation.id}
      onClick={() => onClick(reservation)}
      style={{
        ...getStatusColor(reservation.isLive, reservation.isEnded, reservation.isEmBreve),
        minWidth: '320px',
        padding: '1.5rem',
        borderRadius: '1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer'
      }}
      className="reservation-card"
      whileHover={{ scale: 1.02 }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f5f5f5', padding: '6px 12px', borderRadius: '9999px' }}>
            <Clock size={14} style={{ color: reservation.isLive ? '#ef4444' : reservation.isEmBreve ? '#f59e0b' : reservation.isEnded ? '#71717a' : '#71717a' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: reservation.isLive ? '#ef4444' : reservation.isEmBreve ? '#f59e0b' : reservation.isEnded ? '#94a3b8' : '#1e293b', textDecoration: reservation.isEnded ? 'line-through' : 'none' }}>
              {reservation.time}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {reservation.combined && (
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '4px 10px', borderRadius: '9999px', background: '#dbeafe', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                LABS 01 e 02
              </span>
            )}
            {reservation.isLive ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#ef4444', color: '#ffffff' }}
              >
                AGORA
              </motion.span>
            ) : reservation.isEmBreve ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#f59e0b', color: '#ffffff' }}
              >
                EM BREVE
              </motion.span>
            ) : reservation.isEnded ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#fee2e2', color: '#991b1b' }}>
                ENCERRADA
              </span>
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '9999px', background: '#f5f5f5', color: '#52525b' }}>
                OCUPADO
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '4px' }}>
            <BookOpen size={16} style={{ color: '#0a0a0a' }} />
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#71717a', marginBottom: '2px' }}>Disciplina</p>
            <p style={{ fontWeight: 500, color: '#1e293b' }}>{reservation.subject}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e4e4e7' }}>
        <User size={14} style={{ color: '#71717a' }} />
        <p style={{ fontSize: '14px', fontWeight: 500, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#71717a', fontWeight: 400, marginRight: '4px' }}>Professor:</span>
          {reservation.professor}
        </p>
      </div>
      {reservation.reservaFeitaPor && reservation.reservaFeitaPor !== reservation.professor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
          <User size={14} style={{ color: '#71717a' }} />
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#71717a', fontWeight: 400, marginRight: '4px' }}>Agendado por:</span>
            {reservation.reservaFeitaPor}
          </p>
        </div>
      )}
    </motion.div>
  )
}
