import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Monitor, X } from 'lucide-react'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { useUpcomingReservations } from '../hooks/useUpcomingReservations'
import { pickUpcomingReservation } from '../utils/upcomingReservation'

/**
 * Pop-up da tela inicial avisando que uma reserva do campus está chegando.
 *
 * Regras:
 *  - só aparece para quem tem acesso `full` ao ReservaLab (super admin incluso);
 *  - janela de 30 min, igual ao push;
 *  - uma vez dispensado, o mesmo aviso não reaparece (chave por reserva).
 */
export function UpcomingReservationPopup() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const { getLevel } = useAppAccess()
  const canSee = getLevel('reservalab') === 'full'

  const { labReservas, tabletReservas } = useUpcomingReservations(
    canSee ? workspace?.slug : undefined,
    canSee ? workspace?.id : undefined,
  )

  const [dismissedKeys, setDismissedKeys] = useState<string[]>([])
  const next = canSee ? pickUpcomingReservation(labReservas, tabletReservas, 30) : null
  const open = !!next && !dismissedKeys.includes(next!.key)

  const dismiss = () => {
    if (next) setDismissedKeys((prev) => (prev.includes(next.key) ? prev : [...prev, next.key]))
  }

  const goToReservas = () => {
    dismiss()
    navigate('/reservalab')
  }

  return (
    <AnimatePresence>
      {open && next && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          role="dialog"
          aria-label="Reserva chegando"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 400, padding: '1rem',
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.5rem',
              maxWidth: '400px', width: '100%',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-soft)', color: 'var(--accent)',
              }}>
                {next.kind === 'tablet' ? <Monitor size={20} /> : <Bell size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Reserva chegando {next.startsIn === 0 ? 'agora' : `em ${next.startsIn} min`}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {next.label} · {next.timeLabel}
                  {next.professor ? ` · ${next.professor}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Fechar"
                style={{
                  border: 'none', background: 'var(--bg-input)', cursor: 'pointer',
                  borderRadius: '0.5rem', padding: '6px', color: 'var(--text-muted)',
                  display: 'flex', flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={dismiss}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: '0.6rem',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontWeight: 600,
                  fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                Dispensar
              </button>
              <button
                type="button"
                onClick={goToReservas}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: '0.6rem', border: 'none',
                  background: 'var(--accent)', color: '#fff', fontWeight: 600,
                  fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                Ver reservas
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
