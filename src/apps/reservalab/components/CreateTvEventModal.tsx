import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Tv, Check, Plus, X } from 'lucide-react'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { fetchWorkspaceDevices, reserveEventUpsert } from '../../tv/services/supabase'
import type { TvDevice } from '../../tv/types'
import { brDateToIso, isoToBrDate, minutesToTime, mapReserveError } from '../utils/tvEvent'

export interface TvEventDraft {
  title: string
  description: string
  /** Data da reserva em DD/MM/YYYY (obrigatória). */
  reservationDate: string
  /** Chave determinística da reserva (backend /api/reservas). null = sem ligação. */
  reservationId: string | null
  /** Minutos desde meia-noite, somente na data da reserva. null = sem horário. */
  timeStartMinutes: number | null
  timeEndMinutes: number | null
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [additionalDates, setAdditionalDates] = useState<string[]>([])
  const [dateInput, setDateInput] = useState<string>('')
  const [dateError, setDateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdNames, setCreatedNames] = useState<string[] | null>(null)

  const reservationDateIso = brDateToIso(draft.reservationDate)
  const hasTime = draft.timeStartMinutes != null && draft.timeEndMinutes != null

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
        if (rows.length === 1) setSelectedIds([rows[0].id])
      } catch {
        if (mounted) setError('Não foi possível carregar as TVs deste campus.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [workspace?.id])

  // Mantém sempre ao menos uma TV selecionada (exigência 1..N com mínimo 1).
  const toggleDevice = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter((d) => d !== id)
      }
      return [...prev, id]
    })
  }

  const removeAdditionalDate = (iso: string) => {
    setAdditionalDates((prev) => prev.filter((d) => d !== iso))
  }

  const addAdditionalDate = () => {
    if (!dateInput) return
    setDateError('')
    if (dateInput === reservationDateIso) {
      setDateError('Esta data é a própria data da reserva.')
      return
    }
    if (additionalDates.includes(dateInput)) {
      setDateError('Esta data já foi adicionada.')
      return
    }
    if (reservationDateIso && dateInput < reservationDateIso) {
      setDateError('As datas adicionais não podem ser anteriores à data da reserva.')
      return
    }
    setAdditionalDates((prev) => [...prev, dateInput])
    setDateInput('')
  }

  const handleCreate = async () => {
    if (selectedIds.length === 0 || saving) return
    if (!draft.reservationDate) {
      setError('Informe a data da reserva.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await reserveEventUpsert({
        reservationDate: reservationDateIso,
        title: draft.title || 'Reserva',
        description: draft.description || null,
        reservationId: draft.reservationId ?? null,
        timeStart: hasTime ? minutesToTime(draft.timeStartMinutes) : null,
        timeEnd: hasTime ? minutesToTime(draft.timeEndMinutes) : null,
        additionalDates: additionalDates.length ? [...additionalDates].sort() : null,
        targetDeviceIds: selectedIds,
        eventId: null,
      })
      const names = selectedIds
        .map((id) => devices.find((d) => d.id === id)?.name)
        .filter(Boolean) as string[]
      setCreatedNames(names)
    } catch (err) {
      console.error('[ReservaLab] Falha ao criar evento na TV:', err)
      setError(mapReserveError(err))
    } finally {
      setSaving(false)
    }
  }

  const reservationDateLabel = draft.reservationDate
    ? isoToBrDate(brDateToIso(draft.reservationDate))
    : '—'

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
          maxWidth: '480px', width: '100%', maxHeight: '85vh', overflow: 'auto',
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

        {createdNames ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0.9rem', borderRadius: '0.75rem',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
              color: '#22c55e', fontSize: '0.85rem', fontWeight: 600, flexWrap: 'wrap',
            }}>
              <Check size={16} /> Evento programado
              <span style={{ fontWeight: 500 }}>na TV {createdNames.join(', TV ')}</span>
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
            {/* Data da reserva: fixa, não removível */}
            <div style={{
              padding: '0.85rem', borderRadius: '0.75rem',
              background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '2px' }}>
                DATA DA RESERVA
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {reservationDateLabel}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {hasTime
                  ? `Horário: ${minutesToTime(draft.timeStartMinutes)} – ${minutesToTime(draft.timeEndMinutes)}`
                  : 'Sem horário declarado na reserva'}
              </div>
            </div>

            {/* Datas adicionais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Repetir nas datas adicionais
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="date"
                  value={dateInput}
                  min={reservationDateIso || undefined}
                  onChange={(e) => setDateInput(e.target.value)}
                  style={{
                    flex: 1, padding: '0.55rem 0.7rem', borderRadius: '0.6rem',
                    border: '1px solid var(--border)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', minHeight: '44px',
                  }}
                />
                <button
                  type="button"
                  onClick={addAdditionalDate}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                    padding: '0 0.9rem', borderRadius: '0.6rem', border: '1px solid var(--border)',
                    background: 'var(--bg-card)', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600, minHeight: '44px',
                  }}
                >
                  <Plus size={15} /> Adicionar
                </button>
              </div>
              {dateError && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444' }}>{dateError}</p>
              )}
              {additionalDates.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {additionalDates.map((iso) => (
                    <span key={iso} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '4px 8px', borderRadius: '0.5rem',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)',
                    }}>
                      {isoToBrDate(iso)}
                      <button
                        type="button"
                        onClick={() => removeAdditionalDate(iso)}
                        aria-label={`Remover ${isoToBrDate(iso)}`}
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                        }}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Nas datas adicionais o evento segue a programação normal da TV (somente a data da reserva usa o horário).
              </p>
            </div>

            {/* Seleção de TVs (1..N) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                TVs ({selectedIds.length}/{devices.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {devices.map((d) => {
                  const active = selectedIds.includes(d.id)
                  const online = isDeviceOnline(d)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDevice(d.id)}
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
            </div>

            {error && <p style={{ fontSize: '0.78rem', color: '#ef4444' }}>{error}</p>}

            <button
              type="button"
              onClick={handleCreate}
              disabled={selectedIds.length === 0 || saving}
              style={{
                padding: '0.7rem', borderRadius: '0.6rem', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 600,
                fontSize: '0.875rem', cursor: selectedIds.length === 0 || saving ? 'not-allowed' : 'pointer',
                opacity: selectedIds.length === 0 || saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Programando...' : 'Programar evento'}
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