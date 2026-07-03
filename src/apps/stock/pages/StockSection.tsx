import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { useStockSelection } from '../hooks/useStockSelection'
import { stockPhotoService } from '../services/stockPhotoService'
import { StockCard } from '../components/StockCard'
import { StockBatchBar } from '../components/StockBatchBar'
import { StockForm } from '../components/StockForm'
import { MovementForm } from '../components/MovementForm'
import { SectionTabs } from '../components/SectionTabs'
import type { StockSection as Section, StockItem, StockItemFormData, StockMovementFormData } from '../types'
import { stockSections } from '../types'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import { exportStockItemsCSV } from '../utils/export'
import { parseFile, mapStockRow, validateRows } from '../utils/import'
import { BatchCreateModal } from '../components/BatchCreateModal'

export function StockSectionPage() {
  const { items, loading, create, update, remove, reload } = useStock()
  const { create: createMovement } = useMovements()
  const selection = useStockSelection()
  const [searchParams] = useSearchParams()
  const [activeSection, setActiveSection] = useState<Section | 'all' | 'repair'>('maquinas')

  useEffect(() => {
    const section = searchParams.get('section')
    if (section && (stockSections.some((s) => s.value === section) || section === 'all' || section === 'repair')) {
      setActiveSection(section as any)
    }
  }, [searchParams])

  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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

  const hasActiveFilters = roomFilter !== '' || statusFilter !== '' || search !== ''

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeSection === 'all') {
        if (item.status !== 'ativo') return false
      } else if (activeSection === 'repair') {
        if (item.status !== 'em_conserto') return false
      } else {
        if (item.section !== activeSection) return false
      }
      if (roomFilter && item.room !== roomFilter) return false
      if (statusFilter && item.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.subcategory.toLowerCase().includes(q) ||
          item.serialNumber.toLowerCase().includes(q) ||
          item.room.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, activeSection, roomFilter, statusFilter, search])

  const clearFilters = useCallback(() => {
    setRoomFilter('')
    setStatusFilter('')
    setSearch('')
  }, [])

  const sectionItems = useMemo(() => {
    if (activeSection === 'all') return items.filter((i) => i.status === 'ativo')
    if (activeSection === 'repair') return items.filter((i) => i.status === 'em_conserto')
    return items.filter((i) => i.section === activeSection)
  }, [items, activeSection])

  const stats = useMemo(() => ({
    total: sectionItems.length,
    ativos: sectionItems.filter((i) => i.status === 'ativo').length,
    conserto: sectionItems.filter((i) => i.status === 'em_conserto').length,
    descartados: sectionItems.filter((i) => i.status === 'descartado').length,
  }), [sectionItems])

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
      } else if (data.type === 'devolucao') {
        update(movementTarget.id, { status: 'ativo' })
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

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <SectionTabs active={activeSection} onChange={setActiveSection} />

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            {activeSection === 'all'
              ? 'Todos os Itens Ativos'
              : activeSection === 'repair'
                ? 'Itens em Conserto'
                : stockSections.find((s) => s.value === activeSection)?.label}
          </h2>
          <div className="flex gap-2">
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
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
            >
              + Novo Item
            </button>
            <button
              type="button"
              onClick={() => setShowBatch(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 shadow-sm btn-interactive"
            >
              <icons.ui.copy size={14} />
              Criar Lote
            </button>
          </div>
        </div>

        {stats.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-[11px] text-fg-muted font-medium">Total</p>
              <p className="text-2xl font-bold tracking-tight text-fg">{stats.total}</p>
            </div>
            <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Ativos</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">{stats.ativos}</p>
            </div>
            <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Conserto</p>
              <p className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">{stats.conserto}</p>
            </div>
            <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">Descartados</p>
              <p className="text-2xl font-bold tracking-tight text-red-700 dark:text-red-400">{stats.descartados}</p>
            </div>
          </div>
        )}

        {stats.conserto > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <icons.nav.parts size={16} />
            <span>{stats.conserto} {stats.conserto === 1 ? 'item em conserto' : 'itens em conserto'} — <span className="text-amber-600 dark:text-amber-400 font-medium">requer atenção</span></span>
          </div>
        )}

        {batchSuccess > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            <icons.ui.checkCircle size={16} />
            <span>{batchSuccess} {batchSuccess === 1 ? 'item criado' : 'itens criados'} com sucesso!</span>
          </div>
        )}

        {cleanupMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            <icons.ui.checkCircle size={16} />
            <span>{cleanupMessage}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setImportMode(!importMode)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              importMode
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-input text-fg-dim hover:bg-input/80'
            }`}
          >
            <icons.ui.upload size={14} />
            Importar CSV
          </button>
          <button
            type="button"
            onClick={() => exportStockItemsCSV(filtered)}
            className="flex items-center gap-1.5 rounded-xl bg-input px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:bg-input/80"
          >
            <icons.ui.fileBarChart size={14} />
            Exportar CSV
          </button>
        </div>

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
                    Colunas esperadas: Nome, Seção, Subcategoria, Nº Série, Sala, Status, Condição, Tipo Cabo, Comprimento, Conectores, Tomadas, Observações
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportResult(null)
                        setImportError('')
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      className="text-xs text-fg-muted hover:text-fg"
                    >
                      Cancelar
                    </button>
                  </div>
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

        {showForm && (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {editing ? 'Editar Item' : `Novo ${activeSection === 'cabos' ? 'Cabo' : activeSection === 'maquinas' ? 'Equipamento' : activeSection === 'perifericos' ? 'Periférico' : 'Item'}`}
            </h3>
            <StockForm
              initial={editing ? { ...editing } : { section: (activeSection === 'all' || activeSection === 'repair') ? 'maquinas' : activeSection }}
              onSave={handleSave}
              onCancel={() => { setEditing(null); setShowForm(false) }}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, série ou sala..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
              title="Limpar filtros"
            >
              <icons.ui.close size={16} />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="w-full rounded-xl bg-input px-3 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 appearance-none"
          >
            <option value="">Todas as salas</option>
            {uniqueRooms.map((room) => (
              <option key={room} value={room}>{room}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl bg-input px-3 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 appearance-none"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="em_conserto">Em Conserto</option>
            <option value="emprestado">Emprestado</option>
            <option value="descartado">Descartado</option>
          </select>
        </div>

        {!importMode && (filtered.length === 0 ? (
          <EmptyState
            icon={icons.ui.package}
            title={items.length === 0 ? 'Estoque vazio' : 'Nenhum item nesta seção'}
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
              {filtered.map((item) => (
                <StockCard
                  key={item.id}
                  item={item}
                  onEdit={handleEdit}
                  onMove={handleMove}
                  onRepair={handleRepair}
                  onDiscard={handleDiscard}
                  onLoan={handleLoan}
                  onReturn={handleReturn}
                  selectable={selection.selectMode}
                  selected={selection.selected.has(item.id)}
                  onToggleSelect={selection.toggle}
                />
              ))}
            </div>
          </>
        ))}
      </div>

      {movementTarget && (
        <Modal
          open={true}
          onClose={() => setMovementTarget(null)}
          title={
            movementType === 'mudanca_sala' ? 'Mover Item' :
            movementType === 'conserto' ? 'Registrar Conserto' :
            movementType === 'emprestimo' ? 'Registrar Empréstimo' :
            movementType === 'devolucao' ? 'Registrar Devolução' :
            'Movimentar Item'
          }
        >
          <MovementForm
            itemId={movementTarget.id}
            itemName={movementTarget.name}
            currentRoom={movementTarget.room}
            initialType={movementType}
            onSave={handleMovementSave}
            onCancel={() => setMovementTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!discardTarget}
        onClose={() => setDiscardTarget(null)}
        onConfirm={confirmDiscard}
        title="Descartar Item"
        message={`Tem certeza que deseja descartar "${discardTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Descartar"
        variant="danger"
      />

      <BatchCreateModal
        open={showBatch}
        onClose={() => setShowBatch(false)}
        onCreate={handleBatchCreate}
      />

      {selection.selectMode && selection.selected.size > 0 && (
        <StockBatchBar
          selected={selection.selected}
          items={items}
          onClear={selection.clear}
          onExit={selection.exit}
          onUpdate={handleBatchUpdate}
          onDelete={handleBatchDelete}
          onCreateMovement={createMovement}
        />
      )}
    </PullToRefresh>
  )
}
