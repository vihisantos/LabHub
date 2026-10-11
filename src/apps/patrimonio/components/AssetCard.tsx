import { Link } from 'react-router-dom'
import { ASSET_CONDITION_LABELS, type PatrimonioAsset } from '../../../core/patrimonio'
import { icons } from '../../../lib/icons'
import { AssetStatusBadge } from './AssetBadges'

interface AssetCardProps {
  asset: PatrimonioAsset
  unitName: string
  locationLabel: (id: string | null) => string | null
  responsibleLabel: (id: string | null) => string | null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="truncate text-xs text-fg-dim">{value}</dd>
    </div>
  )
}

export function AssetCard({ asset, unitName, locationLabel, responsibleLabel }: AssetCardProps) {
  const location = locationLabel(asset.location_id)
  const responsible = responsibleLabel(asset.responsible_id)
  const subtitle = [asset.equipment_type, asset.manufacturer, asset.model]
    .filter((part) => part && part.trim().length > 0)
    .join(' · ')

  return (
    <Link
      to={`/patrimonio/${asset.id}`}
      className="block rounded-xl border border-line bg-card p-4 transition-colors hover:bg-card/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-fg-muted">{asset.asset_tag ?? 'Sem tombo'}</span>
            <AssetStatusBadge status={asset.status} />
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-fg">{asset.name}</h3>
          {subtitle && <p className="truncate text-xs text-fg-muted">{subtitle}</p>}
        </div>
        <icons.ui.chevronRight size={16} className="mt-1 shrink-0 text-fg-muted" />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4">
        <Field label="Unidade" value={unitName} />
        <Field label="Localização" value={location ?? 'Não informado'} />
        <Field label="Responsável" value={responsible ?? 'Sem responsável'} />
        <Field label="Condição" value={ASSET_CONDITION_LABELS[asset.condition]} />
      </dl>
    </Link>
  )
}
