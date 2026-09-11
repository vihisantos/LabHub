import { motion } from 'framer-motion'
import { Bell, Monitor } from 'lucide-react'
import { pickUpcomingReservation, type LabReservationLike } from '../utils/upcomingReservation'
import type { TabletReserva } from '../types'

interface UpcomingReservationBannerProps {
  labReservas: LabReservationLike[]
  tabletReservas: TabletReserva[]
  /** Minutos de antecedência do aviso in-app (default: 30). */
  windowMinutes?: number
}

/**
 * Aviso in-app de reserva chegando. Complementa o push (que chega com o app
 * fechado): aqui o usuário já dentro do ReservaLab vê a próxima reserva do
 * campus começando, com contagem em minutos.
 */
export function UpcomingReservationBanner({
  labReservas,
  tabletReservas,
  windowMinutes = 30,
}: UpcomingReservationBannerProps) {
  const next = pickUpcomingReservation(labReservas, tabletReservas, windowMinutes)
  if (!next) return null

  const when = next.startsIn === 0 ? 'agora' : `em ${next.startsIn} min`

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '1.5rem', padding: '0.85rem 1rem', borderRadius: '0.85rem',
        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        border: '1px solid var(--accent-ring)',
        color: 'var(--text-primary)',
      }}
    >
      <span style={{
        width: '2rem', height: '2rem', borderRadius: '0.6rem', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent)',
      }}>
        {next.kind === 'tablet' ? <Monitor size={16} /> : <Bell size={16} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Reserva chegando {when}
        </p>
        <p style={{
          fontSize: '0.78rem', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {next.label} · {next.timeLabel}
          {next.professor ? ` · ${next.professor}` : ''}
        </p>
      </div>
    </motion.div>
  )
}
