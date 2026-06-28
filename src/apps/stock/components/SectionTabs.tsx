import type { StockSection } from '../types'
import { stockSections } from '../types'

interface SectionTabsProps {
  active: StockSection | 'all' | 'repair'
  onChange: (section: StockSection) => void
}

export function SectionTabs({ active, onChange }: SectionTabsProps) {
  return (
    <div className="flex rounded-xl bg-segmented p-0.5 select-none">
      {stockSections.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`flex-1 shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all duration-200 btn-interactive ${
            active === s.value
              ? 'bg-surface shadow-sm text-fg'
              : 'text-fg-muted hover:text-fg-dim'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
