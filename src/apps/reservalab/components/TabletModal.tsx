import { motion } from 'framer-motion'
import type { TabletReserva } from '../types'

interface TabletModalProps {
  reservation: TabletReserva
  onClose: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const X = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
  </svg>
)

export function TabletModal({ reservation, onClose }: TabletModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: '1rem',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: '1rem', padding: '1.5rem',
          maxWidth: '400px', width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0a0a0a' }}>{reservation.sala}</h3>
            <p style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: 500, marginTop: '2px' }}>
              {formatDate(reservation.horario_inicio)}
            </p>
          </div>
          <button onClick={onClose} style={{ padding: '10px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <InfoRow label="Horário" value={`${formatTime(reservation.horario_inicio)} — ${formatTime(reservation.horario_fim)}`} />
          <InfoRow label="Professor" value={reservation.professor} />
          <InfoRow label="Quantidade" value={`${reservation.quantidade_tablets} tablets`} />
          <InfoRow label="Reservado por" value={reservation.reservado_por || '—'} />
          {reservation.finalidade && <InfoRow label="Finalidade" value={reservation.finalidade} />}
          <InfoRow label="Status" value={reservation.status === 'ativa' ? 'Ativa' : 'Cancelada'} />
        </div>
      </motion.div>
    </motion.div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.8rem', color: '#71717a' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
