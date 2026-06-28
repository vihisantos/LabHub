import { useNavigate } from 'react-router-dom'
import type { Kit } from '../types'
import { icons } from '../../../lib/icons'

const statusConfig = {
  ok: { label: 'Completo', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
  incompleto: { label: 'Incompleto', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', dot: 'bg-amber-500' },
  nao_conferido: { label: 'Não Conferido', cls: 'bg-input text-fg-muted', dot: 'bg-fg-muted' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function KitCard({ kit }: { kit: Kit }) {
  const navigate = useNavigate()
  const config = statusConfig[kit.status]
  const presentCount = kit.items.filter((i) => i.present).length

  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/kits/${kit.id}`)}
      className="group w-full rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-fg text-sm">{kit.name}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            {kit.room}
            {kit.lastChecked && ` · Última conferência: ${formatDate(kit.lastChecked)}`}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {config.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <icons.ui.check size={14} className="text-fg-muted" />
        <span className="text-xs text-fg-dim">{presentCount}/{kit.items.length} itens presentes</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {kit.items.slice(0, 4).map((item) => (
          <span
            key={item.name}
            className={            `rounded-lg px-2 py-0.5 text-[10px] font-medium ${
              item.present
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-400'
            }`}
          >
            {item.name}
          </span>
        ))}
        {kit.items.length > 4 && (
          <span className="rounded-lg bg-input px-2 py-0.5 text-[10px] font-medium text-fg-muted">
            +{kit.items.length - 4}
          </span>
        )}
      </div>
    </button>
  )
}
