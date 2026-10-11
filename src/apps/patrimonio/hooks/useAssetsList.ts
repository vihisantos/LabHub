import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assetsRepository,
  toPatrimonioError,
  type AssetCondition,
  type AssetStatus,
  type PatrimonioAsset,
  type PatrimonioError,
} from '../../../core/patrimonio'

/** Tamanho de página da lista de bens. */
export const ASSETS_PAGE_SIZE = 20

export interface AssetsListFilters {
  search: string
  status: AssetStatus | ''
  condition: AssetCondition | ''
  locationId: string
}

interface UseAssetsListOptions extends AssetsListFilters {
  page: number
  /** Só dispara consultas quando o usuário tem contexto (unidade + permissão). */
  enabled: boolean
}

export interface AssetsListResult {
  assets: PatrimonioAsset[]
  loading: boolean
  error: PatrimonioError | null
  /** Existe uma página seguinte? (busca `PAGE_SIZE + 1` linhas). */
  hasNext: boolean
  reload: () => void
}

/**
 * Lista paginada de bens escopada à unidade ativa.
 *
 * Consome `assetsRepository.list` diretamente — a camada de dados é a fronteira
 * com o Supabase e já é fail-closed por unidade/permissão. Nada é inventado
 * aqui: os filtros aceitos são exatamente os do repositório.
 *
 * Paginação sem `count`: pede uma linha a mais que a página e usa a sobra para
 * saber se há próxima página — evita expor totais que o repositório não fornece.
 *
 * Em falha, a lista é esvaziada e o erro é exposto: nunca mantemos dados
 * antigos na tela como se fossem atuais.
 */
export function useAssetsList(options: UseAssetsListOptions): AssetsListResult {
  const { search, status, condition, locationId, page, enabled } = options
  const [assets, setAssets] = useState<PatrimonioAsset[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!enabled) return
    const req = ++seq.current
    setLoading(true)
    try {
      const rows = await assetsRepository.list({
        search: search.trim() || undefined,
        status: status || undefined,
        condition: condition || undefined,
        locationId: locationId || undefined,
        limit: ASSETS_PAGE_SIZE + 1,
        offset: page * ASSETS_PAGE_SIZE,
      })
      if (req !== seq.current) return
      setHasNext(rows.length > ASSETS_PAGE_SIZE)
      setAssets(rows.slice(0, ASSETS_PAGE_SIZE))
      setError(null)
    } catch (err) {
      if (req !== seq.current) return
      setError(toPatrimonioError(err))
      setAssets([])
      setHasNext(false)
    } finally {
      if (req === seq.current) setLoading(false)
    }
  }, [enabled, search, status, condition, locationId, page])

  useEffect(() => {
    if (!enabled) {
      setAssets([])
      setError(null)
      setHasNext(false)
      setLoading(false)
      return
    }
    void load()
  }, [enabled, load])

  return { assets, loading, error, hasNext, reload: load }
}
