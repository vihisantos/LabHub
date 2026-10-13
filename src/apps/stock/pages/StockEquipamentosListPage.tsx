import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  type AssetCondition,
  type AssetStatus,
} from '../../../core/patrimonio'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { useAssetsList } from '../../patrimonio/hooks/useAssetsList'
import { usePatrimonioReferences } from '../../patrimonio/hooks/usePatrimonioReferences'
import { AssetCard } from '../../patrimonio/components/AssetCard'
import { AssetFiltersSheet } from '../../patrimonio/components/AssetFiltersSheet'
import { AssetFormModal } from '../../patrimonio/components/AssetFormModal'
import { Pagination } from '../../patrimonio/components/Pagination'
import { QueryError } from '../../patrimonio/components/QueryError'

export function StockEquipamentosListPage() {
  const { workspace } = useWorkspace()
  const { allowed, loading: permLoading } = useCanAccessAction('patrimonio.view')
  const canCreate = useCanAccessAction('patrimonio.asset.create')
  const workspaceId = workspace?.id ?? null
  const enabled = allowed && !!workspaceId
  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AssetStatus | ''>('')
  const [condition, setCondition] = useState<AssetCondition | ''>('')
  const [locationId, setLocationId] = useState('')
  const [page, setPage] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchRaw])

  useEffect(() => {
    setPage(0)
  }, [search, status, condition, locationId])

  const { assets, loading, error, hasNext, reload } = useAssetsList({
    search,
    status,
    condition,
    locationId,
    page,
    workspaceId,
    enabled,
  })
  const references = usePatrimonioReferences(workspaceId, enabled)

  const activeFilterCount = [status, condition, locationId].filter(Boolean).length
  const hasActiveFilters = activeFilterCount > 0 || search !== ''

  const clearFilters = useCallback(() => {
    setStatus('')
    setCondition('')
    setLocationId('')
    setSearchRaw('')
    setSearch('')
  }, [])

  const unitName = workspace?.name ?? ''
  const isInitialLoading = loading && assets.length === 0
  const showingSkeletons = permLoading || (isInitialLoading && !error)

  const listBody = useMemo(() => {
    if (showingSkeletons) {
      return (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )
    }

    if (error) {
      return (
        <QueryError
          title="Falha ao carregar o acervo"
          message={error.message}
          onRetry={reload}
        />
      )
    }

    if (assets.length === 0) {
      if (hasActiveFilters) {
        return (
          <EmptyState
            icon={icons.ui.search}
            title="Nenhum equipamento encontrado"
            description="Tente ajustar a busca ou os filtros."
            accentColor="accent"
          />
        )
      }
      return (
        <EmptyState
          icon={icons.ui.hardDrive}
          title="Acervo vazio"
          description={`Nenhum equipamento cadastrado em ${unitName || 'nesta unidade'}.`}
          accentColor="accent"
          action={
            canCreate.allowed && !canCreate.loading
              ? { label: 'Cadastrar equipamento', onClick: () => setFormOpen(true) }
              : undefined
          }
        />
      )
    }

    return (
      <div className="space-y-2">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            unitName={unitName}
            locationLabel={references.locationLabel}
            responsibleLabel={references.responsibleLabel}
          />
        ))}
      </div>
    )
  }, [showingSkeletons, error, assets, hasActiveFilters, unitName, references, reload, canCreate.allowed, canCreate.loading])

  if (!permLoading && !allowed) {
    return (
      <EmptyState
        icon={icons.ui.shield}
        title="Sem permissão"
        description="Você não tem acesso ao módulo Equipamentos nesta unidade."
        accentColor="accent"
      />
    )
  }

  if (!permLoading && allowed && !workspace) {
    return (
      <EmptyState
        icon={icons.ui.mapPin}
        title="Nenhuma unidade ativa"
        description="Selecione uma unidade para visualizar os equipamentos."
        accentColor="accent"
      />
    )
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <icons.ui.search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="text"
              placeholder="Buscar tombamento, nome, série..."
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none transition-all placeholder:text-fg-muted focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            {searchRaw && (
              <button
                type="button"
                onClick={() => {
                  setSearchRaw('')
                  setSearch('')
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                aria-label="Limpar busca"
              >
                <icons.ui.close size={14} />
              </button>
            )}
          </div>
          {canCreate.allowed && !canCreate.loading && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent-strong)] px-3.5 text-sm font-medium text-[var(--on-accent)] transition-all hover:opacity-90 shadow-sm btn-interactive"
              aria-label="Cadastrar equipamento"
            >
              <icons.ui.plus size={16} />
              <span className="hidden sm:inline">Cadastrar equipamento</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFilterCount > 0
                ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                : 'bg-input text-fg-dim hover:text-fg'
            }`}
            aria-label="Filtros"
          >
            <icons.ui.sliders size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-[var(--accent-strong)] px-1 text-[9px] font-bold text-[var(--on-accent)]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {status && <Chip label={`Estado: ${ASSET_STATUS_LABELS[status]}`} onRemove={() => setStatus('')} />}
            {condition && (
              <Chip label={`Condição: ${ASSET_CONDITION_LABELS[condition]}`} onRemove={() => setCondition('')} />
            )}
            {locationId && (
              <Chip
                label={`Local: ${references.locationLabel(locationId) ?? '—'}`}
                onRemove={() => setLocationId('')}
              />
            )}
            {search && (
              <Chip
                label={`Busca: "${search}"`}
                onRemove={() => {
                  setSearchRaw('')
                  setSearch('')
                }}
              />
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              Limpar tudo
            </button>
          </div>
        )}

        {listBody}

        {!showingSkeletons && !error && (hasNext || page > 0) && (
          <Pagination
            page={page}
            hasNext={hasNext}
            loading={loading}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </div>

      <AssetFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        status={status}
        condition={condition}
        locationId={locationId}
        locations={references.locations}
        onStatusChange={setStatus}
        onConditionChange={setCondition}
        onLocationChange={setLocationId}
        onClear={clearFilters}
        activeCount={activeFilterCount}
      />

      <AssetFormModal
        open={formOpen}
        workspaceId={workspaceId}
        initial={null}
        references={references}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setPage(0)
          reload()
        }}
      />
    </PullToRefresh>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-strong)]">
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-70" aria-label={`Remover ${label}`}>
        <icons.ui.close size={12} />
      </button>
    </span>
  )
}