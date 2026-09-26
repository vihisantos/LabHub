import type { TicketPriority, TicketStatus } from '../../../apps/chamados/types'
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from '../../../apps/chamados/types'
import type { TicketStatsSummary } from '../../../apps/chamados/services/ticketStats'
import { BarChart } from '../../../lib/charts/BarChart'
import { ChartCard } from '../../../lib/charts/ChartCard'
import { DonutChart } from '../../../lib/charts/DonutChart'
import { icons } from '../../../lib/icons'
import { ResponsiveGrid } from '../../../responsive'
import { CoordinatorMetricCard } from './CoordinatorMetricCard'
import { CoordinatorPanel } from './CoordinatorPanel'

/**
 * C2 (PR B #236) — Painel apresentacional de chamados da Central.
 *
 * Puramente presentacional: recebe `stats` (TicketStatsSummary do C1) e um
 * callback opcional de navegação por props. Não faz fetch, não lê cache,
 * workspace ou autorização, não calcula KPI nem SLA, e NÃO chama
 * `analyzeTickets` internamente — o shell (C5) produz os dados.
 *
 * KPIs: reutilizam `CoordinatorMetricCard` e preservam os testids da visão
 * geral existente (`overview-kpi-*`), acrescentando `overview-kpi-total`
 * (não havia identificador para o total operacional). Com callback presente,
 * os cards com deep link existente do TicketList viram botão; sem callback,
 * tudo permanece bloco de leitura.
 *
 * Distribuições: `BarChart` (status) e `DonutChart` (prioridade) dentro de
 * `ChartCard`, com dados puros de `stats.byStatus`/`stats.byPriority`.
 * Quando não há chamados operacionais, renderiza mensagem honesta — nenhum
 * dado fabricado.
 */

const STATUS_ORDER: TicketStatus[] = ['aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado']
const PRIORITY_ORDER: TicketPriority[] = ['baixa', 'normal', 'alta', 'urgente']

const STATUS_CHART_COLORS: Record<TicketStatus, string> = {
  aberto: '#f59e0b',
  a_caminho: '#f97316',
  em_atendimento: '#3b82f6',
  resolvido: '#10b981',
  fechado: '#64748b',
}

const PRIORITY_CHART_COLORS: Record<TicketPriority, string> = {
  baixa: '#64748b',
  normal: '#3b82f6',
  alta: '#f59e0b',
  urgente: '#ef4444',
}

interface CoordinatorTicketsPanelProps {
  stats: TicketStatsSummary
  /** Navegação para o app de chamados quando houver escopo de UMA unidade. */
  onOpenChamados?: (query?: string) => void
  /**
   * KPIs de SLA do escopo (C5) — quando fornecidos, o painel acrescenta os
   * cards `overview-kpi-within/near/overdue` com os deep links do shell
   * (`?sla=near` / `?sla=overdue`). Opcionais e apresentacionais: o cálculo
   * continua na camada superior (`sla.ts`); nada de regra de SLA aqui.
   */
  sla?: { within: number; near: number; overdue: number }
}

export function CoordinatorTicketsPanel({
  stats,
  onOpenChamados,
  sla,
}: CoordinatorTicketsPanelProps) {
  const statusData = STATUS_ORDER.map((status) => ({
    label: TICKET_STATUS_LABELS[status],
    value: stats.byStatus[status],
    color: STATUS_CHART_COLORS[status],
  }))

  const priorityData = PRIORITY_ORDER.map((priority) => ({
    name: TICKET_PRIORITY_LABELS[priority],
    value: stats.byPriority[priority],
    color: PRIORITY_CHART_COLORS[priority],
  }))

  const hasTickets = stats.total > 0

  return (
    <>
      <CoordinatorPanel
        title="KPIs principais"
        description="Chamados das suas unidades, lendo o mesmo cache autorizado do app de chamados. Com uma única unidade no escopo, os cards abrem os filtros existentes do TicketList."
        className="mb-6"
        data-testid="overview-kpis"
      >
        <ResponsiveGrid minWidth={220} maxWidth={360} gap={12}>
          <CoordinatorMetricCard
            label="Chamados operacionais"
            value={stats.total}
            tone="neutral"
            icon={<icons.ui.fileBarChart size={16} />}
            data-testid="overview-kpi-total"
            onClick={onOpenChamados ? () => onOpenChamados() : undefined}
          />
          <CoordinatorMetricCard
            label="Chamados abertos"
            value={stats.abertos}
            tone="amber"
            icon={<icons.ui.inbox size={16} />}
            data-testid="overview-kpi-aberto"
            onClick={onOpenChamados ? () => onOpenChamados('?status=aberto') : undefined}
          />
          <CoordinatorMetricCard
            label="Em atendimento"
            value={stats.emAtendimento}
            tone="violet"
            icon={<icons.ui.userCheck size={16} />}
            data-testid="overview-kpi-em_atendimento"
            onClick={onOpenChamados ? () => onOpenChamados('?status=em_andamento') : undefined}
          />
          <CoordinatorMetricCard
            label="Sem responsável"
            value={stats.semResponsavel}
            icon={<icons.ui.user size={16} />}
            data-testid="overview-kpi-unassigned"
            onClick={onOpenChamados ? () => onOpenChamados('?unassigned=1') : undefined}
          />
          <CoordinatorMetricCard
            label="Alta prioridade"
            value={stats.altaPrioridade}
            tone="amber"
            icon={<icons.ui.circleAlert size={16} />}
            data-testid="overview-kpi-alta_prioridade"
          />
          <CoordinatorMetricCard
            label="Urgentes"
            value={stats.urgentes}
            tone="red"
            icon={<icons.ui.alertCircle size={16} />}
            data-testid="overview-kpi-urgentes"
          />
          {sla && (
            <>
              <CoordinatorMetricCard
                label="Dentro do SLA"
                value={sla.within}
                tone="emerald"
                icon={<icons.ui.circleCheck size={16} />}
                data-testid="overview-kpi-within"
                onClick={onOpenChamados ? () => onOpenChamados() : undefined}
              />
              <CoordinatorMetricCard
                label="Próximos do SLA"
                value={sla.near}
                tone="amber"
                icon={<icons.ui.clock size={16} />}
                data-testid="overview-kpi-near"
                onClick={onOpenChamados ? () => onOpenChamados('?sla=near') : undefined}
              />
              <CoordinatorMetricCard
                label="Vencidos"
                value={sla.overdue}
                tone="red"
                icon={<icons.ui.alertCircle size={16} />}
                data-testid="overview-kpi-overdue"
                onClick={onOpenChamados ? () => onOpenChamados('?sla=overdue') : undefined}
              />
            </>
          )}
        </ResponsiveGrid>
      </CoordinatorPanel>

      <ResponsiveGrid minWidth={400} gap={12}>
        <div data-testid="tickets-dist-status">
          <ChartCard
            title="Chamados por status"
            subtitle="Distribuição dos chamados operacionais do escopo por estado."
          >
            {hasTickets ? (
              <BarChart data={statusData} layout="horizontal" height={200} />
            ) : (
              <p className="text-[10px] leading-relaxed text-fg-muted">
                Sem chamados operacionais no escopo — a distribuição por status aparece quando houver
                dados.
              </p>
            )}
          </ChartCard>
        </div>

        <div data-testid="tickets-dist-priority">
          <ChartCard
            title="Chamados por prioridade"
            subtitle="Distribuição dos chamados operacionais do escopo por prioridade."
          >
            {hasTickets ? (
              <DonutChart data={priorityData} centralSubLabel="chamados" />
            ) : (
              <p className="text-[10px] leading-relaxed text-fg-muted">
                Sem chamados operacionais no escopo — a distribuição por prioridade aparece quando
                houver dados.
              </p>
            )}
          </ChartCard>
        </div>
      </ResponsiveGrid>
    </>
  )
}