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
 * histórico não derruba os dados do bem (e vice-versa). Ao trocar de ativo, o
 * histórico é resetado antes de recarregar — nunca se misturam dois bens.
 */
export function useAssetDetail(id: string | undefined, enabled: boolean): AssetDetailResult {
  const [asset, setAsset] = useState<PatrimonioAsset | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const assetSeq = useRef(0)

  const loadAsset = useCallback(async () => {
    if (!enabled || !id) return
    const req = ++assetSeq.current
    setLoading(true)
    setError(null)
    setAsset(null)
    try {
      const data = await assetsRepository.get(id)
      if (req !== assetSeq.current) return
      setAsset(data)
    } catch (err) {
      if (req !== assetSeq.current) return
      setError(toPatrimonioError(err))
      setAsset(null)
    } finally {
      if (req === assetSeq.current) setLoading(false)
    }
  }, [enabled, id])

  useEffect(() => {
    if (!enabled || !id) {
      setAsset(null)
      setError(null)
      setLoading(false)
      return
    }
    void loadAsset()
  }, [enabled, id, loadAsset])

  const [movements, setMovements] = useState<AssetMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(enabled)
  const [movementsError, setMovementsError] = useState<PatrimonioError | null>(null)
  const [movementsHasNext, setMovementsHasNext] = useState(false)
  const movSeq = useRef(0)

  const loadMovements = useCallback(
    async (offset: number) => {
      if (!enabled || !id) return
      const req = ++movSeq.current
      setMovementsLoading(true)
      try {
        const rows = await movementsRepository.listByAsset(id, {
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
    [enabled, id],
  )

  useEffect(() => {
    setMovements([])
    setMovementsHasNext(false)
    setMovementsError(null)
    if (!enabled || !id) {
      setMovementsLoading(false)
      return
    }
    void loadMovements(0)
  }, [enabled, id, loadMovements])

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
