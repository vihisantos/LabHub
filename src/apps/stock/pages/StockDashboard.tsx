import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { useMovements } from '../hooks/useMovements'
import { useInventory } from '../hooks/useInventory'
import { StatusBadge } from '../components/StatusBadge'
import { MovementTimeline } from '../components/MovementTimeline'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import type { StockSection } from '../types'

const sectionIcons: Record<StockSection, typeof icons.ui.package> = {
  maquinas: icons.nav.pcs,
  perifericos: icons.ui.plug,
  material_escritorio: icons.ui.paperclip,
  adaptadores: icons.ui.link,
  equipamentos: icons.ui.hardDrive,
  cabos: icons.ui.cable,
  outros: icons.ui.moreHorizontal,
}

const sectionColors: Record<StockSection, { bg: string; text: string; icon: string }> = {
  maquinas: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-500' },
  perifericos: { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', icon: 'text-violet-500' },
  material_escritorio: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400', icon: 'text-orange-500' },
  adaptadores: { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400', icon: 'text-teal-500' },
  equipamentos: { bg: 'bg-pink-50 dark:bg-pink-950/30', text: 'text-pink-700 dark:text-pink-400', icon: 'text-pink-500' },
  cabos: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-500' },
  outros: { bg: 'bg-slate-50 dark:bg-slate-800/30', text: 'text-slate-700 dark:text-slate-400', icon: 'text-slate-500' },
}

export function StockDashboard() {
  const navigate = useNavigate()
  const { items, loading, reload } = useStock()
  const { kits } = useKits()
  const { movements } = useMovements()
  const { cycles: inventoryCycles } = useInventory()
  const [search, setSearch] = useState('')

  const activeItems = items.filter((i) => i.status === 'ativo')
  const inRepair = items.filter((i) => i.status === 'em_conserto')
  const incompleteKits = kits.filter((k) => k.status === 'incompleto')

  const sectionCounts = useMemo(() => {
    const counts: Partial<Record<StockSection, number>> = {}
    for (const item of activeItems) {
      counts[item.section] = (counts[item.section] || 0) + 1
    }
    return counts
  }, [activeItems])

  const recentMovements = useMemo(
    () => [...movements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3),
    [movements],
  )

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.subcategory.toLowerCase().includes(q) ||
        i.serialNumber.toLowerCase().includes(q) ||
        i.room.toLowerCase().includes(q),
    )
  }, [items, search])

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Estoque</h2>
          <p className="mt-1 text-sm text-fg-muted">{activeItems.length} itens ativos em {Object.keys(sectionCounts).length} categorias</p>
        </div>

        <div className="relative">
          <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Buscar em todo o estoque..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
            >
              <icons.ui.close size={16} />
            </button>
          )}
        </div>

        {search.trim() ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-fg-muted">{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}</p>
            {searchResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">Nenhum item encontrado.</p>
            ) : (
              searchResults.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/stock/items/${item.id}`)}
                  className="flex w-full items-center justify-between rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-fg">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-fg-muted">{item.subcategory}{item.room && ` · ${item.room}`}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate('/stock/items?section=all')}
                className="rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
              >
                <icons.ui.package size={20} className="text-emerald-500" />
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">{activeItems.length}</p>
                <p className="text-[11px] font-medium text-fg-muted">Total Ativos</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/stock/items?section=repair')}
                className={`rounded-xl p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive ${
                  inRepair.length > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-card'
                }`}
              >
                <icons.nav.parts size={20} className={inRepair.length > 0 ? 'text-amber-500' : 'text-fg-muted'} />
                <p className={`mt-2 text-2xl font-bold tracking-tight ${inRepair.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-fg'}`}>
                  {inRepair.length}
                </p>
                <p className={`text-[11px] font-medium ${inRepair.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-fg-muted'}`}>
                  Em Conserto
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/stock/kits')}
                className={`rounded-xl p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive ${
                  incompleteKits.length > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card'
                }`}
              >
                <icons.ui.check size={20} className={incompleteKits.length > 0 ? 'text-red-500' : 'text-fg-muted'} />
                <p className={`mt-2 text-2xl font-bold tracking-tight ${incompleteKits.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-fg'}`}>
                  {incompleteKits.length}
                </p>
                <p className={`text-[11px] font-medium ${incompleteKits.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-muted'}`}>
                  Kits Incompletos
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/stock/movements')}
                className="rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
              >
                <icons.ui.clock size={20} className="text-fg-muted" />
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">{movements.length}</p>
                <p className="text-[11px] font-medium text-fg-muted">Movimentações</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/stock/inventory')}
                className="rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
              >
                <icons.nav.checklists size={20} className="text-fg-muted" />
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">{inventoryCycles.length}</p>
                <p className="text-[11px] font-medium text-fg-muted">Inventários</p>
              </button>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">Categorias</h3>
                <button
                  type="button"
                  onClick={() => navigate('/stock/items')}
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
                >
                  Ver tudo
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['maquinas', 'perifericos', 'material_escritorio', 'adaptadores', 'equipamentos', 'cabos', 'outros'] as StockSection[]).map((section) => {
                  const count = sectionCounts[section] || 0
                  const Icon = sectionIcons[section]
                  const color = sectionColors[section]
                  const label = section === 'material_escritorio' ? 'Escritório' : section.charAt(0).toUpperCase() + section.slice(1)

                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => navigate(`/stock/items?section=${section}`)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-all duration-200 btn-interactive ${color.bg}`}
                    >
                      <Icon size={20} className={color.icon} />
                      <span className={`text-xs font-medium ${color.text}`}>{label}</span>
                      <span className={`text-lg font-bold tracking-tight ${color.text}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {recentMovements.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">Atividade Recente</h3>
                  <button
                    type="button"
                    onClick={() => navigate('/stock/movements')}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    Ver todas
                  </button>
                </div>
                <MovementTimeline movements={recentMovements} />
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  )
}
