import {
  ASSET_MOVEMENT_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  isAssetStatus,
  type AssetMovement,
} from '../../../core/patrimonio'
import { icons } from '../../../lib/icons'
import { formatDateTime } from '../utils/format'
import { SkeletonTimeline } from '../../pcare/components/Skeletons'

interface MovementTimelineProps {
  movements: AssetMovement[]
  locationLabel: (id: string | null) => string | null
  responsibleLabel: (id: string | null) => string | null
  loading: boolean
  error: { message: string } | null
  hasNext: boolean
  onLoadMore: () => void
  onRetry: () => void
}

/**
 * Histórico de movimentações do ativo, do mais recente ao mais antigo.
 *
 * O schema `asset_movements` é somente-destino (`to_*`): a origem de um
 * movimento é o destino do movimento anterior na cronologia. Como a lista é
 * paginada, a origem só é confiável enquanto o movimento anterior estiver
 * carregado; fora disso mostramos "origem desconhecida" em vez de inventar.
 */
export function MovementTimeline({
  movements,
  locationLabel,
  responsibleLabel,
  loading,
  error,
  hasNext,
  onLoadMore,
  onRetry,
}: MovementTimelineProps) {
  if (loading && movements.length === 0) {
    return <SkeletonTimeline />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card/50 px-4 py-6 text-center">
        <icons.ui.alertCircle size={20} className="text-red-500" />
        <p className="text-sm text-fg-dim">Não foi possível carregar o histórico.</p>
        <p className="text-xs text-fg-muted">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 flex items-center gap-1 rounded-lg bg-input px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:text-fg"
        >
          <icons.ui.refresh size={13} />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <p className="rounded-xl bg-input/50 px-4 py-4 text-center text-sm text-fg-muted">
        Nenhuma movimentação registrada.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <ol className="relative space-y-3 border-l border-line pl-4">
        {movements.map((movement, index) => {
          const previous = movements[index + 1]
          const fromLocation = previous ? locationLabel(previous.to_location_id) : null
          const toLocation = locationLabel(movement.to_location_id)
          const toResponsible =
            movement.to_responsible_nome ?? responsibleLabel(movement.to_responsible_id)
          const fromResponsible = previous ? responsibleLabel(previous.to_responsible_id) : null
          const fromStatus = previous && isAssetStatus(previous.to_status) ? previous.to_status : null
          const toStatus = isAssetStatus(movement.to_status) ? movement.to_status : null

          return (
            <li key={movement.id} className="relative">
              <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-surface">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
              </span>
              <div className="rounded-xl border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">
                    {ASSET_MOVEMENT_TYPE_LABELS[movement.type]}
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    {formatDateTime(movement.created_at)}
                  </span>
                </div>

                <dl className="mt-2 space-y-1 text-xs">
                  {toLocation && (
                    <Summary
                      label="Local"
                      from={fromLocation}
                      to={toLocation}
                    />
                  )}
                  {toResponsible && (
                    <Summary
                      label="Responsável"
                      from={fromResponsible}
                      to={toResponsible}
                    />
                  )}
                  {toStatus && (
                    <Summary
                      label="Status"
                      from={fromStatus ? ASSET_STATUS_LABELS[fromStatus] : null}
                      to={ASSET_STATUS_LABELS[toStatus]}
                    />
                  )}
                  {movement.expected_return_at && (
                    <div className="flex gap-1.5">
                      <dt className="text-fg-muted">Devolução prevista:</dt>
                      <dd className="text-fg-dim">{formatDateTime(movement.expected_return_at)}</dd>
                    </div>
                  )}
                </dl>

                {movement.note && (
                  <p className="mt-2 rounded-lg bg-input/50 px-2.5 py-1.5 text-[11px] text-fg-dim">
                    {movement.note}
                  </p>
                )}

                {movement.performed_by_nome && (
                  <p className="mt-2 text-[11px] text-fg-muted">
                    por {movement.performed_by_nome}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {hasNext && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="w-full rounded-xl bg-input py-2.5 text-xs font-medium text-fg-dim transition-colors hover:text-fg disabled:opacity-50"
        >
          {loading ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}

function Summary({ label, from, to }: { label: string; from: string | null; to: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <dt className="text-fg-muted">{label}:</dt>
      <dd className="flex items-center gap-1.5 text-fg-dim">
        {from && (
          <>
            <span className="text-fg-muted">{from}</span>
            <icons.ui.chevronRight size={11} className="text-fg-muted" />
          </>
        )}
        <span className="font-medium text-fg">{to}</span>
      </dd>
    </div>
  )
}
