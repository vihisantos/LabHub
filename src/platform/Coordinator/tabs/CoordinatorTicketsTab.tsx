import { TICKET_STATUS_LABELS, type Ticket } from '../../../apps/chamados/types'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

export interface CoordinatorTicketsTabProps {
  units: CoordinatedUnit[]
  activeKpis: { abertos: number; emAtendimento: number; semResponsavel: number }
  recentTickets: Ticket[]
  unitNameOf: (workspaceId?: string) => string
  openChamadosFor: (unitId: string) => ((query?: string) => void) | null
  openTicketFor: (unitId: string) => ((ticketId: string) => void) | null
}

const FILTER_CHIPS: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Fila de abertos', query: '?status=aberto' },
  { label: 'Sem responsável', query: '?unassigned=1' },
  { label: 'SLA: próximos', query: '?sla=near' },
  { label: 'SLA: vencidos', query: '?sla=overdue' },
]

/**
 * Aba "Chamados" da Central (PR C). Camada de coordenação sobre o APP de
 * chamados existente: resume os KPIs e recentes do escopo (já calculados pelo
 * shell a partir do cache bruto autorizado — #250) e encaminha a operação
 * completa com os FILTROS já existentes do TicketList. Reaproveita
 * `openChamadosFor`/`openTicketFor` do shell — nenhum ciclo de dados novo
 * (sem useTickets/poll/realtime nesta aba) e nenhum painel da Visão Geral é
 * reimplementado aqui.
 */
export function CoordinatorTicketsTab({
  units,
  activeKpis,
  recentTickets,
  unitNameOf,
  openChamadosFor,
  openTicketFor,
}: CoordinatorTicketsTabProps) {
  return (
    <section data-testid="tab-tickets" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-fg">Chamados no seu escopo</h2>
      <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-fg-muted">
        Visão de coordenação sobre os chamados das unidades que você coordena. Os números vêm de
        uma leitura passiva dos dados já carregados; a operação completa continua no app de
        Chamados com os filtros existentes.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="tickets-kpis">
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Abertos</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-abertos">
            {activeKpis.abertos}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Em atendimento</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-atendimento">
            {activeKpis.emAtendimento}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Sem responsável</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-sem-responsavel">
            {activeKpis.semResponsavel}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Chamados recentes no escopo
        </p>
        {recentTickets.length === 0 ? (
          <p className="mt-2 text-[11px] text-fg-muted">
            Nenhum chamado ativo encontrado nas unidades do seu escopo.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5" data-testid="tickets-recent">
            {recentTickets.map((ticket) => {
              const statusLabel = TICKET_STATUS_LABELS[ticket.status] ?? ticket.status
              const unitName = unitNameOf(ticket.workspace_id)
              const open = ticket.workspace_id ? openTicketFor(ticket.workspace_id) : null
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    disabled={!open}
                    data-testid={`tickets-recent-${ticket.id}`}
                    onClick={() => open?.(ticket.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-input disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-fg">
                        #{ticket.ticketNumber} — {ticket.assetName || ticket.roomName}
                      </span>
                      <span className="block truncate text-[10px] text-fg-muted">{unitName}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                      {statusLabel}
                    </span>
                    <icons.ui.chevronRight size={13} className="shrink-0 text-fg-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Operação completa por unidade
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {units.map((unit) => {
            const open = openChamadosFor(unit.unitId)
            return (
              <div
                key={unit.unitId}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-fg">
                  {unit.unitName}
                </span>
                <button
                  type="button"
                  data-testid={`tickets-open-${unit.unitId}`}
                  disabled={!open}
                  onClick={() => open?.()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-600 transition-colors hover:bg-violet-500/25 disabled:cursor-default disabled:opacity-50 dark:text-violet-400"
                >
                  <icons.ui.inbox size={12} />
                  Abrir Chamados
                </button>
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.query}
                    type="button"
                    data-testid={`tickets-open-${unit.unitId}${chip.query}`}
                    disabled={!open}
                    onClick={() => open?.(chip.query)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-fg-muted transition-colors',
                      'hover:border-violet-500/40 hover:text-fg disabled:cursor-default disabled:opacity-50',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}