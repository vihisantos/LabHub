import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useMaintenance } from '../hooks/useMaintenance'
import { PCCard } from '../components/PCCard'
import { FilterBar } from '../components/FilterBar'
import type { Status } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'
import { Modal } from '../components/Modal'
import { icons } from '../../../lib/icons'

export function PCList() {
  const navigate = useNavigate()
  const { pcs, loading, update, reload } = usePCs()
  const { create: scheduleMaint } = useMaintenance()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<{ lab: string; status: Status }>({
    lab: '',
    status: 'all',
  })
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleType, setScheduleType] = useState<'cleaning' | 'restoration' | 'both'>('cleaning')

  const labs = useMemo(() => {
    const unique = new Set(pcs.map((p) => p.labName))
    return Array.from(unique).sort()
  }, [pcs])

  const filtered = useMemo(() => {
    return pcs.filter((pc) => {
      if (filters.lab && pc.labName !== filters.lab) return false
      if (filters.status !== 'all' && pc.cleaningStatus !== filters.status && pc.restorationStatus !== filters.status) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          pc.labName.toLowerCase().includes(q) ||
          pc.pcNumber.toLowerCase().includes(q) ||
          pc.roomLocation.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [pcs, filters, search])

  const selectedPCs = useMemo(() => {
    return pcs.filter((p) => selected.has(p.id))
  }, [pcs, selected])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p) => p.id)))
    }
  }

  function batchUpdate(key: 'cleaningStatus' | 'restorationStatus', value: 'pending' | 'in_progress' | 'done') {
    selected.forEach((id) => update(id, { [key]: value }))
    reload()
    setSelected(new Set())
    setSelectMode(false)
  }

  function handleScheduleMaintenance() {
    if (!scheduleDate) return
    const date = new Date(scheduleDate)
    if (isNaN(date.getTime())) return

    selectedPCs.forEach((pc) => {
      scheduleMaint({
        pcId: pc.id,
        labName: pc.labName,
        pcNumber: pc.pcNumber,
        type: scheduleType,
        scheduledDate: date.toISOString(),
        notes: `Agendamento em lote (${selectedPCs.length} PCs)`,
      })
    })

    setSelected(new Set())
    setSelectMode(false)
    setShowScheduleModal(false)
    setScheduleDate('')
    setScheduleType('cleaning')
  }

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setSelected(new Set())
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Computadores</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/pcare/qr')}
            className="rounded-lg border border-cyan-600 dark:border-cyan-700 px-3 py-2 text-sm text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30"
          >
            QR
          </button>
          <button
            type="button"
            onClick={toggleSelectMode}
            className={`rounded-lg border px-3 py-2 text-sm ${
              selectMode
                ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                : 'border-line text-fg-dim hover:border-line'
            }`}
          >
            {selectMode ? 'Cancelar' : 'Selecionar'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/pcare/pcs/new')}
            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            + Novo PC
          </button>
        </div>
      </div>

      <div className="relative mb-3">
        <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          placeholder="Buscar por laboratório, PC ou sala..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-dim"
            aria-label="Limpar busca"
          >
            <icons.ui.close size={14} />
          </button>
        )}
      </div>

      {labs.length > 0 && (
        <FilterBar labs={labs} onFilterChange={setFilters} />
      )}

      {selectMode && filtered.length > 0 && (
        <button type="button" onClick={selectAll} className="mb-3 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300">
          {selected.size === filtered.length ? 'Desmarcar todos' : `Selecionar todos (${filtered.length})`}
        </button>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={icons.nav.pcs}
          title="Nenhum PC encontrado"
          description="Crie o primeiro computador para começar o inventário."
          action={{ label: 'Adicionar PC', onClick: () => navigate('/pcare/pcs/new') }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">
            {filtered.length} de {pcs.length} PCs exibidos
            {selected.size > 0 && ` · ${selected.size} selecionados`}
          </p>
          {filtered.map((pc) => (
            <PCCard
              key={pc.id}
              pc={pc}
              selectable={selectMode}
              selected={selected.has(pc.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed left-0 right-0 z-40 mx-auto max-w-lg px-4" style={{ bottom: 'calc(4rem + max(1rem, env(safe-area-inset-bottom)))' }}>
          <div className="rounded-xl border border-line bg-card p-3 shadow-lg shadow-black/40 backdrop-blur-xl">
            <p className="mb-2 text-center text-xs text-fg-dim">{selected.size} PCs selecionados</p>
            <div className="flex flex-wrap justify-center gap-2">
              <div className="flex gap-1">
                <StatusQuickBtn label="Limpeza" value="pending" color="slate" onClick={() => batchUpdate('cleaningStatus', 'pending')} />
                <StatusQuickBtn label="Limpeza" value="in_progress" color="amber" onClick={() => batchUpdate('cleaningStatus', 'in_progress')} />
                <StatusQuickBtn label="Limpeza" value="done" color="emerald" onClick={() => batchUpdate('cleaningStatus', 'done')} />
              </div>
              <div className="flex gap-1">
                <StatusQuickBtn label="Rest." value="pending" color="slate" onClick={() => batchUpdate('restorationStatus', 'pending')} />
                <StatusQuickBtn label="Rest." value="in_progress" color="amber" onClick={() => batchUpdate('restorationStatus', 'in_progress')} />
                <StatusQuickBtn label="Rest." value="done" color="emerald" onClick={() => batchUpdate('restorationStatus', 'done')} />
              </div>
              <button type="button" onClick={() => setShowScheduleModal(true)} className="flex items-center gap-1 rounded-lg bg-input px-3 py-1.5 text-xs text-fg-dim ring-1 ring-line transition-colors hover:bg-card">
                <icons.ui.calendar size={12} />
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={showScheduleModal} onClose={() => setShowScheduleModal(false)} title="Agendar Manutenção">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-fg-dim">Data</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg-dim">Tipo</label>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as any)}
              className="w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg outline-none focus:border-cyan-500"
            >
              <option value="cleaning">Limpeza</option>
              <option value="restoration">Restauração</option>
              <option value="both">Ambas</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleScheduleMaintenance}
            disabled={!scheduleDate}
            className="w-full rounded-lg bg-cyan-600 py-2 text-sm font-medium text-fg transition-colors hover:bg-cyan-700 disabled:opacity-50"
          >
            Agendar para {selected.size} PC{selected.size > 1 ? 's' : ''}
          </button>
        </div>
      </Modal>
    </PullToRefresh>
  )
}

function StatusQuickBtn({
  label,
  value,
  color,
  onClick,
}: {
  label: string
  value: string
  color: 'slate' | 'amber' | 'emerald'
  onClick: () => void
}) {
  const colors = {
    slate: 'bg-input text-fg-dim hover:bg-card ring-1 ring-line',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 ring-1 ring-amber-500 dark:ring-amber-800/50',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 ring-1 ring-emerald-500 dark:ring-emerald-800/50',
  }

  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${colors[color]}`}>
      {label}: {value === 'pending' ? 'Pend' : value === 'in_progress' ? 'Andam' : 'Conc'}
    </button>
  )
}
