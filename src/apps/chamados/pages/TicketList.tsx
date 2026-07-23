import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../types'
import { icons } from '../../../lib/icons'
import type { TicketStatus } from '../types'

export function TicketList() {
  const navigate = useNavigate()
  const { tickets } = useTickets()
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [roomFilter, setRoomFilter] = useState('')
  const [search, setSearch] = useState('')

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false
      if (roomFilter && t.roomName !== roomFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !t.assetName.toLowerCase().includes(q) &&
          !t.roomName.toLowerCase().includes(q) &&
          !t.problemCategory.toLowerCase().includes(q) &&
          !String(t.ticketNumber).includes(q)
        ) return false
      }
      return true
    })
  }, [tickets, statusFilter, roomFilter, search])

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
          Todos
        </button>
        {(['aberto', 'em_atendimento', 'resolvido', 'fechado'] as TicketStatus[]).map((status) => (
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
            {tickets.length === 0 ? 'Nenhum chamado registrado' : 'Nenhum resultado encontrado'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
              className="flex w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-bold text-amber-500">
                #{ticket.ticketNumber}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg truncate">{ticket.assetName}</p>
                <p className="text-[11px] text-fg-muted">
                  {ticket.roomName} · {ticket.problemCategory}
                </p>
                <p className="text-[10px] text-fg-dim">
                  {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                {TICKET_STATUS_LABELS[ticket.status]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
