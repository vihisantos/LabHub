import { useParams, useNavigate } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS } from '../../chamados/types'

export function TicketSuccess() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const ticket = ticketId ? ticketService.getById(ticketId) : null

  if (!ticket) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">Chamado não encontrado</p>
        <button
          type="button"
          onClick={() => navigate('/chamados-publico')}
          className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-5 pt-16 pb-8">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
        <icons.ui.checkCircle size={40} className="text-emerald-500" />
      </div>

      <h1 className="text-2xl font-bold text-fg">Chamado Aberto!</h1>
      <p className="mt-2 text-sm text-fg-muted">Seu chamado foi registrado com sucesso</p>

      <div className="mt-8 w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-center">
          <span className="text-3xl font-bold text-emerald-500">#{ticket.ticketNumber}</span>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Sala</span>
            <span className="font-medium text-fg">{ticket.roomName}</span>
          </div>
          {ticket.assetName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Equipamento</span>
              <span className="font-medium text-fg">{ticket.assetName}</span>
            </div>
          )}
          {ticket.problemArea && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Área</span>
              <span className="font-medium text-fg">
                {ticket.problemArea === 'administrativa' ? 'Área Administrativa' : 'Área Acadêmica'}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Problema</span>
            <span className="font-medium text-fg">{ticket.problemCategory}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Status</span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {TICKET_STATUS_LABELS[ticket.status]}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico/track')}
        className="mt-3 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-input"
      >
        <icons.ui.circleCheck size={18} className="text-emerald-500" />
        Acompanhar e avaliar depois
      </button>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico')}
        className="mt-8 flex items-center gap-2 rounded-xl bg-card px-6 py-3 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-input"
      >
        <icons.ui.scanBarcode size={18} />
        {ticket.assetName ? 'Escanear outro QR' : 'Abrir outro chamado'}
      </button>
    </div>
  )
}
