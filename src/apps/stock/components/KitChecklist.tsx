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
        <p className="text-xs text-fg-dim font-medium">{presentCount}/{items.length} itens presentes</p>
        {allPresent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            <icons.ui.check size={10} />
            Kit Completo
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => toggle(index)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all duration-200 btn-interactive ${
              item.present
                ? 'bg-emerald-50 dark:bg-emerald-900/30 shadow-sm'
                : 'bg-input hover:bg-input/80 shadow-[var(--shadow-card)]'
            }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg ${
              item.present
                ? 'bg-emerald-500'
                : 'border-2 border-line'
            }`}>
              {item.present && <icons.ui.check size={12} className="text-white" />}
            </span>
            <div className="min-w-0 flex-1">
              <span className={`text-sm ${item.present ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-fg'}`}>
                {item.name}
              </span>
              {item.expected > 1 && (
                <span className="ml-1 text-[11px] text-fg-muted">(×{item.expected})</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
      >
        Salvar Conferência
      </button>
    </div>
  )
}
