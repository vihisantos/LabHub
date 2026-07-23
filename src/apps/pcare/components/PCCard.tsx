import { useNavigate } from 'react-router-dom'
import type { Asset, PC } from '../types'
import { ASSET_STATUS_LABELS, OPERATING_SYSTEM_LABELS } from '../types'
import { icons } from '../../../lib/icons'

interface AssetCardProps { asset?: Asset; /** @deprecated Legacy PC prop. */ pc?: PC; selectable?: boolean; selected?: boolean; highlighted?: boolean; onToggleSelect?: (id: string) => void }

/** @deprecated Filename retained to avoid breaking existing imports. Renders an inventory asset. */
export function PCCard({ asset: assetProp, pc, selectable, selected, highlighted, onToggleSelect }: AssetCardProps) {
  const navigate = useNavigate()
  const asset: Asset = assetProp ?? {
    id: pc!.id, assetTag: pc!.assetTag || pc!.pcNumber, equipmentType: 'Desktop', manufacturer: '', model: '', serialNumber: '', location: pc!.roomLocation, status: 'in_use', observations: pc!.observations, technical: { operatingSystem: '', architecture: '', processor: pc!.specs.cpu, memory: pc!.specs.ram, storageType: '', storageCapacity: pc!.specs.storage, storageBrand: '' }, network: { hostname: '', macEthernet: '', macWifi: '', ip: '', domain: pc!.config?.domain || '' }, parentAssetId: null, childAssetIds: [], photos: pc!.photos || [], createdAt: pc!.createdAt, updatedAt: pc!.updatedAt,
  }
  return <button type="button" onClick={() => selectable ? onToggleSelect?.(asset.id) : navigate(`/pc-care/assets/${asset.id}`)} className={`group relative w-full overflow-hidden rounded-xl bg-card p-4 text-left ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lg ${highlighted ? 'ring-emerald-500' : selected ? 'ring-violet-500' : 'ring-line/50'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {selectable && <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(asset.id)} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar ${asset.assetTag}`} className="h-5 w-5" />}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-input">
          {asset.photos[0] ? <img src={asset.photos[0]} alt="" className="h-full w-full object-cover" /> : <icons.nav.pcs size={19} className="text-fg-dim" />}
        </div>
        <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-fg">{asset.assetTag}</h3><p className="truncate text-xs text-fg-muted">{asset.equipmentType} · {asset.manufacturer} {asset.model}</p><p className="truncate text-xs text-fg-muted">{asset.location}</p></div>
      </div>
      <span className="shrink-0 rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim">{ASSET_STATUS_LABELS[asset.status]}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-1">
      {asset.technical.operatingSystem && <span className="rounded bg-input px-2 py-0.5 text-[10px] text-fg-dim">{OPERATING_SYSTEM_LABELS[asset.technical.operatingSystem]}</span>}
      {asset.technical.processor && <span className="max-w-[180px] truncate rounded bg-input px-2 py-0.5 text-[10px] text-fg-dim">{asset.technical.processor}</span>}
      {asset.serialNumber && <span className="rounded bg-input px-2 py-0.5 text-[10px] text-fg-dim">S/N: {asset.serialNumber}</span>}
    </div>
  </button>
}
