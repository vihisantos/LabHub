import { motion } from 'framer-motion'
import type { TransformedReservation } from '../types'

const X = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
  </svg>
)

const ClockSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
)

const UserSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)

const UsersSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

interface ReservationModalProps {
  reservation: TransformedReservation
  onClose: () => void
}

const DESK_COLS = 7
const DESK_ROWS = 8
const PCD_INDEX = 54

export function ReservationModal({ reservation, onClose }: ReservationModalProps) {
  const desks = Array.from({ length: DESK_COLS * DESK_ROWS }, (_, i) => {
    if (i === PCD_INDEX) return { label: 'PCD', pcd: true }
    return { label: `${Math.floor(i / DESK_COLS) + 1}.${(i % DESK_COLS) + 1}`, pcd: false }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '1rem',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="modal-grid-2"
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                {reservation.subject}
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: 500 }}>
                {reservation.isLive ? '🟢 Ativo agora' : reservation.isEmBreve ? '🟡 Começa em breve' : reservation.isEnded ? '⚫ Encerrada' : '🔵 Agendada'}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '10px', borderRadius: '50%', border: 'none',
                background: '#f5f5f5', cursor: 'pointer',
                minHeight: '44px', minWidth: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Info Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#71717a', fontSize: '0.75rem', marginBottom: '4px' }}>
                <ClockSVG /> Horário
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{reservation.time}</p>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#71717a', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UserSVG /> Professor
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{reservation.professor || '—'}</p>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#71717a', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UsersSVG /> Alunos
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{reservation.alunos}</p>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#71717a', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UserSVG /> Reservado por
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{reservation.reservaFeitaPor || '—'}</p>
            </div>
          </div>

          {/* Desk Map */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.75rem' }}>
              Mapa de Carteiras
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${DESK_COLS}, 1fr)`,
              gap: '4px',
              background: '#f8fafc',
              padding: '0.75rem',
              borderRadius: '0.75rem',
            }}>
              {desks.map((desk, i) => (
                <div
                  key={i}
                  title={`Carteira ${desk.label}`}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    background: desk.pcd ? '#6366f1' : '#e2e8f0',
                    color: desk.pcd ? '#ffffff' : '#94a3b8',
                    cursor: 'default',
                  }}
                >
                  {desk.label}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#e2e8f0', display: 'inline-block' }} /> Livre
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#6366f1', display: 'inline-block' }} /> PCD
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
