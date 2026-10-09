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
import { getPriority, getSlaState, isSlaOverdue } from '../services/sla'
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

const STATUS_CHIP_VALUES: Array<Exclude<StatusFilterValue, 'arquivados' | ''>> = [
  'aberto',
  'em_andamento',
  'a_caminho',
  'em_atendimento',
  'em_espera',
  'resolvido',
  'indeferido',
]

const STATUS_CHIP_LABELS: Record<TicketStatus | 'em_andamento', string> = {
  ...TICKET_STATUS_LABELS,
  em_andamento: 'Em andamento',
}

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
  const [slaFilter] = useState<'near' | 'overdue' | ''>(() => {
    const param = searchParams.get('sla')
    return param === 'near' || param === 'overdue' ? param : ''
  })
  const [roomFilter, setRoomFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'recente' | 'prioridade' | 'sla' | 'sala' | 'numero'>('recente')
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
      // Issue #367 — em_espera/indeferido SAIEM da fila operacional ativa:
      // têm segmentos próprios (chips) e não aparecem na fila de abertos.
      const pausedOrDenied = t.status === 'em_espera' || t.status === 'indeferido'
      if (assignedFilter) {
        if (archived) return false
        if (t.assignedToUserId !== user?.id) return false
      } else if (unassignedFilter) {
        if (archived) return false
        if (pausedOrDenied) return false
        if (t.assignedToUserId) return false
      } else {
        if (statusFilter === 'arquivados') {
          if (!archived) return false
        } else if (statusFilter === 'em_espera' || statusFilter === 'indeferido') {
          // Segmento próprio (issue #367): fora da fila ativa, localizável.
          if (archived || t.status !== statusFilter) return false
        } else {
          if (archived) return false
          if (pausedOrDenied) return false
          if (statusFilter === 'em_andamento') {
            if (t.status !== 'a_caminho' && t.status !== 'em_atendimento') return false
          } else if (statusFilter && t.status !== statusFilter) {
            return false
          }
        }
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
      } else {
        counts.ativos++
        if (t.status === 'a_caminho' || t.status === 'em_atendimento') counts.em_andamento++
        if (t.status in counts) counts[t.status]++
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('')
            setAssignedFilter(false)
            setUnassignedFilter(false)
          }}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === '' && !assignedFilter && !unassignedFilter ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Ativos {statusCounts.ativos > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts.ativos}</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            // Lê o valor atual em vez de fazer efeitos dentro do updater:
            // o updater pode ser reexecutado (StrictMode) e não deve ter
            // efeitos colaterais.
            if (!assignedFilter) {
              setUnassignedFilter(false)
              setStatusFilter('')
            }
            setAssignedFilter((v) => !v)
          }}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            assignedFilter ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
          title="Chamados atribuídos a você para atendimento"
        >
          Meus Atendimentos
        </button>
        <button
          type="button"
          onClick={() => {
            if (!unassignedFilter) {
              setAssignedFilter(false)
              setStatusFilter('')
            }
            setUnassignedFilter((v) => !v)
          }}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            unassignedFilter ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Sem responsável
        </button>
        {STATUS_CHIP_VALUES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => {
              setStatusFilter(status)
              // Chips de status refinam a DIMENSÃO DE STATUS; os filtros de
              // fila (responsável) são o mesmo eixo e são zerados junto.
              clearQueueScope()
            }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === status ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {STATUS_CHIP_LABELS[status]} {statusCounts[status] > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts[status]}</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setStatusFilter('arquivados')
            clearQueueScope()
          }}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === 'arquivados' ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Arquivados {statusCounts.arquivados > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px]">{statusCounts.arquivados}</span>}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setPriorityFilter('')}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            priorityFilter === '' ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Prioridades
        </button>
        {TICKET_PRIORITIES.map((priority) => (
          <button
            key={priority}
            type="button"
            onClick={() => setPriorityFilter(priority)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              priorityFilter === priority ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {TICKET_PRIORITY_LABELS[priority]}
          </button>
        ))}
      </div>

      {uniqueRooms.length > 0 && (
        <select
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
        >
          <option value="">Todas as salas</option>
          {uniqueRooms.map((room) => (
            <option key={room} value={room}>{room}</option>
          ))}
        </select>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSortBy(opt.value)}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              sortBy === opt.value ? 'bg-fg text-surface' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {sortedTickets.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">
            {tickets.length === 0
              ? 'Nenhum chamado encontrado na fila atual.'
              : statusFilter === 'arquivados'
                ? 'Nenhum chamado arquivado'
                : 'Nenhum resultado encontrado'}
          </p>
          <p className="mt-1 text-[11px] text-fg-dim">
            Procurando os chamados que você abriu? Eles ficam em &quot;Meus Chamados&quot;.
          </p>
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
