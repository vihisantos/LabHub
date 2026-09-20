import { useCallback, useEffect, useState } from 'react'
import {
  getCoordinatorInactiveMembers,
  getCoordinatorRequests,
  getCoordinatorUnitOverview,
  getLastCoordinatorServiceError,
  type CoordinatorInactiveMember,
  type CoordinatorRequest,
  type CoordinatorUnitOverview,
} from './coordinatorService'

/**
 * Carregamento assíncrono dos dados de Pessoal da Central do Coordenador.
 *
 * Centraliza os três loaders que antes viviam em `CoordinatorHome`:
 *   - solicitações pendentes por unidade  (`requestsByUnit`)
 *   - membros inativos por unidade        (`inactiveByUnit`)
 *   - visão geral (chamados) por unidade  (`overviewByUnit`)
 *
 * Recebe `unitsKey` — string derivada dos `unitId` separados por `|`, exatamente
 * como era gerada no shell — para preservar a semântica de invalidação: quando
 * o escopo muda (nova unidade adicionada ou removida), os três `useCallback`
 * recebem nova referência e os `useEffect` re-disparam, exatamente como antes.
 *
 * A fonte de verdade continua sendo a membership/RPC server-side (fail-closed
 * por `auth.uid()` + `is_coordinator_of`). Este hook não altera RPCs, RLS,
 * roles ou qualquer regra de autorização — é exclusivamente gestão de estado
 * de carregamento assíncrono.
 *
 * Os loaders (`loadRequests`, `loadInactive`, `loadOverview`) são estáveis entre
 * renders (via `useCallback`), portanto podem ser chamados diretamente pelas
 * mutações do shell após approve/reject/suspend/restore/remove sem criar ciclos
 * extras.
 */
export function useCoordinatorPeopleData(unitsKey: string) {
  const [requestsByUnit, setRequestsByUnit] = useState<Record<string, CoordinatorRequest[]>>({})
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsFailed, setRequestsFailed] = useState(false)

  const [inactiveByUnit, setInactiveByUnit] = useState<
    Record<string, CoordinatorInactiveMember[]>
  >({})
  const [inactiveLoading, setInactiveLoading] = useState(false)
  const [inactiveFailed, setInactiveFailed] = useState(false)

  const [overviewByUnit, setOverviewByUnit] = useState<Record<string, CoordinatorUnitOverview>>({})
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewFailed, setOverviewFailed] = useState(false)

  const loadRequests = useCallback(async () => {
    const currentUnits = unitsKey ? unitsKey.split('|') : []
    if (currentUnits.length === 0) {
      setRequestsByUnit({})
      setRequestsFailed(false)
      setRequestsLoading(false)
      return
    }
    setRequestsLoading(true)
    setRequestsFailed(false)
    const next: Record<string, CoordinatorRequest[]> = {}
    let anyFailed = false
    for (const unitId of currentUnits) {
      const rows = await getCoordinatorRequests(unitId)
      if (getLastCoordinatorServiceError() !== null) {
        anyFailed = true
        break
      }
      next[unitId] = rows
    }
    setRequestsByUnit(next)
    setRequestsFailed(anyFailed)
    setRequestsLoading(false)
  }, [unitsKey])

  const loadInactive = useCallback(async () => {
    const currentUnits = unitsKey ? unitsKey.split('|') : []
    if (currentUnits.length === 0) {
      setInactiveByUnit({})
      setInactiveFailed(false)
      setInactiveLoading(false)
      return
    }
    setInactiveLoading(true)
    setInactiveFailed(false)
    const next: Record<string, CoordinatorInactiveMember[]> = {}
    let anyFailed = false
    for (const unitId of currentUnits) {
      const rows = await getCoordinatorInactiveMembers(unitId)
      if (getLastCoordinatorServiceError() !== null) {
        anyFailed = true
        break
      }
      next[unitId] = rows
    }
    setInactiveByUnit(next)
    setInactiveFailed(anyFailed)
    setInactiveLoading(false)
  }, [unitsKey])

  const loadOverview = useCallback(async () => {
    const currentUnits = unitsKey ? unitsKey.split('|') : []
    if (currentUnits.length === 0) {
      setOverviewByUnit({})
      setOverviewFailed(false)
      setOverviewLoading(false)
      return
    }
    setOverviewLoading(true)
    setOverviewFailed(false)
    const next: Record<string, CoordinatorUnitOverview> = {}
    let anyFailed = false
    for (const unitId of currentUnits) {
      const overview = await getCoordinatorUnitOverview(unitId)
      if (getLastCoordinatorServiceError() !== null) {
        anyFailed = true
        break
      }
      if (overview) next[unitId] = overview
    }
    setOverviewByUnit(next)
    setOverviewFailed(anyFailed)
    setOverviewLoading(false)
  }, [unitsKey])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useEffect(() => {
    void loadInactive()
  }, [loadInactive])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  return {
    requestsByUnit,
    requestsLoading,
    requestsFailed,
    loadRequests,
    inactiveByUnit,
    inactiveLoading,
    inactiveFailed,
    loadInactive,
    overviewByUnit,
    overviewLoading,
    overviewFailed,
    loadOverview,
  }
}
