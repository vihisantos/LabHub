import { useMemo } from 'react'
import type { StockSection } from '../types'
import { stockSections } from '../types'
import { icons } from '../../../lib/icons'
import type { StockItem } from '../types'

export type TabId = StockSection | 'all' | 'repair' | 'emprestados'

interface SectionTabsProps {
  active: TabId
  onChange: (tab: TabId) => void
  items: StockItem[]
}

const sectionColors: Record<StockSection, string> = {
  maquinas: 'text-sky-600 dark:text-sky-400',
  perifericos: 'text-purple-600 dark:text-purple-400',
  material_escritorio: 'text-amber-600 dark:text-amber-400',
  adaptadores: 'text-cyan-600 dark:text-cyan-400',
  equipamentos: 'text-rose-600 dark:text-rose-400',
  cabos: 'text-orange-600 dark:text-orange-400',
  outros: 'text-slate-600 dark:text-slate-400',
}

const sectionBg: Record<StockSection, string> = {
  maquinas: 'bg-sky-100 dark:bg-sky-950/30',
  perifericos: 'bg-purple-100 dark:bg-purple-950/30',
  material_escritorio: 'bg-amber-100 dark:bg-amber-950/30',
  adaptadores: 'bg-cyan-100 dark:bg-cyan-950/30',
  equipamentos: 'bg-rose-100 dark:bg-rose-950/30',
  cabos: 'bg-orange-100 dark:bg-orange-950/30',
  outros: 'bg-slate-100 dark:bg-slate-950/30',
}

const sectionIcons: Record<StockSection, React.FC<{ size?: number }>> = {
  maquinas: icons.nav.pcs,
  perifericos: icons.ui.printer,
  material_escritorio: icons.ui.fileBarChart,
  adaptadores: icons.ui.plug,
  equipamentos: icons.ui.hardDrive,
  cabos: icons.ui.cable,
  outros: icons.ui.package,
}

const specialTabs: { id: TabId; label: string; icon: React.FC<{ size?: number }>; color: string }[] = [
  { id: 'all', label: 'Ativos', icon: icons.ui.inbox, color: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'emprestados', label: 'Emprestados', icon: icons.ui.user, color: 'text-violet-600 dark:text-violet-400' },
  { id: 'repair', label: 'Em Conserto', icon: icons.nav.parts, color: 'text-amber-600 dark:text-amber-400' },
]

export function SectionTabs({ active, onChange, items }: SectionTabsProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of items) {
      map[item.section] = (map[item.section] || 0) + 1
    }
    map.all = items.filter((i) => i.status === 'ativo').length
    map.emprestados = items.filter((i) => i.status === 'emprestado').length
    map.repair = items.filter((i) => i.status === 'em_conserto').length
    return map
  }, [items])

  return (
    <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] -mx-4 px-4">
      <div className="flex gap-2 pb-1 w-max">
        {specialTabs.map((tab) => {
          const Icon = tab.icon
          const count = counts[tab.id] ?? 0
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`
                flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium
                transition-all duration-200 shrink-0
                ${isActive
                  ? 'bg-card shadow-[var(--shadow-card)] ring-1 ring-line'
                  : 'text-fg-muted hover:bg-input hover:text-fg'
                }
              `}
            >
              <Icon size={16} className={isActive ? tab.color : ''} />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className={`text-[11px] tabular-nums ${isActive ? 'text-fg-muted' : 'text-fg-dim'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}

        <div className="mx-1 w-px bg-line self-stretch" />

        {stockSections.map((s) => {
          const Icon = sectionIcons[s.value]
          const count = counts[s.value] ?? 0
          const isActive = active === s.value
          const color = sectionColors[s.value]
          const bg = sectionBg[s.value]
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              className={`
                flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium
                transition-all duration-200 shrink-0
                ${isActive
                  ? 'bg-card shadow-[var(--shadow-card)] ring-1 ring-line'
                  : 'text-fg-muted hover:bg-input hover:text-fg'
                }
              `}
            >
              <Icon size={16} className={isActive ? color : ''} />
              <span>{s.label}</span>
              {count > 0 && (
                <span className={`text-[11px] tabular-nums ${isActive ? 'text-fg-muted' : 'text-fg-dim'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
