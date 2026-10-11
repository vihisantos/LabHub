import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ASSET_CONDITION_LABELS, ASSET_STATUS_LABELS, type AssetCondition, type AssetStatus } from '../../../core/patrimonio'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { useAssetsList } from '../hooks/useAssetsList'
import { usePatrimonioReferences } from '../hooks/usePatrimonioReferences'
import { AssetCard } from '../components/AssetCard'
import { AssetFiltersSheet } from '../components/AssetFiltersSheet'
import { AssetFormModal } from '../components/AssetFormModal'
import { Pagination } from '../components/Pagination'
import { QueryError } from '../components/QueryError'

export function AssetListPage() {
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
            title="Nenhum bem encontrado"
            description="Tente ajustar a busca ou os filtros."
            accentColor="cyan"
          />
        )
      }
      return (
        <EmptyState
          icon={icons.ui.hardDrive}
          title="Acervo vazio"
          description={`Nenhum bem cadastrado em ${unitName || 'nesta unidade'}.`}
          accentColor="cyan"
          action={
            canCreate.allowed && !canCreate.loading
              ? { label: 'Cadastrar bem', onClick: () => setFormOpen(true) }
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
              className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none transition-all placeholder:text-fg-muted focus:ring-2 focus:ring-sky-500/30"
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
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-3.5 text-sm font-medium text-white transition-all hover:shadow-md btn-interactive"
              aria-label="Cadastrar bem"
            >
              <icons.ui.plus size={16} />
              <span className="hidden sm:inline">Cadastrar bem</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFilterCount > 0
                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
                : 'bg-input text-fg-dim hover:text-fg'
            }`}
            aria-label="Filtros"
          >
            <icons.ui.sliders size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">
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
    <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-950/30 dark:text-sky-400">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-sky-900 dark:hover:text-sky-200" aria-label={`Remover ${label}`}>
        <icons.ui.close size={12} />
      </button>
    </span>
  )
}
