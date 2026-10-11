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
  /**
   * Unidade ativa — identidade da consulta. Trocar de unidade invalida a
   * requisição em voo, limpa a lista e recarrega no novo contexto.
   */
  workspaceId: string | null
  /** Só dispara consultas quando o usuário tem permissão. */
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
  const { search, status, condition, locationId, page, workspaceId, enabled } = options
  const active = enabled && !!workspaceId
  const [assets, setAssets] = useState<PatrimonioAsset[]>([])
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!active || !workspaceId) return
    const req = ++seq.current
    setLoading(true)
    try {
      const rows = await assetsRepository.list({
        workspaceId,
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
  }, [active, workspaceId, search, status, condition, locationId, page])

  // Chave de escopo: muda quando a unidade ativa muda ou a permissão é
  // revogada/concedida. NÃO muda em busca/filtro/página — nesses casos a lista
  // atual permanece até a resposta nova (comportamento de paginação), e só o
  // `seq` é incrementado dentro de `load` para descartar a resposta antiga.
  const scopedKey = `${workspaceId ?? ''}|${active ? 'on' : 'off'}`
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastKeyRef.current !== scopedKey) {
      // Troca de unidade / mudança de acesso: invalida o que está em voo e
      // esvazia IMEDIATAMENTE — nada da unidade anterior fica visível.
      lastKeyRef.current = scopedKey
      seq.current++
      setAssets([])
      setHasNext(false)
      setError(null)
    }
    if (!active) {
      setLoading(false)
      return
    }
    void load()
  }, [active, scopedKey, load])

  return { assets, loading, error, hasNext, reload: load }
}
