import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  type AssetCondition,
  type AssetStatus,
  type PatrimonioLocation,
} from '../../../core/patrimonio'
import { icons } from '../../../lib/icons'

interface AssetFiltersSheetProps {
  open: boolean
  onClose: () => void
  status: AssetStatus | ''
  condition: AssetCondition | ''
  locationId: string
  locations: PatrimonioLocation[]
  onStatusChange: (value: AssetStatus | '') => void
  onConditionChange: (value: AssetCondition | '') => void
  onLocationChange: (value: string) => void
  onClear: () => void
  activeCount: number
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-800'
          : 'bg-input text-fg-muted hover:bg-input/80 hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Filtros do acervo: local e estado de custódia (status) + condição física.
 * A unidade NÃO aparece como filtro — é o contexto global da sessão; filtrar
 * por unidade aqui seria misturar escopo com filtro.
 */
export function AssetFiltersSheet({
  open,
  onClose,
  status,
  condition,
  locationId,
  locations,
  onStatusChange,
  onConditionChange,
  onLocationChange,
  onClear,
  activeCount,
}: AssetFiltersSheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Filtros"
        className="relative z-10 w-full rounded-t-2xl bg-card pb-safe-bottom shadow-2xl animate-[slide-up_0.2s_ease-out]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="text-base font-semibold text-fg">Filtros</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:text-fg"
            aria-label="Fechar filtros"
          >
            <icons.ui.close size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 pb-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Estado
            </label>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Todos" active={!status} onClick={() => onStatusChange('')} />
              {ASSET_STATUSES.map((value) => (
                <FilterChip
                  key={value}
                  label={ASSET_STATUS_LABELS[value]}
                  active={status === value}
                  onClick={() => onStatusChange(value)}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Condição
            </label>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Todas" active={!condition} onClick={() => onConditionChange('')} />
              {ASSET_CONDITIONS.map((value) => (
                <FilterChip
                  key={value}
                  label={ASSET_CONDITION_LABELS[value]}
                  active={condition === value}
                  onClick={() => onConditionChange(value)}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Localização
            </label>
            {locations.length === 0 ? (
              <p className="text-xs text-fg-muted">Nenhum local cadastrado nesta unidade.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="Todos"
                  active={!locationId}
                  onClick={() => onLocationChange('')}
                />
                {locations.map((location) => (
                  <FilterChip
                    key={location.id}
                    label={location.nome}
                    active={locationId === location.id}
                    onClick={() => onLocationChange(location.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClear()
                onClose()
              }}
              className="w-full rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
