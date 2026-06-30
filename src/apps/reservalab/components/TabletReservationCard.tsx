import { motion } from 'framer-motion'
import type { TabletReserva } from '../types'

interface TabletReservationCardProps {
  reservation: TabletReserva
  onClick: (r: TabletReserva) => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function getStatus(res: TabletReserva) {
  const agora = new Date()
  const inicio = new Date(res.horario_inicio)
  const fim = new Date(res.horario_fim)
  if (agora >= inicio && agora <= fim) return { label: 'AGORA', color: '#dc2626', bg: 'rgba(239,68,68,0.1)' }
  if (agora < inicio && inicio.getTime() - agora.getTime() < 30 * 60 * 1000) return { label: 'EM BREVE', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
  if (agora > fim) return { label: 'ENCERRADA', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
  return { label: 'ATIVA', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' }
}

export function TabletReservationCard({ reservation, onClick }: TabletReservationCardProps) {
  const status = getStatus(reservation)
  const isLive = status.label === 'AGORA'

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(reservation)}
      className="reservation-card"
      style={{
        minWidth: '280px',
        padding: '1.25rem',
        borderRadius: '1rem',
        border: isLive ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(99,102,241,0.15)',
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(12px)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{reservation.sala}</h4>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '9999px', color: status.color, background: status.bg }}>
          {status.label}
        </span>
      </div>
      <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
        {formatTime(reservation.horario_inicio)} — {formatTime(reservation.horario_fim)}
      </p>
      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
        {reservation.professor}
      </p>
      {reservation.finalidade && (
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
          {reservation.finalidade}
        </p>
      )}
    </motion.div>
  )
}
