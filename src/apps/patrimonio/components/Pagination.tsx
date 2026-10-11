import { icons } from '../../../lib/icons'

interface PaginationProps {
  page: number
  hasNext: boolean
  loading: boolean
  onPrev: () => void
  onNext: () => void
}

/**
 * Paginação por deslocamento. Não exibe total: o repositório não fornece
 * contagem, então mostrar um total seria inventar dado. `hasNext` vem da
 * sobre-leitura de uma linha extra feita pelo hook.
 */
export function Pagination({ page, hasNext, loading, onPrev, onNext }: PaginationProps) {
  const atFirst = page === 0
  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Paginação">
      <button
        type="button"
        onClick={onPrev}
        disabled={atFirst || loading}
        className="flex items-center gap-1 rounded-xl bg-input px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        <icons.ui.back size={16} />
        Anterior
      </button>
      <span className="text-xs text-fg-muted">Página {page + 1}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        className="flex items-center gap-1 rounded-xl bg-input px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        Próxima
        <icons.ui.chevronRight size={16} />
      </button>
    </nav>
  )
}
