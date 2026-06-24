import type { GeneralItem } from '../types'

const categoryMeta: Record<string, { icon: string; label: string }> = {
  papel: { icon: '📄', label: 'Papel' },
  caneta: { icon: '🖊️', label: 'Caneta' },
  cabo: { icon: '🔌', label: 'Cabo' },
  adaptador: { icon: '🔗', label: 'Adaptador' },
  material_limpeza: { icon: '🧹', label: 'Limpeza' },
  suprimento_escritorio: { icon: '📎', label: 'Escritório' },
  ferramenta: { icon: '🛠️', label: 'Ferramenta' },
  outro: { icon: '📦', label: 'Outro' },
}

interface StockCardProps {
  item: GeneralItem
  onEdit: (item: GeneralItem) => void
  onRemove: (id: string) => void
  onAdjust: (id: string, delta: number) => void
}

export function StockCard({ item, onEdit, onRemove, onAdjust }: StockCardProps) {
  const cat = categoryMeta[item.category] || { icon: '📦', label: item.category }
  const low = item.quantity <= item.minQuantity && item.quantity > 0
  const critical = item.quantity === 0
  const pct = item.minQuantity > 0 ? Math.min(100, (item.quantity / item.minQuantity) * 100) : 100

  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-800/40 hover:shadow-lg hover:shadow-emerald-900/10">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-900/20 text-lg ring-1 ring-emerald-800/30">
          {cat.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium text-slate-200 truncate">{item.name}</h3>
              <p className="text-xs text-slate-500">
                {cat.label}
                {item.location && ` · ${item.location}`}
                {item.unit && ` · ${item.unit}`}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onAdjust(item.id, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-sm text-slate-400 ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-slate-200"
              >
                −
              </button>
              <span className="min-w-[3ch] text-center text-lg font-bold text-white">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => onAdjust(item.id, 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-sm text-slate-400 ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-slate-200"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-600">
            {critical ? 'Sem estoque' : low ? 'Abaixo do mínimo' : 'Estável'}
          </span>
          <span className="text-slate-500">
            {item.quantity}{item.unit} / {item.minQuantity}{item.unit}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              critical ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-900/30"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remover ${item.name}?`)) onRemove(item.id)
            }}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-900/30"
          >
            Excluir
          </button>
        </div>
        {item.notes && (
          <span className="truncate text-[10px] text-slate-600 max-w-[140px]">{item.notes}</span>
        )}
      </div>
    </div>
  )
}
