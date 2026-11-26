import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { publicTicketService } from '../../chamados/services/publicTicketService'
import { icons } from '../../../lib/icons'
import { TicketOpenedAt } from '../components/TicketOpenedAt'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import type { TicketEvent } from '../../chamados/types'
import { forgetRecentTicket, parseTrackingInput, recentTickets, recentToken, rememberRecentTicket, restoreRecentCampus, trackingPath, type RecentTicket } from '../utils/recentTickets'

function isConcluded(row: RecentTicket) {
  return row.status === 'resolvido' || row.status === 'fechado'
}

export function TrackPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(recentTickets)
  const [tokenInput, setTokenInput] = useState('')
  const [result, setResult] = useState<{ row: RecentTicket; token: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const requestId = useRef(0)
  const historyId = useRef(0)

  const loadByToken = useCallback(async (token: string) => {
    const id = ++requestId.current
    ++historyId.current
    setLoading(true)
    setError('')
    setResult(null)
    setExpanded(false)
    setEvents([])
    setLoadingEvents(false)
    setHistoryError(false)
    try {
      const ticket = await publicTicketService.getByToken(token)
      if (requestId.current !== id) return
      rememberRecentTicket(ticket, token)
      const saved = recentTickets()
      const row = saved.find(item => item.id === ticket.id) ?? {
        id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status,
        roomName: ticket.roomName, problemCategory: ticket.problemCategory,
        feedbackRating: ticket.feedbackRating, createdAt: ticket.createdAt,
      }
      setRows(saved)
      setResult({ row, token })
      setTokenInput('')
    } catch (err) {
      if (requestId.current !== id) return
      setError(err instanceof Error ? err.message : 'Não foi possível localizar o chamado.')
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }, [])

  const initialToken = useRef(new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token'))
  useEffect(() => {
    if (initialToken.current) {
      window.history.replaceState({}, '', window.location.pathname)
      void loadByToken(initialToken.current)
    }
    return () => { ++requestId.current; ++historyId.current }
  }, [loadByToken])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    try {
      const token = parseTrackingInput(tokenInput)
      if (token) await loadByToken(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.')
    }
  }

  function open(row: RecentTicket, token: string) {
    if (!token) return
    restoreRecentCampus(row)
    navigate(trackingPath(row.id, token))
  }

  async function toggleHistory() {
    if (!result) return
    if (expanded) {
      setExpanded(false)
      return
    }
    const id = ++historyId.current
    setExpanded(true)
    setLoadingEvents(true)
    setHistoryError(false)
    try {
      const next = await publicTicketService.getEvents(result.token)
      if (historyId.current === id) setEvents(next)
    } catch {
      if (historyId.current === id) setHistoryError(true)
    } finally {
      if (historyId.current === id) setLoadingEvents(false)
    }
  }

  function remove(row: RecentTicket) {
    forgetRecentTicket(row.id)
    setRows(recentTickets())
    if (result?.row.id === row.id) {
      ++historyId.current
      setResult(null)
      setExpanded(false)
      setEvents([])
    }
  }

  function renderCard(row: RecentTicket, token: string, selected = false) {
    const pending = isConcluded(row) && !row.feedbackRating
    return (
      <div key={row.id} className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-emerald-500">{row.ticketNumber ? '#' + row.ticketNumber : 'Chamado salvo'}</span>
          {row.status && <span className={'rounded-full px-2.5 py-1 text-[11px] font-semibold ' + TICKET_STATUS_COLORS[row.status]}>{TICKET_STATUS_LABELS[row.status]}</span>}
        </div>
        <p className="mt-2 text-sm font-semibold text-fg">{row.problemCategory || 'Consultar chamado'}</p>
        {row.roomName && <p className="mt-0.5 text-xs text-fg-muted">{row.roomName}</p>}
        {row.campusName && <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted"><icons.ui.mapPin size={12} />{row.campusName}</p>}
        <TicketOpenedAt createdAt={row.createdAt} />
        {pending && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><icons.ui.star size={13} />Avaliação pendente</p>}
        {isConcluded(row) && !!row.feedbackRating && <p className="mt-2 text-xs text-fg-muted">Avaliado</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => open(row, token)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {pending ? 'Acompanhar e avaliar' : 'Acompanhar chamado'}<icons.ui.chevronRight size={14} />
          </button>
          {selected && <button type="button" onClick={toggleHistory} className="text-xs text-fg-muted hover:text-fg">{expanded ? 'Fechar histórico' : 'Ver histórico'}</button>}
          <button type="button" onClick={() => remove(row)} className="text-[11px] text-fg-muted hover:text-fg" aria-label={'Remover ' + (row.ticketNumber ? '#' + row.ticketNumber : 'chamado salvo') + ' deste navegador'}>Remover</button>
        </div>
        {selected && expanded && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {loadingEvents ? <p className="text-xs text-fg-muted">Carregando histórico...</p>
              : historyError ? <p className="text-xs text-fg-muted">Não foi possível carregar o histórico.</p>
              : events.length ? events.map(event => (
                <div key={event.id} className="text-xs">
                  <p className="font-medium text-fg">{event.author}</p>
                  <p className="whitespace-pre-wrap break-words text-fg-muted">{event.content}</p>
                  <p className="text-[10px] text-fg-muted">{new Date(event.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              )) : <p className="text-xs text-fg-muted">Nenhum registro ainda.</p>}
          </div>
        )}
      </div>
    )
  }

  const recent = rows.filter(row => row.id !== result?.row.id)
  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface px-4 pb-8 pt-6">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Meus chamados</h1>
        <p className="mt-1 text-sm text-fg-muted">Acompanhe suas solicitações de atendimento.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="tracking-input" className="text-xs font-medium text-fg-muted">Link ou código de acompanhamento</label>
        <div className="flex gap-2">
          <input id="tracking-input" type="text" value={tokenInput} onChange={event => { setTokenInput(event.target.value); setError('') }} placeholder="Cole o link ou código" autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-3 text-sm text-fg placeholder:text-fg-muted focus:border-emerald-500 focus:outline-none" />
          <button type="submit" disabled={loading || !tokenInput.trim()} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Buscando...' : 'Buscar'}</button>
        </div>
        <p className="text-[11px] text-fg-muted">Use o link privado ou código disponível na tela do chamado.</p>
      </form>
      {error && <div role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">{error}</div>}
      {loading && <p role="status" className="mt-5 text-center text-sm text-fg-muted">Localizando chamado...</p>}
      {result && <section className="mt-6 space-y-2"><h2 className="text-xs font-semibold text-fg-muted">Resultado da busca</h2>{renderCard(result.row, result.token, true)}</section>}
      <section className="mt-7 space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-fg">Chamados recentes</h2><span className="text-xs text-fg-muted">{recent.length}</span></div>
        {recent.length ? <>
          <p className="text-[11px] text-fg-muted">Salvos neste navegador. O status exibido é o último consultado; abra o chamado para atualizar.</p>
          {recent.map(row => renderCard(row, recentToken(row.id)))}
        </> : <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-card text-fg-muted"><icons.ui.inbox size={24} /></div>
          <p className="text-sm font-semibold text-fg">{result ? 'Nenhum outro chamado salvo' : 'Nenhum chamado salvo neste navegador'}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-muted">Abra um chamado ou importe seu link privado para encontrá-lo aqui depois.</p>
        </div>}
      </section>
      <button type="button" onClick={() => navigate('/chamados-publico/new')} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium text-fg hover:bg-input"><icons.ui.plus size={17} />Abrir novo chamado</button>
      <p className="mt-3 text-center text-[11px] text-fg-muted">Em dispositivos compartilhados, remova seus chamados salvos ao terminar.</p>
    </div>
  )
}
