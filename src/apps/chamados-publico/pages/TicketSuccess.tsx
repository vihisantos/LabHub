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
          className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white"
        >
          Escanear novamente
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
          <span className="text-3xl font-bold text-amber-500">#{ticket.ticketNumber}</span>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Sala</span>
            <span className="font-medium text-fg">{ticket.roomName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Equipamento</span>
            <span className="font-medium text-fg">{ticket.assetName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Problema</span>
            <span className="font-medium text-fg">{ticket.problemCategory}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Status</span>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              {TICKET_STATUS_LABELS[ticket.status]}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico')}
        className="mt-8 flex items-center gap-2 rounded-xl bg-card px-6 py-3 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-input"
      >
        <icons.ui.scanBarcode size={18} />
        Escanear outro QR
      </button>
    </div>
  )
}
