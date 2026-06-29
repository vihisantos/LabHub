import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaintenance } from '../hooks/useMaintenance'
import { usePCs } from '../hooks/usePCs'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'
import { icons } from '../../../lib/icons'
import { ConfirmDialog } from '../components/Modal'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function isOverdue(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

function toDateKey(iso: string) {
  return iso.slice(0, 10)
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function Maintenance() {
  const navigate = useNavigate()
  const { pcs } = usePCs()
  const { all, upcoming, loading, create, complete, remove, reload } = useMaintenance()
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [form, setForm] = useState({
    pcId: '',
    labName: '',
    pcNumber: '',
    type: 'cleaning' as const,
    scheduledDate: '',
    notes: '',
  })

  function handlePcChange(pcId: string) {
    const pc = pcs.find((p) => p.id === pcId)
    setForm({
      ...form,
      pcId,
      labName: pc?.labName || '',
      pcNumber: pc?.pcNumber || '',
    })
  }

  function resetForm() {
    setForm({ pcId: '', labName: '', pcNumber: '', type: 'cleaning', scheduledDate: '', notes: '' })
    setShowForm(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.pcId || !form.scheduledDate) return
    const date = new Date(form.scheduledDate)
    create({
      pcId: form.pcId,
      labName: form.labName,
      pcNumber: form.pcNumber,
      type: form.type,
      scheduledDate: date.toISOString(),
      notes: form.notes,
    })
    resetForm()
  }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const today = new Date().toISOString().slice(0, 10)

    const maintByDay = new Map<string, typeof all>()
    all.forEach((m) => {
      const key = toDateKey(m.scheduledDate)
      if (!maintByDay.has(key)) maintByDay.set(key, [])
      maintByDay.get(key)!.push(m)
    })

    const days: { date: string; day: number; isToday: boolean; isOther: boolean; items: typeof all }[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push({ date: '', day: 0, isToday: false, isOther: true, items: [] })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ date, day: d, isToday: date === today, isOther: false, items: maintByDay.get(date) || [] })
    }

    const selectedDayItems = selectedDay ? all.filter((m) => toDateKey(m.scheduledDate) === selectedDay) : []

    return { days, selectedDayItems }
  }, [all, calMonth, calYear, selectedDay])

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1) }
    else setCalMonth((m) => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1) }
    else setCalMonth((m) => m + 1)
    setSelectedDay(null)
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>

  const overdue = upcoming.filter((m) => isOverdue(m.scheduledDate))
  const future = upcoming.filter((m) => !isOverdue(m.scheduledDate))

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manutenção</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {showForm ? 'Cancelar' : '+ Agendar'}
        </button>
      </div>

      {/* View switcher */}
      <div className="mb-4 flex gap-1 rounded-xl bg-input/50 p-1">
        <button
          type="button"
          onClick={() => setView('list')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
            view === 'list' ? 'bg-card text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
          }`}
        >
          Lista
        </button>
        <button
          type="button"
          onClick={() => setView('calendar')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
            view === 'calendar' ? 'bg-card text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
          }`}
        >
          Grade
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Nova Manutenção</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Computador</label>
              <select
                value={form.pcId}
                onChange={(e) => handlePcChange(e.target.value)}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                required
              >
                <option value="">Selecione um PC</option>
                {pcs.map((pc) => (
                  <option key={pc.id} value={pc.id}>{pc.labName} — {pc.pcNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              >
                <option value="cleaning">Limpeza</option>
                <option value="restoration">Restauração</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Data prevista</label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Observações</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Motivo, peças necessárias, etc."
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <button type="submit" className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md">
              Agendar
            </button>
          </div>
        </form>
      )}

      {all.length === 0 && !showForm ? (
        <EmptyState
          icon={icons.ui.calendar}
          title="Nenhuma manutenção agendada"
          description="Programe a manutenção dos computadores."
          action={{ label: 'Agendar', onClick: () => setShowForm(true) }}
        />
      ) : view === 'calendar' ? (
        <div>
          {/* Month header */}
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-fg transition-colors">
              <icons.ui.back size={16} />
            </button>
            <span className="text-sm font-semibold">{MONTHS[calMonth]} {calYear}</span>
            <button type="button" onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-fg transition-colors">
              <icons.ui.back size={16} className="rotate-180" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-fg-dim">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.days.map((d, i) => (
              d.isOther ? (
                <div key={i} />
              ) : (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDay(selectedDay === d.date ? null : d.date)}
                  className={`relative flex flex-col items-center rounded-lg py-2 text-xs font-medium transition-all ${
                    selectedDay === d.date
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : d.isToday
                        ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                        : 'text-fg hover:bg-input'
                  }`}
                >
                  <span>{d.day}</span>
                  {d.items.length > 0 && (
                    <div className="mt-0.5 flex gap-0.5">
                      {d.items.slice(0, 3).map((m) => (
                        <span
                          key={m.id}
                          className={`h-1 w-1 rounded-full ${
                            m.completed ? 'bg-emerald-500' : isOverdue(m.scheduledDate) ? 'bg-red-500' : 'bg-cyan-500'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            ))}
          </div>

          {/* Selected day items */}
          {selectedDay && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                {formatDate(selectedDay)} · {calendarDays.selectedDayItems.length} {calendarDays.selectedDayItems.length === 1 ? 'manutenção' : 'manutenções'}
              </h3>
              {calendarDays.selectedDayItems.length === 0 ? (
                <p className="py-3 text-center text-xs text-fg-dim">Nenhuma manutenção neste dia</p>
              ) : (
                calendarDays.selectedDayItems.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate(`/pcare/pcs/${m.pcId}`)}
                    className={`w-full rounded-xl border p-3 text-left transition-all hover:shadow-md ${
                      m.completed
                        ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10'
                        : isOverdue(m.scheduledDate)
                          ? 'border-red-500/30 bg-red-50 dark:bg-red-950/20'
                          : 'border-line bg-card/50'
                    }`}
                  >
                    <p className="text-sm font-medium">{m.labName} — {m.pcNumber}</p>
                    <p className="text-xs text-fg-muted">
                      {m.type === 'cleaning' ? 'Limpeza' : m.type === 'restoration' ? 'Restauração' : 'Ambos'}
                      {m.notes && ` · ${m.notes}`}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {m.completed ? (
                        <span className="inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Concluída</span>
                      ) : isOverdue(m.scheduledDate) ? (
                        <span className="inline-block rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">Atrasada</span>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {overdue.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-red-600 dark:text-red-400"><icons.ui.alertTriangle size={14} className="inline" /> Atrasadas ({overdue.length})</h3>
              <div className="flex flex-col gap-2">
                {overdue.map((m) => (
                  <MaintenanceCard key={m.id} maintenance={m} onComplete={complete} onRemove={remove} onNavigate={() => navigate(`/pcare/pcs/${m.pcId}`)} />
                ))}
              </div>
            </section>
          )}
          {future.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-fg-dim">Próximas ({future.length})</h3>
              <div className="flex flex-col gap-2">
                {future.map((m) => (
                  <MaintenanceCard key={m.id} maintenance={m} onComplete={complete} onRemove={remove} onNavigate={() => navigate(`/pcare/pcs/${m.pcId}`)} />
                ))}
              </div>
            </section>
          )}
          {all.filter((m) => m.completed).length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-fg-muted">Concluídas</h3>
              <div className="flex flex-col gap-2">
                {all.filter((m) => m.completed).map((m) => (
                  <MaintenanceCard key={m.id} maintenance={m} onComplete={complete} onRemove={remove} onNavigate={() => navigate(`/pcare/pcs/${m.pcId}`)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PullToRefresh>
  )
}

function MaintenanceCard({
  maintenance: m,
  onComplete,
  onRemove,
  onNavigate,
}: {
  maintenance: ReturnType<typeof useMaintenance>['all'][0]
  onComplete: (id: string) => void
  onRemove: (id: string) => void
  onNavigate: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const overdue = !m.completed && isOverdue(m.scheduledDate)

  return (
    <>
      <div className={`rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        m.completed
          ? 'border-emerald-500/50 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/10'
          : overdue
            ? 'border-red-500/50 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20'
            : 'border-line bg-card/50'
      }`}>
        <div className="flex items-start justify-between">
          <button type="button" onClick={onNavigate} className="text-left">
            <p className={`font-medium ${m.completed ? 'text-fg-muted' : 'text-fg'}`}>
              {m.labName} — {m.pcNumber}
            </p>
            <p className="text-xs text-fg-muted">
              {m.type === 'cleaning' ? 'Limpeza' : m.type === 'restoration' ? 'Restauração' : 'Ambos'}
              {' · '}{formatDate(m.scheduledDate)}
              {overdue && <span className="ml-1 text-red-600 dark:text-red-400">(atrasada)</span>}
            </p>
          </button>
          <div className="flex gap-2">
            {!m.completed && (
              <button type="button" onClick={() => onComplete(m.id)} className="rounded bg-emerald-600 dark:bg-emerald-800 px-2 py-1 text-xs text-emerald-50 dark:text-emerald-200 ring-1 ring-emerald-500 dark:ring-emerald-700/50 transition-colors hover:bg-emerald-700">Concluir</button>
            )}
            <button type="button" onClick={() => setConfirmRemove(true)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Excluir</button>
          </div>
        </div>
        {m.notes && <p className="mt-1 text-xs text-fg-muted">{m.notes}</p>}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => onRemove(m.id)}
        title="Remover manutenção"
        message="Tem certeza que deseja remover esta manutenção?"
        confirmLabel="Remover"
      />
    </>
  )
}
