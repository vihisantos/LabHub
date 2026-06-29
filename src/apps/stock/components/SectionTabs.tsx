import type { StockSection } from '../types'
import { stockSections } from '../types'

interface SectionTabsProps {
  active: StockSection | 'all' | 'repair'
  onChange: (section: StockSection) => void
}

export function SectionTabs({ active, onChange }: SectionTabsProps) {
  return (
    <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="flex gap-1 rounded-xl bg-segmented p-0.5 select-none w-max">
        {stockSections.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-200 btn-interactive ${
              active === s.value
                ? 'bg-surface shadow-sm text-fg'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
