import { useMemo, useState } from 'react'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { StockCard } from '../components/StockCard'
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
  const { items, loading, create, update, reload } = useStock()
  const { create: createMovement } = useMovements()
  const [activeSection, setActiveSection] = useState<Section>('maquinas')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StockItem | null>(null)
  const [movementTarget, setMovementTarget] = useState<StockItem | null>(null)
  const [movementType, setMovementType] = useState<'mudanca_sala' | 'conserto' | 'descarte'>('mudanca_sala')
  const [discardTarget, setDiscardTarget] = useState<StockItem | null>(null)

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (item.section !== activeSection) return false
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
  }, [items, activeSection, search])

  const sectionItems = useMemo(() => items.filter((i) => i.section === activeSection), [items, activeSection])
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

  function handleMove(item: StockItem) {
    setMovementTarget(item)
    setMovementType('mudanca_sala')
  }

  function handleRepair(item: StockItem) {
    setMovementTarget(item)
    setMovementType('conserto')
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
      }
    }
    setMovementTarget(null)
  }

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <SectionTabs active={activeSection} onChange={setActiveSection} />

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{stockSections.find((s) => s.value === activeSection)?.label}</h2>
          <button
            type="button"
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-emerald-500/20 transition-all hover:shadow-md"
          >
            + Novo Item
          </button>
        </div>

        {stats.total > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-line bg-card/50 px-3 py-2.5">
              <p className="text-xs text-fg-muted">Total</p>
              <p className="text-lg font-bold text-fg">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-900/30 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Ativos</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{stats.ativos}</p>
            </div>
            <div className="rounded-lg border border-amber-900/30 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
              <p className="text-xs text-amber-600 dark:text-amber-400">Conserto</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{stats.conserto}</p>
            </div>
            <div className="rounded-lg border border-red-900/30 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">Descartados</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300">{stats.descartados}</p>
            </div>
          </div>
        )}

        {stats.conserto > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-900/30 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <icons.nav.parts size={14} />
            <span>{stats.conserto} {stats.conserto === 1 ? 'item em conserto' : 'itens em conserto'} — <span className="text-amber-600 dark:text-amber-400">requer atenção</span></span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => exportStockItemsCSV(filtered)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:bg-input hover:text-fg"
          >
            <icons.ui.fileBarChart size={14} />
            Exportar CSV
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {editing ? 'Editar Item' : 'Novo Item'}
            </h3>
            <StockForm
              initial={editing ? { ...editing } : { section: activeSection }}
              onSave={handleSave}
              onCancel={() => { setEditing(null); setShowForm(false) }}
            />
          </div>
        )}

        <div className="relative">
          <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Buscar por nome, série ou sala..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-emerald-500"
          />
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
          <div className="space-y-2">
            {filtered.map((item) => (
              <StockCard
                key={item.id}
                item={item}
                onMove={handleMove}
                onRepair={handleRepair}
                onDiscard={handleDiscard}
              />
            ))}
          </div>
        )}
      </div>

      {movementTarget && (
        <Modal
          open={true}
          onClose={() => setMovementTarget(null)}
          title={movementType === 'mudanca_sala' ? 'Mover Item' : 'Registrar Conserto'}
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
    </PullToRefresh>
  )
}
