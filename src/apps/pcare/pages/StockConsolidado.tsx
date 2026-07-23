import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { partUsageService } from '../services/partUsageService'
import { icons } from '../../../lib/icons'

const categoryLabels: Record<string, string> = {
  fan: 'Cooler',
  ssd: 'SSD',
  ram: 'RAM',
  keyboard: 'Teclado',
  mouse: 'Mouse',
  cable: 'Cabo',
  power_supply: 'Fonte',
  monitor: 'Monitor',
  other: 'Outros',
}

export function StockConsolidado() {
  const navigate = useNavigate()
  const { pcs } = usePCs()
  const { parts } = useParts()
  const [selectedLab, setSelectedLab] = useState<string | null>(null)

  const labs = useMemo(() => {
    const set = new Set(pcs.map((p) => p.labName))
    return Array.from(set).sort()
  }, [pcs])

  const pcIdsByLab = useMemo(() => {
    const map = new Map<string, Set<string>>()
    pcs.forEach((p) => {
      if (!map.has(p.labName)) map.set(p.labName, new Set())
      map.get(p.labName)!.add(p.id)
    })
    return map
  }, [pcs])

  const filteredParts = useMemo(() => {
    if (!selectedLab) return parts
    const labPcIds = pcIdsByLab.get(selectedLab)
    if (!labPcIds?.size) return []
    const usage = partUsageService.getAll()
    const partIds = new Set(usage.filter((u) => labPcIds.has(u.pcId)).map((u) => u.partId))
    return parts.filter((p) => partIds.has(p.id))
  }, [parts, selectedLab, pcIdsByLab])

  const stats = useMemo(() => {
    const list = selectedLab ? filteredParts : parts
    const totalItems = list.reduce((s, p) => s + p.quantity, 0)
    const lowStock = list.filter((p) => p.quantity <= p.minQuantity)
    const categories = new Set(list.map((p) => p.category))
    return { totalParts: list.length, totalItems, lowStock: lowStock.length, categories: categories.size }
  }, [parts, filteredParts, selectedLab])

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    const list = selectedLab ? filteredParts : parts
    list.forEach((p) => {
      if (!map.has(p.category)) map.set(p.category, { name: categoryLabels[p.category] || p.category, total: 0, count: 0 })
      const entry = map.get(p.category)!
      entry.total += p.quantity
      entry.count += 1
    })
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [parts, filteredParts, selectedLab])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Consolidado de Estoque</h2>
        <button
          type="button"
          onClick={() => navigate('/pc-care/parts')}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          Ver Peças
        </button>
      </div>

      {/* Lab filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedLab(null)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            !selectedLab ? 'bg-violet-600 text-white shadow-sm' : 'bg-input text-fg-muted hover:text-fg'
          }`}
        >
          Todas
        </button>
        {labs.map((lab) => (
          <button
            key={lab}
            type="button"
            onClick={() => setSelectedLab(lab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              selectedLab === lab ? 'bg-violet-600 text-white shadow-sm' : 'bg-input text-fg-muted hover:text-fg'
            }`}
          >
            {lab}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox label="Peças" value={stats.totalParts} icon={icons.nav.parts} />
        <StatBox label="Itens em estoque" value={stats.totalItems} icon={icons.ui.package} />
        <StatBox label="Categorias" value={stats.categories} icon={icons.ui.filter} />
        <StatBox
          label="Estoque baixo"
          value={stats.lowStock}
          icon={icons.ui.alertTriangle}
          alert={stats.lowStock > 0}
        />
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl border border-line bg-card/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {selectedLab ? `${selectedLab} — ` : ''}Por Categoria
        </h3>
        <div className="space-y-3">
          {byCategory.map(([cat, data]) => {
            const max = Math.max(...byCategory.map(([, d]) => d.count), 1)
            return (
              <div key={cat}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-fg font-medium">{data.name}</span>
                  <span className="text-fg-muted">{data.count} peça{data.count !== 1 ? 's' : ''} · {data.total} uni.</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-input">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all"
                    style={{ width: `${(data.count / max) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
          {byCategory.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-dim">Nenhuma peça encontrada</p>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {filteredParts.filter((p) => p.quantity <= p.minQuantity).length > 0 && (
        <div className="rounded-xl border border-red-900/30 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
            <icons.ui.alertTriangle size={14} />
            Estoque Baixo
          </h3>
          <div className="flex flex-col gap-2">
            {filteredParts.filter((p) => p.quantity <= p.minQuantity).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/50 dark:bg-black/20 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-fg">{p.name}</p>
                  <p className="text-xs text-fg-muted">{categoryLabels[p.category] || p.category}</p>
                </div>
                <span className="shrink-0 rounded-full bg-red-100 dark:bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                  {p.quantity} / {p.minQuantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Part usage summary per lab */}
      {!selectedLab && labs.length > 0 && (
        <div className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Uso por Laboratório</h3>
          <div className="flex flex-col gap-2">
            {labs.map((lab) => {
              const labPcIds = pcIdsByLab.get(lab)
              const usage = partUsageService.getAll().filter((u) => labPcIds?.has(u.pcId))
              const uniqueParts = new Set(usage.map((u) => u.partId)).size
              const totalUsed = usage.reduce((s, u) => s + u.quantity, 0)
              return (
                <button
                  key={lab}
                  type="button"
                  onClick={() => setSelectedLab(lab)}
                  className="flex items-center justify-between rounded-lg bg-input/50 px-3 py-2.5 transition-all hover:bg-input"
                >
                  <span className="text-sm font-medium text-fg">{lab}</span>
                  <span className="text-xs text-fg-muted">{uniqueParts} peças · {totalUsed} usos</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, icon: Icon, alert }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; alert?: boolean }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-fg-muted">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
          alert ? 'bg-red-500/10 text-red-500' : 'bg-violet-500/10 text-violet-500'
        }`}>
          <Icon size={14} />
        </div>
      </div>
      <span className={`text-2xl font-bold ${alert ? 'text-red-500' : 'text-fg'}`}>{value}</span>
    </div>
  )
}
