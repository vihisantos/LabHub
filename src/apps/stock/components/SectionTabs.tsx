import type { StockSection } from '../types'
import { stockSections } from '../types'
import { Tabs, TabsList, TabsTrigger } from '../../../lib/components/ui'

interface SectionTabsProps {
  active: StockSection | 'all' | 'repair'
  onChange: (section: StockSection) => void
}

export function SectionTabs({ active, onChange }: SectionTabsProps) {
  return (
    <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
      <Tabs value={active as string} onValueChange={(v) => onChange(v as StockSection)} className="w-max">
        <TabsList className="bg-segmented">
          {stockSections.map((s) => (
            <TabsTrigger key={s.value} value={s.value} className="text-[11px] px-3 py-1.5">
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
