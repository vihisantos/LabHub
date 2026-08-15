import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_NOTE_PRESETS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import { getPriority, getSlaInfo } from '../services/sla'
import { Stars } from '../components/Stars'
import { icons } from '../../../lib/icons'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useAuth } from '../../../core/auth/useAuth'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

const STATUS_FLOW: TicketStatus[] = ['aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado']

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function slaConfigFor(ticket: Ticket) {
  return slaConfigService.getHoursForTickets()[ticket.workspace_id ?? ''] ?? null
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { tickets, update, updateStatus } = useTickets()
  const { isFullAccess } = useAppAccess()
  const { user } = useAuth()
  const canWrite = isFullAccess('chamados')
  const ticket = tickets.find((t) => t.id === id)
  const [noteInput, setNoteInput] = useState('')

  const history = useMemo(() => {
    if (!ticket) return []
    return tickets
      .filter((t) => t.assetId === ticket.assetId && t.assetSource === ticket.assetSource && t.id !== ticket.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
  }, [ticket, tickets])

  if (!ticket) {
    return (
      <div className="flex flex-col items-center py-12">
        <icons.ui.alertCircle size={40} className="text-fg-muted" />
        <p className="mt-3 text-sm text-fg-muted">Chamado não encontrado</p>
      </div>
    )
  }

  const currentIndex = STATUS_FLOW.indexOf(ticket.status)
  const nextStatus = currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null

  const slaInfo = getSlaInfo(ticket.createdAt, ticket.priority, ticket.status, slaConfigFor(ticket))

  const claimedByMe = ticket.assignedTo === user?.name
  const claimedByOther =
    !!ticket.assignedTo && !claimedByMe && (ticket.status === 'a_caminho' || ticket.status === 'em_atendimento')

  function handleAdvanceStatus() {
    if (!nextStatus || !ticket) return
    if (nextStatus === 'a_caminho') {
      update(ticket.id, { status: nextStatus, assignedTo: user?.name })
    } else if (nextStatus === 'fechado') {
      update(ticket.id, {
        status: nextStatus,
        archived: true,
        closedAt: new Date().toISOString(),
        closedBy: user?.name,
      })
    } else {
      updateStatus(ticket.id, nextStatus)
    }
  }

  function handleReopen() {
    if (!ticket) return
    update(ticket.id, {
      status: 'aberto',
      archived: false,
      closedAt: null,
      closedBy: '',
    })
  }

  function handlePriority(next: TicketPriority) {
    if (!ticket || next === getPriority(ticket.priority)) return
    update(ticket.id, { priority: next })
  }

  return (
    <div className="space-y-4">
      {slaInfo?.state === 'overdue' && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <icons.ui.alertTriangle size={16} className="shrink-0 text-red-500" />
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {slaInfo.label} — prazo foi {formatDate(slaInfo.deadline.toISOString())}
          </p>
        </div>
      )}

      {ticket.status === 'a_caminho' && ticket.assignedTo && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <icons.ui.mapPin size={16} className="shrink-0 text-orange-500" />
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
            {claimedByMe ? 'Você está a caminho do local' : `${ticket.assignedTo} está a caminho`}
          </p>
        </div>
      )}

      {ticket.statusNote && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <icons.ui.messageSquareWarning size={16} className="mt-0.5 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{ticket.statusNote}</p>
            <p className="mt-0.5 text-[10px] text-fg-dim">Mensagem visível para o professor</p>
          </div>
        </div>
      )}

      {canWrite &&
        (ticket.status === 'aberto' || ticket.status === 'a_caminho' || ticket.status === 'em_atendimento') && (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted">Mensagem para o professor</h3>
            <div className="flex flex-wrap gap-1.5">
              {TICKET_STATUS_NOTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => update(ticket.id, { statusNote: preset })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    ticket.statusNote === preset
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-line bg-surface text-fg-muted hover:border-blue-500 hover:text-blue-500'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Mensagem personalizada..."
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (noteInput.trim()) {
                    update(ticket.id, { statusNote: noteInput.trim() })
                    setNoteInput('')
                  }
                }}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-400"
              >
                Definir
              </button>
            </div>
            {ticket.statusNote && (
              <button
                type="button"
                onClick={() => update(ticket.id, { statusNote: '' })}
                className="mt-2 text-[11px] font-medium text-fg-dim transition-colors hover:text-red-500"
              >
                Remover mensagem
              </button>
            )}
          </div>
        )}

      {ticket.status === 'fechado' && (
        <div className="rounded-xl border border-line bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <icons.ui.folder size={16} className="shrink-0 text-fg-muted" />
            <p className="text-xs font-medium text-fg-muted">
              Chamado arquivado{ticket.closedAt ? ` em ${formatDate(ticket.closedAt)}` : ''}
              {ticket.closedBy ? ` por ${ticket.closedBy}` : ''}
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={handleReopen}
              className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-500"
            >
              Reabrir chamado
            </button>
          )}
        </div>
      )}

      <div className={`rounded-xl bg-card p-5 shadow-[var(--shadow-card)] ${slaInfo?.state === 'overdue' ? 'ring-1 ring-red-500/50' : ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-2xl font-bold text-amber-500">#{ticket.ticketNumber}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
        </div>

        <div className="mb-4 space-y-3 rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg-muted">Prioridade</span>
            {canWrite ? (
              <div className="flex gap-1">
                {TICKET_PRIORITIES.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => handlePriority(priority)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      getPriority(ticket.priority) === priority
                        ? TICKET_PRIORITY_COLORS[priority]
                        : 'text-fg-dim hover:text-fg'
                    }`}
                  >
                    {TICKET_PRIORITY_LABELS[priority]}
                  </button>
                ))}
              </div>
            ) : (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TICKET_PRIORITY_COLORS[getPriority(ticket.priority)]}`}>
                {TICKET_PRIORITY_LABELS[getPriority(ticket.priority)]}
              </span>
            )}
          </div>
          {slaInfo && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted">Prazo de atendimento</span>
              <span className="text-xs font-semibold text-fg">{formatDate(slaInfo.deadline.toISOString())}</span>
            </div>
          )}
          {slaInfo && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted">SLA</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  slaInfo.state === 'overdue'
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : slaInfo.state === 'near'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {slaInfo.state === 'overdue' ? `Em atraso · ${slaInfo.label}` : slaInfo.label}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-start gap-3">
            <icons.ui.home size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Sala</p>
              <p className="text-sm font-medium text-fg">{ticket.roomName}</p>
            </div>
          </div>
          {ticket.assetName && (
            <div className="flex items-start gap-3">
              <icons.nav.pcs size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Equipamento</p>
                <p className="text-sm font-medium text-fg">{ticket.assetName}</p>
                {ticket.assetPatrimony && (
                  <p className="text-[11px] text-fg-dim">Patrimônio: {ticket.assetPatrimony}</p>
                )}
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <icons.ui.alertCircle size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Problema</p>
              <p className="text-sm font-medium text-fg">{ticket.problemCategory}</p>
              {ticket.problemArea && (
                <p className="text-[11px] text-fg-dim">
                  {ticket.problemArea === 'administrativa' ? 'Área Administrativa' : 'Área Acadêmica'}
                </p>
              )}
            </div>
          </div>
          {ticket.problemDescription && (
            <div className="flex items-start gap-3">
              <icons.ui.fileBarChart size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Descrição</p>
                <p className="text-sm text-fg">{ticket.problemDescription}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <icons.ui.user size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Reportado por</p>
              <p className="text-sm font-medium text-fg">{ticket.reportedBy}</p>
              {ticket.reportedByEmail && (
                <p className="text-[11px] text-fg-dim">{ticket.reportedByEmail}</p>
              )}
            </div>
          </div>
          {ticket.assignedTo && (
            <div className="flex items-start gap-3">
              <icons.ui.userCheck size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Responsável</p>
                <p className="text-sm font-medium text-fg">{ticket.assignedTo}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {ticket.feedbackRating && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Feedback do professor</h3>
          <div className="flex items-center justify-between">
            <Stars value={ticket.feedbackRating} disabled size={18} />
            {ticket.feedbackAt && (
              <span className="text-[10px] text-fg-dim">{formatDate(ticket.feedbackAt)}</span>
            )}
          </div>
          {ticket.feedbackComment && (
            <p className="mt-2 text-sm text-fg">{ticket.feedbackComment}</p>
          )}
        </div>
      )}

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Timeline</h3>
        <div className="space-y-3">
          {STATUS_FLOW.map((status, i) => {
            const isPast = i <= currentIndex
            const isCurrent = i === currentIndex
            return (
              <div key={status} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCurrent ? 'bg-amber-500 text-white' : isPast ? 'bg-emerald-500/20 text-emerald-500' : 'bg-input text-fg-muted'
                }`}>
                  {isPast ? <icons.ui.check size={12} /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-medium ${isCurrent ? 'text-fg' : isPast ? 'text-fg-muted' : 'text-fg-dim'}`}>
                    {TICKET_STATUS_LABELS[status]}
                  </p>
                </div>
                {isCurrent && ticket.resolvedAt && status === 'resolvido' && (
                  <span className="text-[10px] text-fg-dim">{formatDate(ticket.resolvedAt)}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canWrite && claimedByOther && (
        <div className="flex items-center gap-2 rounded-xl bg-input/60 px-4 py-3">
          <icons.ui.userCheck size={16} className="shrink-0 text-fg-muted" />
          <p className="text-xs text-fg-muted">{ticket.assignedTo} já está atendendo este chamado</p>
        </div>
      )}

      {canWrite && nextStatus && !claimedByOther && (
        <button
          type="button"
          onClick={handleAdvanceStatus}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          {nextStatus === 'a_caminho' && 'Assumir chamado'}
          {nextStatus === 'em_atendimento' && 'Iniciar Atendimento'}
          {nextStatus === 'resolvido' && 'Marcar como Resolvido'}
          {nextStatus === 'fechado' && 'Fechar Chamado'}
        </button>
      )}

      {history.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Histórico deste equipamento</h3>
          <div className="space-y-2">
            {history.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">#{t.ticketNumber} — {t.problemCategory}</span>
                <span className="text-[10px] text-fg-dim">
                  {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
