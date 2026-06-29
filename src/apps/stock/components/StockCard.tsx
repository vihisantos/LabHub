import { useNavigate } from 'react-router-dom'
import type { StockItem } from '../types'
import { StatusBadge } from './StatusBadge'
import { icons } from '../../../lib/icons'

interface StockCardProps {
  item: StockItem
  onEdit?: (item: StockItem) => void
  onMove: (item: StockItem) => void
  onRepair: (item: StockItem) => void
  onDiscard: (item: StockItem) => void
  onLoan?: (item: StockItem) => void
  onReturn?: (item: StockItem) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export function StockCard({ item, onEdit, onMove, onRepair, onDiscard, onLoan, onReturn, selectable, selected, onToggleSelect }: StockCardProps) {
  const navigate = useNavigate()

  function handleClick() {
    if (selectable && onToggleSelect) {
      onToggleSelect(item.id)
    } else {
      navigate(`/stock/items/${item.id}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group w-full rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[var(--shadow-elevated)] ${
        selected ? 'ring-2 ring-emerald-500' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {selectable && (
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg transition-colors ${
                selected ? 'bg-emerald-500' : 'border-2 border-line'
              }`}>
                {selected && <icons.ui.check size={12} className="text-white" />}
              </span>
            )}
            <h3 className="truncate font-semibold text-fg text-sm">{item.name}</h3>
            {!selectable && <StatusBadge status={item.status} />}
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {item.subcategory}
            {item.room && ` · ${item.room}`}
            {item.serialNumber && ` · ${item.serialNumber}`}
          </p>
        </div>
        {selectable && <StatusBadge status={item.status} />}
      </div>

      {item.condition && (
        <p className="mb-2 text-[10px] text-fg-dim">Condição: {item.condition}</p>
      )}

      {item.section === 'cabos' && (item.cableType || item.cableLength) && (
        <p className="mb-2 text-[10px] text-fg-dim">
          {item.cableType && `Tipo: ${item.cableType}`}
          {item.cableType && item.cableLength && ' · '}
          {item.cableLength && `${item.cableLength}m`}
          {item.connectorType && ` · ${item.connectorType}`}
          {item.outletCount && ` · ${item.outletCount} tomadas`}
        </p>
      )}

      {item.notes && (
        <p className="mb-2 line-clamp-1 text-[10px] text-fg-dim">{item.notes}</p>
      )}

      {!selectable && item.status !== 'descartado' && (
        <div className="flex gap-1 pt-2" onClick={(e) => e.stopPropagation()}>
          {item.status === 'emprestado' ? (
            <button
              type="button"
              onClick={() => onReturn?.(item)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
            >
              <icons.ui.userCheck size={12} />
              Devolver
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onEdit?.(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-fg-dim transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
              >
                <icons.ui.edit size={12} />
                Editar
              </button>
              <button
                type="button"
                onClick={() => onLoan?.(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
              >
                <icons.ui.user size={12} />
                Emprestar
              </button>
              <button
                type="button"
                onClick={() => onMove(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
              >
                <icons.ui.refresh size={12} />
                Mover
              </button>
              <button
                type="button"
                onClick={() => onRepair(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
              >
                <icons.nav.parts size={12} />
                Consertar
              </button>
              <button
                type="button"
                onClick={() => onDiscard(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-black/5 dark:hover:bg-white/5 btn-interactive"
              >
                <icons.ui.trash size={12} />
                Descartar
              </button>
            </>
          )}
        </div>
      )}
    </button>
  )
}
