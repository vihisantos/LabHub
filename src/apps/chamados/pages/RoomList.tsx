import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRooms } from '../hooks/useRooms'
import { useRoomAssets } from '../hooks/useRoomAssets'
import { ticketService } from '../services/ticketService'
import { icons } from '../../../lib/icons'

function RoomCard({ room }: { room: { id: string; name: string; location: string; assetIds: string[] } }) {
  const navigate = useNavigate()
  const { grouped } = useRoomAssets(room.name)
  const openTickets = ticketService.getOpenByRoom(room.id)
  const totalAssets = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <button
      type="button"
      onClick={() => navigate(`/chamados/rooms/${room.id}/edit`)}
      className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
        <icons.ui.home size={22} className="text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{room.name}</p>
        <p className="text-[11px] text-fg-muted">
          {room.location || 'Sem localização'} · {totalAssets} ativo{totalAssets !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        {openTickets.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {openTickets.length} chamado{openTickets.length > 1 ? 's' : ''}
          </span>
        )}
        <icons.ui.chevronRight size={16} className="text-fg-muted" />
      </div>
    </button>
  )
}

export function RoomList() {
  const navigate = useNavigate()
  const { rooms } = useRooms()

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => a.name.localeCompare(b.name))
  }, [rooms])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-muted">{rooms.length} sala{rooms.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => navigate('/chamados/rooms/new')}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400"
        >
          <icons.ui.plus size={14} />
          Nova Sala
        </button>
      </div>

      {sortedRooms.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <icons.ui.home size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">Nenhuma sala cadastrada</p>
          <p className="mt-1 text-xs text-fg-dim">Crie uma sala para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  )
}
