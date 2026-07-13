import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { useStockSelection } from '../hooks/useStockSelection'
import { stockPhotoService } from '../services/stockPhotoService'
import { StockCard } from '../components/StockCard'
import { StockBatchBar } from '../components/StockBatchBar'
import { StockForm } from '../components/StockForm'
import { MovementForm } from '../components/MovementForm'
import { SectionTabs, type TabId } from '../components/SectionTabs'
import type { StockItem, StockItemFormData, StockMovementFormData } from '../types'
import { stockSections } from '../types'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import { exportStockItemsCSV } from '../utils/export'
import { parseFile, mapStockRow, validateRows } from '../utils/import'
import { BatchCreateModal } from '../components/BatchCreateModal'
import { DesktopSetupModal } from '../components/DesktopSetupModal'
import { NotebookSetupModal } from '../components/NotebookSetupModal'
import { NotebookBatchImport } from '../components/NotebookBatchImport'

export function StockSectionPage() {
  const { items, loading, create, update, remove, reload } = useStock()
  const { create: createMovement } = useMovements()
  const selection = useStockSelection()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>('all')

  useEffect(() => {
    const section = searchParams.get('section')
    if (section) {
      const valid: TabId[] = [...stockSections.map((s) => s.value), 'all', 'repair', 'emprestados']
      if (valid.includes(section as TabId)) {
        setActiveTab(section as TabId)
      }
    }
  }, [searchParams])

  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [conditionFilter, setConditionFilter] = useState('')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchRaw])

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StockItem | null>(null)
  const [movementTarget, setMovementTarget] = useState<StockItem | null>(null)
  const [movementType, setMovementType] = useState<'mudanca_sala' | 'conserto' | 'descarte' | 'emprestimo' | 'devolucao'>('mudanca_sala')
  const [discardTarget, setDiscardTarget] = useState<StockItem | null>(null)
  const [importMode, setImportMode] = useState(false)
  const [importResult, setImportResult] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(0)
  const [showBatch, setShowBatch] = useState(false)
  const [showDesktopSetup, setShowDesktopSetup] = useState(false)
  const [showNotebookSetup, setShowNotebookSetup] = useState(false)
  const [showNotebookBatchImport, setShowNotebookBatchImport] = useState(false)
  const [batchSuccess, setBatchSuccess] = useState(0)
  const [cleanupMessage, setCleanupMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-cleanup orphaned photos when items load
  useEffect(() => {
    if (loading) return
    const validIds = new Set(items.map((i) => i.id))
    const cleaned = stockPhotoService.cleanupOrphans(validIds)
    if (cleaned > 0) {
      setCleanupMessage(`${cleaned} foto${cleaned > 1 ? 's' : ''} órfã${cleaned > 1 ? 's' : ''} limpa${cleaned > 1 ? 's' : ''}`)
      const timer = setTimeout(() => setCleanupMessage(''), 4000)
      return () => clearTimeout(timer)
    }
  }, [loading, items])

  const uniqueRooms = useMemo(() => {
    const rooms = new Set(items.map((i) => i.room).filter(Boolean))
    return Array.from(rooms).sort()
  }, [items])

  const hasActiveFilters = roomFilter !== '' || statusFilter !== '' || conditionFilter !== '' || search !== ''

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeTab === 'all') {
        if (item.status !== 'ativo') return false
      } else if (activeTab === 'repair') {
        if (item.status !== 'em_conserto') return false
      } else if (activeTab === 'emprestados') {
        if (item.status !== 'emprestado') return false
      } else {
        if (item.section !== activeTab) return false
      }
      if (roomFilter && item.room !== roomFilter) return false
      if (statusFilter && item.status !== statusFilter) return false
      if (conditionFilter && item.condition !== conditionFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.subcategory.toLowerCase().includes(q) ||
          item.serialNumber.toLowerCase().includes(q) ||
          item.room.toLowerCase().includes(q) ||
          item.notes.toLowerCase().includes(q) ||
          (item.linkedPcLabel || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, activeTab, roomFilter, statusFilter, conditionFilter, search])

  const clearFilters = useCallback(() => {
    setRoomFilter('')
    setStatusFilter('')
    setConditionFilter('')
    setSearchRaw('')
    setSearch('')
  }, [])

  const activeFilterCount = [roomFilter, statusFilter, conditionFilter].filter(Boolean).length

  const sectionItems = useMemo(() => {
    if (activeTab === 'all') return items.filter((i) => i.status === 'ativo')
    if (activeTab === 'repair') return items.filter((i) => i.status === 'em_conserto')
    if (activeTab === 'emprestados') return items.filter((i) => i.status === 'emprestado')
    return items.filter((i) => i.section === activeTab)
  }, [items, activeTab])

  const stats = useMemo(() => ({
    total: sectionItems.length,
    ativos: sectionItems.filter((i) => i.status === 'ativo').length,
    conserto: sectionItems.filter((i) => i.status === 'em_conserto').length,
    emprestados: sectionItems.filter((i) => i.status === 'emprestado').length,
    descartados: sectionItems.filter((i) => i.status === 'descartado').length,
  }), [sectionItems])

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { pcId: string; pcLabel: string; items: StockItem[] }>()
    const unlinked: StockItem[] = []
    for (const item of filtered) {
      if (item.linkedPcId && item.linkedPcLabel) {
        const key = item.linkedPcId
        if (!groups.has(key)) {
          groups.set(key, { pcId: item.linkedPcId, pcLabel: item.linkedPcLabel, items: [] })
        }
        groups.get(key)!.items.push(item)
      } else {
        unlinked.push(item)
      }
    }
    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.pcLabel.localeCompare(b.pcLabel))
    return { groups: sortedGroups, unlinked }
  }, [filtered])

  function handleSave(data: StockItemFormData, photos?: string[]) {
    if (editing) {
      update(editing.id, data)
      if (photos !== undefined) {
        stockPhotoService.setAll(editing.id, photos)
      }
    } else {
      const item = create(data)
      if (photos && photos.length > 0) {
        stockPhotoService.setAll(item.id, photos)
      }
    }
    setEditing(null)
    setShowForm(false)
  }

  function handleEdit(item: StockItem) {
    setEditing(item)
    setShowForm(true)
  }

  function handleMove(item: StockItem) {
    setMovementTarget(item)
    setMovementType('mudanca_sala')
  }

  function handleRepair(item: StockItem) {
    setMovementTarget(item)
    setMovementType('conserto')
  }

  function handleLoan(item: StockItem) {
    setMovementTarget(item)
    setMovementType('emprestimo')
  }

  function handleReturn(item: StockItem) {
    setMovementTarget(item)
    setMovementType('devolucao')
  }

  function handleDiscard(item: StockItem) {
    setDiscardTarget(item)
  }

  function confirmDiscard() {
    if (!discardTarget) return
    createMovement({
      itemId: discardTarget.id,
      itemName: discardTarget.name,
      type: 'descarte',
      fromRoom: discardTarget.room,
      toRoom: '',
      description: 'Item descartado',
      replacedPart: '',
      newPart: '',
      performedBy: '',
    })
    update(discardTarget.id, { status: 'descartado' })
    setDiscardTarget(null)
  }

  function handleMovementSave(data: StockMovementFormData) {
    createMovement(data)
    if (movementTarget) {
      if (data.type === 'mudanca_sala') {
        update(movementTarget.id, { room: data.toRoom })
      } else if (data.type === 'conserto') {
        update(movementTarget.id, { status: 'em_conserto' })
      } else if (data.type === 'emprestimo') {
        update(movementTarget.id, { status: 'emprestado', room: data.destinationRoom || movementTarget.room })
        fetch('/api/push/notify-loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: movementTarget.name,
            borrowedBy: data.borrowedBy || 'Alguém',
            expectedReturnAt: data.expectedReturnAt || '',
          }),
        }).catch(() => {})
      } else if (data.type === 'devolucao') {
        update(movementTarget.id, { status: 'ativo' })
        fetch('/api/push/notify-return', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: movementTarget.name,
            returnedBy: data.performedBy || 'Alguém',
          }),
        }).catch(() => {})
      }
    }
    setMovementTarget(null)
  }

  function handleBatchUpdate(ids: string[], data: Partial<StockItem>) {
    for (const id of ids) update(id, data)
    reload()
  }

  function handleBatchCreate(items: StockItemFormData[]) {
    for (const data of items) {
      create(data)
    }
    setBatchSuccess(items.length)
    reload()
    setTimeout(() => setBatchSuccess(0), 5000)
  }

  function handleBatchDelete(ids: string[]) {
    for (const id of ids) {
      stockPhotoService.deleteAll(id)
      remove(id)
    }
    reload()
  }

  const tabLabel = activeTab === 'all' ? 'Ativos'
    : activeTab === 'repair' ? 'Em Conserto'
    : activeTab === 'emprestados' ? 'Emprestados'
    : stockSections.find((s) => s.value === activeTab)?.label || ''

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-3">
        {/* ── Abas ── */}
        <SectionTabs active={activeTab} onChange={setActiveTab} items={items} />

        {/* ── Cabeçalho ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">{tabLabel}</h2>
          <div className="flex gap-1.5">
            {selection.selectMode ? (
              <button
                type="button"
                onClick={selection.exit}
                className="rounded-xl bg-input px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
              >
                Cancelar
              </button>
            ) : (
              <button
                type="button"
                onClick={selection.enter}
                className="rounded-xl bg-input px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
              >
                Selecionar
              </button>
            )}
            <button
              type="button"
              onClick={() => { setEditing(null); setShowForm(true) }}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
            >
              + Novo
            </button>
            <button
              type="button"
              onClick={() => setShowBatch(true)}
              className="flex items-center gap-1 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-700 shadow-sm btn-interactive"
            >
              <icons.ui.copy size={13} />
              Lote
            </button>
            <button
              type="button"
              onClick={() => setShowDesktopSetup(true)}
              className="flex items-center gap-1 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-cyan-700 shadow-sm btn-interactive"
            >
              <icons.nav.pcs size={13} />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setShowNotebookSetup(true)}
              className="flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 shadow-sm btn-interactive"
            >
              <icons.nav.pcs size={13} />
              Notebook
            </button>
            <button
              type="button"
              onClick={() => setShowNotebookBatchImport(true)}
              className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 shadow-sm btn-interactive"
            >
              <icons.ui.upload size={13} />
              Importar Notebooks
            </button>
          </div>
        </div>

        {/* ── Busca + Filtros ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar nome, série, sala, PC..."
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-violet-500/30"
            />
            {searchRaw && (
              <button
                type="button"
                onClick={() => { setSearchRaw(''); setSearch('') }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
              >
                <icons.ui.close size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors btn-interactive ${
              activeFilterCount > 0
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400'
                : 'bg-input text-fg-dim hover:text-fg'
            }`}
          >
            <icons.ui.sliders size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Filtros ativos (chips) ── */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {roomFilter && (
              <Chip label={`Sala: ${roomFilter}`} onRemove={() => setRoomFilter('')} />
            )}
            {statusFilter && (
              <Chip label={`Status: ${statusFilter}`} onRemove={() => setStatusFilter('')} />
            )}
            {conditionFilter && (
              <Chip label={`Condição: ${conditionFilter}`} onRemove={() => setConditionFilter('')} />
            )}
            {search && (
              <Chip label={`Busca: "${search}"`} onRemove={() => { setSearchRaw(''); setSearch('') }} />
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-fg-muted hover:text-fg underline underline-offset-2"
            >
              Limpar tudo
            </button>
          </div>
        )}

        {/* ── Mini stats ── */}
        {stats.total > 0 && (
          <div className="flex gap-3 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] -mx-4 px-4 pb-1">
            <StatChip label="Total" value={stats.total} />
            {stats.ativos > 0 && <StatChip label="Ativos" value={stats.ativos} color="text-emerald-600 dark:text-emerald-400" />}
            {stats.emprestados > 0 && <StatChip label="Emprestados" value={stats.emprestados} color="text-violet-600 dark:text-violet-400" />}
            {stats.conserto > 0 && <StatChip label="Conserto" value={stats.conserto} color="text-amber-600 dark:text-amber-400" />}
            {stats.descartados > 0 && <StatChip label="Descartados" value={stats.descartados} color="text-red-600 dark:text-red-400" />}
          </div>
        )}

        {/* ── Alertas ── */}
        {stats.conserto > 0 && activeTab !== 'repair' && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <icons.nav.parts size={15} />
            <span>{stats.conserto} {stats.conserto === 1 ? 'item em conserto' : 'itens em conserto'}</span>
          </div>
        )}

        {batchSuccess > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
            <icons.ui.checkCircle size={15} />
            <span>{batchSuccess} {batchSuccess === 1 ? 'item criado' : 'itens criados'} com sucesso!</span>
          </div>
        )}

        {cleanupMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
            <icons.ui.checkCircle size={15} />
            <span>{cleanupMessage}</span>
          </div>
        )}

        {/* ── Import / Export (compacto) ── */}
        <div className="flex justify-end gap-1.5 -mt-1">
          <button
            type="button"
            onClick={() => setImportMode(!importMode)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              importMode
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'text-fg-muted hover:bg-input'
            }`}
          >
            <icons.ui.upload size={12} />
            Importar
          </button>
          <button
            type="button"
            onClick={() => exportStockItemsCSV(filtered)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-input"
          >
            <icons.ui.fileBarChart size={12} />
            Exportar
          </button>
        </div>

        {/* ── Import Mode ── */}
        {importMode && (
          <div className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Importar Itens</h3>

            {importSuccess > 0 && (
              <div className="mb-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {importSuccess} registro{importSuccess > 1 ? 's' : ''} importado{importSuccess > 1 ? 's' : ''} com sucesso!
              </div>
            )}

            {!importResult ? (
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-input/50 p-8 text-center transition-colors hover:bg-input">
                  <icons.ui.upload size={28} className="text-fg-muted" />
                  <span className="text-sm text-fg-dim">
                    Clique para selecionar .csv ou .xlsx
                  </span>
                  <span className="text-[10px] text-fg-dim">
                    Colunas: Nome, Seção, Subcategoria, Nº Série, Sala, Status, Condição, Tipo Cabo, Comprimento, Conectores, Tomadas, Observações
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setImportError('')
                      setImportResult(null)
                      setImportSuccess(0)
                      try {
                        const parsed = await parseFile(file)
                        setImportResult({ headers: parsed.headers, rows: parsed.rows })
                      } catch (err) {
                        setImportError((err as Error).message)
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {importError && <p className="text-sm text-red-500">{importError}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-fg-dim">
                    {importResult.rows.length} linha{importResult.rows.length !== 1 ? 's' : ''} encontrada{importResult.rows.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setImportResult(null); setImportError(''); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-xs text-fg-muted hover:text-fg"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs text-fg-dim">
                    <thead>
                      <tr className="bg-input">
                        {importResult.headers.slice(0, 6).map((h, i) => (
                          <th key={i} className="px-2 py-1.5 font-medium text-fg-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-line/50">
                          {row.slice(0, 6).map((cell, j) => (
                            <td key={j} className="px-2 py-1 truncate max-w-[120px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importResult.rows.length > 5 && (
                    <p className="p-2 text-[10px] text-fg-muted">
                      + {importResult.rows.length - 5} linha{importResult.rows.length - 5 > 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {importError && <p className="text-sm text-red-500">{importError}</p>}

                <button
                  type="button"
                  onClick={async () => {
                    if (!importResult) return
                    setImporting(true)
                    setImportError('')
                    let success = 0
                    try {
                      const err = validateRows(importResult.rows, 3)
                      if (err) { setImportError(err); setImporting(false); return }
                      for (const row of importResult.rows) {
                        const data = mapStockRow(importResult.headers, row)
                        if (data.name) {
                          create(data)
                          success++
                        }
                      }
                      setImportSuccess(success)
                      setImportResult(null)
                      reload()
                    } catch {
                      setImportError('Erro ao importar dados.')
                    }
                    setImporting(false)
                  }}
                  disabled={importing}
                  className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 py-3 text-sm font-medium text-fg shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                >
                  {importing ? 'Importando...' : `Importar ${importResult.rows.length} registro${importResult.rows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Form ── */}
        {showForm && (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {editing ? 'Editar Item' : `Novo ${tabLabel}`}
            </h3>
            <StockForm
              initial={editing ? { ...editing } : { section: (activeTab === 'all' || activeTab === 'repair' || activeTab === 'emprestados') ? 'maquinas' : activeTab }}
              onSave={handleSave}
              onCancel={() => { setEditing(null); setShowForm(false) }}
            />
          </div>
        )}

        {/* ── Lista de Itens ── */}
        {!importMode && (filtered.length === 0 ? (
          <EmptyState
            icon={icons.ui.package}
            title={items.length === 0 ? 'Estoque vazio' : 'Nenhum item encontrado'}
            description={items.length === 0 ? 'Adicione itens para controlar o estoque.' : 'Tente alterar os filtros ou busca.'}
            action={items.length === 0 ? { label: 'Adicionar Item', onClick: () => { setEditing(null); setShowForm(true) } } : undefined}
            accentColor="emerald"
          />
        ) : (
          <>
            {selection.selectMode && (
              <button
                type="button"
                onClick={() => selection.toggleAll(filtered.map((i) => i.id))}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 btn-interactive"
              >
                {filtered.every((i) => selection.selected.has(i.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            )}
            <div className="space-y-2">
              {groupedItems.groups.length > 0 && groupedItems.groups.map((group) => (
                <div key={group.pcId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/pcare/pcs/${group.pcId}`)}
                    className="mb-1.5 flex w-full items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-950/20 px-4 py-2 text-left transition-colors hover:bg-violet-100 dark:hover:bg-violet-950/40"
                  >
                    <icons.nav.pcs size={15} className="shrink-0 text-violet-500" />
                    <span className="flex-1 text-sm font-semibold text-fg">{group.pcLabel}</span>
                    <span className="text-[11px] text-fg-muted">{group.items.length}</span>
                    <icons.ui.chevronRight size={13} className="text-fg-muted" />
                  </button>
                  <div className="space-y-1.5 pl-3 border-l-2 border-violet-200 dark:border-violet-900">
                    {group.items.map((item) => (
                      <StockCard key={item.id} item={item}
                        onEdit={handleEdit} onMove={handleMove} onRepair={handleRepair}
                        onDiscard={handleDiscard} onLoan={handleLoan} onReturn={handleReturn}
                        selectable={selection.selectMode} selected={selection.selected.has(item.id)} onToggleSelect={selection.toggle}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {groupedItems.unlinked.length > 0 && (
                <div>
                  {groupedItems.groups.length > 0 && (
                    <div className="flex items-center gap-1.5 px-4 py-1.5">
                      <icons.ui.package size={12} className="text-fg-muted" />
                      <span className="text-xs text-fg-muted">Sem vínculo ({groupedItems.unlinked.length})</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {groupedItems.unlinked.map((item) => (
                      <StockCard key={item.id} item={item}
                        onEdit={handleEdit} onMove={handleMove} onRepair={handleRepair}
                        onDiscard={handleDiscard} onLoan={handleLoan} onReturn={handleReturn}
                        selectable={selection.selectMode} selected={selection.selected.has(item.id)} onToggleSelect={selection.toggle}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ))}
      </div>

      {/* ── Filter Bottom Sheet ── */}
      {filterSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setFilterSheetOpen(false)} />
          <div className="relative z-10 w-full rounded-t-2xl bg-card pb-safe-bottom shadow-2xl animate-[slide-up_0.2s_ease-out]">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-base font-semibold text-fg">Filtros</h3>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="rounded-lg p-1.5 text-fg-muted hover:text-fg transition-colors"
              >
                <icons.ui.close size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 pb-6 space-y-5">
              {/* Sala */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Sala</label>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Todas" active={!roomFilter} onClick={() => setRoomFilter('')} />
                  {uniqueRooms.map((room) => (
                    <FilterChip key={room} label={room} active={roomFilter === room} onClick={() => setRoomFilter(room)} />
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Todos" active={!statusFilter} onClick={() => setStatusFilter('')} />
                  <FilterChip label="Ativo" active={statusFilter === 'ativo'} onClick={() => setStatusFilter('ativo')} />
                  <FilterChip label="Em Conserto" active={statusFilter === 'em_conserto'} onClick={() => setStatusFilter('em_conserto')} />
                  <FilterChip label="Emprestado" active={statusFilter === 'emprestado'} onClick={() => setStatusFilter('emprestado')} />
                  <FilterChip label="Descartado" active={statusFilter === 'descartado'} onClick={() => setStatusFilter('descartado')} />
                </div>
              </div>

              {/* Condição */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Condição</label>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Todas" active={!conditionFilter} onClick={() => setConditionFilter('')} />
                  <FilterChip label="Bom" active={conditionFilter === 'Bom'} onClick={() => setConditionFilter('Bom')} />
                  <FilterChip label="Regular" active={conditionFilter === 'Regular'} onClick={() => setConditionFilter('Regular')} />
                  <FilterChip label="Danificado" active={conditionFilter === 'Danificado'} onClick={() => setConditionFilter('Danificado')} />
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { clearFilters(); setFilterSheetOpen(false) }}
                  className="w-full rounded-xl bg-red-50 dark:bg-red-950/20 py-3 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-950/30"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Movement Modal ── */}
      {movementTarget && (
        <Modal open={true} onClose={() => setMovementTarget(null)}
          title={movementType === 'mudanca_sala' ? 'Mover Item' : movementType === 'conserto' ? 'Registrar Conserto' : movementType === 'emprestimo' ? 'Registrar Empréstimo' : movementType === 'devolucao' ? 'Registrar Devolução' : 'Movimentar Item'}
        >
          <MovementForm
            itemId={movementTarget.id} itemName={movementTarget.name} currentRoom={movementTarget.room}
            initialType={movementType} onSave={handleMovementSave} onCancel={() => setMovementTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!discardTarget} onClose={() => setDiscardTarget(null)} onConfirm={confirmDiscard}
        title="Descartar Item" message={`Tem certeza que deseja descartar "${discardTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Descartar" variant="danger"
      />

      <BatchCreateModal open={showBatch} onClose={() => setShowBatch(false)} onCreate={handleBatchCreate} />
      <DesktopSetupModal open={showDesktopSetup} onClose={() => setShowDesktopSetup(false)} onCreate={handleBatchCreate} />
      <NotebookSetupModal open={showNotebookSetup} onClose={() => setShowNotebookSetup(false)} onCreate={handleBatchCreate} />
      <NotebookBatchImport open={showNotebookBatchImport} onClose={() => setShowNotebookBatchImport(false)} onCreate={handleBatchCreate} />

      {selection.selectMode && selection.selected.size > 0 && (
        <StockBatchBar
          selected={selection.selected} items={items} onClear={selection.clear} onExit={selection.exit}
          onUpdate={handleBatchUpdate} onDelete={handleBatchDelete} onCreateMovement={createMovement}
        />
      )}
    </PullToRefresh>
  )
}

/* ── Componentes auxiliares ── */

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-violet-100 dark:bg-violet-950/30 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:text-violet-400">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-violet-900 dark:hover:text-violet-200">
        <icons.ui.close size={12} />
      </button>
    </span>
  )
}

function StatChip({ label, value, color = 'text-fg' }: { label: string; value: number; color?: string }) {
  return (
    <div className="shrink-0 rounded-xl bg-card px-4 py-2 shadow-[var(--shadow-card)]">
      <p className="text-[10px] font-medium text-fg-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 ring-1 ring-violet-300 dark:ring-violet-800'
          : 'bg-input text-fg-muted hover:text-fg hover:bg-input/80'
      }`}
    >
      {label}
    </button>
  )
}
