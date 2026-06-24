import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaintenance } from '../hooks/useMaintenance'
import { usePCs } from '../hooks/usePCs'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString('pt-BR')
}

function isOverdue(seconds: number) {
  return seconds < Math.floor(Date.now() / 1000)
}

export function Maintenance() {
  const navigate = useNavigate()
  const { pcs } = usePCs()
  const { all, upcoming, loading, create, complete, remove, reload } = useMaintenance()
  const [showForm, setShowForm] = useState(false)

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
      scheduledDate: { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 } as any,
      notes: form.notes,
    })
    resetForm()
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>

  const overdue = upcoming.filter((m) => isOverdue(m.scheduledDate.seconds))
  const future = upcoming.filter((m) => !isOverdue(m.scheduledDate.seconds))

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manutenção</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {showForm ? 'Cancelar' : '+ Agendar'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Nova Manutenção</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Computador</label>
              <select
                value={form.pcId}
                onChange={(e) => handlePcChange(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                required
              >
                <option value="">Selecione um PC</option>
                {pcs.map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.labName} — {pc.pcNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              >
                <option value="cleaning">Limpeza</option>
                <option value="restoration">Restauração</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Data prevista</label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Observações</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Motivo, peças necessárias, etc."
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <button type="submit" className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md">
              Agendar
            </button>
          </div>
        </form>
      )}

      {all.length === 0 && !showForm ? (
        <EmptyState
          icon="📅"
          title="Nenhuma manutenção agendada"
          description="Programe a manutenção dos computadores."
          action={{ label: 'Agendar', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {overdue.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-red-400">🔴 Atrasadas ({overdue.length})</h3>
              <div className="flex flex-col gap-2">
                {overdue.map((m) => (
                  <MaintenanceCard key={m.id} maintenance={m} onComplete={complete} onRemove={remove} onNavigate={() => navigate(`/pcare/pcs/${m.pcId}`)} />
                ))}
              </div>
            </section>
          )}

          {future.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-400">Próximas ({future.length})</h3>
              <div className="flex flex-col gap-2">
                {future.map((m) => (
                  <MaintenanceCard key={m.id} maintenance={m} onComplete={complete} onRemove={remove} onNavigate={() => navigate(`/pcare/pcs/${m.pcId}`)} />
                ))}
              </div>
            </section>
          )}

          {all.filter((m) => m.completed).length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-500">Concluídas</h3>
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
  const overdue = !m.completed && isOverdue(m.scheduledDate.seconds)

  return (
    <div className={`rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
      m.completed
        ? 'border-emerald-800/50 bg-emerald-900/10'
        : overdue
          ? 'border-red-800/50 bg-red-950/20'
          : 'border-slate-800 bg-slate-900/50'
    }`}>
      <div className="flex items-start justify-between">
        <button type="button" onClick={onNavigate} className="text-left">
          <p className={`font-medium ${m.completed ? 'text-slate-500' : 'text-slate-200'}`}>
            {m.labName} — {m.pcNumber}
          </p>
          <p className="text-xs text-slate-500">
            {m.type === 'cleaning' ? 'Limpeza' : m.type === 'restoration' ? 'Restauração' : 'Ambos'}
            {' · '}{formatDate(m.scheduledDate.seconds)}
            {overdue && <span className="ml-1 text-red-400">(atrasada)</span>}
          </p>
        </button>
        <div className="flex gap-2">
          {!m.completed && (
            <button type="button" onClick={() => onComplete(m.id)} className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-200 ring-1 ring-emerald-700/50 transition-colors hover:bg-emerald-700">Concluir</button>
          )}
          <button type="button" onClick={() => { if (window.confirm('Remover?')) onRemove(m.id) }} className="text-xs text-red-400 hover:text-red-300">Excluir</button>
        </div>
      </div>
      {m.notes && <p className="mt-1 text-xs text-slate-500">{m.notes}</p>}
    </div>
  )
}
