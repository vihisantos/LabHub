import { icons } from '../../../lib/icons'
import { ResponsiveGrid } from '../../../responsive'
import { CoordinatorMetricCard } from './CoordinatorMetricCard'
import { CoordinatorPanel } from './CoordinatorPanel'

/**
 * C3 (PR B #236) — Painel global de SLA da Central.
 *
 * Exclusivamente apresentacional: recebe os valores já calculados por props e
 * um callback opcional de navegação. A lógica de SLA continua na fonte única
 * `src/apps/chamados/services/sla.ts`; o componente NÃO duplica regra, não
 * chama `analyzeSla`/`analyzeSlaByWorkspace`/`getSlaState`/`slaConfigService`
 * nem acessa Supabase/API/cache/hooks.
 *
 * Preserva os testids e o comportamento de deep links da visão geral existente:
 * - Dentro do SLA  → abre Chamados sem query (`onOpenChamados()`);
 * - Próximos       → `?sla=near`;
 * - Vencidos       → `?sla=overdue`;
 * - Taxa           → bloco de leitura (sem callback, como no shell).
 *
 * Sem callback, nenhum card inventa navegação. `rateLabel` é exibido como
 * recebido (ex.: "—" quando não há taxa) — nunca convertido em "0%".
 */

interface CoordinatorSlaPanelProps {
  within: number
  near: number
  overdue: number
  /** Rótulo de taxa pronto (ex.: "100%" ou "—"). Não converte ausência em "0%". */
  rateLabel: string
  /** Navegação para o app de chamados; ausente → cards estáticos. */
  onOpenChamados?: (query?: string) => void
}

export function CoordinatorSlaPanel({
  within,
  near,
  overdue,
  rateLabel,
  onOpenChamados,
}: CoordinatorSlaPanelProps) {
  return (
    <CoordinatorPanel
      title="SLA no escopo"
      description="Consolidado das suas unidades, sempre via services/sla.ts e reagindo ao cache com sinal passivo (sem novo ciclo ou poll)."
      data-testid="overview-sla"
    >
      <ResponsiveGrid minWidth={180} maxWidth={260} gap={10}>
        <CoordinatorMetricCard
          label="Dentro do SLA"
          value={within}
          tone="emerald"
          icon={<icons.ui.circleCheck size={16} />}
          data-testid="overview-sla-within"
          onClick={onOpenChamados ? () => onOpenChamados() : undefined}
        />
        <CoordinatorMetricCard
          label="Próximos do vencimento"
          value={near}
          tone="amber"
          icon={<icons.ui.clock size={16} />}
          data-testid="overview-sla-near"
          onClick={onOpenChamados ? () => onOpenChamados('?sla=near') : undefined}
        />
        <CoordinatorMetricCard
          label="Vencidos"
          value={overdue}
          tone="red"
          icon={<icons.ui.alertCircle size={16} />}
          data-testid="overview-sla-overdue"
          onClick={onOpenChamados ? () => onOpenChamados('?sla=overdue') : undefined}
        />
        <CoordinatorMetricCard
          label="Taxa de SLA"
          value={rateLabel}
          icon={<icons.ui.fileBarChart size={16} />}
          data-testid="overview-sla-rate"
        />
      </ResponsiveGrid>
    </CoordinatorPanel>
  )
}