import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { publicTicketService, toTicket } from '../../chamados/services/publicTicketService'
import { Stars } from '../../chamados/components/Stars'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS } from '../../chamados/types'
import type { Ticket } from '../../chamados/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FeedbackPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()

  // Tracking token: credencial do professor (acesso ao próprio chamado).
  // Lido da URL e do localStorage; removido da URL imediatamente.
  const [trackingToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const stored = urlToken || (() => {
      try {
        return localStorage.getItem(`chamado_token_${ticketId ?? ''}`)
      } catch {
        return null
      }
    })()
    if (urlToken && ticketId) {
      try {
        localStorage.setItem(`chamado_token_${ticketId}`, urlToken)
      } catch {}
    }
    if (urlToken) {
      window.history.replaceState({}, '', `/chamados-publico/feedback/${ticketId ?? ''}`)
    }
    return stored || ''
  })

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ticketId || ticketId === 'undefined') return
    const load = async () => {
      try {
        if (trackingToken) {
          const pub = await publicTicketService.getByToken(trackingToken)
          const t = toTicket(pub)
          setTicket(t)
          if (t.feedbackRating) setRating(t.feedbackRating)
        } else {
          // Sem tracking token não há acesso anônimo remoto ao chamado;
          // resta apenas o cache local, quando existir.
          const local = ticketId ? ticketService.getByIdNoFilter(ticketId) : null
          if (local) {
            setTicket(local)
            if (local.feedbackRating) setRating(local.feedbackRating)
          } else {
            setNotFound(true)
          }
        }
      } catch {
        const local = ticketId ? ticketService.getByIdNoFilter(ticketId) : null
        if (local) {
          setTicket(local)
          if (local.feedbackRating) setRating(local.feedbackRating)
        } else {
          setNotFound(true)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [ticketId, trackingToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticket || rating < 1 || !trackingToken) return
    setSubmitting(true)
    setError('')
    try {
      const pub = await publicTicketService.submitFeedback(trackingToken, rating, comment.trim())
      setTicket(toTicket(pub))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a avaliação. Tente novamente.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-5">
        <p className="text-sm text-fg-muted">Carregando...</p>
      </div>
    )
  }

  if (notFound || !ticket) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5">
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

  const resolved = ticket.status === 'resolvido' || ticket.status === 'fechado'

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Avaliar Atendimento</h1>
        <p className="mt-1 text-sm text-fg-muted">Chamado #{ticket.ticketNumber || '?'}</p>
      </div>

      {done ? (
        <div className="flex flex-col items-center pt-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <icons.ui.checkCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-fg">Obrigado pelo feedback!</h2>
          <p className="mt-1 max-w-xs text-center text-sm text-fg-muted">
            Sua avaliação ajuda a melhorar o atendimento da equipe de TI.
          </p>
          <button
            type="button"
            onClick={() => navigate('/chamados-publico')}
            className="mt-6 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-medium text-white"
          >
            Voltar ao início
          </button>
        </div>
      ) : !resolved ? (
        <div className="flex flex-col items-center pt-8 text-center">
          <icons.ui.clock size={40} className="text-fg-muted" />
          <p className="mt-4 text-sm text-fg-muted">
            Este chamado ainda está <span className="font-medium text-fg">{TICKET_STATUS_LABELS[ticket.status]}</span>.
          </p>
          <p className="mt-1 text-xs text-fg-dim">A avaliação fica disponível após a resolução do atendimento.</p>
        </div>
      ) : ticket.feedbackRating ? (
        <div className="mx-auto max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-center text-xs font-medium text-fg-muted">Avaliação enviada</p>
          <div className="mb-3 flex justify-center">
            <Stars value={ticket.feedbackRating} disabled />
          </div>
          {ticket.feedbackComment && (
            <p className="text-center text-sm text-fg">{ticket.feedbackComment}</p>
          )}
          {ticket.feedbackAt && (
            <p className="mt-3 text-center text-[11px] text-fg-dim">{formatDate(ticket.feedbackAt)}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-5">
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 space-y-3 border-b border-line pb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Sala</span>
                <span className="font-medium text-fg">{ticket.roomName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Problema</span>
                <span className="font-medium text-fg">{ticket.problemCategory}</span>
              </div>
            </div>

            <p className="mb-2 text-xs font-semibold text-fg-muted">Como foi o atendimento?</p>
            <div className="flex justify-center py-1">
              <Stars value={rating} onChange={setRating} />
            </div>
            <p className="mt-1 text-center text-[11px] text-fg-dim">
              {rating === 0 ? 'Toque nas estrelas para avaliar' : rating <= 2 ? 'Péssimo / Ruim' : rating === 3 ? 'Regular' : rating === 4 ? 'Bom' : 'Excelente'}
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Comentário (opcional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte como foi a experiência..."
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <icons.ui.alertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={rating < 1 || submitting}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </form>
      )}
    </div>
  )
}
