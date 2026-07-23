import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRooms } from '../../chamados/hooks/useRooms'
import { useRoomAssets } from '../../chamados/hooks/useRoomAssets'
import { ticketService } from '../../chamados/services/ticketService'
import { icons } from '../../../lib/icons'
import type { RoomAsset } from '../../chamados/hooks/useRoomAssets'

const CATEGORY_ICONS: Record<string, string> = {
  Equipamentos: '🖥️',
  Multimídia: '📽️',
  Periféricos: '🖱️',
  Áudio: '🔊',
  Rede: '🌐',
  Cabos: '🔌',
  Outros: '📦',
}

function AssetCard({ asset, onClick }: { asset: RoomAsset; onClick: () => void }) {
  const openTickets = ticketService.getOpenByAsset(asset.id, asset.source)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.98]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
        {asset.source === 'pcare' ? <icons.nav.pcs size={20} /> : <icons.ui.package size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg truncate">{asset.name}</p>
        <p className="text-[11px] text-fg-muted">
          {asset.patrimony && `${asset.patrimony} · `}
          {asset.subcategory}
        </p>
      </div>
      {openTickets.length > 0 && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          {openTickets.length} aberto{openTickets.length > 1 ? 's' : ''}
        </span>
      )}
      <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
    </button>
  )
}

export function RoomAssets() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { rooms } = useRooms()
  const room = rooms.find((r) => r.id === roomId)

  const roomName = room?.name || ''
  const { grouped } = useRoomAssets(roomName)

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped])

  if (!room) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">Sala não encontrada</p>
        <button
          type="button"
          onClick={() => navigate('/chamados-publico')}
          className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white"
        >
          Escanear novamente
        </button>
      </div>
    )
  }

  const totalAssets = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
          <icons.ui.home size={24} className="text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-fg">{room.name}</h1>
        {room.location && (
          <p className="mt-1 text-sm text-fg-muted">{room.location}</p>
        )}
        <p className="mt-2 text-xs text-fg-dim">{totalAssets} equipamento{totalAssets !== 1 ? 's' : ''} encontrado{totalAssets !== 1 ? 's' : ''}</p>
      </div>

      {totalAssets === 0 ? (
        <div className="flex flex-col items-center py-12">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">Nenhum equipamento vinculado a esta sala</p>
          <p className="mt-1 text-xs text-fg-dim">Entre em contato com o suporte</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="text-base">{CATEGORY_ICONS[category] || '📦'}</span>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{category}</h2>
              </div>
              <div className="space-y-2">
                {grouped[category].map((asset) => (
                  <AssetCard
                    key={`${asset.source}-${asset.id}`}
                    asset={asset}
                    onClick={() => navigate(`/chamados-publico/new?room=${room.id}&asset=${asset.id}&source=${asset.source}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
