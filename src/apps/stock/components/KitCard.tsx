import { useNavigate } from 'react-router-dom'
import type { Kit } from '../types'
import { icons } from '../../../lib/icons'

const statusConfig = {
  ok: { label: 'Completo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300', dot: 'bg-emerald-400' },
  incompleto: { label: 'Incompleto', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300', dot: 'bg-amber-400' },
  nao_conferido: { label: 'Não Conferido', cls: 'bg-input text-fg-dim', dot: 'bg-slate-400' },
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
      className="group w-full rounded-xl bg-card p-4 text-left ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:bg-input/80 hover:ring-line hover:shadow-lg hover:shadow-black/20"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-fg text-sm">{kit.name}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            {kit.room}
            {kit.lastChecked && ` · Última conferência: ${formatDate(kit.lastChecked)}`}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {config.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <icons.ui.check size={14} className="text-fg-muted" />
        <span className="text-xs text-fg-dim">{presentCount}/{kit.items.length} itens presentes</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {kit.items.slice(0, 4).map((item) => (
          <span
            key={item.name}
            className={            `rounded-md px-1.5 py-0.5 text-[10px] ${
              item.present
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
            }`}
          >
            {item.name}
          </span>
        ))}
        {kit.items.length > 4 && (
          <span className="rounded-md bg-input px-1.5 py-0.5 text-[10px] text-fg-dim">
            +{kit.items.length - 4}
          </span>
        )}
      </div>
    </button>
  )
}
