import { useState } from 'react'
import type { GeneralItem } from '../types'
import { ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'

import type { ComponentType } from 'react'

const categoryIcons: Record<string, ComponentType<{ size?: number }>> = {
  papel: icons.nav.reports,
  caneta: icons.ui.edit,
  cabo: icons.ui.plug,
  adaptador: icons.ui.link,
  material_limpeza: icons.ui.brushCleaning,
  suprimento_escritorio: icons.ui.paperclip,
  ferramenta: icons.nav.parts,
  outro: icons.ui.package,
}

const categoryLabels: Record<string, string> = {
  papel: 'Papel',
  caneta: 'Caneta',
  cabo: 'Cabo',
  adaptador: 'Adaptador',
  material_limpeza: 'Limpeza',
  suprimento_escritorio: 'Escritório',
  ferramenta: 'Ferramenta',
  outro: 'Outro',
}

interface StockCardProps {
  item: GeneralItem
  onEdit: (item: GeneralItem) => void
  onRemove: (id: string) => void
  onAdjust: (id: string, delta: number) => void
}

export function StockCard({ item, onEdit, onRemove, onAdjust }: StockCardProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const label = categoryLabels[item.category] || item.category
  const low = item.quantity <= item.minQuantity && item.quantity > 0
  const critical = item.quantity === 0
  const pct = item.minQuantity > 0 ? Math.min(100, (item.quantity / item.minQuantity) * 100) : 100

  return (
    <>
      <div className="group rounded-xl border border-line bg-card/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-800/40 hover:shadow-lg hover:shadow-emerald-900/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-900/20 ring-1 ring-emerald-800/30">
            {categoryIcons[item.category] ? (
              (() => { const Icon = categoryIcons[item.category]; return <Icon size={20} /> })()
            ) : (
              <icons.ui.package size={20} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium text-fg truncate">{item.name}</h3>
                <p className="text-xs text-fg-muted">
                  {label}
                  {item.location && ` · ${item.location}`}
                  {item.unit && ` · ${item.unit}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onAdjust(item.id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-input text-sm text-fg-dim ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-fg"
                  aria-label="Diminuir quantidade"
                >
                  <icons.ui.minus size={14} />
                </button>
                <span className="min-w-[3ch] text-center text-lg font-bold text-fg">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjust(item.id, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-input text-sm text-fg-dim ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-fg"
                  aria-label="Aumentar quantidade"
                >
                  <icons.ui.plus size={14} />
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
            <span className="text-fg-muted">
              {item.quantity}{item.unit} / {item.minQuantity}{item.unit}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-input">
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
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-900/30"
            >
              <icons.ui.edit size={10} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-900/30"
            >
              <icons.ui.trash size={10} />
              Excluir
            </button>
          </div>
          {item.notes && (
            <span className="truncate text-[10px] text-slate-600 max-w-[140px]">{item.notes}</span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => onRemove(item.id)}
        title="Excluir item"
        message={`Tem certeza que deseja excluir "${item.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
      />
    </>
  )
}
