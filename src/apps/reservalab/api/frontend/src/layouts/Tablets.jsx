import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tablet, Plus, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, cleanupOldCancelledTablets } from '../lib/supabaseClient'
import TimeInput from '../components/TimeInput'
import useIsMobile from '../hooks/useIsMobile'

const SALAS_PRESET = [
  'Sala 1', 'Sala 2', 'Sala 3', 'TBL01',
  'TBL02', 'Auditório',
  'tutoria 01', 'tutoria 02', 'tutoria 03', 'tutoria 04', 'tutoria 05', 'tutoria 06', 'tutoria 07', 'tutoria 08',
  'tutoria 09', 'tutoria 10',
  'Laboratório de Informática 1',
  'Laboratório de Informática 2',
  'Sala 101A', 'Sala 101B', 'Sala 103', 'Sala 104', 'Debriefing 1', 'Debriefing 2', 'Arena de Observação',
  'Estrtura e Função Humana 1', 'Estrtura e Função Humana 2',
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

function parseTime(timeStr) {
  if (!timeStr) return null
  const m = timeStr.match(/^(\d{2})h(\d{2})$/)
  if (!m) return null
  return `${m[1]}:${m[2]}:00`
}

export default function TabletsView() {
  const isMobile = useIsMobile()
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [showSalaDropdown, setShowSalaDropdown] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const buscarReservas = async () => {
    cleanupOldCancelledTablets()
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const { data } = await supabase.from('tablet_reservations').select({
        select: '*',
        order: 'horario_inicio.asc',
        filters: [
          { field: 'horario_inicio', op: 'gte', value: hoje.toISOString() },
        ],
      })
      if (!data) { setReservas([]); return }
      setReservas(data)
    } catch (err) {
      console.error('Erro ao buscar reservas:', err)
      toast.error('Erro ao carregar reservas: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  const dateKey = (d) => {
    const dt = new Date(d)
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  }

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const amanha = useMemo(() => { const d = new Date(hoje); d.setDate(d.getDate()+1); return d }, [hoje])

  const reservasHoje = useMemo(() =>
    reservas.filter(r => {
      const d = new Date(r.horario_inicio)
      return d >= hoje && d < amanha
    }), [reservas, hoje, amanha])

  const grupos = useMemo(() => {
    if (!mostrarTodas) return []
    const map = {}
    reservas.forEach(r => {
      const key = dateKey(r.horario_inicio)
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [reservas, mostrarTodas])

  const formatGroupLabel = (key) => {
    const [y,m,d] = key.split('-').map(Number)
    const dt = new Date(y, m-1, d)
    const hojeKey = dateKey(hoje)
    const amanhaKey = dateKey(amanha)
    if (key === hojeKey) return 'HOJE'
    if (key === amanhaKey) return 'AMANHÃ'
    return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'numeric' })
      .replace('-feira', '')
  }

  useEffect(() => {
    buscarReservas()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sala) { toast.error('Selecione uma sala'); return }
    if (!form.professor) { toast.error('Digite o nome do professor'); return }
    if (!form.data) { toast.error('Selecione a data'); return }
    if (!form.inicio) { toast.error('Digite o horário de início'); return }
    if (!form.fim) { toast.error('Digite o horário de fim'); return }

    const inicioTime = parseTime(form.inicio)
    const fimTime = parseTime(form.fim)
    if (!inicioTime) { toast.error('Horário de início inválido (use 07h30)'); return }
    if (!fimTime) { toast.error('Horário de fim inválido (use 09h20)'); return }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.from('tablet_reservations').insert({
        sala: form.sala,
        quantidade_tablets: parseInt(form.quantidade_tablets) || 1,
        professor: form.professor,
        horario_inicio: new Date(`${form.data}T${inicioTime}`).toISOString(),
        horario_fim: new Date(`${form.data}T${fimTime}`).toISOString(),
        finalidade: form.finalidade,
        reservado_por: form.reservado_por,
        status: 'ativa',
      })
      if (error) throw error
      toast.success('Reserva criada com sucesso!')
      setForm(initialForm)
      setShowForm(false)
      buscarReservas()
    } catch (err) {
      console.error('Erro ao criar reserva:', err)
      toast.error('Erro ao criar reserva: ' + (err.message || 'tente novamente'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      await supabase.from('tablet_reservations').delete({ id: cancelTarget.id })
      buscarReservas()
      setCancelTarget(null)
    } catch (err) {
      console.error('Erro ao excluir reserva:', err)
      toast.error('Erro ao excluir reserva: ' + (err.message || 'tente novamente'))
    }
  }

  const reservationToCancel = cancelTarget ? reservas.find(r => r.id === cancelTarget.id) : null

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const [editForm, setEditForm] = useState(initialForm)
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => {
    if (editTarget) {
      const inicio = new Date(editTarget.horario_inicio)
      const fim = new Date(editTarget.horario_fim)
      const dataStr = inicio.toISOString().slice(0, 10)
      const fmtTime = (d) =>
        `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
      setEditForm({
        sala: editTarget.sala,
        quantidade_tablets: editTarget.quantidade_tablets,
        professor: editTarget.professor,
        data: dataStr,
        inicio: fmtTime(inicio),
        fim: fmtTime(fim),
        finalidade: editTarget.finalidade || '',
        reservado_por: editTarget.reservado_por || '',
      })
    }
  }, [editTarget])

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editTarget) return
    const f = editForm
    if (!f.sala) { toast.error('Selecione uma sala'); return }
    if (!f.professor) { toast.error('Digite o nome do professor'); return }
    if (!f.data) { toast.error('Selecione a data'); return }
    if (!f.inicio) { toast.error('Digite o horário de início'); return }
    if (!f.fim) { toast.error('Digite o horário de fim'); return }

    const inicioTime = parseTime(f.inicio)
    const fimTime = parseTime(f.fim)
    if (!inicioTime) { toast.error('Horário de início inválido (use 07h30)'); return }
    if (!fimTime) { toast.error('Horário de fim inválido (use 09h20)'); return }

    setEditSubmitting(true)
    try {
      await supabase.from('tablet_reservations').update({
        sala: f.sala,
        quantidade_tablets: parseInt(f.quantidade_tablets) || 1,
        professor: f.professor,
        horario_inicio: new Date(`${f.data}T${inicioTime}`).toISOString(),
        horario_fim: new Date(`${f.data}T${fimTime}`).toISOString(),
        finalidade: f.finalidade,
        reservado_por: f.reservado_por,
      }, { id: editTarget.id })
      toast.success('Reserva atualizada com sucesso!')
      setEditTarget(null)
      buscarReservas()
    } catch (err) {
      console.error('Erro ao atualizar reserva:', err)
      toast.error('Erro ao atualizar reserva: ' + (err.message || 'tente novamente'))
    } finally {
      setEditSubmitting(false)
    }
  }

  const editField = (field, value) => setEditForm(f => ({ ...f, [field]: value }))

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
          <Tablet size={28} style={{ color: '#6366f1' }} />
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>
              Reserva de Tablets
            </h2>
            <p style={{ color: '#71717a', fontSize: '1rem' }}>
              {reservasHoje.length} reserva{reservasHoje.length !== 1 ? 's' : ''} hoje
              {reservas.length > reservasHoje.length && !mostrarTodas && (
                <span style={{ color: '#a1a1aa' }}> · {reservas.length} no total</span>
              )}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', borderRadius: '9999px', border: 'none',
            background: showForm ? '#dc2626' : '#6366f1',
            color: '#ffffff', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            minHeight: '44px',
          }}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Fechar' : 'Nova reserva'}
        </motion.button>
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
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Sala
                </label>
                <input
                  type="text"
                  placeholder="Digite ou selecione uma sala"
                  value={form.sala}
                  onChange={(e) => { updateField('sala', e.target.value); setShowSalaDropdown(true) }}
                  onFocus={() => setShowSalaDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSalaDropdown(false), 200)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {showSalaDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px',
                    marginTop: '4px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}>
                    {SALAS_PRESET.filter(s => s.toLowerCase().includes(form.sala.toLowerCase())).map(sala => (
                      <button
                        key={sala}
                        type="button"
                        onMouseDown={() => { updateField('sala', sala); setShowSalaDropdown(false) }}
                        style={{
                          width: '100%', padding: '10px 12px', border: 'none', background: 'transparent',
                          cursor: 'pointer', textAlign: 'left', fontSize: '14px', color: '#1e293b',
                        }}
                      >
                        {sala}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Quantidade de tablets
                </label>
                <input
                  type="number" min="1" max="50"
                  value={form.quantidade_tablets}
                  onChange={(e) => updateField('quantidade_tablets', e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Professor
                </label>
                <input
                  type="text" placeholder="Nome do professor"
                  value={form.professor}
                  onChange={(e) => updateField('professor', e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Reservado por
                </label>
                <input
                  type="text" placeholder="Seu nome"
                  value={form.reservado_por}
                  onChange={(e) => updateField('reservado_por', e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Data
                </label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => updateField('data', e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <TimeInput
                  label="Horário início"
                  placeholder="07h30"
                  value={form.inicio}
                  onChange={(v) => updateField('inicio', v)}
                />
              </div>

              <div>
                <TimeInput
                  label="Horário fim"
                  placeholder="09h20"
                  value={form.fim}
                  onChange={(v) => updateField('fim', v)}
                />
              </div>

              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                  Finalidade (opcional)
                </label>
                <input
                  type="text" placeholder="Ex: Prova PMSUS, Aula prática..."
                  value={form.finalidade}
                  onChange={(e) => updateField('finalidade', e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={submitting}
              whileTap={{ scale: 0.95 }}
              style={{
                marginTop: '1rem', padding: '12px 24px', borderRadius: '9999px', border: 'none',
                background: submitting ? '#a1a1aa' : '#6366f1',
                color: '#ffffff', cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px', fontWeight: 600, width: isMobile ? '100%' : 'auto',
                minHeight: '44px',
              }}
            >
              {submitting ? 'Reservando...' : 'Confirmar reserva'}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>
          Carregando reservas...
        </div>
      ) : reservas.length > 0 ? (
        <div>
          {!mostrarTodas && reservas.length > reservasHoje.length && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setMostrarTodas(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '9999px', border: '1px solid #e4e4e7',
                background: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                color: '#6366f1', marginBottom: '1rem',
              }}
            >
              Ver todas ({reservas.length} reservas) ▼
            </motion.button>
          )}
          {mostrarTodas && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setMostrarTodas(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '9999px', border: '1px solid #e4e4e7',
                background: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                color: '#6366f1', marginBottom: '1rem',
              }}
            >
              Mostrar só hoje ▲
            </motion.button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AnimatePresence>
            {(mostrarTodas ? grupos : [[null, reservasHoje]]).flatMap(([grupoKey, items]) => {
              const rows = items.map(r => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.25rem',
                    borderRadius: '0.75rem',
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: 'rgba(99,102,241,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Tablet size={18} style={{ color: '#6366f1' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>{r.sala}</div>
                      <div style={{ color: '#71717a', fontSize: '13px' }}>
                        {new Date(r.horario_inicio).toLocaleDateString('pt-BR')}
                        {' '}
                        {new Date(r.horario_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {' — '}
                        {new Date(r.horario_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {r.finalidade ? ` · ${r.finalidade}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#52525b' }}>{r.professor}</span>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEditTarget(r)}
                      style={{
                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #e4e4e7',
                        background: '#ffffff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                        color: '#52525b', whiteSpace: 'nowrap',
                      }}
                    >
                      <Pencil size={12} style={{ marginRight: '4px' }} />
                      Editar
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCancelTarget(r)}
                      style={{
                        padding: '6px 14px', borderRadius: '6px', border: '1px solid #fecaca',
                        background: '#fef2f2', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        color: '#dc2626', whiteSpace: 'nowrap',
                      }}
                    >
                      Cancelar
                    </motion.button>
                  </div>
                </motion.div>
              ))
              if (!grupoKey) return rows
              return [
                <div key={grupoKey} style={{
                  fontSize: '12px', fontWeight: 700, color: '#71717a',
                  padding: '0.5rem 0', letterSpacing: '0.05em',
                }}>
                  {formatGroupLabel(grupoKey).toUpperCase()} · {items.length} reserva{items.length !== 1 ? 's' : ''}
                </div>,
                ...rows,
              ]
            })}
          </AnimatePresence>
        </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            padding: '3rem', borderRadius: '1rem',
            border: '2px dashed #e4e4e7', textAlign: 'center', color: '#a1a1aa'
          }}
        >
          <Tablet size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>{mostrarTodas ? 'Nenhuma reserva de tablets encontrada' : 'Nenhuma reserva de tablets hoje'}</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Clique em "Nova reserva" para começar
          </p>
        </motion.div>
      )}

      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCancelTarget(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 300, padding: '1rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff', borderRadius: '1rem',
                padding: '2rem', maxWidth: '420px', width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: '#fef2f2', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  <X size={22} style={{ color: '#dc2626' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                    Excluir reserva
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#71717a', margin: '2px 0 0' }}>
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>

              {reservationToCancel && (
                <div style={{
                  padding: '1rem', background: '#f9fafb', borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                    {reservationToCancel.sala}
                  </div>
                  <div style={{ fontSize: '13px', color: '#71717a' }}>
                    {new Date(reservationToCancel.horario_inicio).toLocaleDateString('pt-BR')}
                    {' '}
                    {new Date(reservationToCancel.horario_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(reservationToCancel.horario_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: '13px', color: '#52525b', marginTop: '4px' }}>
                    {reservationToCancel.professor}
                    {reservationToCancel.finalidade ? ` · ${reservationToCancel.finalidade}` : ''}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCancelTarget(null)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px',
                    border: '1px solid #e4e4e7', background: '#ffffff',
                    cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                    color: '#52525b',
                  }}
                >
                  Voltar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCancel}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px',
                    border: 'none', background: '#dc2626',
                    cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                    color: '#ffffff',
                  }}
                >
                  Sim, excluir
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditTarget(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 300, padding: '1rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff', borderRadius: '1rem',
                padding: '2rem', maxWidth: '560px', width: '100%',
                maxHeight: '90vh', overflow: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                    Editar reserva
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#71717a', margin: '2px 0 0' }}>
                    {editTarget.sala} · {new Date(editTarget.horario_inicio).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  onClick={() => setEditTarget(null)}
                  style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdate}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Sala
                    </label>
                    <input
                      type="text" placeholder="Sala"
                      value={editForm.sala}
                      onChange={(e) => editField('sala', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Quantidade de tablets
                    </label>
                    <input
                      type="number" min="1" max="50"
                      value={editForm.quantidade_tablets}
                      onChange={(e) => editField('quantidade_tablets', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Professor
                    </label>
                    <input
                      type="text" placeholder="Nome do professor"
                      value={editForm.professor}
                      onChange={(e) => editField('professor', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Reservado por
                    </label>
                    <input
                      type="text" placeholder="Seu nome"
                      value={editForm.reservado_por}
                      onChange={(e) => editField('reservado_por', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Data
                    </label>
                    <input
                      type="date"
                      value={editForm.data}
                      onChange={(e) => editField('data', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <TimeInput
                      label="Horário início"
                      placeholder="07h30"
                      value={editForm.inicio}
                      onChange={(v) => editField('inicio', v)}
                    />
                  </div>

                  <div>
                    <TimeInput
                      label="Horário fim"
                      placeholder="09h20"
                      value={editForm.fim}
                      onChange={(v) => editField('fim', v)}
                    />
                  </div>

                  <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
                      Finalidade (opcional)
                    </label>
                    <input
                      type="text" placeholder="Ex: Prova PMSUS, Aula prática..."
                      value={editForm.finalidade}
                      onChange={(e) => editField('finalidade', e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setEditTarget(null)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '10px',
                      border: '1px solid #e4e4e7', background: '#ffffff',
                      cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                      color: '#52525b',
                    }}
                  >
                    Cancelar
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={editSubmitting}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '10px',
                      border: 'none', background: editSubmitting ? '#a1a1aa' : '#6366f1',
                      cursor: editSubmitting ? 'not-allowed' : 'pointer',
                      fontSize: '14px', fontWeight: 600, color: '#ffffff',
                    }}
                  >
                    {editSubmitting ? 'Salvando...' : 'Salvar alterações'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
