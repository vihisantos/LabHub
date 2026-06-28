import { useNavigate } from 'react-router-dom'
import type { PC } from '../types'
import { StatusBadge } from './StatusBadge'
import { icons } from '../../../lib/icons'

interface PCCardProps {
  pc: PC
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export function PCCard({ pc, selectable, selected, onToggleSelect }: PCCardProps) {
  const navigate = useNavigate()

  function handleClick() {
    if (selectable) {
      onToggleSelect?.(pc.id)
    } else {
      navigate(`/pcare/pcs/${pc.id}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group w-full rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
        selected
          ? 'bg-cyan-100 dark:bg-cyan-900/20 ring-2 ring-cyan-500 dark:ring-cyan-500'
          : 'bg-card ring-1 ring-line hover:bg-input/80 hover:ring-line'
      }`}
    >
      <div className="mb-2.5 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(pc.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 shrink-0 rounded border-line bg-input text-cyan-600 dark:text-cyan-500 focus:ring-cyan-500"
              aria-label={`Selecionar ${pc.labName} ${pc.pcNumber}`}
            />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-input text-base ring-1 ring-line">
            <icons.nav.pcs size={18} className="text-fg-dim" />
          </div>
          <div>
            <h3 className="font-semibold text-fg text-sm">
              {pc.labName} — {pc.pcNumber}
            </h3>
            <p className="text-xs text-fg-muted">{pc.roomLocation}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-input px-2 py-0.5 text-[10px] font-medium text-fg-dim ring-1 ring-line">
          {pc.specs.os}
        </span>
      </div>

      <div className="mb-2.5 flex gap-1.5">
        <StatusBadge status={pc.cleaningStatus} />
        <StatusBadge status={pc.restorationStatus} />
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.cpu}</span>
        <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.ram}</span>
        <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.storage}</span>
      </div>

      {pc.observations && (
        <p className="mt-2 line-clamp-1 text-xs text-fg-dim">{pc.observations}</p>
      )}
    </button>
  )
}
