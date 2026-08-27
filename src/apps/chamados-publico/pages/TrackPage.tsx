import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { publicTicketService, toTicket, type PublicTicket } from '../../chamados/services/publicTicketService'
import { Stars } from '../../chamados/components/Stars'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import type { Ticket } from '../../chamados/types'
import type { TicketEvent } from '../../chamados/types'

function normalizeToken(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '')
}

export function TrackPage() {
  const navigate = useNavigate()

  // Modo anônimo: token do chamado (credencial do professor). Se presente,
  // busca APENAS o chamado associado (escopo limitado, sem expor outros dados).
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      try {
        localStorage.setItem(`chamado_token_track`, urlToken)
      } catch {}
      window.history.replaceState({}, '', window.location.pathname)
    }
    return normalizeToken(urlToken || '')
  })
  const initialToken = useRef(token)
  const [tokenInput, setTokenInput] = useState('')
  const [publicTicket, setPublicTicket] = useState<PublicTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  async function loadByToken(tk: string) {
    setLoading(true)
    setError('')
    try {
      const pub = await publicTicketService.getByToken(tk)
      setPublicTicket(pub)
    } catch (err) {
      setPublicTicket(null)
      setError(err instanceof Error ? err.message : 'Não foi possível localizar o chamado.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialToken.current) {
      loadByToken(initialToken.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tk = normalizeToken(tokenInput)
    if (!tk) return
    setToken(tk)
    try {
      localStorage.setItem(`chamado_token_track`, tk)
    } catch {}
    setExpanded(false)
    setEvents([])
    await loadByToken(tk)
  }

  async function toggleHistory() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (events.length === 0) {
      setLoadingEvents(true)
      try {
        const evs = await publicTicketService.getEvents(token)
        setEvents(evs)
      } catch {
        setEvents([])
      } finally {
        setLoadingEvents(false)
      }
    }
  }

  const pubTicket: Ticket | null = publicTicket ? toTicket(publicTicket) : null
  const pubResolved = pubTicket?.status === 'resolvido' || pubTicket?.status === 'fechado'

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Acompanhar Chamado</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Use o código de acompanhamento para ver o status do seu chamado
        </p>
      </div>

      <form onSubmit={handleTokenSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={tokenInput || initialToken.current}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Código de acompanhamento"
            className="flex-1 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '...' : 'Buscar'}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {loading && !pubTicket && (
        <p className="mt-10 text-center text-sm text-fg-muted">Carregando...</p>
      )}

      {!loading && !pubTicket && !error && (
        <div className="mt-10 flex flex-col items-center text-center">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">
            Digite o código que recebeu ao abrir o chamado para acompanhar o status.
          </p>
        </div>
      )}

      {pubTicket && (
        <>
          <div className="mt-5 flex items-center gap-2 text-[11px] text-fg-muted">
            <span>1 chamado</span>
            <span className="text-fg-dim">·</span>
            <span>{pubResolved ? 'resolvido' : 'em andamento'}</span>
          </div>

          <div className="mt-3 space-y-2">
            <div key={pubTicket.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-500">#{pubTicket.ticketNumber || '?'}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[pubTicket.status]}`}>
                  {TICKET_STATUS_LABELS[pubTicket.status]}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-xs text-fg-muted">
                <p>{pubTicket.roomName}</p>
                <p>{pubTicket.problemCategory}</p>
                <p className="text-[10px] text-fg-dim">
                  {(() => {
                    const d = new Date(pubTicket.createdAt)
                    return isNaN(d.getTime()) ? '' : `Aberto em ${d.toLocaleDateString('pt-BR')}`
                  })()}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                {pubResolved && pubTicket.feedbackRating ? (
                  <div className="flex items-center gap-2">
                    <Stars value={pubTicket.feedbackRating} disabled size={16} />
                    <span className="text-[11px] text-fg-dim">Avaliado</span>
                  </div>
                ) : pubResolved ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/chamados-publico/feedback/${pubTicket.id}?token=${encodeURIComponent(token)}`)
                    }
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
                  onClick={toggleHistory}
                  className="flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-emerald-500"
                >
                  <icons.ui.clock size={13} />
                  {expanded ? 'Fechar histórico' : 'Ver histórico'}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 rounded-xl border border-line bg-surface p-3">
                  {loadingEvents ? (
                    <p className="text-[11px] text-fg-dim">Carregando histórico...</p>
                  ) : events.length > 0 ? (
                    <div className="space-y-2.5">
                      {events.map((ev) => (
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
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
