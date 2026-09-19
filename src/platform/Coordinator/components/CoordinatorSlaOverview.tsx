import type { SlaWorkspaceSummary } from '../../../apps/chamados/services/sla'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

interface CoordinatorSlaOverviewProps {
  sla: SlaWorkspaceSummary | null
  /**
   * Navegação contextual para o app de chamados da unidade (Fase 2.1:
   * `setWorkspace(target, { persist: false })` + `/chamados`), ou null quando a
   * unidade não está selecionável. Apenas "Dentro do SLA" navega — os filtros
   * de SLA (vencidos/próximos) não existem no Chamados e não são inventados
   * aqui (gap documentado).
   */
  onOpenChamados: (() => void) | null
}

/**
 * Central do coordenador (Fase 2.2.1): SLA da unidade em KPIs compactos. Os
 * números vêm de `analyzeSlaByWorkspace` (services/sla.ts — única fonte de
 * verdade, mesma semântica do app Chamados) sobre o cache já autorizado.
 * Apresentação somente — nenhuma ação operacional de atendimento aqui.
 */
export function CoordinatorSlaOverview({
  sla,
  onOpenChamados,
}: CoordinatorSlaOverviewProps) {
  const within = sla?.within ?? 0
  const near = sla?.near ?? 0
  const overdue = sla?.overdue ?? 0
  const total = sla?.total ?? 0
  const rateLabel = total > 0 ? `${sla?.rate ?? 0}%` : '—'

  const stats = [
    { key: 'within', label: 'Dentro do SLA', value: within, clickable: true, tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    { key: 'near', label: 'Próximos do vencimento', value: near, clickable: false, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    { key: 'overdue', label: 'Vencidos', value: overdue, clickable: false, tone: 'bg-red-500/10 text-red-500' },
    { key: 'rate', label: 'Taxa de SLA', value: rateLabel, clickable: false, tone: 'bg-input text-fg-dim' },
  ]

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5" data-testid="coordinator-sla-overview">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        SLA da unidade
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {stats.map((stat) => {
          const content = (
            <>
              <span className="truncate text-[10px] text-fg-muted">{stat.label}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  stat.tone,
                )}
              >
                {stat.value}
              </span>
            </>
          )
          return stat.clickable && onOpenChamados ? (
            <button
              key={stat.key}
              type="button"
              onClick={onOpenChamados}
              className="flex w-full items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-input"
              data-testid={`sla-stat-${stat.key}`}
            >
              {content}
            </button>
          ) : (
            <div
              key={stat.key}
              className="flex items-center justify-between gap-1 rounded-lg px-2 py-1.5"
              data-testid={`sla-stat-${stat.key}`}
            >
              {content}
            </div>
          )
        })}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] leading-relaxed text-fg-muted">
        <icons.ui.clock size={11} className="shrink-0" />
        Mesmo ciclo de atualização do app Chamados — {total} chamado{total === 1 ? '' : 's'} com SLA aplicável.
      </p>
    </div>
  )
}