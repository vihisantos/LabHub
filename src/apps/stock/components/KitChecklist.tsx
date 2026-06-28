import { useState } from 'react'
import type { Kit, KitItem } from '../types'
import { icons } from '../../../lib/icons'

interface KitChecklistProps {
  kit: Kit
  onSave: (items: KitItem[]) => void
}

export function KitChecklist({ kit, onSave }: KitChecklistProps) {
  const [items, setItems] = useState<KitItem[]>(
    kit.items.map((i) => ({ ...i }))
  )

  function toggle(index: number) {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, present: !item.present } : item
    ))
  }

  function handleSave() {
    onSave(items)
  }

  const presentCount = items.filter((i) => i.present).length
  const allPresent = items.every((i) => i.present)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-dim">{presentCount}/{items.length} itens presentes</p>
        {allPresent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
            <icons.ui.check size={10} />
            Kit Completo
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {items.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => toggle(index)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
              item.present
                ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500 dark:ring-emerald-800/40'
                : 'bg-input/50 ring-1 ring-line hover:bg-input'
            }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
              item.present
                ? 'border-emerald-500 bg-emerald-500'
                : 'border-line'
            }`}>
              {item.present && <icons.ui.check size={12} className="text-fg" />}
            </span>
            <div className="min-w-0 flex-1">
              <span className={`text-sm ${item.present ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'}`}>
                {item.name}
              </span>
              {item.expected > 1 && (
                <span className="ml-1 text-[10px] text-fg-muted">(×{item.expected})</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 py-2 text-sm font-medium text-fg shadow-sm shadow-emerald-500/20 transition-all hover:shadow-md"
      >
        Salvar Conferência
      </button>
    </div>
  )
}
