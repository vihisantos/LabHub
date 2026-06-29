import { useMemo, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { useStockSelection } from '../hooks/useStockSelection'
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

  function handleSave(data: StockItemFormData) {
    if (editing) {
      update(editing.id, data)
    } else {
      create(data)
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

  function handleBatchDelete(ids: string[]) {
    for (const id of ids) remove(id)
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

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => exportStockItemsCSV(filtered)}
            className="flex items-center gap-1.5 rounded-xl bg-input px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:bg-input/80"
          >
            <icons.ui.fileBarChart size={14} />
            Exportar CSV
          </button>
        </div>

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

        {filtered.length === 0 ? (
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
        )}
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
