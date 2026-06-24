import { useMemo, useState } from 'react'
import { useStock } from '../hooks/useStock'
import { StockCard } from '../components/StockCard'
import { StockForm } from '../components/StockForm'
import { stockCategories } from '../types'
import type { GeneralItem } from '../types'
import { LoadingSpinner } from '../../pcare/components/LoadingSpinner'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'

export function StockList() {
  const { items, loading, create, update, remove, reload } = useStock()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editing, setEditing] = useState<GeneralItem | null>(null)
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.notes.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, search, categoryFilter])

  const total = items.length
  const lowStock = items.filter((i) => i.quantity <= i.minQuantity && i.quantity > 0).length
  const critical = items.filter((i) => i.quantity === 0)
  const criticalCount = critical.length

  function handleSave(data: Parameters<typeof create>[0]) {
    if (editing) {
      update(editing.id, data)
    } else {
      create(data)
    }
    setEditing(null)
    setShowForm(false)
  }

  function handleEdit(item: GeneralItem) {
    setEditing(item)
    setShowForm(true)
  }

  function handleAdjust(id: string, delta: number) {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newQty = Math.max(0, item.quantity + delta)
    update(id, { quantity: newQty })
  }

  function openForm() {
    setEditing(null)
    setShowForm(true)
  }

  if (loading) return <LoadingSpinner />

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Estoque Geral</h2>
          <button
            type="button"
            onClick={showForm ? () => setShowForm(false) : openForm}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-500/20 transition-all hover:shadow-md"
          >
            {showForm ? 'Cancelar' : '+ Novo Item'}
          </button>
        </div>

        {total > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-lg font-bold text-white">{total}</p>
            </div>
            <div className="rounded-lg border border-amber-900/30 bg-amber-950/20 px-3 py-2.5">
              <p className="text-xs text-amber-400">Estoque baixo</p>
              <p className="text-lg font-bold text-amber-300">{lowStock}</p>
            </div>
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2.5">
              <p className="text-xs text-red-400">Esgotados</p>
              <p className="text-lg font-bold text-red-300">{criticalCount}</p>
            </div>
          </div>
        )}

        {showForm && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {editing ? 'Editar Item' : 'Novo Item'}
            </h3>
            <StockForm
              initial={editing ?? undefined}
              onSave={handleSave}
              onCancel={() => { setEditing(null); setShowForm(false) }}
            />
          </div>
        )}

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nome, local ou observação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition-colors focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === ''
                ? 'bg-emerald-900/40 text-emerald-300 ring-1 ring-emerald-700/50'
                : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700 hover:bg-slate-700'
            }`}
          >
            Todos
          </button>
          {stockCategories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategoryFilter(cat.value === categoryFilter ? '' : cat.value)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat.value
                  ? 'bg-emerald-900/40 text-emerald-300 ring-1 ring-emerald-700/50'
                  : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700 hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {criticalCount > 0 && categoryFilter === '' && !search && (
          <div className="rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3">
            <p className="text-sm font-medium text-red-400">
              ⚠️ {criticalCount} {criticalCount === 1 ? 'item esgotado' : 'itens esgotados'}
            </p>
            <p className="text-xs text-red-400/70 mt-0.5">Reposição necessária o quanto antes</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon="📦"
            title={items.length === 0 ? 'Estoque vazio' : 'Nenhum item encontrado'}
            description={items.length === 0 ? 'Adicione itens para controlar o estoque do laboratório.' : 'Tente alterar os filtros ou a busca.'}
            action={items.length === 0 ? { label: 'Adicionar Item', onClick: openForm } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <StockCard
                key={item.id}
                item={item}
                onEdit={handleEdit}
                onRemove={remove}
                onAdjust={handleAdjust}
              />
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}
