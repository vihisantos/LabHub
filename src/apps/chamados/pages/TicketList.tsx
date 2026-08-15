import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import { getPriority, isSlaOverdue } from '../services/sla'
import { icons } from '../../../lib/icons'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

function slaConfigFor(ticket: Ticket) {
  return slaConfigService.getHoursForTickets()[ticket.workspace_id ?? ''] ?? null
}

export function TicketList() {
  const navigate = useNavigate()
  const { tickets } = useTickets()
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'arquivados' | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('')
  const [roomFilter, setRoomFilter] = useState('')
  const [search, setSearch] = useState('')

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const archived = t.archived === true || t.status === 'fechado'
      if (statusFilter === 'arquivados') {
        if (!archived) return false
      } else {
        if (archived) return false
        if (statusFilter && t.status !== statusFilter) return false
      }
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
  }, [tickets, statusFilter, priorityFilter, roomFilter, search])

  const uniqueRooms = useMemo(() => {
    return [...new Set(tickets.map((t) => t.roomName))].sort()
  }, [tickets])

  return (
    <div className="space-y-4">
      <div className="relative">
        <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por #, sala, ativo ou problema..."
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === '' ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Ativos
        </button>
        {(['aberto', 'a_caminho', 'em_atendimento', 'resolvido'] as TicketStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === status ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {TICKET_STATUS_LABELS[status]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setStatusFilter('arquivados')}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === 'arquivados' ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
          }`}
        >
          Arquivados
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

      {filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">
            {tickets.length === 0
              ? 'Nenhum chamado registrado'
              : statusFilter === 'arquivados'
                ? 'Nenhum chamado arquivado'
                : 'Nenhum resultado encontrado'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => {
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
                  #{ticket.ticketNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">{ticket.assetName || ticket.problemCategory}</p>
                  <p className="text-[11px] text-fg-muted">
                    {ticket.roomName} · {ticket.problemCategory}
                    {ticket.problemArea ? ` · ${ticket.problemArea === 'administrativa' ? 'Adm' : 'Acad'}` : ''}
                  </p>
                  <p className="text-[10px] text-fg-dim">
                    {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
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
        </div>
      )}
    </div>
  )
}
