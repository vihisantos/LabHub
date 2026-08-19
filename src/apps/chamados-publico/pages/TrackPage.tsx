import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { Stars } from '../../chamados/components/Stars'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import type { Ticket } from '../../chamados/types'
import type { TicketEvent } from '../../chamados/types'

export function TrackPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [eventsByTicket, setEventsByTicket] = useState<Record<string, TicketEvent[]>>({})
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [commentByTicket, setCommentByTicket] = useState<Record<string, string>>({})
  const [commentError, setCommentError] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = name.trim()
    if (!q) return
    setLoading(true)
    setError('')
    try {
      const found = await ticketService.getByReporter(q)
      setTickets(
        found.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    } catch {
      // Sem conexão: usa o cache local.
      const local = ticketService
        .getAll()
        .filter((t) => t.reportedBy.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setTickets(local)
    } finally {
      setLoading(false)
    }
  }

  function handleAvaliar(ticket: Ticket) {
    navigate(`/chamados-publico/feedback/${ticket.id}`)
  }

  async function toggleHistory(ticket: Ticket) {
    if (expandedId === ticket.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(ticket.id)
    if (!eventsByTicket[ticket.id]) {
      setLoadingEvents(true)
      try {
        const evs = await ticketService.getEvents(ticket.id)
        setEventsByTicket((prev) => ({ ...prev, [ticket.id]: evs }))
      } catch {
        setEventsByTicket((prev) => ({ ...prev, [ticket.id]: [] }))
      } finally {
        setLoadingEvents(false)
      }
    }
  }

  async function handleComment(ticket: Ticket) {
    const text = (commentByTicket[ticket.id] || '').trim()
    if (!text) return
    setCommentError('')
    try {
      const ev = await ticketService.addEvent(ticket.id, {
        content: text,
        author: ticket.reportedBy || 'Solicitante',
      })
      setEventsByTicket((prev) => ({ ...prev, [ticket.id]: [ev, ...(prev[ticket.id] || [])] }))
      setCommentByTicket((prev) => ({ ...prev, [ticket.id]: '' }))
    } catch {
      setCommentError('Não foi possível enviar o comentário. Tente novamente.')
    }
  }

  const resolvedCount = tickets?.filter((t) => t.status === 'resolvido' || t.status === 'fechado').length ?? 0
  const ratedCount = tickets?.filter((t) => t.feedbackRating).length ?? 0

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Acompanhar Chamado</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Busque pelo nome que usou ao abrir o chamado e veja o status
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '...' : 'Buscar'}
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {tickets && tickets.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">Nenhum chamado encontrado com esse nome</p>
          <p className="mt-1 text-xs text-fg-dim">Confira se digitou o nome exatamente como no cadastro</p>
        </div>
      )}

      {tickets && tickets.length > 0 && (
        <>
          <div className="mt-5 flex items-center gap-2 text-[11px] text-fg-muted">
            <span>{tickets.length} chamado{tickets.length !== 1 ? 's' : ''}</span>
            <span className="text-fg-dim">·</span>
            <span>{resolvedCount} resolvido{resolvedCount !== 1 ? 's' : ''}</span>
            <span className="text-fg-dim">·</span>
            <span>{ratedCount} avaliado{ratedCount !== 1 ? 's' : ''}</span>
          </div>

          <div className="mt-3 space-y-2">
            {tickets.map((ticket) => {
              const resolved = ticket.status === 'resolvido' || ticket.status === 'fechado'
              return (
                <div key={ticket.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-emerald-500">#{ticket.ticketNumber || '?'}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-fg-muted">
                    <p>{ticket.roomName}</p>
                    <p>{ticket.problemCategory}{ticket.assetName ? ` · ${ticket.assetName}` : ''}</p>
                    <p className="text-[10px] text-fg-dim">
                      {(() => {
                        const d = new Date(ticket.createdAt)
                        return isNaN(d.getTime()) ? '' : `Aberto em ${d.toLocaleDateString('pt-BR')}`
                      })()}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    {resolved && ticket.feedbackRating ? (
                      <div className="flex items-center gap-2">
                        <Stars value={ticket.feedbackRating} disabled size={16} />
                        <span className="text-[11px] text-fg-dim">Avaliado</span>
                      </div>
                    ) : resolved ? (
                      <button
                        type="button"
                        onClick={() => handleAvaliar(ticket)}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-400"
                      >
                        <icons.ui.star size={14} />
                        Avaliar atendimento
                      </button>
                    ) : (
                      <span className="text-[11px] text-fg-dim">A avaliação libera após a resolução</span>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleHistory(ticket)}
                      className="flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-emerald-500"
                    >
                      <icons.ui.clock size={13} />
                      {expandedId === ticket.id ? 'Fechar histórico' : 'Ver histórico'}
                    </button>
                  </div>

                  {expandedId === ticket.id && (
                    <div className="mt-3 rounded-xl border border-line bg-surface p-3">
                      {loadingEvents && !eventsByTicket[ticket.id] ? (
                        <p className="text-[11px] text-fg-dim">Carregando histórico...</p>
                      ) : eventsByTicket[ticket.id] && eventsByTicket[ticket.id].length > 0 ? (
                        <div className="space-y-2.5">
                          {eventsByTicket[ticket.id].map((ev) => (
                            <div key={ev.id} className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0 text-fg-dim">
                                <icons.ui.user size={12} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className="text-[10px] font-semibold text-fg">{ev.author}</p>
                                  <span className="shrink-0 text-[10px] text-fg-dim">
                                    {new Date(ev.createdAt).toLocaleString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                {ev.content && <p className="mt-0.5 text-[11px] text-fg-muted">{ev.content}</p>}
                                {ev.photos.length > 0 && (
                                  <div className="mt-1.5 flex gap-1.5">
                                    {ev.photos.map((url, i) => (
                                      <img
                                        key={`${ev.id}-${i}`}
                                        src={url}
                                        alt={`Foto ${i + 1}`}
                                        className="h-14 w-14 rounded-lg border border-line object-cover"
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-fg-dim">Nenhum registro ainda</p>
                      )}

                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={commentByTicket[ticket.id] || ''}
                          onChange={(e) =>
                            setCommentByTicket((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleComment(ticket)
                          }}
                          placeholder="Escrever um comentário..."
                          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleComment(ticket)}
                          disabled={!(commentByTicket[ticket.id] || '').trim()}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Comentar
                        </button>
                      </div>
                      {commentError && <p className="mt-1.5 text-[10px] text-red-500">{commentError}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
