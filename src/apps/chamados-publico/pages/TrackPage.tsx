import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { Stars } from '../../chamados/components/Stars'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import type { Ticket } from '../../chamados/types'

export function TrackPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <span className="text-sm font-bold text-amber-500">#{ticket.ticketNumber}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-fg-muted">
                    <p>{ticket.roomName}</p>
                    <p>{ticket.problemCategory}{ticket.assetName ? ` · ${ticket.assetName}` : ''}</p>
                    <p className="text-[10px] text-fg-dim">
                      Aberto em {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
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
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400"
                      >
                        <icons.ui.star size={14} />
                        Avaliar atendimento
                      </button>
                    ) : (
                      <span className="text-[11px] text-fg-dim">A avaliação libera após a resolução</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
