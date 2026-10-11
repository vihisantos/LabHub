import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
} from '../../../core/patrimonio'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { EmptyState } from '../../pcare/components/EmptyState'
import { SkeletonCard, SkeletonTimeline } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { useAssetDetail } from '../hooks/useAssetDetail'
import { usePatrimonioReferences } from '../hooks/usePatrimonioReferences'
import { AssetConditionBadge, AssetStatusBadge } from '../components/AssetBadges'
import { AssetFormModal } from '../components/AssetFormModal'
import { MovementTimeline } from '../components/MovementTimeline'
import { QueryError } from '../components/QueryError'
import { formatDateTime } from '../utils/format'

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { workspace } = useWorkspace()
  const { allowed, loading: permLoading } = useCanAccessAction('patrimonio.view')
  const canEdit = useCanAccessAction('patrimonio.asset.edit')
  const workspaceId = workspace?.id ?? null
  const enabled = allowed && !!workspaceId
  const [formOpen, setFormOpen] = useState(false)

  const detail = useAssetDetail(id, workspaceId, enabled)
  const references = usePatrimonioReferences(workspaceId, enabled)

  if (!permLoading && !allowed) {
    return (
      <EmptyState
        icon={icons.ui.shield}
        title="Sem permissão"
        description="Você não tem acesso ao módulo Patrimônio nesta unidade."
        accentColor="amber"
      />
    )
  }

  if (!permLoading && allowed && !workspace) {
    return (
      <EmptyState
        icon={icons.ui.mapPin}
        title="Nenhuma unidade ativa"
        description="Selecione uma unidade para visualizar o patrimônio."
        accentColor="amber"
      />
    )
  }

  if (permLoading || (detail.loading && !detail.asset)) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonTimeline />
      </div>
    )
  }

  if (detail.error) {
    return (
      <QueryError
        title="Falha ao carregar o bem"
        message={detail.error.message}
        onRetry={detail.reloadAsset}
      />
    )
  }

  if (!detail.asset) {
    return (
      <EmptyState
        icon={icons.ui.hardDrive}
        title="Bem não encontrado"
        description="Este bem não existe ou não pertence à unidade ativa."
        accentColor="cyan"
      />
    )
  }

  const asset = detail.asset
  const location = references.locationLabel(asset.location_id)
  const responsible = references.responsibleLabel(asset.responsible_id)

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-mono text-[11px] text-fg-muted">
              {asset.asset_tag ?? 'Sem tombamento'}
            </span>
            <h2 className="mt-0.5 text-lg font-semibold leading-tight text-fg">{asset.name}</h2>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {canEdit.allowed && !canEdit.loading && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="mt-[-2px] flex items-center gap-1 rounded-lg bg-input px-2.5 py-1 text-[11px] font-medium text-fg-dim transition-colors hover:bg-input/80 hover:text-fg btn-interactive"
                aria-label="Editar bem"
              >
                <icons.ui.edit size={12} />
                Editar
              </button>
            )}
            <AssetStatusBadge status={asset.status} />
            <AssetConditionBadge condition={asset.condition} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="Tipo" value={asset.equipment_type} />
          <Field label="Fabricante / Modelo" value={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'} />
          <Field label="Número de série" value={asset.serial_number ?? '—'} />
          <Field label="Unidade" value={workspace?.name ?? '—'} />
          <Field label="Localização" value={location ?? 'Não informado'} />
          <Field label="Responsável" value={responsible ?? 'Sem responsável'} />
          <Field label="Condição" value={ASSET_CONDITION_LABELS[asset.condition]} />
          <Field label="Estado" value={ASSET_STATUS_LABELS[asset.status]} />
        </dl>

        {asset.notes && (
          <div className="mt-4">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
              Observações
            </dt>
            <p className="mt-1 whitespace-pre-wrap text-sm text-fg-dim">{asset.notes}</p>
          </div>
        )}

        <p className="mt-4 text-[11px] text-fg-muted">
          Registrado em {formatDateTime(asset.created_at)} · Atualizado em{' '}
          {formatDateTime(asset.updated_at)}
        </p>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
          <icons.ui.clock size={15} className="text-fg-muted" />
          Histórico de movimentações
        </h3>
        <MovementTimeline
          movements={detail.movements}
          locationLabel={references.locationLabel}
          responsibleLabel={references.responsibleLabel}
          loading={detail.movementsLoading}
          error={detail.movementsError}
          hasNext={detail.movementsHasNext}
          onLoadMore={detail.loadMoreMovements}
          onRetry={detail.reloadMovements}
        />
      </section>

      <AssetFormModal
        open={formOpen}
        workspaceId={workspaceId}
        initial={asset}
        references={references}
        onClose={() => setFormOpen(false)}
        onSaved={() => detail.reloadAsset()}
      />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="truncate text-sm text-fg-dim">{value}</dd>
    </div>
  )
}
