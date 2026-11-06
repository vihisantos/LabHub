import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTicketsContext } from '../contexts/TicketsContext'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import { getPriority, getSlaState, isSlaOverdue, isTicketOpen } from '../services/sla'
import { useAuth } from '../../../core/auth/useAuth'
import { icons } from '../../../lib/icons'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

function slaConfigFor(ticket: Ticket) {
  return slaConfigService.getHoursForTickets()[ticket.workspace_id ?? ''] ?? null
}

const CONTEXTUAL_STATUS_FILTERS: TicketStatus[] = [
  'aberto', 'a_caminho', 'em_atendimento', 'em_espera', 'indeferido', 'resolvido',
]

// Fase 2.1: valor composto da Central ("Em andamento" = a_caminho + em_atendimento).
// Continua sendo UM único statusFilter — sem segunda lógica de filtragem.
type StatusFilterValue = TicketStatus | 'arquivados' | 'em_andamento' | ''

/**
 * Chamados — a FILA OPERACIONAL da equipe de TI.
 *
 * Tudo nesta tela gira em torno do trabalho de atendimento: status, prioridade,
 * responsável, sala, SLA, ordenação e a lista completa do que está em aberto.
 *
 * ⚠️ Esta tela NÃO é o lugar de "Meus Chamados". Chamar alguém é só histórico de
 * pedido: é área pessoal, vive na rota `/chamados/meus` (página `MyTickets`, com
 * dados de `GET /api/chamados?mine=true`) e não é uma segunda fila aqui dentro.
 * Os dois conceitos que coexistem — "Meus Atendimentos" (`assignedFilter`, fila de
 * TRABALHO: só abertos) e "Meus Chamados" (histórico de PEDIDOS, em página
 * própria) — continuam sendo distintos, mas não dividem mais esta tela.
 */
export function TicketList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { tickets, syncing, reload } = useTicketsContext()
  const { user } = useAuth()
  // Fase 2.1 — os query params da Central INICIALIZAM os filtros existentes:
  // o useState abaixo continua sendo a única fonte de verdade após o mount.
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(() => {
    const param = searchParams.get('status')
    if (param === 'em_andamento') return 'em_andamento'
    return (CONTEXTUAL_STATUS_FILTERS as readonly string[]).includes(param ?? '')
      ? (param as TicketStatus)
      : ''
  })
  const [assignedFilter, setAssignedFilter] = useState(false)
  const [unassignedFilter, setUnassignedFilter] = useState(
    () => searchParams.get('unassigned') === '1',
  )
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>(() => {
    const param = searchParams.get('priority')
    return (TICKET_PRIORITIES as readonly string[]).includes(param ?? '')
      ? (param as TicketPriority)
      : ''
  })
  const [slaFilter, setSlaFilter] = useState<'near' | 'overdue' | ''>(() => {
    const param = searchParams.get('sla')
    return param === 'near' || param === 'overdue' ? param : ''
  })
  const [roomFilter, setRoomFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'recente' | 'prioridade' | 'sla' | 'sala' | 'numero'>('recente')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)

  useEffect(() => { setVisibleCount(20) }, [statusFilter, assignedFilter, unassignedFilter, priorityFilter, slaFilter, roomFilter, search, sortBy])

  const SORT_OPTIONS: { value: typeof sortBy; label: string }[] = [
    { value: 'recente', label: 'Mais recentes' },
    { value: 'prioridade', label: 'Prioridade' },
    { value: 'sla', label: 'SLA' },
    { value: 'sala', label: 'Sala' },
    { value: 'numero', label: 'Nº' },
  ]

  /** Zera os filtros de FILA (atendimentos/sem responsável). */
  function clearQueueScope() {
    setAssignedFilter(false)
    setUnassignedFilter(false)
  }

  const filteredTickets = useMemo(() => {
    const slaByWorkspace = slaConfigService.getHoursForTickets()
    return tickets.filter((t) => {
      const archived = t.archived === true || t.status === 'fechado'
      if (assignedFilter) {
        if (archived) return false
        if (t.assignedToUserId !== user?.id) return false
      } else if (unassignedFilter) {
        if (archived || t.status === 'em_espera' || t.status === 'indeferido') return false
        if (t.assignedToUserId) return false
      } else if (statusFilter === 'arquivados') {
        if (!archived) return false
      } else if (statusFilter === 'em_espera' || statusFilter === 'indeferido') {
        if (archived || t.status !== statusFilter) return false
      } else if (statusFilter === 'em_andamento') {
        if (archived || (t.status !== 'a_caminho' && t.status !== 'em_atendimento')) return false
      } else if (statusFilter) {
        if (archived || t.status !== statusFilter) return false
      } else if (archived || !isTicketOpen(t.status)) {
        // Visão padrão "Ativos": somente aberto, a_caminho e em_atendimento.
        return false
      }
      if (slaFilter && getSlaState(t.createdAt, t.priority, t.status, slaByWorkspace[t.workspace_id ?? '']) !== slaFilter) return false
      if (priorityFilter && getPriority(t.priority) !== priorityFilter) return false
      if (roomFilter && t.roomName !== roomFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !String(t.assetName || '').toLowerCase().includes(q) &&
          !t.roomName.toLowerCase().includes(q) &&
          !t.problemCategory.toLowerCase().includes(q) &&
          !String(t.ticketNumber).includes(q)
        ) return false
      }
      return true
    })
  }, [tickets, statusFilter, assignedFilter, unassignedFilter, priorityFilter, slaFilter, roomFilter, search, user?.id])

  const uniqueRooms = useMemo(() => {
    return [...new Set(tickets.map((t) => t.roomName))].sort()
  }, [tickets])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ativos: 0, arquivados: 0, aberto: 0, a_caminho: 0, em_atendimento: 0, em_andamento: 0, em_espera: 0, resolvido: 0, indeferido: 0 }
    for (const t of tickets) {
      const archived = t.archived === true || t.status === 'fechado'
      if (archived) {
        counts.arquivados++
      } else if (t.status === 'em_espera' || t.status === 'indeferido') {
        // Issue #367 — fora da fila operacional ativa (segmento próprio):
        // o contador do chip "Ativos" só reflete a fila de abertos.
        counts[t.status]++
      } else if (isTicketOpen(t.status)) {
        counts.ativos++
        if (t.status in counts) counts[t.status]++
      } else if (t.status in counts) {
        counts[t.status]++
      }
    }
    return counts
  }, [tickets])

  const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

  const sortedTickets = useMemo(() => {
    const sorted = filteredTickets.filter((t) => t.id && t.ticketNumber != null)
    switch (sortBy) {
      case 'prioridade':
        return sorted.sort((a, b) => (PRIORITY_ORDER[getPriority(a.priority)] ?? 2) - (PRIORITY_ORDER[getPriority(b.priority)] ?? 2))
      case 'sla':
        return sorted.sort((a, b) => {
          const aOverdue = isSlaOverdue(a.createdAt, a.priority, a.status, slaConfigFor(a))
          const bOverdue = isSlaOverdue(b.createdAt, b.priority, b.status, slaConfigFor(b))
          if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
          return (a.createdAt || '').localeCompare(b.createdAt || '')
        })
      case 'sala':
        return sorted.sort((a, b) => a.roomName.localeCompare(b.roomName))
      case 'numero':
        return sorted.sort((a, b) => (b.ticketNumber || 0) - (a.ticketNumber || 0))
      default:
        return sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    }
  }, [filteredTickets, sortBy])

  return (
    <div className="space-y-4">
      {syncing && (
        <div className="h-0.5 -mt-2 -mx-4 overflow-hidden">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_infinite] rounded-full bg-amber-500" />
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por #, sala, ativo ou problema..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={syncing}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg disabled:opacity-50"
          aria-label="Atualizar lista"
          title="Atualizar lista"
        >
          <icons.ui.refresh size={16} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      <section className="space-y-2.5" aria-label="Busca e filtros dos chamados">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Visualização</p>
          <span className="text-[11px] text-fg-dim">{sortedTickets.length} {sortedTickets.length === 1 ? 'chamado' : 'chamados'}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain pb-2 [scrollbar-width:thin] [scrollbar-color:var(--color-fg-dim)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-fg-dim/40 [&::-webkit-scrollbar-thumb:hover]:bg-fg-dim/70">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('')
              setAssignedFilter(false)
              setUnassignedFilter(false)
            }}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              statusFilter === '' && !assignedFilter && !unassignedFilter ? 'bg-amber-500 text-white' : 'border border-line bg-card text-fg-dim hover:text-fg'
            }`}
          >
            Ativos {statusCounts.ativos > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts.ativos}</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setUnassignedFilter(false)
              setStatusFilter('')
              setAssignedFilter((v) => !v)
            }}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              assignedFilter ? 'bg-amber-500 text-white' : 'border border-line bg-card text-fg-dim hover:text-fg'
            }`}
            title="Chamados ativos atribuídos a você"
          >
            Meus Atendimentos
          </button>
          {(['em_espera', 'indeferido'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status)
                clearQueueScope()
              }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === status ? 'bg-amber-500 text-white' : 'border border-line bg-card text-fg-dim hover:text-fg'
              }`}
            >
              {status === 'em_espera' ? 'Em espera' : 'Indeferidos'} {statusCounts[status] > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts[status]}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('arquivados')
              clearQueueScope()
            }}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              statusFilter === 'arquivados' ? 'bg-amber-500 text-white' : 'border border-line bg-card text-fg-dim hover:text-fg'
            }`}
          >
            Arquivados {statusCounts.arquivados > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts.arquivados}</span>}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="ticket-list-filters"
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              filtersOpen || unassignedFilter || priorityFilter || slaFilter || roomFilter
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                : 'border-line bg-card text-fg hover:bg-input'
            }`}
          >
            <icons.ui.sliders size={14} />
            Filtrar
            {(Number(Boolean(unassignedFilter)) + Number(Boolean(priorityFilter)) + Number(Boolean(slaFilter)) + Number(Boolean(roomFilter))) > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] text-white">
                {Number(Boolean(unassignedFilter)) + Number(Boolean(priorityFilter)) + Number(Boolean(slaFilter)) + Number(Boolean(roomFilter))}
              </span>
            )}
            <icons.ui.chevronDown size={13} className={filtersOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <label className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-muted shadow-sm transition-colors focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 sm:w-auto sm:min-w-[220px] sm:max-w-[280px] sm:flex-1">
            <span className="shrink-0 font-semibold text-fg">Ordenar</span>
            <select
              aria-label="Ordenar chamados"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent text-xs font-medium text-fg outline-none"
            >
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <icons.ui.chevronDown size={14} className="shrink-0 text-fg-muted" />
          </label>
        </div>

        {filtersOpen && (
          <div id="ticket-list-filters" className="space-y-4 rounded-xl border border-line bg-card p-3.5">
            <button
              type="button"
              onClick={() => {
                setAssignedFilter(false)
                setStatusFilter('')
                setUnassignedFilter((value) => !value)
              }}
              aria-pressed={unassignedFilter}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                unassignedFilter ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
              }`}
            >
              Sem responsável
            </button>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-fg">Prioridade</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPriorityFilter('')}
                  aria-pressed={priorityFilter === ''}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    priorityFilter === '' ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
                  }`}
                >
                  Todas
                </button>
                {TICKET_PRIORITIES.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setPriorityFilter(priority)}
                    aria-pressed={priorityFilter === priority}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      priorityFilter === priority ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
                    }`}
                  >
                    {TICKET_PRIORITY_LABELS[priority]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {uniqueRooms.length > 0 && (
                <label className="space-y-1.5 text-xs font-medium text-fg">
                  Sala
                  <select
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className="w-full rounded-lg border border-line bg-input px-3 py-2.5 text-sm text-fg focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Todas as salas</option>
                    {uniqueRooms.map((room) => <option key={room} value={room}>{room}</option>)}
                  </select>
                </label>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-fg">SLA</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSlaFilter('')}
                    aria-pressed={slaFilter === ''}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      slaFilter === '' ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlaFilter('near')}
                    aria-pressed={slaFilter === 'near'}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      slaFilter === 'near' ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
                    }`}
                  >
                    Próximos do prazo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlaFilter('overdue')}
                    aria-pressed={slaFilter === 'overdue'}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      slaFilter === 'overdue' ? 'bg-amber-500 text-white' : 'border border-line bg-input text-fg-dim hover:text-fg'
                    }`}
                  >
                    Em atraso
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => {
                  setUnassignedFilter(false)
                  setPriorityFilter('')
                  setSlaFilter('')
                  setRoomFilter('')
                }}
                className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </section>

      {sortedTickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card/50 px-5 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-muted">
            <icons.ui.inbox size={28} />
          </div>
          <p className="mt-4 text-sm font-semibold text-fg">
            {search
              ? 'Nenhum chamado encontrado'
              : assignedFilter
                ? 'Nenhum atendimento atribuído a você'
                : unassignedFilter
                  ? 'Nenhum chamado sem responsável'
                  : statusFilter === 'arquivados'
                    ? 'Nenhum chamado arquivado'
                    : statusFilter === 'em_espera'
                      ? 'Nenhum chamado em espera'
                      : statusFilter === 'indeferido'
                        ? 'Nenhum chamado indeferido'
                        : statusFilter === 'resolvido'
                          ? 'Nenhum chamado resolvido'
                          : priorityFilter || slaFilter || roomFilter
                            ? 'Nenhum chamado corresponde aos filtros'
                            : tickets.length === 0
                              ? 'A fila está vazia'
                              : 'Nenhum chamado ativo'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-fg-dim">
            {tickets.length === 0
              ? 'Quando um novo chamado for registrado, ele aparecerá aqui.'
              : search
                ? 'Tente conferir o número, a sala ou o termo pesquisado.'
                : assignedFilter
                  ? 'Quando um chamado for atribuído a você, ele aparecerá nesta visualização.'
                  : unassignedFilter
                    ? 'No momento, não há chamados ativos aguardando responsável.'
                    : statusFilter === 'arquivados'
                      ? 'Os chamados arquivados aparecerão aqui.'
                      : statusFilter === 'em_espera'
                        ? 'Os chamados colocados em espera aparecerão aqui.'
                        : statusFilter === 'indeferido'
                          ? 'Os chamados indeferidos aparecerão aqui.'
                          : statusFilter === 'resolvido'
                            ? 'Os chamados resolvidos aparecerão aqui.'
                            : priorityFilter || slaFilter || roomFilter
                              ? 'Tente remover ou alterar algum filtro para ampliar os resultados.'
                              : 'Não há chamados em andamento nesta fila no momento.'}
          </p>
          {(search || assignedFilter || unassignedFilter || statusFilter || priorityFilter || slaFilter || roomFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setStatusFilter('')
                setAssignedFilter(false)
                setUnassignedFilter(false)
                setPriorityFilter('')
                setSlaFilter('')
                setRoomFilter('')
              }}
              className="mt-4 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-input"
            >
              Limpar busca e filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTickets.slice(0, visibleCount).map((ticket) => {
            const overdue = isSlaOverdue(ticket.createdAt, ticket.priority, ticket.status, slaConfigFor(ticket))
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
                className={`flex w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] ${
                  overdue ? 'ring-1 ring-red-500/50' : ''
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-bold text-amber-500">
                  #{ticket.ticketNumber || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">{ticket.assetName || ticket.problemCategory}</p>
                  <p className="text-[11px] text-fg-muted">
                    {ticket.roomName} · {ticket.problemCategory}
                    {ticket.problemArea ? ` · ${ticket.problemArea === 'administrativa' ? 'Adm' : 'Acad'}` : ''}
                    {ticket.assignedTo ? ` · ${ticket.assignedTo}` : ''}
                  </p>
                  <p className="text-[10px] text-fg-dim">
                    {(() => {
                      const d = new Date(ticket.createdAt)
                      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
                    })()}
                    {overdue && <span className="ml-1 font-bold text-red-500">· Em atraso</span>}
                    {ticket.feedbackRating && (
                      <span className="ml-1 text-amber-500">· ★ {ticket.feedbackRating}</span>
                    )}
                  </p>
                  {ticket.statusNote && (
                    <p className="mt-0.5 truncate text-[10px] italic text-blue-500">{ticket.statusNote}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_PRIORITY_COLORS[getPriority(ticket.priority)]}`}>
                  {TICKET_PRIORITY_LABELS[getPriority(ticket.priority)]}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
              </button>
            )
          })}
          {visibleCount < sortedTickets.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 20)}
              className="w-full rounded-xl border border-line bg-card py-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              Carregar mais ({sortedTickets.length - visibleCount} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
