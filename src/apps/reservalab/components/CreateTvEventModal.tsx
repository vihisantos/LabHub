import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Tv, Check } from 'lucide-react'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { fetchWorkspaceDevices, createEvent } from '../../tv/services/supabase'
import type { TvDevice } from '../../tv/types'

export interface TvEventDraft {
  title: string
  description: string
  /** ISO 8601 (ou null) */
  startDate: string | null
  /** ISO 8601 (ou null) */
  endDate: string | null
}

interface CreateTvEventModalProps {
  draft: TvEventDraft
  onClose: () => void
}

/** Considera a TV "online" se bateu heartbeat nos últimos 15 min. */
function isDeviceOnline(device: TvDevice): boolean {
  return !!device.last_seen && Date.now() - new Date(device.last_seen).getTime() < 15 * 60 * 1000
}

export function CreateTvEventModal({ draft, onClose }: CreateTvEventModalProps) {
  const { workspace } = useWorkspace()
  const [devices, setDevices] = useState<TvDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdOn, setCreatedOn] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!workspace?.id) {
        if (mounted) { setDevices([]); setLoading(false) }
        return
      }
      try {
        const rows = await fetchWorkspaceDevices(workspace.id)
        if (!mounted) return
        setDevices(rows)
        // Só uma TV no campus → já vem selecionada.
        if (rows.length === 1) setSelected(rows[0].id)
      } catch {
        if (mounted) setError('Não foi possível carregar as TVs deste campus.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [workspace?.id])

  const handleCreate = async () => {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    try {
      await createEvent({
        title: draft.title || 'Reserva',
        description: draft.description || null,
        image_url: null,
        pdf_url: null,
        start_date: draft.startDate,
        end_date: draft.endDate,
        is_active: true,
        sort_order: 0,
        device_id: selected,
      })
      const device = devices.find((d) => d.id === selected)
      setCreatedOn(device?.name || 'TV')
    } catch {
      setError('Não foi possível criar o evento. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300, padding: '1rem',
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.5rem',
          maxWidth: '440px', width: '100%', maxHeight: '85vh', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.25rem' }}>
          <div style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '0.6rem',
            background: 'var(--accent-soft)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <Tv size={18} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Criar evento na TV
          </h3>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          {draft.title}
        </p>

        {createdOn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0.9rem', borderRadius: '0.75rem',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
              color: '#22c55e', fontSize: '0.85rem', fontWeight: 600,
            }}>
              <Check size={16} /> Evento criado na TV {createdOn}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '0.7rem', borderRadius: '0.6rem', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 600,
                fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Concluir
            </button>
          </div>
        ) : loading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
            Carregando TVs do campus...
          </p>
        ) : !workspace?.id ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Selecione um campus para escolher a TV.
          </p>
        ) : devices.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            gap: '0.5rem', padding: '1.5rem 1rem', borderRadius: '0.75rem',
            border: '1.5px dashed var(--border)', color: 'var(--text-muted)',
          }}>
            <Monitor size={26} style={{ opacity: 0.6 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Nenhuma TV ativada neste campus
            </p>
            <p style={{ fontSize: '0.75rem' }}>
              Ative uma TV pelo app TV → Dispositivos usando um código de ativação.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {devices.map((d) => {
                const active = selected === d.id
                const online = isDeviceOnline(d)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelected(d.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '0.7rem 0.85rem', borderRadius: '0.75rem', textAlign: 'left',
                      cursor: 'pointer',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'var(--accent-soft)' : 'var(--bg-input)',
                    }}
                  >
                    <Monitor size={16} color={active ? 'var(--accent)' : 'var(--text-muted)'} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: '0.875rem', fontWeight: 600,
                        color: 'var(--text-primary)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {d.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: online ? '#22c55e' : 'var(--text-muted)' }}>
                        {online ? 'online' : 'offline'}
                      </span>
                    </span>
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: active ? '5px solid var(--accent)' : '1.5px solid var(--border)',
                    }} />
                  </button>
                )
              })}
            </div>

            {error && <p style={{ fontSize: '0.78rem', color: '#ef4444' }}>{error}</p>}

            <button
              type="button"
              onClick={handleCreate}
              disabled={!selected || saving}
              style={{
                padding: '0.7rem', borderRadius: '0.6rem', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 600,
                fontSize: '0.875rem', cursor: !selected || saving ? 'not-allowed' : 'pointer',
                opacity: !selected || saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Criando...' : 'Criar evento'}
            </button>
          </div>
        )}

        {error && devices.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.75rem' }}>{error}</p>
        )}
      </motion.div>
    </motion.div>
  )
}
