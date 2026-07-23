import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRooms } from '../hooks/useRooms'
import { stockService } from '../../stock/services/stockService'
import { pcService } from '../../pcare/services/pcService'
import { icons } from '../../../lib/icons'

export function RoomForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { rooms, create, update } = useRooms()
  const existingRoom = id ? rooms.find((r) => r.id === id) : null

  const [name, setName] = useState(existingRoom?.name || '')
  const [location, setLocation] = useState(existingRoom?.location || '')
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set(existingRoom?.assetIds || []))
  const [search, setSearch] = useState('')

  const allAssets = useMemo(() => {
    const stockItems = stockService.getAll().map((item) => ({
      id: item.id,
      name: item.name,
      subcategory: item.subcategory,
      room: item.room,
      source: 'stock' as const,
    }))
    const pcs = pcService.getAll().map((pc) => ({
      id: pc.id,
      name: `${pc.labName} — ${pc.pcNumber}`,
      subcategory: 'Desktop',
      room: pc.roomLocation,
      source: 'pcare' as const,
    }))
    return [...stockItems, ...pcs]
  }, [])

  const filteredAssets = useMemo(() => {
    if (!search) return allAssets
    const q = search.toLowerCase()
    return allAssets.filter(
      (a) => a.name.toLowerCase().includes(q) || a.room.toLowerCase().includes(q) || a.subcategory.toLowerCase().includes(q)
    )
  }, [allAssets, search])

  const selectedAssets = useMemo(() => {
    return allAssets.filter((a) => selectedAssetIds.has(`${a.source}:${a.id}`))
  }, [allAssets, selectedAssetIds])

  function toggleAsset(source: string, assetId: string) {
    const key = `${source}:${assetId}`
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const assetIds = [...selectedAssetIds]

    if (existingRoom) {
      update(existingRoom.id, { name: name.trim(), location: location.trim(), assetIds })
    } else {
      create({ name: name.trim(), location: location.trim(), assetIds })
    }
    navigate('/chamados/rooms')
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Nome da Sala *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Sala 101"
            required
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Localização</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex: Bloco A, 2º andar"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
            Equipamentos Vinculados ({selectedAssetIds.size})
          </label>

          {selectedAssets.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedAssets.map((asset) => (
                <span
                  key={`${asset.source}:${asset.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                >
                  {asset.name}
                  <button
                    type="button"
                    onClick={() => toggleAsset(asset.source, asset.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-amber-500/20"
                  >
                    <icons.ui.close size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative mb-2">
            <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar equipamento..."
              className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-xl border border-line">
            {filteredAssets.length === 0 ? (
              <p className="p-3 text-center text-xs text-fg-muted">Nenhum equipamento encontrado</p>
            ) : (
              filteredAssets.map((asset) => {
                const key = `${asset.source}:${asset.id}`
                const isSelected = selectedAssetIds.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAsset(asset.source, asset.id)}
                    className={`flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 transition-colors ${
                      isSelected ? 'bg-amber-500/10' : 'hover:bg-input'
                    }`}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      isSelected ? 'border-amber-500 bg-amber-500' : 'border-line'
                    }`}>
                      {isSelected && <icons.ui.check size={12} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-fg">{asset.name}</p>
                      <p className="text-[10px] text-fg-muted">{asset.subcategory} · {asset.room || 'Sem sala'}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/chamados/rooms')}
            className="flex-1 rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-input"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {existingRoom ? 'Salvar' : 'Criar Sala'}
          </button>
        </div>
      </form>

      {existingRoom && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/chamados/rooms/${existingRoom.id}/qr`)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-input"
          >
            <icons.ui.qrCode size={16} />
            Ver QR Code
          </button>
        </div>
      )}
    </div>
  )
}
