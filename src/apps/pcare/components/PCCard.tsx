import { useNavigate } from 'react-router-dom'
import type { PC } from '../types'
import { StatusBadge } from './StatusBadge'

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
          ? 'bg-cyan-900/20 ring-2 ring-cyan-500'
          : 'bg-slate-900 ring-1 ring-slate-800 hover:bg-slate-800/80 hover:ring-slate-600'
      }`}
    >
      <div className="mb-2.5 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          {selectable && (
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                selected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-600 group-hover:border-slate-500'
              }`}
              onClick={(e) => { e.stopPropagation(); onToggleSelect?.(pc.id) }}
            >
              {selected && <span className="text-[10px] text-white">✓</span>}
            </div>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-base ring-1 ring-slate-700">
            🖥️
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">
              {pc.labName} — {pc.pcNumber}
            </h3>
            <p className="text-xs text-slate-500">{pc.roomLocation}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-700">
          {pc.specs.os}
        </span>
      </div>

      <div className="mb-2.5 flex gap-1.5">
        <StatusBadge status={pc.cleaningStatus} />
        <StatusBadge status={pc.restorationStatus} />
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-700/50">{pc.specs.cpu}</span>
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-700/50">{pc.specs.ram}</span>
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-700/50">{pc.specs.storage}</span>
      </div>

      {pc.observations && (
        <p className="mt-2 line-clamp-1 text-xs text-slate-600">{pc.observations}</p>
      )}
    </button>
  )
}
