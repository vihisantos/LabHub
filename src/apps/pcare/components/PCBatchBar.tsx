import { icons } from '../../../lib/icons'

interface PCBatchBarProps {
  selectedCount: number
  onBatchUpdate: (field: 'cleaningStatus' | 'restorationStatus', value: 'pending' | 'in_progress' | 'done') => void
  onSchedule: () => void
  onExport: () => void
  onClear: () => void
}

export function PCBatchBar({
  selectedCount,
  onBatchUpdate,
  onSchedule,
  onExport,
  onClear,
}: PCBatchBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed left-0 right-0 z-40 mx-auto max-w-lg px-4" style={{ bottom: 'calc(4rem + max(1rem, env(safe-area-inset-bottom)))' }}>
      <div className="rounded-2xl border border-white/10 bg-card/80 p-3 shadow-xl shadow-black/40 backdrop-blur-2xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-fg-dim">{selectedCount} PC{selectedCount > 1 ? 's' : ''} selecionado{selectedCount > 1 ? 's' : ''}</p>
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <icons.ui.close size={12} />
            Limpar
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <div className="flex gap-1">
            <label className="flex items-center gap-1 rounded-lg bg-input px-2 py-1 text-[10px] font-medium text-fg-dim ring-1 ring-line">
              Limpeza
            </label>
            <BatchBtn label="Pend" color="slate" onClick={() => onBatchUpdate('cleaningStatus', 'pending')} />
            <BatchBtn label="Andam" color="amber" onClick={() => onBatchUpdate('cleaningStatus', 'in_progress')} />
            <BatchBtn label="Conc" color="emerald" onClick={() => onBatchUpdate('cleaningStatus', 'done')} />
          </div>
          <div className="flex gap-1">
            <label className="flex items-center gap-1 rounded-lg bg-input px-2 py-1 text-[10px] font-medium text-fg-dim ring-1 ring-line">
              Rest.
            </label>
            <BatchBtn label="Pend" color="slate" onClick={() => onBatchUpdate('restorationStatus', 'pending')} />
            <BatchBtn label="Andam" color="amber" onClick={() => onBatchUpdate('restorationStatus', 'in_progress')} />
            <BatchBtn label="Conc" color="emerald" onClick={() => onBatchUpdate('restorationStatus', 'done')} />
          </div>
          <button
            type="button"
            onClick={onSchedule}
            className="flex items-center gap-1 rounded-lg bg-input px-2.5 py-1 text-[10px] font-medium text-fg-dim ring-1 ring-line transition-colors hover:bg-card"
          >
            <icons.ui.calendar size={12} />
            Agendar
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1 rounded-lg bg-input px-2.5 py-1 text-[10px] font-medium text-fg-dim ring-1 ring-line transition-colors hover:bg-card"
          >
            <icons.ui.fileBarChart size={12} />
            Exportar
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchBtn({
  label,
  color,
  onClick,
}: {
  label: string
  color: 'slate' | 'amber' | 'emerald'
  onClick: () => void
}) {
  const colors = {
    slate: 'bg-input text-fg-dim hover:bg-card ring-1 ring-line',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 ring-1 ring-amber-500 dark:ring-amber-800/50',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 ring-1 ring-emerald-500 dark:ring-emerald-800/50',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${colors[color]}`}
    >
      {label}
    </button>
  )
}
