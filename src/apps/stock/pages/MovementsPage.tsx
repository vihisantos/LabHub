import { useMemo, useState } from 'react'
import { useMovements } from '../hooks/useMovements'
import { MovementTimeline } from '../components/MovementTimeline'
import { movementTypes } from '../types'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { exportMovementsCSV } from '../utils/export'

export function MovementsPage() {
  const { movements, loading, reload } = useMovements()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          m.itemName.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.fromRoom.toLowerCase().includes(q) ||
          m.toRoom.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [movements, search, typeFilter])

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Movimentações</h2>
          <button
            type="button"
            onClick={() => exportMovementsCSV(filtered)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:bg-input hover:text-fg"
          >
            <icons.ui.fileBarChart size={14} />
            Exportar CSV
          </button>
        </div>

        <div className="relative">
          <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Buscar por item, descrição ou sala..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setTypeFilter('')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === ''
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-500 dark:ring-emerald-700/50'
                : 'bg-input text-fg-dim ring-1 ring-line hover:bg-card'
            }`}
          >
            Todas
          </button>
          {movementTypes.map((mt) => (
            <button
              key={mt.value}
              type="button"
              onClick={() => setTypeFilter(mt.value === typeFilter ? '' : mt.value)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === mt.value
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-500 dark:ring-emerald-700/50'
                  : 'bg-input text-fg-dim ring-1 ring-line hover:bg-card'
              }`}
            >
              {mt.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <icons.ui.clock size={28} className="mb-3 text-fg-muted" />
            <h3 className="mb-1 text-lg font-medium text-fg-dim">Nenhuma movimentação</h3>
            <p className="text-sm text-fg-muted">Registre movimentações nos itens do estoque.</p>
          </div>
        ) : (
          <MovementTimeline movements={filtered} />
        )}
      </div>
    </PullToRefresh>
  )
}
