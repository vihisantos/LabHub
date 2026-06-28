import { useNavigate } from 'react-router-dom'
import type { StockItem } from '../types'
import { StatusBadge } from './StatusBadge'
import { icons } from '../../../lib/icons'

interface StockCardProps {
  item: StockItem
  onMove: (item: StockItem) => void
  onRepair: (item: StockItem) => void
  onDiscard: (item: StockItem) => void
}

export function StockCard({ item, onMove, onRepair, onDiscard }: StockCardProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/items/${item.id}`)}
      className="group w-full rounded-xl bg-card p-4 text-left ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:bg-input/80 hover:ring-line hover:shadow-lg hover:shadow-black/20"
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-fg text-sm">{item.name}</h3>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {item.subcategory}
            {item.room && ` · ${item.room}`}
            {item.serialNumber && ` · ${item.serialNumber}`}
          </p>
        </div>
      </div>

      {item.condition && (
        <p className="mb-2 text-[10px] text-fg-dim">Condição: {item.condition}</p>
      )}

      {item.notes && (
        <p className="mb-2 line-clamp-1 text-[10px] text-fg-dim">{item.notes}</p>
      )}

      {item.status !== 'descartado' && (
        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onMove(item)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/30"
          >
            <icons.ui.refresh size={10} />
            Mover
          </button>
          <button
            type="button"
            onClick={() => onRepair(item)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/30"
          >
            <icons.nav.parts size={10} />
            Consertar
          </button>
          <button
            type="button"
            onClick={() => onDiscard(item)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <icons.ui.trash size={10} />
            Descartar
          </button>
        </div>
      )}
    </button>
  )
}
