import { useEffect, useState } from 'react'
import {
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  type Ticket,
  type TicketPriority,
} from '../../../apps/chamados/types'
import { getPriority, getSlaInfo } from '../../../apps/chamados/services/sla'
import { getWorkspaceAssignees, type WorkspaceAssignee } from '../../../core/permissions/workspaceAssigneesService'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { SheetOrDialog } from '../../../responsive'
import type { ScopeSlaConfigs } from '../coordinatorTickets'
import { assignCoordinatorTicket, unassignCoordinatorTicket } from '../hooks/useCoordinatorTickets'

export interface CoordinatorTicketDrawerProps {
  ticket: Ticket | null
  unitName: string
  slaConfigs: ScopeSlaConfigs
  /** Abre o detail operacional completo (se o workspace estiver disponível). */
  openOperational: (() => void) | null
  onClose: () => void
  /** Chamado após salvar atribuição (para recarregar a lista). */
  onAssigned: (updated: Ticket) => void
}

/**
 * Drawer de detalhe rápido da aba Chamados da Central do Coordenador.
 *
 * Responsabilidade:
 * - Exibir informações essenciais de um chamado sem navegar para outra rota.
 * - Permitir atribuição/reatribuição de responsável com lista filtrada pelo
 *   workspace DO CHAMADO (não do contexto de workspace global).
 * - NÃO reimplementar o fluxo operacional completo (status, comentários, etc.).
 *
 * Segurança:
 * - A lista de técnicos vem de `getWorkspaceAssignees(ticket.workspace_id)`,
 *   que consulta memberships ativas daquele workspace via RLS. Técnico de outro
 *   campus não aparece no seletor.
 * - A atribuição usa `ticketService.patchRemote` (PATCH individual com auth):
 *   o backend valida `ticket.assign`, `_is_assigner` e membership do assignee
 *   (hardening adicionado). A UI filtra por conveniência; a fronteira real é
 *   o servidor.
 */
export function CoordinatorTicketDrawer({
  ticket,
  unitName,
  slaConfigs,
  openOperational,
  onClose,
  onAssigned,
}: CoordinatorTicketDrawerProps) {
  const [assignees, setAssignees] = useState<WorkspaceAssignee[]>([])
  const [assigneesLoading, setAssigneesLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState(false)

  // Busca técnicos do workspace DO chamado ao abrir.
  useEffect(() => {
    if (!ticket?.workspace_id) {
      setAssignees([])
      return
    }
    setAssigneesLoading(true)
    setAssignError(null)
    setAssignSuccess(false)
    // Pre-preenche com o responsável atual.
    setSelectedUserId(ticket.assignedToUserId ?? '')
    setSelectedName(ticket.assignedTo ?? '')

    getWorkspaceAssignees(ticket.workspace_id)
      .then((list) => {
        setAssignees(list)
      })
      .catch(() => {
        setAssignees([])
      })
      .finally(() => {
        setAssigneesLoading(false)
      })
  }, [ticket?.id, ticket?.workspace_id, ticket?.assignedToUserId, ticket?.assignedTo])

  const handleAssign = async () => {
    if (!ticket) return
    setAssigning(true)
    setAssignError(null)
    setAssignSuccess(false)
    try {
      let updated: Ticket
      if (!selectedUserId) {
        updated = await unassignCoordinatorTicket(ticket.id)
      } else {
        updated = await assignCoordinatorTicket(ticket.id, selectedName, selectedUserId)
      }
      setAssignSuccess(true)
      onAssigned(updated)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível salvar a atribuição. Tente novamente.'
      setAssignError(msg)
    } finally {
      setAssigning(false)
    }
  }

  const hasChanged =
    (selectedUserId || '') !== (ticket?.assignedToUserId || '') ||
    (selectedName || '') !== (ticket?.assignedTo || '')

  const priority = ticket ? getPriority(ticket.priority) : ('normal' as TicketPriority)
  const slaInfo = ticket
    ? getSlaInfo(ticket.createdAt, ticket.priority, ticket.status, slaConfigs[ticket.workspace_id ?? ''])
    : null
  const statusLabel = ticket ? (TICKET_STATUS_LABELS[ticket.status] ?? ticket.status) : ''

  return (
    <SheetOrDialog
      open={ticket !== null}
      onClose={onClose}
      title={ticket ? `#${ticket.ticketNumber} — ${ticket.assetName || ticket.roomName}` : ''}
      className="max-w-lg"
    >
      {ticket && (
        <div className="flex flex-col gap-4 px-5 pb-6">
          {/* Badges de status / prioridade / SLA */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TICKET_STATUS_COLORS[ticket.status])}
            >
              {statusLabel}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                TICKET_PRIORITY_COLORS[priority],
              )}
            >
              {TICKET_PRIORITY_LABELS[priority]}
            </span>
            {slaInfo && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  {
                    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400': slaInfo.state === 'ok',
                    'bg-amber-500/15 text-amber-600 dark:text-amber-400': slaInfo.state === 'near',
                    'bg-red-500/15 text-red-600 dark:text-red-400': slaInfo.state === 'overdue',
                  },
                )}
              >
                {slaInfo.label}
              </span>
            )}
          </div>

          {/* Informações principais */}
          <dl className="grid grid-cols-1 gap-y-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[10px] text-fg-muted">Solicitante</dt>
              <dd className="mt-0.5 truncate font-medium text-fg">{ticket.reportedBy || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-fg-muted">Unidade</dt>
              <dd className="mt-0.5 truncate font-medium text-fg">{unitName}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-fg-muted">Local / Patrimônio</dt>
              <dd className="mt-0.5 truncate font-medium text-fg">
                {[ticket.roomName, ticket.assetName, ticket.assetPatrimony].filter(Boolean).join(' · ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-fg-muted">Categoria</dt>
              <dd className="mt-0.5 truncate font-medium text-fg">{ticket.problemCategory || '—'}</dd>
            </div>
            {ticket.createdAt && (
              <div>
                <dt className="text-[10px] text-fg-muted">Aberto em</dt>
                <dd className="mt-0.5 font-medium text-fg">
                  {new Date(ticket.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
            )}
            {ticket.resolvedAt && (
              <div>
                <dt className="text-[10px] text-fg-muted">Resolvido em</dt>
                <dd className="mt-0.5 font-medium text-fg">
                  {new Date(ticket.resolvedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            )}
            {ticket.updatedAt && (
              <div>
                <dt className="text-[10px] text-fg-muted">Última atualização</dt>
                <dd className="mt-0.5 font-medium text-fg">
                  {new Date(ticket.updatedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
            )}
          </dl>

          {/* Descrição */}
          {ticket.problemDescription && (
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-[10px] text-fg-muted">Descrição</p>
              <p className="mt-1 text-xs leading-relaxed text-fg">{ticket.problemDescription}</p>
            </div>
          )}

          {/* Atribuição */}
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              Responsável
            </p>

            {assigneesLoading ? (
              <p className="mt-2 text-xs text-fg-muted">Carregando técnicos da unidade…</p>
            ) : (
              <>
                <select
                  data-testid="coordinator-ticket-assignee-select"
                  value={selectedUserId}
                  onChange={(e) => {
                    const userId = e.target.value
                    const assignee = assignees.find((a) => a.userId === userId)
                    setSelectedUserId(userId)
                    setSelectedName(assignee?.name ?? '')
                    setAssignSuccess(false)
                    setAssignError(null)
                  }}
                  disabled={assigning}
                  className="mt-2 w-full rounded-xl border border-line bg-input px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60"
                  aria-label="Selecionar responsável"
                >
                  <option value="">Sem responsável</option>
                  {assignees.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.name}
                    </option>
                  ))}
                </select>

                {assignees.length === 0 && !assigneesLoading && (
                  <p className="mt-1 text-[10px] text-fg-muted">
                    Nenhum técnico ativo encontrado nesta unidade.
                  </p>
                )}

                {assignError && (
                  <p className="mt-2 text-[11px] text-red-500" role="alert">
                    {assignError}
                  </p>
                )}
                {assignSuccess && (
                  <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400" role="status">
                    Responsável atualizado com sucesso.
                  </p>
                )}

                <button
                  type="button"
                  data-testid="coordinator-ticket-assign-btn"
                  onClick={() => void handleAssign()}
                  disabled={assigning || !hasChanged}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-default disabled:opacity-50"
                >
                  {assigning ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <icons.ui.userCheck size={12} />
                      Salvar atribuição
                    </>
                  )}
                </button>

                <p className="mt-2 text-[10px] leading-relaxed text-fg-muted">
                  Somente técnicos ativos desta unidade são exibidos. O servidor valida a atribuição.
                </p>
              </>
            )}
          </div>

          {/* Ação: abrir no módulo operacional */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-medium text-fg transition-colors hover:bg-input"
            >
              Fechar
            </button>
            {openOperational && (
              <button
                type="button"
                data-testid="coordinator-ticket-open-operational"
                onClick={() => {
                  onClose()
                  openOperational()
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-input px-4 py-2 text-xs font-semibold text-fg transition-colors hover:bg-line"
              >
                <icons.ui.link size={12} />
                Abrir no módulo de Chamados
              </button>
            )}
          </div>
        </div>
      )}
    </SheetOrDialog>
  )
}
