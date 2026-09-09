import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const desks = Array.from({ length: DESK_COLS * DESK_ROWS }, (_, i) => {
    if (i === PCD_INDEX) return { label: 'PCD', pcd: true }
    return { label: `${Math.floor(i / DESK_COLS) + 1}.${(i % DESK_COLS) + 1}`, pcd: false }
  })

  const buildTvUrl = () => {
    const params = new URLSearchParams()
    params.set('tab', 'events')
    params.set('title', reservation.subject)

    // Build description from available data
    const parts: string[] = []
    if (reservation.data) parts.push(`Data: ${reservation.data}`)
    if (reservation.professor) parts.push(`Professor: ${reservation.professor}`)
    if (reservation.reservaFeitaPor) parts.push(`Reservado por: ${reservation.reservaFeitaPor}`)
    parts.push(reservation.time)
    params.set('description', parts.join(' | '))

    // Build ISO dates from data + time
    if (reservation.data && reservation.horario_inicio != null) {
      const [dia, mes, ano] = reservation.data.split('/').map(Number)
      const h = Math.floor(reservation.horario_inicio / 60)
      const m = reservation.horario_inicio % 60
      const start = new Date(ano, mes - 1, dia, h, m)
      params.set('start_date', start.toISOString())
    }
    if (reservation.data && reservation.horario_fim != null) {
      const [dia, mes, ano] = reservation.data.split('/').map(Number)
      const h = Math.floor(reservation.horario_fim / 60)
      const m = reservation.horario_fim % 60
      const end = new Date(ano, mes - 1, dia, h, m)
      params.set('end_date', end.toISOString())
    }

    return `/tv?${params.toString()}`
  }

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
          background: 'var(--bg-card)',
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
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {reservation.subject}
              </h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 500 }}>
                {reservation.isLive ? '🟢 Ativo agora' : reservation.isEmBreve ? '🟡 Começa em breve' : reservation.isEnded ? '⚫ Encerrada' : '🔵 Agendada'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => { navigate(buildTvUrl()); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '6px 12px', borderRadius: '0.5rem', border: '1px solid var(--border)',
                  background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--accent)',
                  fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
                </svg>
                Criar evento na TV
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '10px', borderRadius: '50%', border: 'none',
                  background: 'var(--bg-input)', cursor: 'pointer',
                  minHeight: '44px', minWidth: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Info Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>
                <ClockSVG /> Horário
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{reservation.time}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UserSVG /> Professor
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{reservation.professor || '—'}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UsersSVG /> Alunos
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{reservation.alunos}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>
                <UserSVG /> Reservado por
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{reservation.reservaFeitaPor || '—'}</p>
            </div>
          </div>

          {/* Desk Map */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Mapa de Carteiras
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${DESK_COLS}, 1fr)`,
              gap: '4px',
              background: 'var(--bg-input)',
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
                    background: desk.pcd ? 'var(--accent)' : 'var(--bg-segmented)',
                    color: desk.pcd ? '#ffffff' : 'var(--text-muted)',
                    cursor: 'default',
                  }}
                >
                  {desk.label}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--bg-segmented)', display: 'inline-block' }} /> Livre
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent)', display: 'inline-block' }} /> PCD
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
