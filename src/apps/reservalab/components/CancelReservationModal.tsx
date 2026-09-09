import { motion } from 'framer-motion'
import { Tablet as TabletIcon } from 'lucide-react'
import type { TabletReserva } from '../types'

interface CancelReservationModalProps {
  reservation: TabletReserva
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
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

export function CancelReservationModal({ reservation, onClose, onConfirm, loading }: CancelReservationModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={loading ? undefined : onClose}
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
          background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.5rem',
          maxWidth: '400px', width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '0.75rem', flexShrink: 0,
              background: 'rgba(220, 38, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TabletIcon size={20} color="#dc2626" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Cancelar reserva de tablets</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 500, marginTop: '2px' }}>
                {formatDate(reservation.horario_inicio)}
              </p>
            </div>
          </div>
          <button onClick={loading ? undefined : onClose} style={{ padding: '10px', borderRadius: '50%', border: 'none', background: 'var(--bg-input)', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <InfoRow label="Sala" value={reservation.sala} />
          <InfoRow label="Horário" value={`${formatTime(reservation.horario_inicio)} — ${formatTime(reservation.horario_fim)}`} />
          <InfoRow label="Professor" value={reservation.professor} />
          <InfoRow label="Quantidade" value={`${reservation.quantidade_tablets} tablets`} />
          {reservation.reservado_por && <InfoRow label="Reservado por" value={reservation.reservado_por} />}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Tem certeza que deseja cancelar esta reserva de tablets? Esta ação não pode ser desfeita.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: '9999px', border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, minHeight: '44px', opacity: loading ? 0.5 : 1,
            }}
          >
            Voltar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: '9999px', border: 'none',
              background: '#ef4444', color: '#ffffff', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, minHeight: '44px', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}