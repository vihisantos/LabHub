import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import type { Ticket, TicketStatus } from '../../chamados/types'

const STATUS_MESSAGES: Record<TicketStatus, string> = {
  aberto: 'Aguardando técnico',
  a_caminho: 'Técnico a caminho',
  em_atendimento: 'Atendendo agora',
  resolvido: 'Chamado resolvido',
  fechado: 'Chamado concluído',
}

const POLL_INTERVAL_MS = 15000

function statusMessage(ticket: Ticket): string {
  return (ticket.statusNote || STATUS_MESSAGES[ticket.status] || '').trim()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function showStatusNotification(ticket: Ticket): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!document.hidden) return
    const message = statusMessage(ticket)
    const notification = new Notification(`Chamado #${ticket.ticketNumber}`, {
      body: `Status: ${TICKET_STATUS_LABELS[ticket.status]}${message ? ` — ${message}` : ''}`,
      tag: `chamado-${ticket.id}-status`,
      icon: '/icon-192.png',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Notificação nativa indisponível
  }
}

export function TicketSuccess() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(() =>
    ticketId ? (ticketService.getById(ticketId) ?? null) : null,
  )
  const [offline, setOffline] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const lastStatusRef = useRef(ticket?.status)

  useEffect(() => {
    if (!ticketId) return
    const id = ticketId
    let alive = true
    async function poll() {
      try {
        const fresh = await ticketService.getByIdRemote(id)
        if (!alive) return
        setTicket(fresh)
        setOffline(false)
        setNotFound(false)
        if (lastStatusRef.current && lastStatusRef.current !== fresh.status) {
          showStatusNotification(fresh)
        }
        lastStatusRef.current = fresh.status
      } catch (err) {
        if (!alive) return
        setOffline(true)
        if (err instanceof Error && err.message.toLowerCase().includes('não encontrado')) {
          setNotFound(true)
        }
      }
    }
    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [ticketId])

  if (!ticket || notFound) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">
          {notFound ? 'Chamado não encontrado' : 'Carregando seu chamado...'}
        </p>
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

  const statusMsg = statusMessage(ticket)
  const concluded = ticket.status === 'resolvido' || ticket.status === 'fechado'

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
        </div>
      </div>

      <div className="mt-3 w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-fg-muted">Status ao vivo</h2>
          <span className="flex items-center gap-1.5 text-[10px] text-fg-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                offline ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'
              }`}
            />
            {offline ? 'Sem conexão — tenta de novo automaticamente' : 'Atualiza automaticamente'}
          </span>
        </div>

        <div className="mt-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}
          >
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
          {statusMsg && <p className="mt-2 text-sm font-medium text-fg">{statusMsg}</p>}
        </div>

        <p className="mt-3 border-t border-line pt-3 text-[10px] text-fg-dim">
          {concluded
            ? 'Seu chamado foi concluído. Obrigado!'
            : 'Pode fechar esta página — o andamento fica registrado. Volte quando quiser para ver o status.'}
          {ticket.updatedAt && (
            <span className="ml-1 text-fg-dim">Atualizado às {formatTime(ticket.updatedAt)}.</span>
          )}
        </p>
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
