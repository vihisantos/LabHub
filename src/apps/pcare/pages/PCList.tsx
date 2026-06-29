import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useMaintenance } from '../hooks/useMaintenance'
import { useChecklistTemplates, usePCChecklists } from '../hooks/useChecklists'
import { useFocusMode } from '../hooks/useFocusMode'
import { useActiveLab } from '../../../lib/useLabContext'
import { PCCard } from '../components/PCCard'
import { FilterBar } from '../components/FilterBar'
import { PCBatchBar } from '../components/PCBatchBar'
import type { Status } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'
import { Modal } from '../components/Modal'
import { PCChecklistModal } from '../components/PCChecklistModal'
import { icons } from '../../../lib/icons'
import { exportCSV, pcToRows } from '../utils/export'

export function PCList() {
  const navigate = useNavigate()
  const { pcs: allPcs, loading, update, reload } = usePCs()
  const { create: scheduleMaint } = useMaintenance()
  const { templates } = useChecklistTemplates()
  const { focusMode } = useFocusMode()
  const { activeLab } = useActiveLab()

  const pcs = useMemo(() => {
    if (!activeLab) return allPcs
    return allPcs.filter((p) => p.labName === activeLab)
  }, [allPcs, activeLab])
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
  const [focusPcId, setFocusPcId] = useState<string | null>(null)

  const { checklists: focusPcChecklists, create: createFocusChecklist, update: updateFocusChecklist, reload: reloadFocusChecklists } = usePCChecklists(focusPcId ?? '')

  const focusPC = focusPcId ? pcs.find((p) => p.id === focusPcId) ?? null : null

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
          pc.roomLocation.toLowerCase().includes(q) ||
          pc.assetTag.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [pcs, filters, search])

  const highlightedId = useMemo(() => {
    if (!search) return null
    const exact = pcs.find((pc) => pc.assetTag.toLowerCase() === search.toLowerCase())
    return exact?.id ?? null
  }, [pcs, search])

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

  function handleBatchExport() {
    const { headers, rows } = pcToRows(selectedPCs)
    exportCSV(headers, rows, 'pcs_selecionados')
    setSelected(new Set())
    setSelectMode(false)
  }

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setSelected(new Set())
  }

  function handleFocusClick(pcId: string) {
    setFocusPcId(pcId)
  }

  function handleFocusApplyTemplate(templateId: string) {
    if (!focusPcId) return
    createFocusChecklist({
      pcId: focusPcId,
      templateId,
      templateName: templates.find((t) => t.id === templateId)?.name ?? '',
      labName: focusPC?.labName ?? '',
      items: templates.find((t) => t.id === templateId)?.items.map((i) => ({ itemId: i.id, label: i.label, category: i.category, done: false, doneAt: null })) ?? [],
      completedAt: null,
    })
    reloadFocusChecklists()
  }

  function handleFocusToggleItem(checklistId: string, itemId: string) {
    updateFocusChecklist(checklistId, {
      items: focusPcChecklists.find((c) => c.id === checklistId)?.items.map((i) =>
        i.itemId === itemId ? { ...i, done: !i.done, doneAt: !i.done ? new Date().toISOString() : null } : i
      ) ?? [],
    })
    reloadFocusChecklists()
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>

  return (
    <PullToRefresh onRefresh={reload}>
      {!focusMode && (
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
          </div>
        </div>
      )}

      {focusMode && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-fg">Modo Foco</h2>
          <p className="text-sm text-fg-dim">Toque em um PC para abrir o checklist</p>
        </div>
      )}

      {!focusMode && (
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
      )}

      {!focusMode && labs.length > 0 && (
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
          description="Nenhum computador encontrado com os filtros atuais."
        />
      ) : (
        <div className={`flex flex-col ${focusMode ? 'gap-4' : 'gap-3'}`}>
          {!focusMode && (
            <p className="text-xs text-fg-muted">
              {filtered.length} de {pcs.length} PCs exibidos
              {selected.size > 0 && ` · ${selected.size} selecionados`}
            </p>
          )}
          {filtered.map((pc) => (
            <div key={pc.id} onClick={focusMode ? () => handleFocusClick(pc.id) : undefined}>
              <PCCard
                pc={pc}
                selectable={selectMode}
                selected={selected.has(pc.id)}
                highlighted={pc.id === highlightedId}
                onToggleSelect={toggleSelect}
                focusMode={focusMode}
              />
            </div>
          ))}
        </div>
      )}

      <PCBatchBar
        selectedCount={selected.size}
        onBatchUpdate={batchUpdate}
        onSchedule={() => setShowScheduleModal(true)}
        onExport={handleBatchExport}
        onClear={() => setSelected(new Set())}
      />

      <PCChecklistModal
        open={focusPcId !== null}
        onClose={() => setFocusPcId(null)}
        templates={templates}
        existingChecklists={focusPcChecklists}
        onApplyTemplate={handleFocusApplyTemplate}
        onToggleItem={handleFocusToggleItem}
      />

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


