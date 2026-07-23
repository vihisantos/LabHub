import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { useMovements } from '../hooks/useMovements'
import { useInventory } from '../hooks/useInventory'
import { useStockMaintenance } from '../hooks/useStockMaintenance'
import { StatusBadge } from '../components/StatusBadge'
import { MovementTimeline } from '../components/MovementTimeline'
import { ChartCard, DonutChart, BarChart } from '../../../lib/charts'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { getOverdueLoans } from '../utils/overdue'
import type { StockSection } from '../types'

const donutColors: Record<StockSection, string> = {
  maquinas: '#3b82f6',
  perifericos: '#8b5cf6',
  material_escritorio: '#f97316',
  adaptadores: '#14b8a6',
  equipamentos: '#ec4899',
  cabos: '#a855f7',
  outros: '#64748b',
}

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
  const { upcoming: maintUpcoming, overdue: maintOverdue } = useStockMaintenance()

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

  const allStatuses = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      counts[item.status] = (counts[item.status] || 0) + 1
    }
    return counts
  }, [items])

  const sectionDonutData = useMemo(() => {
    const labels: Record<StockSection, string> = {
      maquinas: 'Máquinas',
      perifericos: 'Periféricos',
      material_escritorio: 'Escritório',
      adaptadores: 'Adaptadores',
      equipamentos: 'Equipamentos',
      cabos: 'Cabos',
      outros: 'Outros',
    }
    return (Object.keys(sectionCounts) as StockSection[]).map((s) => ({
      name: labels[s] || s,
      value: sectionCounts[s] || 0,
      color: donutColors[s],
    }))
  }, [sectionCounts])

  const statusBarData = useMemo(() => {
    const statusColors: Record<string, string> = {
      ativo: '#10b981',
      em_conserto: '#f59e0b',
      emprestado: '#8b5cf6',
      descartado: '#ef4444',
    }
    const statusLabels: Record<string, string> = {
      ativo: 'Ativo',
      em_conserto: 'Em Conserto',
      emprestado: 'Emprestado',
      descartado: 'Descartado',
    }
    return (Object.keys(allStatuses) as string[]).map((s) => ({
      label: statusLabels[s] || s,
      value: allStatuses[s],
      color: statusColors[s] || '#64748b',
    }))
  }, [allStatuses])

  const movementTrends = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short' })
      months.push({ key, label, count: 0 })
    }
    for (const m of movements) {
      const d = new Date(m.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const found = months.find((mth) => mth.key === key)
      if (found) found.count++
    }
    return months
  }, [movements])



  const overdueLoans = useMemo(() => getOverdueLoans(movements), [movements])
  const overdueCount = overdueLoans.length

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
      <div className="relative space-y-6">
        {/* ── Wallpaper blobs animados ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="wallpaper-blob"
            style={{
              width: '500px', height: '500px',
              top: '-10%', right: '-15%',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12), transparent 70%)',
              animation: 'blob-float-slow 8s ease-in-out infinite',
            }}
          />
          <div
            className="wallpaper-blob"
            style={{
              width: '400px', height: '400px',
              bottom: '-5%', left: '-10%',
              background: 'radial-gradient(circle, rgba(5, 150, 105, 0.10), transparent 70%)',
              animation: 'blob-float-slow-2 10s ease-in-out infinite',
            }}
          />
        </div>

        <div className="relative z-10">
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
                className={`rounded-xl p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive ${
                  overdueCount > 0 ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-card'
                }`}
              >
                <icons.ui.clock size={20} className={overdueCount > 0 ? 'text-rose-500' : 'text-fg-muted'} />
                <p className={`mt-2 text-2xl font-bold tracking-tight ${overdueCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-fg'}`}>
                  {overdueCount}
                </p>
                <p className={`text-[11px] font-medium ${overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-fg-muted'}`}>
                  Empréstimos Atrasados
                </p>
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

              <button
                type="button"
                onClick={() => navigate('/stock/qr-scan')}
                className="rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
              >
                <icons.ui.scanBarcode size={20} className="text-fg-muted" />
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">Scan</p>
                <p className="text-[11px] font-medium text-fg-muted">Escanear QR</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/stock/maintenance')}
                className={`rounded-xl p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive ${
                  maintOverdue.length > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card'
                }`}
              >
                <icons.nav.maintenance size={20} className={maintOverdue.length > 0 ? 'text-red-500' : 'text-fg-muted'} />
                <p className={`mt-2 text-2xl font-bold tracking-tight ${maintOverdue.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-fg'}`}>
                  {maintOverdue.length + maintUpcoming.length}
                </p>
                <p className={`text-[11px] font-medium ${maintOverdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-muted'}`}>
                  {maintOverdue.length > 0 ? `${maintOverdue.length} atrasada${maintOverdue.length > 1 ? 's' : ''}` : 'Manutenções'}
                </p>
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
                      className={`card-gradient-bg-stock relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-all duration-200 btn-interactive ${color.bg}`}
                    >
                      <Icon size={20} className={color.icon} />
                      <span className={`text-xs font-medium ${color.text}`}>{label}</span>
                      <span className={`text-lg font-bold tracking-tight ${color.text}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-fg">Gráficos</h3>
              <div className="grid grid-cols-2 gap-4">
                <ChartCard title="Por Seção" subtitle="Itens ativos por categoria">
                  {sectionDonutData.length > 0 ? (
                    <DonutChart
                      data={sectionDonutData}
                      size={180}
                      centralLabel={activeItems.length.toString()}
                      centralSubLabel="ativos"
                    />
                  ) : (
                    <div className="flex h-[180px] items-center justify-center text-xs text-fg-muted">Sem dados</div>
                  )}
                </ChartCard>

                <ChartCard title="Por Status" subtitle="Distribuição geral dos itens">
                  {statusBarData.length > 0 ? (
                    <BarChart
                      data={statusBarData}
                      layout="vertical"
                      height={180}
                    />
                  ) : (
                    <div className="flex h-[180px] items-center justify-center text-xs text-fg-muted">Sem dados</div>
                  )}
                </ChartCard>
              </div>

              <ChartCard title="Movimentações (6 meses)" subtitle="Total de movimentações por mês">
                {movementTrends.some((m) => m.count > 0) ? (
                  <BarChart
                    data={movementTrends.map((m) => ({ label: m.label, value: m.count, color: '#10b981' }))}
                    layout="vertical"
                    height={180}
                  />
                ) : (
                  <div className="flex h-[180px] items-center justify-center text-xs text-fg-muted">Nenhuma movimentação nos últimos 6 meses</div>
                )}
                {movementTrends.length > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-fg-muted">
                    <span>Total: {movementTrends.reduce((s, m) => s + m.count, 0)} mov.</span>
                    <span>·</span>
                    <span>Média: {Math.round(movementTrends.reduce((s, m) => s + m.count, 0) / Math.max(movementTrends.filter((m) => m.count > 0).length, 1))}/mês</span>
                  </div>
                )}
              </ChartCard>
            </div>

            {overdueLoans.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    <icons.ui.alert size={16} className="inline-block -mt-0.5 mr-1" />
                    Empréstimos Atrasados
                  </h3>
                  <button
                    type="button"
                    onClick={() => navigate('/stock/movements')}
                    className="text-xs font-medium text-rose-600 dark:text-rose-400"
                  >
                    Ver todos
                  </button>
                </div>
                <div className="space-y-2">
                  {overdueLoans.map((mov) => {
                    const item = items.find((i) => i.id === mov.itemId)
                    return (
                      <div
                        key={mov.id}
                        className="rounded-xl border border-rose-200/60 bg-rose-50/50 p-3.5 dark:border-rose-900/30 dark:bg-rose-950/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">{item?.name || mov.itemId}</p>
                            <p className="mt-0.5 text-xs text-rose-600/80 dark:text-rose-400/80">
                              Retirado por {mov.borrowedBy || mov.borrowerContact || '-'}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-rose-200/60 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                            {new Date(mov.expectedReturnAt!).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        {mov.description && (
                          <p className="mt-1 text-[11px] leading-relaxed text-rose-600/70 dark:text-rose-400/70">{mov.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
