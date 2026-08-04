import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssets } from '../hooks/useAssets'
import { PCCard } from '../components/PCCard'
import { FilterBar, type AssetFilters } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { SkeletonCard } from '../components/Skeletons'
import { icons } from '../../../lib/icons'

export function PCList() {
  const navigate = useNavigate(); const { assets, loading } = useAssets(); const [search, setSearch] = useState(''); const [filters, setFilters] = useState<AssetFilters>({ location: 'all', type: 'all', status: 'all' })
  const locations = useMemo(() => [...new Set(assets.map((asset) => asset.location).filter(Boolean))].sort(), [assets])
  const filtered = useMemo(() => assets.filter((asset) => {
    if (filters.location !== 'all' && asset.location !== filters.location) return false
    if (filters.type !== 'all' && asset.equipmentType !== filters.type) return false
    if (filters.status !== 'all' && asset.status !== filters.status) return false
    const query = search.trim().toLowerCase()
    return !query || [asset.assetTag, asset.equipmentType, asset.manufacturer, asset.model, asset.serialNumber, asset.location, asset.network.hostname, asset.network.ip].join(' ').toLowerCase().includes(query)
  }), [assets, filters, search])
  const expiring = useMemo(() => {
    const soon = 30
    const now = Date.now()
    return assets.filter((asset) => {
      const dates: (string | null)[] = [asset.warranty?.expiresAt, ...(asset.licenses || []).map((license) => license.expiresAt)]
      return dates.some((date) => date && new Date(date).getTime() - now <= soon * 86400000)
    })
  }, [assets])
  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
  return <div>
    <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Ativos</h2><p className="text-xs text-fg-muted">Inventário de equipamentos de TI</p></div><button type="button" onClick={() => navigate('/pc-care/assets/new')} className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-3 py-2 text-sm font-medium text-white">+ Novo ativo</button></div>
    {expiring.length > 0 && (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-900/30 bg-amber-50 p-3 dark:bg-amber-950/20">
        <icons.ui.alertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Garantia ou licença vencendo</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">{expiring.length} {expiring.length === 1 ? 'ativo tem' : 'ativos têm'} vencimento em até 30 dias</p>
        </div>
        <button type="button" onClick={() => navigate(`/pc-care/assets/${expiring[0].id}`)} className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300">Ver</button>
      </div>
    )}
    <div className="relative mb-3"><icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar patrimônio, tipo, fabricante, modelo, série, local ou IP..." className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-violet-500" /></div>
    <FilterBar locations={locations} onFilterChange={setFilters} />
    {filtered.length === 0 ? <EmptyState icon={icons.nav.pcs} title="Nenhum ativo encontrado" description="Cadastre um ativo ou ajuste os filtros." /> : <><p className="mb-3 text-xs text-fg-muted">{filtered.length} de {assets.length} ativo{assets.length !== 1 ? 's' : ''}</p><div className="flex flex-col gap-3">{filtered.map((asset) => <PCCard key={asset.id} asset={asset} highlighted={asset.assetTag.toLowerCase() === search.toLowerCase()} />)}</div></>}
  </div>
}
