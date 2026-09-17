import { useCallback, useEffect, useState } from 'react'
import type { CoordinatedUnit } from './coordinatorService'
import { getCoordinatorScope, getLastCoordinatorServiceError } from './coordinatorService'

/**
 * RBAC 2.0 (Fase 8): escopo de coordenação (unidades → lideranças → equipes).
 *
 * Multi-unidade: NÃO depende do `workspaceStore` (ao contrário do `useTeam`, que
 * segue a unidade ativa). O escopo vem do servidor (`get_coordinator_units` +
 * RPCs 047, fail-closed por auth.uid()): sem units → vazio legítimo (não é erro);
 * erro em qualquer RPC → `failed` (a UI oferece retry).
 */
export function useCoordinator() {
  const [units, setUnits] = useState<CoordinatedUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  /**
   * `silent: true` re-consulta o escopo SEM ligar o spinner de página inteira —
   * usado após escritas escopadas (a UI mostra o loading no próprio membro, não
   * no Dashboard). O erro continua honesto: uma falha vira `failed`.
   */
  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) setLoading(true)
    setFailed(false)
    const data = await getCoordinatorScope()
    // Vazio legítimo (sem unidades de coordenação) NÃO é erro.
    setFailed(data.length === 0 && getLastCoordinatorServiceError() !== null)
    setUnits(data)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { units, loading, failed, refresh }
}