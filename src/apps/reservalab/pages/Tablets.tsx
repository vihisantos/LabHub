import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tablet as TabletIcon, Plus, X } from 'lucide-react'
import { TimeInput } from '../components/TimeInput'
import { useIsMobile } from '../hooks/useIsMobile'
import { fetchTabletReservas, createTabletReserva, deleteTabletReserva, cleanupOldCancelledTablets } from '../services/supabase'
import type { TabletReserva } from '../types'

const SALAS_PRESET = [
  'Sala 1', 'Sala 2', 'Sala 3', 'TBL01', 'TBL02', 'Auditório',
  'tutoria 01', 'tutoria 02', 'tutoria 03', 'tutoria 04', 'tutoria 05',
  'tutoria 06', 'tutoria 07', 'tutoria 08', 'tutoria 09', 'tutoria 10',
  'Laboratório de Informática 1', 'Laboratório de Informática 2',
  'Sala 101A', 'Sala 101B', 'Sala 103', 'Sala 104', 'Debriefing 1', 'Debriefing 2',
  'Arena de Observação', 'Estrutura e Função Humana 1', 'Estrutura e Função Humana 2',
]

const initialForm = {
  sala: '',
  quantidade_tablets: 1,
  professor: '',
  data: '',
  inicio: '',
  fim: '',
  finalidade: '',
  reservado_por: '',
}

function parseTime(timeStr: string): string | null {
  if (!timeStr) return null
  const m = timeStr.match(/^(\d{2})h(\d{2})$/)
  if (!m) return null
  return `${m[1]}:${m[2]}:00`
}

export function TabletsView() {
  const isMobile = useIsMobile()
  const [reservas, setReservas] = useState<TabletReserva[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [showSalaDropdown, setShowSalaDropdown] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      cleanupOldCancelledTablets()
      try {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const rows = await fetchTabletReservas(hoje)
        if (mounted) setReservas(rows)
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
  }, [])

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const amanha = useMemo(() => { const d = new Date(hoje); d.setDate(d.getDate() + 1); return d }, [hoje])

  const reservasHoje = useMemo(
    () => reservas.filter((r) => {
      const d = new Date(r.horario_inicio)
      return d >= hoje && d < amanha
    }),
    [reservas, hoje, amanha]
  )

  const grupos = useMemo(() => {
    if (!mostrarTodas) return []
    const map: Record<string, TabletReserva[]> = {}
    reservas.forEach((r) => {
      const key = new Date(r.horario_inicio).toISOString().slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [reservas, mostrarTodas])

  const formatGroupLabel = (key: string) => {
    const hojeKey = hoje.toISOString().slice(0, 10)
    const amanhaKey = amanha.toISOString().slice(0, 10)
    if (key === hojeKey) return 'HOJE'
    if (key === amanhaKey) return 'AMANHÃ'
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'numeric' }).replace('-feira', '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.sala) { alert('Selecione uma sala'); return }
    if (!form.professor) { alert('Digite o nome do professor'); return }
    if (!form.data) { alert('Selecione a data'); return }
    if (!form.inicio) { alert('Digite o horário de início'); return }
    if (!form.fim) { alert('Digite o horário de fim'); return }

    const inicioTime = parseTime(form.inicio)
    const fimTime = parseTime(form.fim)
    if (!inicioTime) { alert('Horário de início inválido (use 07h30)'); return }
    if (!fimTime) { alert('Horário de fim inválido (use 09h20)'); return }

    setSubmitting(true)
    try {
      await createTabletReserva({
        sala: form.sala,
        quantidade_tablets: parseInt(String(form.quantidade_tablets)) || 1,
        professor: form.professor,
        horario_inicio: new Date(`${form.data}T${inicioTime}`).toISOString(),
        horario_fim: new Date(`${form.data}T${fimTime}`).toISOString(),
        finalidade: form.finalidade || '',
        reservado_por: form.reservado_por || '',
        status: 'ativa',
      })
      setForm(initialForm)
      setShowForm(false)
      const hoje2 = new Date(); hoje2.setHours(0, 0, 0, 0)
      const rows = await fetchTabletReservas(hoje2)
      setReservas(rows)
    } catch (err) {
      console.error('Erro ao criar reserva:', err)
      alert('Erro ao criar reserva')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (id: number) => {
    try {
      await deleteTabletReserva(id)
      setReservas((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error('Erro ao excluir reserva:', err)
    }
  }

  const formatTimeDisplay = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: '#71717a' }}>
        Carregando...
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: isMobile ? '6rem 1.5rem 5rem' : '9rem 1.5rem 6rem',
        minHeight: '100vh',
        color: '#0a0a0a',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TabletIcon size={28} style={{ color: '#6366f1' }} />
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>Reserva de Tablets</h2>
            <p style={{ color: '#71717a', fontSize: '1rem' }}>
              {reservasHoje.length} reserva{reservasHoje.length !== 1 ? 's' : ''} hoje
              {reservas.length > reservasHoje.length && !mostrarTodas && (
                <span style={{ color: '#a1a1aa' }}> · {reservas.length} no total</span>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {reservas.length > 5 && (
            <button
              onClick={() => setMostrarTodas(!mostrarTodas)}
              style={{
                padding: '10px 20px', borderRadius: '9999px', border: '1px solid #e4e4e7',
                background: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 500, minHeight: '44px',
              }}
            >
              {mostrarTodas ? 'Só hoje' : 'Todas'}
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowForm(!showForm)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: '9999px', border: 'none',
              background: showForm ? '#dc2626' : '#6366f1',
              color: '#ffffff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, minHeight: '44px',
            }}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Fechar' : 'Nova reserva'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(12px)',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              marginBottom: '2rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
              <FormField label="Sala">
                <input
                  type="text"
                  placeholder="Digite ou selecione uma sala"
                  value={form.sala}
                  onChange={(e) => { setForm((f) => ({ ...f, sala: e.target.value })); setShowSalaDropdown(true) }}
                  onFocus={() => setShowSalaDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSalaDropdown(false), 200)}
                  style={inputStyle}
                />
                {showSalaDropdown && (
                  <div style={dropdownStyle}>
                    {SALAS_PRESET.filter((s) => s.toLowerCase().includes(form.sala.toLowerCase())).map((sala) => (
                      <button
                        key={sala}
                        type="button"
                        onMouseDown={() => { setForm((f) => ({ ...f, sala })); setShowSalaDropdown(false) }}
                        style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: '14px', color: '#1e293b' }}
                      >
                        {sala}
                      </button>
                    ))}
                  </div>
                )}
              </FormField>

              <FormField label="Quantidade de tablets">
                <input
                  type="number" min="1" max="50"
                  value={form.quantidade_tablets}
                  onChange={(e) => setForm((f) => ({ ...f, quantidade_tablets: parseInt(e.target.value) || 1 }))}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Professor">
                <input
                  type="text" placeholder="Nome do professor"
                  value={form.professor}
                  onChange={(e) => setForm((f) => ({ ...f, professor: e.target.value }))}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Reservado por">
                <input
                  type="text" placeholder="Seu nome"
                  value={form.reservado_por}
                  onChange={(e) => setForm((f) => ({ ...f, reservado_por: e.target.value }))}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Data">
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  style={inputStyle}
                />
              </FormField>

              <TimeInput
                label="Horário início"
                placeholder="07h30"
                value={form.inicio}
                onChange={(v) => setForm((f) => ({ ...f, inicio: v }))}
              />

              <TimeInput
                label="Horário fim"
                placeholder="09h20"
                value={form.fim}
                onChange={(v) => setForm((f) => ({ ...f, fim: v }))}
              />

              <FormField label="Finalidade (opcional)" style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <input
                  type="text" placeholder="Ex: Prova, Aula prática..."
                  value={form.finalidade}
                  onChange={(e) => setForm((f) => ({ ...f, finalidade: e.target.value }))}
                  style={inputStyle}
                />
              </FormField>
            </div>

            <motion.button
              type="submit"
              disabled={submitting}
              whileTap={{ scale: 0.95 }}
              style={{
                marginTop: '1rem', padding: '12px 24px', borderRadius: '9999px', border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff',
                fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Salvando...' : 'Criar Reserva'}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {mostrarTodas
          ? grupos.map(([key, items]) => (
              <div key={key}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6366f1', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatGroupLabel(key)}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {items.map((r) => (
                    <ReservationRow key={r.id} reservation={r} onCancel={handleCancel} formatTime={formatTimeDisplay} />
                  ))}
                </div>
              </div>
            ))
          : reservasHoje.map((r) => (
              <ReservationRow key={r.id} reservation={r} onCancel={handleCancel} formatTime={formatTimeDisplay} />
            ))}
        {reservas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
            <TabletIcon size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>Nenhuma reserva encontrada</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function FormField({ label, children, style: containerStyle }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', ...containerStyle }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
  background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px',
  marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
}

function ReservationRow({
  reservation,
  onCancel,
  formatTime,
}: {
  reservation: TabletReserva
  onCancel: (id: number) => void
  formatTime: (iso: string) => string
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        padding: '1rem', borderRadius: '1rem',
        background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '0.75rem',
          background: 'rgba(99, 102, 241, 0.1)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TabletIcon size={18} color="#6366f1" />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>{reservation.sala}</p>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {formatTime(reservation.horario_inicio)} — {formatTime(reservation.horario_fim)}
            <span style={{ marginLeft: '8px' }}>{new Date(reservation.horario_inicio).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
          </p>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>{reservation.professor}</p>
        </div>
      </div>
      <button
        onClick={() => onCancel(reservation.id)}
        style={{
          padding: '8px 16px', borderRadius: '9999px', border: '1px solid #fecaca',
          background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', minHeight: '36px',
        }}
      >
        Cancelar
      </button>
    </motion.div>
  )
}
