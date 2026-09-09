import { motion } from 'framer-motion'
import type { TransformedReservation } from '../types'

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

interface ReservationCardProps {
  reservation: TransformedReservation
  onClick: () => void
}

function getStatusBadge(res: TransformedReservation): { label: string; color: string; bg: string } | null {
  if (res.isLive) return { label: 'AGORA', color: '#dc2626', bg: 'rgba(239,68,68,0.1)' }
  if (res.isEmBreve) return { label: 'EM BREVE', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
  if (res.isEnded) return { label: 'ENCERRADA', color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.12)' }
  return { label: 'OCUPADO', color: 'var(--accent)', bg: 'var(--accent-soft)' }
}

export function ReservationCard({ reservation, onClick }: ReservationCardProps) {
  const badge = getStatusBadge(reservation)
  const isLive = reservation.isLive
  const isEmBreve = reservation.isEmBreve

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="reservation-card"
      style={{
        minWidth: '300px',
        padding: '1.25rem',
        borderRadius: '1rem',
        border: isLive
          ? '1px solid rgba(239,68,68,0.5)'
          : '1px solid var(--border)',
        background: isLive
          ? 'color-mix(in srgb, var(--bg-card) 65%, transparent)'
          : 'color-mix(in srgb, var(--bg-card) 60%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        ...(isLive ? { boxShadow: '0 0 20px rgba(239,68,68,0.12)' } : {}),
      }}
    >
      {/* Status bar */}
      {isLive && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, #dc2626, #ef4444)',
          }}
        />
      )}

      {/* Header: Time + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          <ClockSVG />
          {reservation.time}
        </div>
        {badge && (
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '9999px',
            color: badge.color,
            background: badge.bg,
            ...(isEmBreve ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : {}),
          }}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Subject */}
      <p style={{
        fontSize: '1rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '0.75rem',
        lineHeight: 1.3,
      }}>
        {reservation.subject}
      </p>

      {/* Professor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        <UserSVG />
        <span>{reservation.professor || '—'}</span>
      </div>

      {/* Alunos */}
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {reservation.alunos} alunos
      </div>
    </motion.div>
  )
}
