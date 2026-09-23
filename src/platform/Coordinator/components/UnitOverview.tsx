import type { CoordinatorUnitOverview } from '../../../core/permissions/coordinatorService'
import type { SlaWorkspaceSummary } from '../../../apps/chamados/services/sla'
import { CoordinatorSlaOverview } from './CoordinatorSlaOverview'
import { ErrorState } from './ErrorState'
import { SkeletonRow, SkeletonStatGrid } from './Skeletons'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

interface UnitOverviewProps {
  overview: CoordinatorUnitOverview | null
  loading: boolean
  failed: boolean
  onRetry: () => void
  /**
   * Resumo operacional de SLA desta unidade (services/sla.ts — única fonte de
   * verdade), ou null quando a unidade não tem chamados com SLA aplicável.
   */
  sla: SlaWorkspaceSummary | null
  /**
   * Caminho para o app de chamados existente no contexto da unidade, ou null
   * quando a unidade não está selecionável pelo contexto atual de workspace
   * (ex.: fora do `workspaces` visível). Recebe opcionalmente o sufixo de query
   * (`?status=aberto`, `?unassigned=1`, ...) que INICIALIZA os filtros
   * existentes do TicketList. A navegação NÃO duplica o fluxo de chamados —
   * apenas abre o app no workspace da unidade.
   */
  onOpenChamados: ((query?: string) => void) | null
  /**
   * Abre o detail EXISTENTE (`/chamados/tickets/:id`) de um chamado recente
   * desta unidade, com a troca de workspace antes quando a unidade difere da
   * ativa. A leitura continua sendo do app de chamados — a Central não busca
   * o ticket.
   */
  onOpenTicket: ((ticketId: string) => void) | null
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

// Fase 2.1: destino contextual de cada card — query params que apenas
// INICIALIZAM os filtros existentes do TicketList (valores reais do código).
const CONTEXTUAL_DEST: Record<'open' | 'in_progress' | 'unassigned' | 'high_priority' | 'urgent', string> = {
  open: '?status=aberto',
  in_progress: '?status=em_andamento',
  unassigned: '?unassigned=1',
  high_priority: '?priority=alta',
  urgent: '?priority=urgente',
}

/**
 * Central do coordenador (migration 070): visão agregada READ-ONLY da unidade
 * de chamados. Os números vêm da RPC fail-closed — a UI reage ao erro com
 * honestidade (tentar de novo) e nunca inventa zeros. Os cards e chamados
 * recentes são navegação contextual (Fase 2.1): trocam o workspace via
 * `setWorkspace` e abrem o app/detail existentes com o filtro inicial — não há
 * fluxo de chamados duplicado aqui.
 */
export function UnitOverview({
  overview,
  loading,
  failed,
  onRetry,
  sla,
  onOpenChamados,
  onOpenTicket,
}: UnitOverviewProps) {
  const tickets = overview?.tickets
  const activeTotal = tickets ? tickets.open + tickets.in_progress : 0
  const plural = (n: number) => (n === 1 ? '' : 's')

  return (
    <div
      className="border-y border-line bg-surface"
      data-testid="coordinator-unit-overview"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Visão da unidade
        </p>
        {onOpenChamados && (
          <button
            type="button"
            onClick={() => onOpenChamados()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            <icons.ui.chevronRight size={11} />
            Abrir chamados
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-3 px-4 pb-3" role="status" aria-live="polite">
          <SkeletonStatGrid />
          <div className="mt-3 space-y-2">
            <SkeletonRow />
          </div>
          <p className="mt-3 text-[10px] text-fg-muted">Carregando chamados da unidade...</p>
        </div>
      ) : failed ? (
        <ErrorState
          className="mx-4 mt-2.5 mb-3"
          message="Não foi possível carregar a visão desta unidade."
          onRetry={onRetry}
        />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-1.5 px-4 sm:grid-cols-3">
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
              const content = (
                <>
                  <span className="truncate text-[11px] text-fg-muted">{stat.label}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      tone,
                    )}
                  >
                    {value}
                  </span>
                </>
              )
              return onOpenChamados ? (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => onOpenChamados(CONTEXTUAL_DEST[stat.key])}
                  className="flex w-full items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-left transition-all duration-150 hover:bg-input active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  data-testid={`unit-stat-${stat.key}`}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={stat.key}
                  className="flex items-center justify-between gap-1 rounded-lg px-2 py-1.5"
                  data-testid={`unit-stat-${stat.key}`}
                >
                  {content}
                </div>
              )
            })}
          </div>
          <CoordinatorSlaOverview
            sla={sla}
            onOpenChamados={onOpenChamados ? () => onOpenChamados() : null}
          />
          {(overview?.recent.length ?? 0) > 0 && (
            <ul className="flex flex-col gap-1.5 px-4 pb-1 pt-2">
              {overview?.recent.slice(0, 3).map((ticket) => {
                const content = (
                  <>
                    <icons.ui.dot size={11} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {ticket.roomName || 'Chamado'}
                      {ticket.problemCategory ? ` — ${ticket.problemCategory}` : ''}
                    </span>
                    <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 font-semibold text-fg-dim tabular-nums">
                      #{ticket.ticketNumber}
                    </span>
                  </>
                )
                return (
                  <li key={ticket.id} className="text-[10px] leading-relaxed text-fg-muted">
                    {onOpenTicket ? (
                      <button
                        type="button"
                        onClick={() => onOpenTicket(ticket.id)}
                        className="flex w-full items-center gap-2 text-left transition-colors hover:text-fg"
                        data-testid={`unit-recent-${ticket.id}`}
                      >
                        {content}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2">{content}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="px-4 pb-3 pt-2 text-[10px] leading-relaxed text-fg-muted">
            Resumo dos chamados ativos — {activeTotal} no total{plural(activeTotal)}. O
            atendimento completo continua no app de chamados da unidade.
          </p>
        </>
      )}
    </div>
  )
}