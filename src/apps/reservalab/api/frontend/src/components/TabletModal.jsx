import { motion } from 'framer-motion'
import { Clock, User, Tablet, BookOpen } from 'lucide-react'

export default function TabletModal({ reservation, onClose }) {
  if (!reservation) return null

  const inicio = new Date(reservation.horario_inicio)
  const fim = new Date(reservation.horario_fim)
  const formatTime = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const formatDate = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const agora = new Date()
  const cincoMinAntes = new Date(inicio.getTime() - 5 * 60 * 1000)
  const trintaMinAntes = new Date(inicio.getTime() - 30 * 60 * 1000)
  const isLive = agora >= cincoMinAntes && agora <= fim
  const isEmBreve = agora >= trintaMinAntes && agora < cincoMinAntes
  const isEnded = agora > fim

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '95%',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a0a0a' }}>{reservation.sala}</h3>
            <p style={{ color: '#6366f1', fontSize: '14px', fontWeight: 500 }}>
              {formatDate(inicio)} — {formatTime(inicio)} às {formatTime(fim)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M15 9l-6 6M9 9l6 6"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Tablet size={12} /> Sala
            </div>
            <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.sala}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> Horário
            </div>
            <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
              {formatDate(inicio)} — {formatTime(inicio)} às {formatTime(fim)}
            </div>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} /> Professor
            </div>
            <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.professor}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Tablet size={12} /> Quantidade de tablets
            </div>
            <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.quantidade_tablets}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BookOpen size={12} /> Disciplina
            </div>
            <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.finalidade || '—'}</div>
          </div>
          {reservation.reservado_por && (
            <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={12} /> Reservado por
              </div>
              <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.reservado_por}</div>
            </div>
          )}
            <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isLive ? (
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Agora</span>
                ) : isEmBreve ? (
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>Em breve</span>
                ) : isEnded ? (
                  <span style={{ color: '#6b7280' }}>Encerrada</span>
                ) : (
                  <span style={{ color: '#22c55e' }}>Ativa</span>
                )}
              </div>
            </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
