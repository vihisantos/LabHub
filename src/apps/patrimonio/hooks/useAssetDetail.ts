import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assetsRepository,
  movementsRepository,
  toPatrimonioError,
  type AssetMovement,
  type PatrimonioAsset,
  type PatrimonioError,
} from '../../../core/patrimonio'

/** Tamanho de página do histórico de movimentações. */
export const MOVEMENTS_PAGE_SIZE = 10

export interface AssetDetailResult {
  asset: PatrimonioAsset | null
  loading: boolean
  error: PatrimonioError | null
  reloadAsset: () => void
  movements: AssetMovement[]
  movementsLoading: boolean
  movementsError: PatrimonioError | null
  movementsHasNext: boolean
  loadMoreMovements: () => void
  reloadMovements: () => void
}

/**
 * Detalhe de um bem + histórico de movimentações, ambos escopados à unidade.
 *
 * O ativo e o histórico têm estados de erro independentes: uma falha no
 * histórico não derruba os dados do bem (e vice-versa). Ao trocar de ativo OU
 * de unidade, ambos são invalidados e esvaziados ANTES de recarregar — nunca se
 * misturam dois bens nem duas unidades. Uma resposta atrasada de uma consulta
 * antiga é descartada pelo contador `seq` de cada recurso.
 */
export function useAssetDetail(
  id: string | undefined,
  workspaceId: string | null,
  enabled: boolean,
): AssetDetailResult {
  const active = enabled && !!workspaceId && !!id
  const [asset, setAsset] = useState<PatrimonioAsset | null>(null)
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const assetSeq = useRef(0)

  const loadAsset = useCallback(async () => {
    if (!enabled || !workspaceId || !id) return
    const req = ++assetSeq.current
    setLoading(true)
    setError(null)
    setAsset(null)
    try {
      const data = await assetsRepository.get(id, workspaceId)
      if (req !== assetSeq.current) return
      setAsset(data)
    } catch (err) {
      if (req !== assetSeq.current) return
      setError(toPatrimonioError(err))
      setAsset(null)
    } finally {
      if (req === assetSeq.current) setLoading(false)
    }
  }, [enabled, workspaceId, id])

  const scopedKey = `${workspaceId ?? ''}|${id ?? ''}|${active ? 'on' : 'off'}`
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastKeyRef.current !== scopedKey) {
      lastKeyRef.current = scopedKey
      assetSeq.current++
      setAsset(null)
      setError(null)
    }
    if (!active) {
      setLoading(false)
      return
    }
    void loadAsset()
  }, [active, scopedKey, loadAsset])

  const [movements, setMovements] = useState<AssetMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(active)
  const [movementsError, setMovementsError] = useState<PatrimonioError | null>(null)
  const [movementsHasNext, setMovementsHasNext] = useState(false)
  const movSeq = useRef(0)

  const loadMovements = useCallback(
    async (offset: number) => {
      if (!enabled || !workspaceId || !id) return
      const req = ++movSeq.current
      setMovementsLoading(true)
      try {
        const rows = await movementsRepository.listByAsset(id, {
          workspaceId,
          limit: MOVEMENTS_PAGE_SIZE + 1,
          offset,
        })
        if (req !== movSeq.current) return
        setMovementsHasNext(rows.length > MOVEMENTS_PAGE_SIZE)
        const slice = rows.slice(0, MOVEMENTS_PAGE_SIZE)
        setMovements((prev) => (offset === 0 ? slice : [...prev, ...slice]))
        setMovementsError(null)
      } catch (err) {
        if (req !== movSeq.current) return
        setMovementsError(toPatrimonioError(err))
        if (offset === 0) setMovements([])
      } finally {
        if (req === movSeq.current) setMovementsLoading(false)
      }
    },
    [enabled, workspaceId, id],
  )

  const lastMovKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastMovKeyRef.current !== scopedKey) {
      lastMovKeyRef.current = scopedKey
      movSeq.current++
      setMovements([])
      setMovementsHasNext(false)
      setMovementsError(null)
    }
    if (!active) {
      setMovementsLoading(false)
      return
    }
    void loadMovements(0)
  }, [active, scopedKey, loadMovements])

  const loadMoreMovements = useCallback(() => {
    void loadMovements(movements.length)
  }, [loadMovements, movements.length])

  const reloadMovements = useCallback(() => {
    void loadMovements(0)
  }, [loadMovements])

  return {
    asset,
    loading,
    error,
    reloadAsset: loadAsset,
    movements,
    movementsLoading,
    movementsError,
    movementsHasNext,
    loadMoreMovements,
    reloadMovements,
  }
}
