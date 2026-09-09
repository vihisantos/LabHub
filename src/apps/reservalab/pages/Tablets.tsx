import { useState, useEffect, useMemo } from 'react'
import { Tablet as TabletIcon, Plus, X, User, Pencil } from 'lucide-react'
import { TimeInput } from '../components/TimeInput'
import { TabletCalendar, type CalendarDay } from '../components/TabletCalendar'
import { CancelReservationModal } from '../components/CancelReservationModal'
import { TabletModal } from '../components/TabletModal'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAuth } from '../../../core/auth/AuthContext'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import {
  fetchTabletReservas,
  createTabletReserva,
  updateTabletReserva,
  deleteTabletReserva,
  checkTabletCapacity,
} from '../services/supabase'
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

/** ISO (da reserva) → "YYYY-MM-DD" para o input date. */
function isoToDateInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO (da reserva) → "HHhMM" para o TimeInput. */
function isoToTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
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
  const [formError, setFormError] = useState('')
  const { user } = useAuth()
  const { getLevel } = useAppAccess()
  const { workspace } = useWorkspace()
  const canEdit = getLevel('reservalab') === 'full'

  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [monthReservas, setMonthReservas] = useState<TabletReserva[]>([])
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [canceling, setCanceling] = useState<TabletReserva | null>(null)
  const [cancelingSubmit, setCancelingSubmit] = useState(false)
  const [detailsReserva, setDetailsReserva] = useState<TabletReserva | null>(null)
  // Edição: reserva em edição (null = formulário em modo criação)
  const [editing, setEditing] = useState<TabletReserva | null>(null)

  // Auto-fill reservado_por with logged-in user whenever form opens
  useEffect(() => {
    if (showForm && user?.name) {
      setForm((prev) => ({ ...prev, reservado_por: user.name }))
    }
  }, [showForm, user?.name])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const rows = await fetchTabletReservas(hoje, undefined, workspace?.id)
        if (mounted) setReservas(rows)
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    }
    const timer = setTimeout(load, 100)
    return () => { mounted = false; clearTimeout(timer) }
    // Re-carrega quando o workspace (campus) muda — antes ficava com o valor antigo
  }, [workspace?.id])

  // Busca reservas do mês exibido no calendário (inclui meses passados)
  useEffect(() => {
    let mounted = true
    const loadMonth = async () => {
      setLoadingCalendar(true)
      try {
        const primeiro = new Date(calYear, calMonth, 1)
        primeiro.setHours(0, 0, 0, 0)
        const ultimo = new Date(calYear, calMonth + 1, 1)
        ultimo.setHours(0, 0, 0, 0)
        const rows = await fetchTabletReservas(primeiro, ultimo, workspace?.id)
        if (mounted) setMonthReservas(rows)
      } catch {
        // ignore
      } finally {
        if (mounted) setLoadingCalendar(false)
      }
    }
    loadMonth()
    return () => { mounted = false }
  }, [calYear, calMonth, workspace?.id])

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const amanha = useMemo(() => { const d = new Date(hoje); d.setDate(d.getDate() + 1); return d }, [hoje])

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const todayKey = new Date().toISOString().slice(0, 10)

    const byDay = new Map<string, TabletReserva[]>()
    monthReservas.forEach((r) => {
      const key = new Date(r.horario_inicio).toISOString().slice(0, 10)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(r)
    })

    const days: CalendarDay[] = []
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: '', day: 0, isToday: false, isOther: true, items: [] })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ date, day: d, isToday: date === todayKey, isOther: false, items: byDay.get(date) || [] })
    }
    return days
  }, [calYear, calMonth, monthReservas])

  const selectedDayItems = useMemo(
    () => (selectedDay ? monthReservas.filter((r) => new Date(r.horario_inicio).toISOString().slice(0, 10) === selectedDay) : []),
    [selectedDay, monthReservas]
  )

  function prevMonth() {
    setSelectedDay(null)
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1) }
    else setCalMonth((m) => m - 1)
  }

  function nextMonth() {
    setSelectedDay(null)
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1) }
    else setCalMonth((m) => m + 1)
  }

  function goToToday() {
    setCalYear(new Date().getFullYear())
    setCalMonth(new Date().getMonth())
    setSelectedDay(new Date().toISOString().slice(0, 10))
  }

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
    if (!form.sala) { setFormError('Selecione uma sala'); return }
    if (!form.professor) { setFormError('Digite o nome do professor'); return }
    if (!form.data) { setFormError('Selecione a data'); return }
    if (!form.inicio) { setFormError('Digite o horário de início'); return }
    if (!form.fim) { setFormError('Digite o horário de fim'); return }

    const inicioTime = parseTime(form.inicio)
    const fimTime = parseTime(form.fim)
    if (!inicioTime) { setFormError('Horário de início inválido (use 07h30)'); return }
    if (!fimTime) { setFormError('Horário de fim inválido (use 09h20)'); return }
    setFormError('')

    const quantidade = parseInt(String(form.quantidade_tablets)) || 1
    const inicioDate = new Date(`${form.data}T${inicioTime}`)
    const fimDate = new Date(`${form.data}T${fimTime}`)

    setSubmitting(true)
    try {
      // Capacidade: soma os tablets já reservados no intervalo e compara com
      // o inventário (50). Sobreposição de sala/horário é permitida enquanto
      // não ultrapassar o inventário — acima disso, barra com aviso.
      const capacityError = await checkTabletCapacity({
        inicio: inicioDate,
        fim: fimDate,
        quantidade,
        workspaceId: workspace?.id,
        ignoreId: editing?.id,
      })
      if (capacityError) {
        setFormError(capacityError)
        return
      }

      const payload = {
        sala: form.sala,
        quantidade_tablets: quantidade,
        professor: form.professor,
        horario_inicio: inicioDate.toISOString(),
        horario_fim: fimDate.toISOString(),
        finalidade: form.finalidade || '',
        reservado_por: form.reservado_por || '',
      }

      if (editing) {
        await updateTabletReserva(editing.id, payload)
      } else {
        await createTabletReserva({ ...payload, status: 'ativa' }, workspace?.id)
      }
      setForm(initialForm)
      setFormError('')
      setShowForm(false)
      setEditing(null)
      const hoje2 = new Date(); hoje2.setHours(0, 0, 0, 0)
      const rows = await fetchTabletReservas(hoje2, undefined, workspace?.id)
      setReservas(rows)
      setLoadingCalendar(true)
      const primeiro = new Date(calYear, calMonth, 1); primeiro.setHours(0, 0, 0, 0)
      const ultimo = new Date(calYear, calMonth + 1, 1); ultimo.setHours(0, 0, 0, 0)
      setMonthReservas(await fetchTabletReservas(primeiro, ultimo, workspace?.id))
      setLoadingCalendar(false)
    } catch (err) {
      console.error('Erro ao salvar reserva:', err)
      setFormError(err instanceof Error && err.message
        ? `Erro ao salvar reserva: ${err.message}`
        : 'Erro ao salvar reserva. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Abre o formulário em modo edição, preenchido com a reserva. */
  function openEditModal(r: TabletReserva) {
    setEditing(r)
    setForm({
      sala: r.sala,
      quantidade_tablets: r.quantidade_tablets,
      professor: r.professor,
      data: isoToDateInput(r.horario_inicio),
      inicio: isoToTimeInput(r.horario_inicio),
      fim: isoToTimeInput(r.horario_fim),
      finalidade: r.finalidade || '',
      reservado_por: r.reservado_por || '',
    })
    setFormError('')
    setShowForm(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Fecha o formulário e volta para o modo criação. */
  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(initialForm)
    setFormError('')
  }

  const handleCancel = async (id: string) => {
    setCancelingSubmit(true)
    try {
      await deleteTabletReserva(id)
      setReservas((prev) => prev.filter((r) => r.id !== id))
      setMonthReservas((prev) => prev.filter((r) => r.id !== id))
      setCanceling(null)
    } catch (err) {
      console.error('Erro ao cancelar reserva:', err)
      setCanceling(null)
    } finally {
      setCancelingSubmit(false)
    }
  }

  const openCancelModal = (reservation: TabletReserva) => setCanceling(reservation)

  const formatTimeDisplay = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        Carregando...
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: isMobile ? '6rem 1.5rem 5rem' : '9rem 1.5rem 6rem',
        minHeight: '100vh',
        color: 'var(--text-primary)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TabletIcon size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Reserva de Tablets</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
              {reservasHoje.length} reserva{reservasHoje.length !== 1 ? 's' : ''} hoje
              {reservas.length > reservasHoje.length && !mostrarTodas && (
                <span style={{ color: 'var(--text-muted)' }}> · {reservas.length} no total</span>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {reservas.length > 5 && (
            <button
              onClick={() => setMostrarTodas(!mostrarTodas)}
              style={{
                padding: '10px 20px', borderRadius: '9999px', border: '1px solid var(--border)',
                background: 'var(--bg-card)', cursor: 'pointer', fontSize: '13px', fontWeight: 500, minHeight: '44px',
              }}
            >
              {mostrarTodas ? 'Só hoje' : 'Todas'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { if (showForm) closeForm(); else { setEditing(null); setShowForm(true); setFormError('') } }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '9999px', border: 'none',
                background: showForm ? '#ef4444' : 'var(--accent)',
                color: '#ffffff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, minHeight: '44px',
              }}
            >
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? 'Fechar' : 'Nova reserva'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
          <form
            onSubmit={handleSubmit}
            aria-label={editing ? 'Editar reserva' : 'Nova reserva'}
            style={{
              background: 'color-mix(in srgb, var(--bg-card) 75%, transparent)',
              backdropFilter: 'blur(12px)',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '1px solid var(--border)',
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
                        style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: '14px', color: 'var(--text-primary)' }}
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

              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Reservado por</label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: '14px',
                  color: 'var(--text-primary)', boxSizing: 'border-box', opacity: 0.7,
                }}>
                  <User size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span>{form.reservado_por || <span style={{ color: 'var(--text-muted)' }}>Você (logado)</span>}</span>
                </div>
              </div>

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

            {formError && (
              <p style={{ marginTop: '1rem', color: '#ef4444', fontSize: '0.85rem', fontWeight: 500 }}>
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: '1rem', padding: '12px 24px', borderRadius: '9999px', border: 'none',
                background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #7c3aed))', color: '#ffffff',
                fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Criar Reserva'}
            </button>
          </form>
        )}

      <div className="mb-6">
        <TabletCalendar
          calYear={calYear}
          calMonth={calMonth}
          selectedDay={selectedDay}
          calendarDays={calendarDays}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onToday={goToToday}
          onSelectDay={setSelectedDay}
          selectedDayItems={selectedDayItems}
          loadingCalendar={loadingCalendar}
          formatTime={formatTimeDisplay}
          onSelectReservation={setDetailsReserva}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {mostrarTodas
          ? grupos.map(([key, items]) => (
              <div key={key}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatGroupLabel(key)}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {items.map((r) => (
                    <ReservationRow key={r.id} reservation={r} onCancel={() => openCancelModal(r)} onEdit={() => openEditModal(r)} formatTime={formatTimeDisplay} canCancel={canEdit} canEdit={canEdit} />
                  ))}
                </div>
              </div>
            ))
          : reservasHoje.map((r) => (
              <ReservationRow key={r.id} reservation={r} onCancel={() => openCancelModal(r)} onEdit={() => openEditModal(r)} formatTime={formatTimeDisplay} canCancel={canEdit} canEdit={canEdit} />
            ))}
        {reservas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <TabletIcon size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>Nenhuma reserva encontrada</p>
          </div>
        )}
      </div>

      {detailsReserva && (
        <TabletModal reservation={detailsReserva} onClose={() => setDetailsReserva(null)} />
      )}

      {canceling && (
        <CancelReservationModal
          reservation={canceling}
          loading={cancelingSubmit}
          onClose={() => setCanceling(null)}
          onConfirm={() => handleCancel(canceling.id)}
        />
      )}
    </div>
  )
}

function FormField({ label, children, style: containerStyle }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', ...containerStyle }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
  marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
  boxShadow: 'var(--shadow-elevated)',
}

function ReservationRow({
  reservation,
  onCancel,
  onEdit,
  formatTime,
  canCancel,
  canEdit,
}: {
  reservation: TabletReserva
  onCancel: (id: string) => void
  onEdit: (r: TabletReserva) => void
  formatTime: (iso: string) => string
  canCancel: boolean
  canEdit: boolean
}) {
  return (
    <div
      data-testid="reservation-row"
      style={{
        padding: '1rem', borderRadius: '1rem',
        background: 'color-mix(in srgb, var(--bg-card) 75%, transparent)', backdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '0.75rem',
          background: 'var(--accent-soft)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TabletIcon size={18} color="var(--accent)" />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{reservation.sala}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {formatTime(reservation.horario_inicio)} — {formatTime(reservation.horario_fim)}
            <span style={{ marginLeft: '8px' }}>{new Date(reservation.horario_inicio).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{reservation.professor}</p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            <User size={10} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
            {reservation.reservado_por}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {canEdit && (
          <button
            onClick={() => onEdit(reservation)}
            title="Editar reserva"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--accent-ring)',
              background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', minHeight: '36px',
            }}
          >
            <Pencil size={12} />
            Editar
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(reservation.id)}
            style={{
              padding: '8px 16px', borderRadius: '9999px', border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', minHeight: '36px',
            }}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
