import type { CoordinatorUnitOverview } from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

interface UnitOverviewProps {
  overview: CoordinatorUnitOverview | null
  loading: boolean
  failed: boolean
  onRetry: () => void
  /**
   * Caminho para o app de chamados existente no contexto da unidade, ou null
   * quando a unidade não está selecionável pelo contexto atual de workspace
   * (ex.: fora do `workspaces` visível). A navegação NÃO duplica o fluxo de
   * chamados — apenas abre o app no workspace da unidade.
   */
  onOpenChamados: (() => void) | null
}

const STATS: Array<{
  key: 'open' | 'in_progress' | 'unassigned' | 'high_priority' | 'urgent'
  label: string
  tone: 'amber' | 'violet' | 'input' | 'red'
}> = [
  { key: 'open', label: 'Abertos', tone: 'amber' },
  { key: 'in_progress', label: 'Em andamento', tone: 'violet' },
  { key: 'unassigned', label: 'Sem responsável', tone: 'input' },
  { key: 'high_priority', label: 'Alta prioridade', tone: 'red' },
  { key: 'urgent', label: 'Urgentes', tone: 'red' },
]

/**
 * Central do coordenador (migration 070): visão agregada READ-ONLY da unidade
 * de chamados. Os números vêm da RPC fail-closed — a UI reage ao erro com
 * honestidade (tentar de novo) e nunca inventa zeros. O botão "Abrir chamados"
 * reaproveita o app de chamados existente no contexto da unidade (WorkspaceGate
 * / contexto de workspace); não há fluxo de chamados duplicado aqui.
 */
export function UnitOverview({
  overview,
  loading,
  failed,
  onRetry,
  onOpenChamados,
}: UnitOverviewProps) {
  const tickets = overview?.tickets
  const activeTotal = tickets ? tickets.open + tickets.in_progress : 0
  const plural = (n: number) => (n === 1 ? '' : 's')

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5" data-testid="coordinator-unit-overview">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Visão da unidade
        </p>
        {onOpenChamados && (
          <button
            type="button"
            onClick={onOpenChamados}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
          >
            <icons.ui.chevronRight size={11} />
            Abrir chamados
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-2 inline-flex items-center gap-2 text-[10px] text-fg-muted">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Carregando chamados da unidade...
        </p>
      ) : failed ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[10px] leading-relaxed text-red-500">
            Não foi possível carregar a visão desta unidade.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {STATS.map((stat) => {
              const value = tickets?.[stat.key] ?? 0
              const tone =
                stat.tone === 'amber'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : stat.tone === 'violet'
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                    : stat.tone === 'input'
                      ? 'bg-input text-fg-dim'
                      : 'bg-red-500/10 text-red-500'
              return (
                <div
                  key={stat.key}
                  className="flex items-center justify-between gap-1 rounded-lg px-2 py-1.5"
                  data-testid={`unit-stat-${stat.key}`}
                >
                  <span className="truncate text-[10px] text-fg-muted">{stat.label}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      tone,
                    )}
                  >
                    {value}
                  </span>
                </div>
              )
            })}
          </div>
          {(overview?.recent.length ?? 0) > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {overview?.recent.slice(0, 3).map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center gap-2 text-[10px] leading-relaxed text-fg-muted"
                >
                  <icons.ui.dot size={11} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {ticket.roomName || 'Chamado'}
                    {ticket.problemCategory ? ` — ${ticket.problemCategory}` : ''}
                  </span>
                  <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 font-semibold text-fg-dim">
                    #{ticket.ticketNumber}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-fg-muted">
            Resumo dos chamados ativos — {activeTotal} no total{plural(activeTotal)}. O
            atendimento completo continua no app de chamados da unidade.
          </p>
        </>
      )}
    </div>
  )
}