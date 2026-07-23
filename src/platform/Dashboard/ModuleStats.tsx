import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pcService } from '../../apps/pcare/services/pcService'
import { stockService } from '../../apps/stock/services/stockService'
import { ticketService } from '../../apps/chamados/services/ticketService'
import { icons } from '../../lib/icons'

interface ModuleStat {
  id: string
  name: string
  icon: React.ReactNode
  color: string
  route: string
  stats: { label: string; value: number | string }[]
}

export function ModuleStats() {
  const navigate = useNavigate()

  const modules = useMemo<ModuleStat[]>(() => {
    const pcs = pcService.getAll()
    const stockItems = stockService.getAll()
    const tickets = ticketService.getAll()

    const openTickets = tickets.filter((t) => t.status === 'aberto' || t.status === 'em_atendimento')
    const resolvedToday = tickets.filter((t) => {
      if (!t.resolvedAt) return false
      const today = new Date().toISOString().slice(0, 10)
      return t.resolvedAt.startsWith(today)
    })

    return [
      {
        id: 'pcare',
        name: 'Inventário',
        icon: <icons.nav.pcs size={20} />,
        color: '#8b5cf6',
        route: '/pc-care',
        stats: [
          { label: 'PCs', value: pcs.length },
          { label: 'Com problemas', value: pcs.filter((p) => p.cleaningStatus === 'pending').length },
        ],
      },
      {
        id: 'chamados',
        name: 'Chamados',
        icon: <icons.ui.alertCircle size={20} />,
        color: '#f59e0b',
        route: '/chamados',
        stats: [
          { label: 'Abertos', value: openTickets.length },
          { label: 'Resolvidos hoje', value: resolvedToday.length },
        ],
      },
      {
        id: 'stock',
        name: 'Estoque',
        icon: <icons.ui.package size={20} />,
        color: '#10b981',
        route: '/stock',
        stats: [
          { label: 'Itens', value: stockItems.length },
          { label: 'Em uso', value: stockItems.filter((i) => i.status === 'emprestado').length },
        ],
      },
    ]
  }, [])

  return (
    <div className="rounded-xl bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-xs font-semibold text-fg-muted">Resumo por Módulo</h3>
      </div>
      <div className="divide-y divide-line">
        {modules.map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => navigate(mod.route)}
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-input"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: mod.color + '15', color: mod.color }}
            >
              {mod.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{mod.name}</p>
              <div className="mt-1 flex gap-3">
                {mod.stats.map((stat) => (
                  <span key={stat.label} className="text-[10px] text-fg-muted">
                    {stat.value} {stat.label}
                  </span>
                ))}
              </div>
            </div>
            <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
          </button>
        ))}
      </div>
    </div>
  )
}
