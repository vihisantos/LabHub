import { useNavigate } from 'react-router-dom'
import type { PC, OsType, OsEdition, PcTypeLabel } from '../types'
import { OS_TYPE_LABELS, PC_TYPE_LABELS } from '../types'
import { StatusBadge } from './StatusBadge'
import { icons } from '../../../lib/icons'

interface PCCardProps {
  pc: PC
  selectable?: boolean
  selected?: boolean
  highlighted?: boolean
  focusMode?: boolean
  onToggleSelect?: (id: string) => void
}

export function PCCard({ pc, selectable, selected, highlighted, focusMode, onToggleSelect }: PCCardProps) {
  const navigate = useNavigate()

  function handleClick() {
    if (selectable) {
      onToggleSelect?.(pc.id)
    } else if (!focusMode) {
      navigate(`/pcare/pcs/${pc.id}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group w-full rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
        highlighted
          ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500 dark:ring-emerald-400 animate-pulse'
          : selected
            ? 'bg-cyan-100 dark:bg-cyan-900/20 ring-2 ring-cyan-500 dark:ring-cyan-500'
            : focusMode
              ? 'bg-card ring-2 ring-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 cursor-pointer'
              : 'bg-card ring-1 ring-line hover:bg-input/80 hover:ring-line'
      }`}
    >
      <div className={`flex items-start justify-between ${focusMode ? 'mb-1' : 'mb-2.5'}`}>
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
          <div className={`relative flex items-center justify-center rounded-lg bg-input ring-1 ring-line overflow-hidden ${
            focusMode ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-base'
          }`}>
            {pc.photos?.[0] ? (
              <img
                src={pc.photos[0]}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <icons.nav.pcs size={focusMode ? 22 : 18} className="text-fg-dim" />
            )}
          </div>
          <div>
            <h3 className={`font-semibold text-fg ${focusMode ? 'text-base' : 'text-sm'}`}>
              {pc.labName} — {pc.pcNumber}
            </h3>
            <p className={`text-fg-muted ${focusMode ? 'text-xs' : 'text-xs'}`}>{pc.roomLocation}</p>
            {focusMode && pc.assetTag && (
              <p className="text-[11px] text-fg-dim">Patrimônio: {pc.assetTag}</p>
            )}
          </div>
        </div>
        {!focusMode && (
          <span className="shrink-0 rounded-md bg-input px-2 py-0.5 text-[10px] font-medium text-fg-dim ring-1 ring-line">
            {pc.config?.osType
              ? `${OS_TYPE_LABELS[pc.config.osType as OsType] || pc.config.osType}${pc.config.pcType ? ` (${PC_TYPE_LABELS[pc.config.pcType as PcTypeLabel] || pc.config.pcType})` : ''}`
              : pc.config?.pcType
                ? PC_TYPE_LABELS[pc.config.pcType as PcTypeLabel]
                : 'Sem config'}
          </span>
        )}
      </div>

      <div className={`flex gap-1.5 ${focusMode ? 'mb-1' : 'mb-2.5'}`}>
        <StatusBadge status={pc.cleaningStatus} />
        <StatusBadge status={pc.restorationStatus} />
      </div>

      {!focusMode && (
        <div className="flex flex-wrap gap-1">
          <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.cpu}</span>
          <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.ram}</span>
          <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">{pc.specs.storage}</span>
        </div>
      )}

      {focusMode && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          <icons.ui.checkCircle size={14} />
          <span>Toque para abrir checklist</span>
        </div>
      )}

      {pc.observations && !focusMode && (
        <p className="mt-2 line-clamp-1 text-xs text-fg-dim">{pc.observations}</p>
      )}
    </button>
  )
}
