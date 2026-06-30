import { motion } from 'framer-motion'
import { Clock, User, Tablet, BookOpen, XCircle } from 'lucide-react'

function getTabletStatus(reservation) {
  const agora = new Date()
  const inicio = new Date(reservation.horario_inicio)
  const fim = new Date(reservation.horario_fim)

  if (reservation.status === 'cancelada') return { label: 'CANCELADA', style: 'ended' }

  const cincoMinAntes = new Date(inicio.getTime() - 5 * 60 * 1000)
  const trintaMinAntes = new Date(inicio.getTime() - 30 * 60 * 1000)

  if (agora >= cincoMinAntes && agora <= fim) return { label: 'AGORA', style: 'live' }
  if (agora >= trintaMinAntes && agora < cincoMinAntes) return { label: 'EM BREVE', style: 'embreve' }
  if (agora > fim) return { label: 'ENCERRADA', style: 'ended' }
  return { label: 'ATIVA', style: 'normal' }
}

function getStatusColor(style) {
  const map = {
    live: {
      border: '1px solid rgba(239,68,68,0.5)',
      background: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 20px rgba(239,68,68,0.12)',
    },
    embreve: {
      border: '1px solid rgba(245,158,11,0.5)',
      background: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 20px rgba(245,158,11,0.12)',
    },
    ended: {
      border: '1px solid rgba(148,163,184,0.3)',
      background: 'rgba(255,255,255,0.4)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    },
    normal: {
      border: '1px solid rgba(99,102,241,0.15)',
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    },
  }
  return map[style] || map.normal
}

export default function TabletReservationCard({ reservation, onClick, onCancel }) {
  const status = getTabletStatus(reservation)
  const inicio = new Date(reservation.horario_inicio)
  const fim = new Date(reservation.horario_fim)
  const formatTime = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      key={reservation.id}
      onClick={() => onClick?.(reservation)}
      style={{
        ...getStatusColor(status.style),
        minWidth: '320px',
        padding: '1.5rem',
        borderRadius: '1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}
      className="reservation-card"
      whileHover={{ scale: 1.02 }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f5f5f5', padding: '6px 12px', borderRadius: '9999px' }}>
            <Clock size={14} style={{ color: status.style === 'live' ? '#ef4444' : status.style === 'embreve' ? '#f59e0b' : status.style === 'ended' ? '#71717a' : '#71717a' }} />
            <span style={{
              fontWeight: 600, fontSize: '14px',
              color: status.style === 'live' ? '#ef4444' : status.style === 'embreve' ? '#f59e0b' : status.style === 'ended' ? '#94a3b8' : '#1e293b',
              textDecoration: status.style === 'ended' ? 'line-through' : 'none',
            }}>
              {formatTime(inicio)} - {formatTime(fim)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {status.style === 'live' ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#ef4444', color: '#ffffff' }}
              >
                {status.label}
              </motion.span>
            ) : status.style === 'embreve' ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#f59e0b', color: '#ffffff' }}
              >
                {status.label}
              </motion.span>
            ) : status.style === 'ended' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#fee2e2', color: '#991b1b' }}>
                {status.label}
              </span>
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '9999px', background: '#f5f5f5', color: '#52525b' }}>
                ATIVA
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '4px' }}>
            <Tablet size={16} style={{ color: '#0a0a0a' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', color: '#71717a', marginBottom: '2px' }}>Sala</p>
            <p style={{ fontWeight: 500, color: '#1e293b', marginBottom: reservation.finalidade ? '10px' : 0 }}>{reservation.sala}</p>
            {reservation.finalidade && (
              <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.12)' }}>
                <p style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, marginBottom: '2px' }}>DISCIPLINA</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{reservation.finalidade}</p>
              </div>
            )}
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
      {reservation.reservado_por && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
          <User size={14} style={{ color: '#71717a' }} />
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#71717a', fontWeight: 400, marginRight: '4px' }}>Agendado por:</span>
            {reservation.reservado_por}
          </p>
        </div>
      )}
      {reservation.status === 'ativa' && onCancel && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onCancel(reservation.id) }}
          style={{
            marginTop: '1rem', width: '100%', padding: '8px', borderRadius: '8px',
            border: '1px solid #e4e4e7', background: '#ffffff', cursor: 'pointer',
            fontSize: '13px', fontWeight: 500, color: '#dc2626',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <XCircle size={14} /> Cancelar reserva
        </motion.button>
      )}
    </motion.div>
  )
}
