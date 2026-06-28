import type { StockSection } from '../types'
import { stockSections } from '../types'

interface SectionTabsProps {
  active: StockSection
  onChange: (section: StockSection) => void
}

export function SectionTabs({ active, onChange }: SectionTabsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {stockSections.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            active === s.value
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-500 dark:ring-emerald-700/50'
              : 'bg-input text-fg-dim ring-1 ring-line hover:bg-card'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
