import { useCallback, useEffect, useRef, useState } from 'react'
import {
  locationsRepository,
  responsiblesRepository,
  toPatrimonioError,
  type PatrimonioError,
  type PatrimonioLocation,
  type PatrimonioResponsible,
} from '../../../core/patrimonio'

export interface PatrimonioReferences {
  locations: PatrimonioLocation[]
  responsibles: PatrimonioResponsible[]
  loading: boolean
  error: PatrimonioError | null
  locationLabel: (id: string | null) => string | null
  responsibleLabel: (id: string | null) => string | null
  reload: () => void
}

/**
 * Diretórios de referência da unidade: locais e responsáveis.
 *
 * O bem guarda apenas `location_id`/`responsible_id`; os nomes legíveis vêm
 * destes dois repositórios. Uma carga resolve os mapas usados tanto pelos
 * filtros quanto pelos rótulos das listas/detalhe.
 *
 * A identidade da consulta inclui a UNIDADE ativa: ao trocar de unidade, as
 * referências antigas são removidas e recarregadas — nunca se resolvem nomes de
 * um local/responsável da unidade anterior contra os dados da atual.
 */
export function usePatrimonioReferences(
  workspaceId: string | null,
  enabled: boolean,
): PatrimonioReferences {
  const active = enabled && !!workspaceId
  const [locations, setLocations] = useState<PatrimonioLocation[]>([])
  const [responsibles, setResponsibles] = useState<PatrimonioResponsible[]>([])
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!enabled || !workspaceId) return
    const req = ++seq.current
    setLoading(true)
    try {
      const [locs, resps] = await Promise.all([
        locationsRepository.list(workspaceId),
        responsiblesRepository.list(workspaceId),
      ])
      if (req !== seq.current) return
      setLocations(locs)
      setResponsibles(resps)
      setError(null)
    } catch (err) {
      if (req !== seq.current) return
      setError(toPatrimonioError(err))
      setLocations([])
      setResponsibles([])
    } finally {
      if (req === seq.current) setLoading(false)
    }
  }, [enabled, workspaceId])

  const scopedKey = `${workspaceId ?? ''}|${active ? 'on' : 'off'}`
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastKeyRef.current !== scopedKey) {
      lastKeyRef.current = scopedKey
      seq.current++
      setLocations([])
      setResponsibles([])
      setError(null)
    }
    if (!active) {
      setLoading(false)
      return
    }
    void load()
  }, [active, scopedKey, load])

  const locationLabel = useCallback(
    (id: string | null) => (id ? locations.find((l) => l.id === id)?.nome ?? null : null),
    [locations],
  )
  const responsibleLabel = useCallback(
    (id: string | null) => (id ? responsibles.find((r) => r.id === id)?.nome ?? null : null),
    [responsibles],
  )

  return { locations, responsibles, loading, error, locationLabel, responsibleLabel, reload: load }
}
